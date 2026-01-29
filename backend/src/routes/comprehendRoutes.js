import express from "express";
import { DetectSentimentCommand, DetectEntitiesCommand } from "@aws-sdk/client-comprehend";
import { getComprehendClient } from "../aws/comprehendClient.js";
import { requireText, requireLanguageCode } from "../utils/validate.js";

export const comprehendRoutes = express.Router();

comprehendRoutes.post("/sentiment", async (req, res, next) => {
  try {
    const { text, languageCode } = req.body;
    requireText(text);
    const lang = requireLanguageCode(languageCode);

    const client = getComprehendClient();
    const result = await client.send(
      new DetectSentimentCommand({ Text: text, LanguageCode: lang })
    );

    res.json({ ok: true, service: "Amazon Comprehend", action: "DetectSentiment", result });
  } catch (err) {
    next(err);
  }
});

comprehendRoutes.post("/entities", async (req, res, next) => {
  try {
    const { text, languageCode } = req.body;
    requireText(text);
    const lang = requireLanguageCode(languageCode);

    const client = getComprehendClient();
    const result = await client.send(
      new DetectEntitiesCommand({ Text: text, LanguageCode: lang })
    );

    res.json({ ok: true, service: "Amazon Comprehend", action: "DetectEntities", result });
  } catch (err) {
    next(err);
  }
});
