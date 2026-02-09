import {
  ComprehendClient,
  DetectEntitiesCommand,
  DetectSentimentCommand
} from "@aws-sdk/client-comprehend";
import {
  MOCK_AWS,
  QUEUES,
  MAX_RETRIES,
  connectRabbitWithRetry,
  createChannelWithQueues,
  getJob,
  getCorrelationId,
  incrementAttemptCount,
  isTransientError,
  mergeJobResult,
  parseMessage,
  updateJob
} from "./common.js";

const region = process.env.AWS_REGION || "us-east-1";
const comprehendClient = new ComprehendClient({ region });

function normalizeLanguageCode(lang) {
  const value = String(lang || "pt").toLowerCase();
  if (value.startsWith("pt")) return "pt";
  if (value.startsWith("en")) return "en";
  return "en";
}

async function runNlp(text, languageCode) {
  if (MOCK_AWS) {
    return {
      sentiment: { Sentiment: "NEUTRAL", SentimentScore: { Positive: 0.1, Negative: 0.1, Neutral: 0.8, Mixed: 0 } },
      entities: [{ Type: "OTHER", Text: "MOCK", Score: 0.99 }]
    };
  }

  const sentiment = await comprehendClient.send(
    new DetectSentimentCommand({ Text: text, LanguageCode: languageCode })
  );

  const entities = await comprehendClient.send(
    new DetectEntitiesCommand({ Text: text, LanguageCode: languageCode })
  );

  return { sentiment, entities: entities.Entities || [] };
}

async function main() {
  console.log("[worker-nlp] iniciando...");
  const conn = await connectRabbitWithRetry();
  const channel = await createChannelWithQueues(conn);
  channel.prefetch(5);

  console.log(`[worker-nlp] aguardando mensagens em ${QUEUES.nlp}`);

  channel.consume(
    QUEUES.nlp,
    async (msg) => {
      if (!msg) return;

      let message;
      try {
        message = parseMessage(msg);
        const correlationId = getCorrelationId(msg, message?.jobId);
        const { jobId } = message;
        if (!jobId) throw new Error("Mensagem sem jobId.");

        await updateJob(jobId, {
          status: "processing",
          stage: "nlp",
          progress: 75
        });

        const job = await getJob(jobId);
        if (!job) throw new Error("Job não encontrado para NLP.");

        const languageCode = normalizeLanguageCode(job?.meta?.languageCode || job?.payload?.languageCode);
        const text = job?.result?.ocrText || job?.result?.ocr?.text || job?.payload?.text;
        if (!text || !text.trim()) throw new Error("Texto vazio para processamento NLP.");

        const nlp = await runNlp(text, languageCode);

        await mergeJobResult(
          jobId,
          { nlp },
          {
            status: "done",
            stage: "completed",
            progress: 100,
            error_message: null
          }
        );

        channel.sendToQueue(
          QUEUES.completed,
          Buffer.from(JSON.stringify({ jobId, stage: "completed" })),
          { persistent: true, correlationId }
        );

        channel.ack(msg);
        console.log(`[worker-nlp][${correlationId}] job ${jobId} finalizado`);
      } catch (err) {
        const correlationId = getCorrelationId(msg, message?.jobId);
        console.error(`[worker-nlp][${correlationId}] erro:`, err?.message);
        if (message?.jobId) {
          const transient = isTransientError(err);
          if (transient) {
            const persistedJob = await getJob(message.jobId);
            const attempts = Number(persistedJob?.attempt_count || 0);
            if (attempts < MAX_RETRIES) {
              await incrementAttemptCount(message.jobId);
              channel.nack(msg, false, true);
              return;
            }
          }

          await updateJob(message.jobId, {
            status: "failed",
            stage: "nlp",
            error_message: err?.message || "erro no nlp"
          });
        }
        channel.nack(msg, false, false);
      }
    },
    { noAck: false }
  );
}

main().catch((err) => {
  console.error("[worker-nlp] fatal:", err);
  process.exit(1);
});
