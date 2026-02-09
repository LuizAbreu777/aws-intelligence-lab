# AWS Intelligence Lab - Tier 4 Distributed Pipeline

Aplicacao distribuida com processamento assíncrono em estagios (`ingest -> ocr -> nlp`) usando:

- Frontend React (cliente)
- API Gateway Node.js/Express (orquestrador)
- RabbitMQ (message broker)
- Workers dedicados por responsabilidade
- PostgreSQL (estado e resultados)
- Integracao AWS (Textract e Comprehend) com modo mock para desenvolvimento

## 1. Arquitetura

### Servicos

- `frontend`: UI React que inicia jobs e consulta status via polling HTTP.
- `api-gateway`: cria job no banco, publica mensagem na fila `jobs.ingest`, expõe endpoints de status e metricas.
- `rabbitmq`: broker AMQP com filas por etapa e DLQ.
- `worker-ingest`: valida payload, marca progresso inicial, encaminha para OCR.
- `worker-ocr`: executa OCR (Textract async, com polling interno/backoff), salva texto e encaminha para NLP.
- `worker-nlp`: executa NLP (Comprehend), salva resultado final e conclui job.
- `postgres`: persistencia de jobs, status, progresso, erros e resultados.

### Fluxo de processamento

1. Front chama `POST /jobs`.
2. API cria job (`queued`, `stage=ingest`, `progress=0`) e publica em `jobs.ingest`.
3. `worker-ingest` valida e atualiza (`processing`, `progress=10`), publica em `jobs.ocr`.
4. `worker-ocr` processa OCR, salva `result.ocrText` e `result.ocr`, atualiza (`stage=ocr`, `progress=60`), publica em `jobs.nlp`.
5. `worker-nlp` processa sentimento/entidades, salva `result.nlp`, finaliza (`done`, `stage=completed`, `progress=100`), publica em `jobs.completed`.
6. Front consulta `GET /jobs/:id` ate terminar.

### Contrato de dados (jobs)

- `status`: `queued | processing | done | failed`
- `stage`: `ingest | ocr | nlp | completed`
- `progress`: inteiro `0..100`
- `attempt_count`: tentativas de retry para rastreio
- `payload`: entrada original
- `meta`: metadados de pipeline (ex.: `s3Key`, `languageCode`, `textractJobId`)
- `result`: saida agregada por etapa (`ocrText`, `ocr`, `nlp`)
- `error_message`: erro final quando falha

## 2. Confiabilidade e tolerancia a falhas

- Ack somente em sucesso.
- Em erro transitório: `nack(requeue=true)` + incremento de `attempt_count`.
- Limite de retries por job via `JOB_MAX_RETRIES` (default `3`).
- Em erro definitivo: job `failed` + `nack(requeue=false)` (mensagem vai para DLQ).
- DLQ por fila:
  - `jobs.ingest.dlq`
  - `jobs.ocr.dlq`
  - `jobs.nlp.dlq`
- Correlacao ponta a ponta com `correlationId=jobId` em logs e mensagens AMQP.

## 3. Escalabilidade

Escala horizontal por worker (consumer group AMQP):

```bash
docker compose up -d --scale worker-ingest=2 --scale worker-ocr=3 --scale worker-nlp=3
```

RabbitMQ distribui mensagens entre replicas da mesma fila. A API continua stateless para escrita/leitura do estado no Postgres.

## 4. Setup e execucao

## Requisitos

- Docker + Docker Compose

## Variaveis principais

- `MOCK_AWS=true` (default no compose): roda sem chamar AWS real.
- `MOCK_AWS=false`: habilita AWS real.
- `AWS_REGION` (default `us-east-1`)
- `TEXTRACT_S3_BUCKET` (obrigatorio para OCR real em PDF S3)
- Credenciais AWS no ambiente quando `MOCK_AWS=false`.

## Subir stack

```bash
docker compose up -d --build
```

## Validar saude

```bash
docker compose ps
curl -s http://localhost:3000/health
```

## 5. Endpoints principais

- `POST /jobs` cria job da pipeline
- `GET /jobs/:id` consulta status/progresso/resultado
- `GET /jobs/stats` dashboard simples (agregado por `status` + `stage`)
- `POST /comprehend/*` e `POST /textract/*` permanecem para debug/manual

## Exemplo de criacao de job (texto)

```bash
curl -s -X POST http://localhost:3000/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "type":"text",
    "payload":{"text":"O atendimento foi excelente, mas o prazo atrasou.","languageCode":"pt"}
  }'
```

## Exemplo de criacao de job (PDF via S3)

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

## 6. Teste ponta a ponta (checklist)

1. Suba a stack: `docker compose up -d --build`.
2. Crie um job com `s3Key` ou `text`.
3. Consulte `GET /jobs/:id` ate finalizar.
4. Verifique transicao de estado:
   - `queued -> processing -> done` (ou `failed`)
   - estagios: `ingest -> ocr -> nlp -> completed`
5. Confira resultado final em `job.result` e progresso `100`.
6. Confira agregados em `GET /jobs/stats`.

## 7. Operacao e troubleshooting

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

## 8. Observacoes de design (Tier 4)

- Sistema distribuido com multiplos servicos independentes.
- Comunicacao mista HTTP + AMQP.
- Pipeline assíncrona com workers especializados.
- Estado centralizado e consultavel em banco.
- Mecanismos de resiliencia (retry, DLQ, correlation).
- Escalabilidade horizontal por replicas de workers.
