import express from "express";
import path from "path";
import dotenv from "dotenv";
import { createServer as createViteServer } from "vite";
import { suggest_brand_names, transliterate_word } from "./services/brand-suggester";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Arabic word transliteration route
  app.post("/api/transliterate", async (req, res) => {
    try {
      const { word, provider } = req.body;
      if (!word) {
        return res.status(400).json({ success: false, error: "Word is required" });
      }
      const isArabic = /^[\u0600-\u06FF]/.test(word.trim());
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

  // AI provider connection test route (used by the Settings modal)
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

  // Arabic brand suggestions API route
  app.post("/api/suggest", async (req, res) => {
    try {
      const { word, letter_count, tone, mode, provider } = req.body;

      if (!word) {
        return res.status(400).json({ success: false, error: "Seed word is required" });
      }
      const isArabic = /^[\u0600-\u06FF]/.test(word.trim());
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

  // Vite middleware for development vs static asset serving for production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
