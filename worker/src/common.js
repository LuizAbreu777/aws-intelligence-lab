import amqp from "amqplib";
import pkg from "pg";

const { Pool } = pkg;

export const RABBITMQ_URL = process.env.RABBITMQ_URL || "amqp://localhost:5672";
export const DATABASE_URL = process.env.DATABASE_URL;
export const MOCK_AWS = process.env.MOCK_AWS === "true";

export const QUEUES = {
  ingest: process.env.JOB_QUEUE_INGEST || "jobs.ingest",
  ocr: process.env.JOB_QUEUE_OCR || "jobs.ocr",
  nlp: process.env.JOB_QUEUE_NLP || "jobs.nlp",
  completed: process.env.JOB_QUEUE_COMPLETED || "jobs.completed"
};
export const MAX_RETRIES = Number(process.env.JOB_MAX_RETRIES || 3);

export const pool = new Pool({ connectionString: DATABASE_URL });

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function connectRabbitWithRetry(retries = 60, waitMs = 6000) {
  for (let i = 1; i <= retries; i++) {
    try {
      const conn = await amqp.connect(RABBITMQ_URL);
      return conn;
    } catch (err) {
      console.log(`[worker] RabbitMQ indisponivel (${i}/${retries}). tentando novamente...`);
      await sleep(waitMs);
    }
  }
  throw new Error("Nao foi possivel conectar ao RabbitMQ.");
}

export async function createChannelWithQueues(conn) {
  const channel = await conn.createChannel();
  await Promise.all([
    channel.assertQueue(`${QUEUES.ingest}.dlq`, { durable: true }),
    channel.assertQueue(`${QUEUES.ocr}.dlq`, { durable: true }),
    channel.assertQueue(`${QUEUES.nlp}.dlq`, { durable: true }),
    channel.assertQueue(QUEUES.completed, { durable: true }),
    channel.assertQueue(QUEUES.ingest, {
      durable: true,
      arguments: { "x-dead-letter-exchange": "", "x-dead-letter-routing-key": `${QUEUES.ingest}.dlq` }
    }),
    channel.assertQueue(QUEUES.ocr, {
      durable: true,
      arguments: { "x-dead-letter-exchange": "", "x-dead-letter-routing-key": `${QUEUES.ocr}.dlq` }
    }),
    channel.assertQueue(QUEUES.nlp, {
      durable: true,
      arguments: { "x-dead-letter-exchange": "", "x-dead-letter-routing-key": `${QUEUES.nlp}.dlq` }
    })
  ]);
  return channel;
}

export async function updateJob(id, fields) {
  const keys = Object.keys(fields);
  const values = Object.values(fields);
  const setClause = keys.map((k, idx) => `${k} = $${idx + 2}`).join(", ");
  const sql = `
    UPDATE jobs
    SET ${setClause}, updated_at = NOW()
    WHERE id = $1
  `;
  await pool.query(sql, [id, ...values]);
}

export async function getJob(id) {
  const { rows } = await pool.query("SELECT * FROM jobs WHERE id = $1", [id]);
  return rows[0] || null;
}

export async function mergeJobResult(id, partialResult, extraFields = {}) {
  const job = await getJob(id);
  const current = job?.result || {};
  const merged = { ...current, ...partialResult };
  await updateJob(id, { result: merged, ...extraFields });
}

export async function incrementAttemptCount(id) {
  await pool.query(
    "UPDATE jobs SET attempt_count = attempt_count + 1, updated_at = NOW() WHERE id = $1",
    [id]
  );
}

export function getCorrelationId(msg, fallbackId = "unknown") {
  return msg?.properties?.correlationId || fallbackId;
}

export function isTransientError(err) {
  const code = String(err?.code || "");
  const message = String(err?.message || "").toLowerCase();
  return (
    ["TimeoutError", "NetworkingError", "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "ThrottlingException", "TooManyRequestsException"].includes(code) ||
    message.includes("timeout") ||
    message.includes("throttl") ||
    message.includes("temporar")
  );
}

export function parseMessage(msg) {
  if (!msg) return null;
  return JSON.parse(msg.content.toString());
}
