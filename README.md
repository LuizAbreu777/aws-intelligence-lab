# 🚀 AWS Intelligence Lab - Tier 4 Distributed Pipeline

Aplicação distribuída com processamento assíncrono em estágios (`ingest -> ocr -> nlp`) usando:

- Frontend React (cliente)
- API Gateway Node.js/Express (orquestrador)
- RabbitMQ (message broker)
- Workers dedicados por responsabilidade
- PostgreSQL (estado e resultados)
- Integração AWS (Textract e Comprehend) com modo mock para desenvolvimento

## 🗂️ Estrutura do Projeto
```text
aws-intelligence-lab/
├─ backend/
│  ├─ src/
│  │  ├─ app.js
│  │  ├─ server.js
│  │  ├─ aws/
│  │  ├─ routes/
│  │  └─ utils/
│  ├─ Dockerfile
│  └─ package.json
├─ worker/
│  ├─ src/
│  │  ├─ common.js
│  │  ├─ ingestWorker.js
│  │  ├─ ocrWorker.js
│  │  └─ nlpWorker.js
│  ├─ Dockerfile
│  └─ package.json
├─ frontend/
│  ├─ src/
│  │  └─ App.jsx
│  └─ package.json
├─ db/
│  └─ init.sql
├─ docker-compose.yml
├─ docker.compose.yml
└─ README.md
```

## 🧭 Arquitetura do Sistema
```text
[Frontend React]
      |
      | HTTP (POST /jobs, GET /jobs/:id)
      v
[API Gateway - Express]
      |
      | AMQP publish (jobs.ingest)
      v
[RabbitMQ]
   |              |               |
   v              v               v
[worker-ingest] -> [worker-ocr] -> [worker-nlp]
        |               |               |
        |               |               |
        +-------------> [PostgreSQL] <+
                     (status/result/progress)
```

Notas:
- O frontend não acessa AWS diretamente.
- A API orquestra jobs e expõe status.
- Workers processam por etapa e atualizam o banco.
- RabbitMQ desacopla processamento e permite escala horizontal.

## 🏗️ 1. Arquitetura

### Serviços

- `frontend`: UI React que inicia jobs e consulta status via polling HTTP.
- `api-gateway`: cria job no banco, publica mensagem na fila `jobs.ingest`, expõe endpoints de status e métricas.
- `rabbitmq`: broker AMQP com filas por etapa e DLQ.
- `worker-ingest`: valida payload, marca progresso inicial, encaminha para OCR.
- `worker-ocr`: executa OCR (Textract async, com polling interno/backoff), salva texto e encaminha para NLP.
- `worker-nlp`: executa NLP (Comprehend), salva resultado final e conclui job.
- `postgres`: persistência de jobs, status, progresso, erros e resultados.

### Fluxo de processamento

1. Front chama `POST /jobs`.
2. API cria job (`queued`, `stage=ingest`, `progress=0`) e publica em `jobs.ingest`.
3. `worker-ingest` valida e atualiza (`processing`, `progress=10`), publica em `jobs.ocr`.
4. `worker-ocr` processa OCR, salva `result.ocrText` e `result.ocr`, atualiza (`stage=ocr`, `progress=60`), publica em `jobs.nlp`.
5. `worker-nlp` processa sentimento/entidades, salva `result.nlp`, finaliza (`done`, `stage=completed`, `progress=100`), publica em `jobs.completed`.
6. Front consulta `GET /jobs/:id` até terminar.

### Contrato de dados (jobs)

- `status`: `queued | processing | done | failed`
- `stage`: `ingest | ocr | nlp | completed`
- `progress`: inteiro `0..100`
- `attempt_count`: tentativas de retry para rastreio
- `payload`: entrada original
- `meta`: metadados de pipeline (ex.: `s3Key`, `languageCode`, `textractJobId`)
- `result`: saída agregada por etapa (`ocrText`, `ocr`, `nlp`)
- `error_message`: erro final quando falha

## 🛡️ 2. Confiabilidade e tolerância a falhas

- Ack somente em sucesso.
- Em erro transitório: `nack(requeue=true)` + incremento de `attempt_count`.
- Limite de retries por job via `JOB_MAX_RETRIES` (default `3`).
- Em erro definitivo: job `failed` + `nack(requeue=false)` (mensagem vai para DLQ).
- DLQ por fila:
  - `jobs.ingest.dlq`
  - `jobs.ocr.dlq`
  - `jobs.nlp.dlq`
- Correlação ponta a ponta com `correlationId=jobId` em logs e mensagens AMQP.

## 📈 3. Escalabilidade

Escala horizontal por worker (consumer group AMQP):
```bash
docker compose up -d --scale worker-ingest=2 --scale worker-ocr=3 --scale worker-nlp=3
```

