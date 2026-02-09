import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import amqp from "amqplib";
import pkg from "pg";

import { comprehendRoutes } from "./routes/comprehendRoutes.js";
import { textractRoutes } from "./routes/textractRoutes.js";

const { Pool } = pkg;

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  // DB + Rabbit dentro do app (mais previsível)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const QUEUES = {
    ingest: "jobs.ingest",
    ocr: "jobs.ocr",
    nlp: "jobs.nlp",
    completed: "jobs.completed"
  };
  const QUEUE_DLQS = {
    ingest: "jobs.ingest.dlq",
    ocr: "jobs.ocr.dlq",
    nlp: "jobs.nlp.dlq"
  };
  let channel;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function getChannel() {
    if (channel) return channel;
    const retries = 20;
    const waitMs = 1500;

    for (let i = 1; i <= retries; i++) {
      try {
        const conn = await amqp.connect(process.env.RABBITMQ_URL);
        channel = await conn.createChannel();
        await Promise.all([
          channel.assertQueue(QUEUE_DLQS.ingest, { durable: true }),
          channel.assertQueue(QUEUE_DLQS.ocr, { durable: true }),
          channel.assertQueue(QUEUE_DLQS.nlp, { durable: true }),
          channel.assertQueue(QUEUES.completed, { durable: true }),
          channel.assertQueue(QUEUES.ingest, {
            durable: true,
            arguments: { "x-dead-letter-exchange": "", "x-dead-letter-routing-key": QUEUE_DLQS.ingest }
          }),
          channel.assertQueue(QUEUES.ocr, {
            durable: true,
            arguments: { "x-dead-letter-exchange": "", "x-dead-letter-routing-key": QUEUE_DLQS.ocr }
          }),
          channel.assertQueue(QUEUES.nlp, {
            durable: true,
            arguments: { "x-dead-letter-exchange": "", "x-dead-letter-routing-key": QUEUE_DLQS.nlp }
          })
        ]);
        return channel;
      } catch (err) {
        if (i === retries) throw err;
        await sleep(waitMs);
      }
    }
  }

  app.get("/health", async (req, res) => {
    try {
      // Testa conexão com DB também (ajuda na demo)
      await pool.query("SELECT 1");
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: "DB não conectou", details: e.message });
    }
  });

  // 🔥 Tier 4: cria JOB e manda pra fila
  app.post("/jobs", async (req, res, next) => {
    try {
      const { type = "full", payload = {} } = req.body || {};
      const id = crypto.randomUUID();
      const correlationId = id;
      console.log(`[api][${correlationId}] creating job type=${type}`);

      await pool.query(
        `INSERT INTO jobs (id, type, status, stage, progress, payload, meta)
         VALUES ($1, $2, 'queued', 'ingest', 0, $3, $4)`,
        [id, type, payload, { languageCode: payload?.languageCode || "pt", s3Key: payload?.s3Key || null }]
      );

      const ch = await getChannel();
      ch.sendToQueue(
        QUEUES.ingest,
        Buffer.from(JSON.stringify({ jobId: id, type, stage: "ingest", payload })),
        { persistent: true, correlationId }
      );

      res.set("x-correlation-id", correlationId);
      res.status(201).json({ jobId: id, status: "queued", stage: "ingest", progress: 0 });
    } catch (e) {
      next(e);
    }
  });

  app.get("/jobs/stats", async (req, res, next) => {
    try {
      const { rows } = await pool.query(`
        SELECT status, stage, COUNT(*)::int AS total
        FROM jobs
        GROUP BY status, stage
        ORDER BY status, stage
      `);
      res.json({ ok: true, stats: rows });
    } catch (e) {
      next(e);
    }
  });

  // Consulta JOB (polling)
  app.get("/jobs/:id", async (req, res, next) => {
    try {
      const { id } = req.params;
      const { rows } = await pool.query(`SELECT * FROM jobs WHERE id = $1`, [id]);
      if (!rows.length) return res.status(404).json({ ok: false, error: "Job não encontrado" });
      res.json({ ok: true, job: rows[0] });
    } catch (e) {
      next(e);
    }
  });

  // Suas rotas atuais
  app.use("/comprehend", comprehendRoutes);
  app.use("/textract", textractRoutes);

  // Error handler
  app.use((err, req, res, next) => {
    const status = err.statusCode || 500;
    res.status(status).json({ ok: false, error: err.message || "Erro interno" });
  });

  return app;
}
