export const mockSentiment = () => ({
  ok: true,
  service: "Mock AWS",
  action: "DetectSentiment",
  result: {
    Sentiment: "POSITIVE",
    SentimentScore: {
      Positive: 0.92,
      Neutral: 0.06,
      Negative: 0.01,
      Mixed: 0.01
    }
  }
});

export const mockEntities = () => ({
  ok: true,
  service: "Mock AWS",
  action: "DetectEntities",
  result: {
    Entities: [
      {
        Text: "Amazon",
        Type: "ORGANIZATION",
        Score: 0.98,
        BeginOffset: 0,
        EndOffset: 6
      },
      {
        Text: "Brasil",
        Type: "LOCATION",
        Score: 0.93,
        BeginOffset: 10,
        EndOffset: 16
      }
    ]
  }
});

export const mockOcr = () => ({
  ok: true,
  service: "Mock AWS",
  action: "DetectDocumentText",
  detectedLines: [
    "Contrato de prestação de serviços",
    "Cliente: Exemplo S.A.",
    "Valor total: R$ 9.990,00"
  ],
  raw: { Blocks: [] }
});

export const mockAnalyze = () => ({
  ok: true,
  service: "Mock AWS",
  action: "AnalyzeDocument",
  raw: {
    DocumentMetadata: { Pages: 1 },
    Blocks: [
      {
        BlockType: "LINE",
        Confidence: 98.5,
        Text: "Tabela de preços",
        Id: "mock-line-1"
      }
    ]
  }
});

export const mockPdfStart = () => ({
  ok: true,
  service: "Mock AWS",
  action: "StartDocumentAnalysis",
  jobId: "mock-job-123"
});

export const mockPdfStatus = (jobId) => ({
  ok: true,
  service: "Mock AWS",
  action: "GetDocumentAnalysis",
  status: "SUCCEEDED",
  raw: {
    JobStatus: "SUCCEEDED",
    JobId: jobId,
    Blocks: [
      {
        BlockType: "LINE",
        Text: "Documento processado com sucesso.",
        Confidence: 99.1,
        Id: "mock-line-1"
      }
    ]
  }
});
