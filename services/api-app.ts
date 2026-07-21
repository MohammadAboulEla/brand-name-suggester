import express from "express";
import { suggest_brand_names, transliterate_word } from "./brand-suggester";

// Express app holding only the JSON API routes, shared between the local
// long-running server (server.ts) and the Vercel serverless function (api/[...path].ts).
export function createApiApp() {
  const app = express();
  app.use(express.json());

  app.post("/api/transliterate", async (req, res) => {
    try {
      const { word, provider } = req.body;
      if (!word) {
        return res.status(400).json({ success: false, error: "Word is required" });
      }
      const isArabic = /^[؀-ۿ]/.test(word.trim());
      if (!isArabic) {
        return res.status(400).json({ success: false, error: "Word must start with an Arabic character" });
      }
      const transliteration = await transliterate_word(word, provider);
      res.json({ success: true, transliteration });
    } catch (error: any) {
      console.error("API transliterate error:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to transliterate word" });
    }
  });

  app.post("/api/ai-provider/test", async (req, res) => {
    try {
      const { baseURL, apiKey, envVar } = req.body;
      if (!baseURL) {
        return res.status(400).json({ success: false, error: "Base URL is required" });
      }
      const resolvedKey = apiKey || (envVar ? process.env[envVar] : undefined);
      if (!resolvedKey) {
        return res.json({ success: false, error: envVar ? `No API key found in env var "${envVar}"` : "API key is required" });
      }

      const response = await fetch(`${baseURL.replace(/\/$/, "")}/models`, {
        headers: { Authorization: `Bearer ${resolvedKey}` },
      });

      if (!response.ok) {
        return res.json({ success: false, error: `Provider responded with ${response.status}` });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.json({ success: false, error: error.message || "Connection failed" });
    }
  });

  app.post("/api/suggest", async (req, res) => {
    try {
      const { word, letter_count, tone, mode, provider } = req.body;

      if (!word) {
        return res.status(400).json({ success: false, error: "Seed word is required" });
      }
      const isArabic = /^[؀-ۿ]/.test(word.trim());
      if (!isArabic) {
        return res.status(400).json({ success: false, error: "Seed word must start with an Arabic character" });
      }

      const suggestions = await suggest_brand_names({
        word,
        letter_count: letter_count ? Number(letter_count) : null,
        tone: tone || null,
        mode: mode || null,
        provider: provider || null,
      });

      res.json({ success: true, suggestions });
    } catch (error: any) {
      console.error("API suggest error:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to fetch brand names" });
    }
  });

  return app;
}
