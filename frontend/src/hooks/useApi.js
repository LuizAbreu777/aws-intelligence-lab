import { useCallback, useState } from "react";

export function useApi(baseUrl, useMockAws) {
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState(null);
  const [error, setError] = useState(null);

  const request = useCallback(
    async (
      endpoint,
      {
        method = "POST",
        body = null,
        isFileUpload = false,
        useMockAwsOverride,
        updateUi = true
      } = {}
    ) => {
      if (updateUi) {
        setLoading(true);
        setResponse(null);
        setError(null);
      }

      try {
        const headers = {
          "x-use-mock-aws": String(
            typeof useMockAwsOverride === "boolean" ? useMockAwsOverride : useMockAws
          )
        };

        let finalBody = body;

        if (!isFileUpload && method !== "GET") {
          headers["Content-Type"] = "application/json";
          finalBody = JSON.stringify(body);
        }

        const res = await fetch(`${baseUrl}${endpoint}`, {
          method,
          headers,
          body: method === "GET" ? undefined : finalBody
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(data.message || data.error || "Erro ao comunicar com o servidor");
        }

        if (updateUi) setResponse(data);
        return data;
      } catch (err) {
        const message = err?.message || "Falha na conexao com o Backend";
        if (updateUi) setError(message);
        throw err;
      } finally {
        if (updateUi) setLoading(false);
      }
    },
    [baseUrl, useMockAws]
  );

  return {
    loading,
    response,
    error,
    setError,
    setResponse,
    request
  };
}
