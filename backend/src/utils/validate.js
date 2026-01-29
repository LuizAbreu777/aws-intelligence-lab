export function requireText(text) {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    const err = new Error("Campo 'text' é obrigatório e deve ser uma string não vazia.");
    err.statusCode = 400;
    throw err;
  }
  if (text.length > 5000) {
    const err = new Error("Texto muito grande. Envie até 5000 caracteres para a demo.");
    err.statusCode = 400;
    throw err;
  }
}

export function requireLanguageCode(languageCode) {
  const allowed = ["pt", "en", "es", "fr", "de", "it"];
  if (!languageCode || typeof languageCode !== "string") return "pt";
  const lc = languageCode.toLowerCase();
  if (!allowed.includes(lc)) return "pt";
  return lc;
}

export function requireS3Key(key) {
  if (!key || typeof key !== "string" || key.trim().length === 0) {
    const err = new Error("Campo 's3Key' é obrigatório para PDF via S3.");
    err.statusCode = 400;
    throw err;
  }
}
