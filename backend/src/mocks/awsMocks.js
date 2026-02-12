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

const resumeDetectedLines = [
  "LUIZ FERNANDO MENDES DE AZEVEDO",
  "21 ANOS",
  "DEV FULL-STACK | JAVASCRIPT | NODE.JS | REACT",
  "PERFIL PESSOAL",
  "Desenvolvedor em formacao com foco no ecossistema JavaScript, atuando principalmente com Node.js, React e desenvolvimento de APIs REST.",
  "CONTATO",
  "Abreu e Lima - PE",
  "luiz.fma2013@gmail.com",
  "(81) 98598-4546",
  "linkedin.com/in/luiz-azevedo-dev",
  "github.com/LuizAbreu777",
  "FORMACAO",
  "Tecnico em Desenvolvimento de Sistemas - ETE Jurandir Bezerra Lins (2022).",
  "Tecnologia em Sistemas para Internet - IFPE 4 Periodo (Conclusao prevista: 2026).",
  "COMPETENCIAS TECNICAS",
  "JavaScript (ES6+)",
  "Node.js (conceitos, APIs REST, estruturacao de servicos)",
  "React (componentes, estado, props, consumo de APIs)",
  "HTML5 e CSS3",
  "Git e GitHub",
  "COMPETENCIAS COMPORTAMENTAIS",
  "Aprendizado continuo e curiosidade tecnica",
  "Boa comunicacao em ambientes colaborativos",
  "EXPERIENCIA",
  "Jovem Aprendiz - Almoxarifado | Natto",
  "Dez de 2024 - Atualmente",
  "PROJETOS",
  "MyVaccine - Sistema para controle do historico de vacinas.",
  "Rede Baiana - Simulador de infraestrutura de rede com analise de grafos."
];

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const confidenceForLine = (text, index) => {
  let confidence = 93.4;
  const variation = [-1.2, 0.4, -0.8, 1.1, -0.5][index % 5];

  const isMostlyUppercase = text === text.toUpperCase() && /[A-Z]/.test(text);
  const isContactLine = /@|linkedin\.com|github\.com|\(\d{2}\)/.test(text);
  const isLongSentence = text.length > 90;
  const isProjectOrRole = / - | \| /.test(text);

  if (isMostlyUppercase) confidence = 97.2; // Titulo/section header costuma ter OCR mais estavel
  if (isContactLine) confidence = 90.1; // Emails/URLs/telefone costumam perder alguns pontos
  if (isLongSentence) confidence = 88.7; // Linhas longas tendem a ter mais ruído
  if (isProjectOrRole) confidence -= 1.0; // Separadores podem reduzir confiança

  return Number(clamp(confidence + variation, 82.0, 99.2).toFixed(1));
};

const resumeLineBlocks = resumeDetectedLines.map((Text, index) => ({
  BlockType: "LINE",
  Confidence: confidenceForLine(Text, index),
  Text,
  Id: `mock-line-${index + 1}`
}));

export const mockOcr = () => ({
  ok: true,
  service: "Mock AWS",
  action: "DetectDocumentText",
  detectedLines: resumeDetectedLines,
  raw: { Blocks: resumeLineBlocks }
});

export const mockAnalyze = () => ({
  ok: true,
  service: "Mock AWS",
  action: "AnalyzeDocument",
  raw: {
    DocumentMetadata: { Pages: 1 },
    Blocks: resumeLineBlocks
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
