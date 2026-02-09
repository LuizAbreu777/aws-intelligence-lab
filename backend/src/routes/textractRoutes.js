import express from "express";
import {
  DetectDocumentTextCommand,
  AnalyzeDocumentCommand,
  StartDocumentAnalysisCommand,
  GetDocumentAnalysisCommand
} from "@aws-sdk/client-textract";

import { getTextractClient } from "../aws/textractClient.js";
import { mockAnalyze, mockOcr, mockPdfStart, mockPdfStatus } from "../mocks/awsMocks.js";
import { uploadImage } from "../utils/fileUpload.js";
import { shouldUseMockAws } from "../utils/mockAws.js";
import { requireS3Key } from "../utils/validate.js";

export const textractRoutes = express.Router();

textractRoutes.post("/ocr", uploadImage.single("file"), async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ ok: false, error: "Arquivo 'file' é obrigatório (JPG/PNG)." });
    }

    if (shouldUseMockAws(req)) {
      return res.json(mockOcr());
    }

    const client = getTextractClient();
    const result = await client.send(
      new DetectDocumentTextCommand({ Document: { Bytes: req.file.buffer } })
    );

    const lines = (result.Blocks || [])
      .filter(b => b.BlockType === "LINE" && b.Text)
      .map(b => b.Text);

    res.json({
      ok: true,
      service: "Amazon Textract",
      action: "DetectDocumentText",
      detectedLines: lines,
      raw: result
    });
  } catch (err) {
    next(err);
  }
});

textractRoutes.post("/analyze", uploadImage.single("file"), async (req, res, next) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ ok: false, error: "Arquivo 'file' é obrigatório (JPG/PNG)." });
    }

    if (shouldUseMockAws(req)) {
      return res.json(mockAnalyze());
    }

    const client = getTextractClient();
    const result = await client.send(
      new AnalyzeDocumentCommand({
        Document: { Bytes: req.file.buffer },
        FeatureTypes: ["TABLES", "FORMS"]
      })
    );

    res.json({ ok: true, service: "Amazon Textract", action: "AnalyzeDocument", raw: result });
  } catch (err) {
    next(err);
  }
});

// PDF via S3 (assíncrono)
textractRoutes.post("/pdf/start", async (req, res, next) => {
  try {
    const bucket = process.env.TEXTRACT_S3_BUCKET;
    if (!bucket) {
      return res.status(500).json({ ok: false, error: "Defina TEXTRACT_S3_BUCKET no .env." });
    }

    const { s3Key } = req.body;
    requireS3Key(s3Key);

    if (shouldUseMockAws(req)) {
      return res.json(mockPdfStart());
    }

    const client = getTextractClient();
    const result = await client.send(
      new StartDocumentAnalysisCommand({
        DocumentLocation: { S3Object: { Bucket: bucket, Name: s3Key } },
        FeatureTypes: ["TABLES", "FORMS"]
      })
    );

    res.json({
      ok: true,
      service: "Amazon Textract",
      action: "StartDocumentAnalysis",
      jobId: result.JobId
    });
  } catch (err) {
    next(err);
  }
});

textractRoutes.get("/pdf/status/:jobId", async (req, res, next) => {
  try {
    const { jobId } = req.params;

    if (shouldUseMockAws(req)) {
      return res.json(mockPdfStatus(jobId));
    }

    const client = getTextractClient();

    const result = await client.send(
      new GetDocumentAnalysisCommand({ JobId: jobId, MaxResults: 1000 })
    );

    res.json({
      ok: true,
      service: "Amazon Textract",
      action: "GetDocumentAnalysis",
      status: result.JobStatus,
      raw: result
    });
  } catch (err) {
    next(err);
  }
});
