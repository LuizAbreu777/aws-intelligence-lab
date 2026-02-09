import {
  QUEUES,
  MAX_RETRIES,
  connectRabbitWithRetry,
  createChannelWithQueues,
  getJob,
  getCorrelationId,
  incrementAttemptCount,
  isTransientError,
  updateJob,
  parseMessage
} from "./common.js";

function validatePayload(payload = {}) {
  const hasS3Key = typeof payload.s3Key === "string" && payload.s3Key.trim().length > 0;
  const hasText = typeof payload.text === "string" && payload.text.trim().length > 0;
  if (!hasS3Key && !hasText) {
    throw new Error("Payload inválido: informe 's3Key' ou 'text'.");
  }

  if (payload.languageCode != null) {
    const lang = String(payload.languageCode).toLowerCase();
    if (lang !== "pt" && lang !== "en") {
      throw new Error("Payload inválido: languageCode deve ser 'pt' ou 'en'.");
    }
  }
}

async function main() {
  console.log("[worker-ingest] iniciando...");
  const conn = await connectRabbitWithRetry();
  const channel = await createChannelWithQueues(conn);
  channel.prefetch(5);

  console.log(`[worker-ingest] aguardando mensagens em ${QUEUES.ingest}`);

  channel.consume(
    QUEUES.ingest,
    async (msg) => {
      if (!msg) return;

      let job;
      try {
        job = parseMessage(msg);
        const correlationId = getCorrelationId(msg, job?.jobId);
        const { jobId, type = "full", payload = {} } = job;
        if (!jobId) throw new Error("Mensagem sem jobId.");
        validatePayload(payload);

        await updateJob(jobId, {
          status: "processing",
          stage: "ingest",
          progress: 10,
          error_message: null
        });

        channel.sendToQueue(
          QUEUES.ocr,
          Buffer.from(JSON.stringify({ jobId, type, stage: "ocr", payload })),
          { persistent: true, correlationId }
        );

        channel.ack(msg);
        console.log(`[worker-ingest][${correlationId}] job ${jobId} encaminhado para ${QUEUES.ocr}`);
      } catch (err) {
        const correlationId = getCorrelationId(msg, job?.jobId);
        console.error(`[worker-ingest][${correlationId}] erro:`, err?.message);
        if (job?.jobId) {
          const transient = isTransientError(err);
          if (transient) {
            const persistedJob = await getJob(job.jobId);
            const attempts = Number(persistedJob?.attempt_count || 0);
            if (attempts < MAX_RETRIES) {
              await incrementAttemptCount(job.jobId);
              channel.nack(msg, false, true);
              return;
            }
          }

          await updateJob(job.jobId, {
            status: "failed",
            stage: "ingest",
            error_message: err?.message || "erro no ingest"
          });
        }
        channel.nack(msg, false, false);
      }
    },
    { noAck: false }
  );
}

main().catch((err) => {
  console.error("[worker-ingest] fatal:", err);
  process.exit(1);
});
