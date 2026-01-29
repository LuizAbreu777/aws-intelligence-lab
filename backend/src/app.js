import express from "express";
import cors from "cors";
import { comprehendRoutes } from "./routes/comprehendRoutes.js";
import { textractRoutes } from "./routes/textractRoutes.js";

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (req, res) => res.json({ ok: true }));

  app.use("/comprehend", comprehendRoutes);
  app.use("/textract", textractRoutes);

  app.use((err, req, res, next) => {
    const status = err.statusCode || 500;
    res.status(status).json({ ok: false, error: err.message || "Erro interno" });
  });

  return app;
}
