export function shouldUseMockAws(req, fallback = process.env.MOCK_AWS === "true") {
  const headerValue = req?.headers?.["x-use-mock-aws"];
  if (headerValue == null) return fallback;

  const normalized = String(headerValue).trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "mock";
}