RabbitMQ distribui mensagens entre réplicas da mesma fila. A API continua stateless para escrita/leitura do estado no Postgres.

## ⚙️ 4. Setup e execução

## 📦 Requisitos

- Docker + Docker Compose

## 👣 Quick Start (Iniciante Amigável)

Siga esses passos exatamente, nessa ordem.

1. Instale o Docker Desktop
- Download e instalação: https://www.docker.com/products/docker-desktop/
- Abra o Docker Desktop e aguarde até mostrar que está rodando.

2. Abra um terminal na pasta do projeto
- Exemplo de caminho do projeto: `aws-intelligence-lab`

3. Crie ou atualize o arquivo `.env` raiz
- Localização do arquivo: mesma pasta do `docker-compose.yml`
- Conteúdo mínimo:
```env
AWS_REGION=us-east-1
MOCK_AWS=false
TEXTRACT_S3_BUCKET=aws-intelligence-lab-pdf
```
Se você só quer testar sem gastar dinheiro, use:
```env
MOCK_AWS=true
AWS_REGION=us-east-1
TEXTRACT_S3_BUCKET=aws-intelligence-lab-pdf
```

4. Inicie todos os serviços
```bash
docker compose up -d --build
```

5. Verifique se está tudo saudável
```bash
docker compose ps
```
Esperado: `api-gateway`, `rabbitmq`, e workers devem estar `Up` e eventualmente `healthy` ✅

6. Abra a aplicação
- Frontend (se rodando separadamente): geralmente `http://localhost:5173`
- Health da API: `http://localhost:3000/health`

7. Primeiro teste funcional (API)
```bash
curl -s -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{"type":"text","payload":{"text":"Hello from first run","languageCode":"en"}}'
```
Copie o `jobId` retornado, depois verifique o status:
```bash
curl -s http://localhost:3000/jobs/<JOB_ID>
```

8. Pare tudo quando terminar
```bash
docker compose down
```
Se você precisar de um reset completo (incluindo volume do database):
```bash
docker compose down -v
```

## 🔐 Variáveis principais

- `MOCK_AWS=true` (default no compose): roda sem chamar AWS real.
- `MOCK_AWS=false`: habilita AWS real.
- `AWS_REGION` (default `us-east-1`)
- `TEXTRACT_S3_BUCKET` (obrigatório para OCR real em PDF S3)
- Credenciais AWS no ambiente quando `MOCK_AWS=false`.

## Subir stack
```bash
docker compose up -d --build
```

## Validar saúde
```bash
docker compose ps
curl -s http://localhost:3000/health
```

## 🌐 5. Endpoints principais

- `POST /jobs` cria job da pipeline
- `GET /jobs/:id` consulta status/progresso/resultado
- `GET /jobs/stats` dashboard simples (agregado por `status` + `stage`)
- `POST /comprehend/*` e `POST /textract/*` permanecem para debug/manual

## Exemplo de criação de job (texto)
```bash
curl -s -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type":"text",
    "payload":{"text":"O atendimento foi excelente, mas o prazo atrasou.","languageCode":"pt"}
  }'
```

## Exemplo de criação de job (PDF via S3)
```bash
curl -s -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type":"pdf",
    "payload":{"s3Key":"docs/exemplo.pdf","languageCode":"pt"}
  }'
```

## Polling de status
```bash
curl -s http://localhost:3000/jobs/<JOB_ID>
```

## Dashboard simples
```bash
curl -s http://localhost:3000/jobs/stats
```

## 🧪 6. Teste ponta a ponta (checklist)

1. Suba a stack: `docker compose up -d --build`.
2. Crie um job com `s3Key` ou `text`.
3. Consulte `GET /jobs/:id` até finalizar.
4. Verifique transição de estado:
   - `queued -> processing -> done` (ou `failed`)
   - estágios: `ingest -> ocr -> nlp -> completed`
5. Confira resultado final em `job.result` e progresso `100`.
6. Confira agregados em `GET /jobs/stats`.

## 🧰 7. Operação e troubleshooting

- Logs:
```bash
docker compose logs -f api-gateway worker-ingest worker-ocr worker-nlp
```

- Filas e DLQ no Rabbit:
```bash
docker exec -it aws-intelligence-lab-rabbitmq-1 rabbitmqctl list_queues name messages
```

- Recriar stack limpa (inclui filas e banco):
```bash
docker compose down -v
docker compose up -d --build
```

## 🧠 8. Observações de design (Tier 4)

- Sistema distribuído com múltiplos serviços independentes.
- Comunicação mista HTTP + AMQP.
- Pipeline assíncrona com workers especializados.
- Estado centralizado e consultável em banco.
- Mecanismos de resiliência (retry, DLQ, correlation).
- Escalabilidade horizontal por réplicas de workers.
