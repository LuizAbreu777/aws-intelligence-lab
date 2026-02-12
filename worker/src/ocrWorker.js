import {
  GetDocumentTextDetectionCommand,
  StartDocumentTextDetectionCommand,
  TextractClient
} from "@aws-sdk/client-textract";
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
  sleep,
  updateJob
} from "./common.js";
import { buildUsabilityOcrMock, isUsabilityPdfMock } from "./mocks/pdfAsyncMocks.js";

const region = process.env.AWS_REGION || "us-east-1";
const textractBucket = process.env.TEXTRACT_S3_BUCKET;
const textractClient = new TextractClient({ region });

async function waitForTextDetection(jobId) {
  const maxAttempts = 60;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await textractClient.send(
      new GetDocumentTextDetectionCommand({ JobId: jobId, MaxResults: 1000 })
    );

    if (result.JobStatus === "SUCCEEDED") return result;
    if (result.JobStatus === "FAILED" || result.JobStatus === "PARTIAL_SUCCESS") {
      throw new Error(`Textract retornou ${result.JobStatus}.`);
    }

    await sleep(4000);
  }

  throw new Error("Timeout aguardando resultado do Textract.");
}

function extractLines(blocks = []) {
  return blocks
    .filter((b) => b.BlockType === "LINE" && b.Text)
    .map((b) => b.Text);
}

async function processOcr(job) {
  const payload = job?.payload || {};
  const s3Key = payload?.s3Key || job?.meta?.s3Key;
  const inputText = payload?.text;
  const useMockAws = typeof payload?.useMockAws === "boolean" ? payload.useMockAws : MOCK_AWS;

  if (inputText) {
    return {
      text: inputText,
      lineCount: inputText.split("\n").filter(Boolean).length || 1,
      source: "payload.text"
    };
  }

  if (!s3Key) throw new Error("Payload sem 'text' ou 's3Key' para OCR.");

  if (useMockAws) {
    if (isUsabilityPdfMock(s3Key)) {
      return buildUsabilityOcrMock();
    }

    return {
      text: `MOCK OCR do arquivo ${s3Key}`,
      lineCount: 1,
      source: "mock"
    };
  }

  if (!textractBucket) throw new Error("Defina TEXTRACT_S3_BUCKET para OCR assíncrono.");

  const start = await textractClient.send(
    new StartDocumentTextDetectionCommand({
      DocumentLocation: { S3Object: { Bucket: textractBucket, Name: s3Key } }
    })
  );

  if (!start.JobId) throw new Error("Textract não retornou JobId.");

  const result = await waitForTextDetection(start.JobId);
  const lines = extractLines(result.Blocks || []);

  return {
    text: lines.join("\n"),
    lineCount: lines.length,
    source: "textract",
    textractJobId: start.JobId
  };
}

async function main() {
  console.log("[worker-ocr] iniciando...");
  const conn = await connectRabbitWithRetry();
  const channel = await createChannelWithQueues(conn);
  channel.prefetch(3);

  console.log(`[worker-ocr] aguardando mensagens em ${QUEUES.ocr}`);

  channel.consume(
    QUEUES.ocr,
    async (msg) => {
      if (!msg) return;

      let message;
      try {
        message = parseMessage(msg);
        const correlationId = getCorrelationId(msg, message?.jobId);
        const { jobId, type = "full" } = message;
        if (!jobId) throw new Error("Mensagem sem jobId.");

        await updateJob(jobId, {
          status: "processing",
          stage: "ocr",
          progress: 35
        });

        const job = await getJob(jobId);
        if (!job) throw new Error("Job não encontrado para OCR.");

        const ocr = await processOcr(job);

        await mergeJobResult(
          jobId,
          { ocrText: ocr.text, ocr },
          {
            stage: "ocr",
            progress: 60,
            meta: { ...(job.meta || {}), textractJobId: ocr.textractJobId || null }
          }
        );

        channel.sendToQueue(
          QUEUES.nlp,
          Buffer.from(JSON.stringify({ jobId, type, stage: "nlp" })),
          { persistent: true, correlationId }
        );

        channel.ack(msg);
        console.log(`[worker-ocr][${correlationId}] job ${jobId} encaminhado para ${QUEUES.nlp}`);
      } catch (err) {
        const correlationId = getCorrelationId(msg, message?.jobId);
        console.error(`[worker-ocr][${correlationId}] erro:`, err?.message);
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
            stage: "ocr",
            error_message: err?.message || "erro no ocr"
          });
        }
        channel.nack(msg, false, false);
      }
    },
    { noAck: false }
  );
}

main().catch((err) => {
  console.error("[worker-ocr] fatal:", err);
  process.exit(1);
});
