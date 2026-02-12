const USABILITY_PDF_MARKER = "mock:usability-pdf";

function normalizeS3Key(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\\/g, "/")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function isUsabilityPdfMock(s3Key) {
  const key = normalizeS3Key(s3Key);
  if (!key) return false;

  const candidates = new Set([
    "teste de usabilidade .pdf",
    "teste-de-usabilidade.pdf",
    "docs/teste de usabilidade .pdf"
  ]);

  if (candidates.has(key)) return true;
  return key.endsWith("/teste de usabilidade .pdf") || key.endsWith("/teste-de-usabilidade.pdf");
}

export function isUsabilityOcrText(text = "") {
  return String(text || "").includes(USABILITY_PDF_MARKER);
}

export function buildUsabilityOcrMock() {
  const lines = [
    "[mock:usability-pdf] Relatorio de Teste de Usabilidade",
    "Objetivo: avaliar clareza de navegacao e eficiencia das tarefas principais.",
    "Publico-alvo: usuarios iniciantes e intermediarios do sistema.",
    "Cenario 1: localizar funcionalidade de cadastro e concluir o fluxo.",
    "Cenario 2: consultar historico, aplicar filtros e exportar informacoes.",
    "Metrica - taxa de sucesso por tarefa: 86%.",
    "Metrica - tempo medio por tarefa: 2min42s.",
    "Metrica - taxa de erro observada: 14%.",
    "Principais problemas encontrados:",
    "1) Rotulos pouco claros em etapas de confirmacao.",
    "2) Contraste insuficiente em elementos secundarios.",
    "3) Excesso de cliques para concluir a tarefa de exportacao.",
    "Recomendacoes:",
    "a) Padronizar nomenclatura e melhorar feedback de estado.",
    "b) Aumentar contraste e reforcar hierarquia visual.",
    "c) Reduzir passos no fluxo critico e simplificar a navegacao.",
    "Conclusao: experiencia geral positiva, com pontos de melhoria em acessibilidade e fluidez."
  ];

  return {
    text: lines.join("\n"),
    lineCount: lines.length,
    source: USABILITY_PDF_MARKER,
    textractJobId: null
  };
}

export function buildUsabilityNlpMock() {
  return {
    sentiment: {
      Sentiment: "NEUTRAL",
      SentimentScore: {
        Positive: 0.31,
        Negative: 0.12,
        Neutral: 0.54,
        Mixed: 0.03
      }
    },
    entities: [
      { Type: "OTHER", Text: "usabilidade", Score: 0.99 },
      { Type: "OTHER", Text: "teste", Score: 0.98 },
      { Type: "OTHER", Text: "usuario", Score: 0.97 },
      { Type: "OTHER", Text: "fluxo", Score: 0.97 },
      { Type: "OTHER", Text: "tempo de tarefa", Score: 0.96 },
      { Type: "OTHER", Text: "taxa de sucesso", Score: 0.96 },
      { Type: "OTHER", Text: "acessibilidade", Score: 0.95 },
      { Type: "OTHER", Text: "navegacao", Score: 0.95 }
    ]
  };
}
