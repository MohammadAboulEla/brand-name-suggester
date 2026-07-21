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
      const { word } = req.body;
      if (!word) {
        return res.status(400).json({ success: false, error: "Word is required" });
      }
      const isArabic = /^[\u0600-\u06FF]/.test(word.trim());
      if (!isArabic) {
        return res.status(400).json({ success: false, error: "Word must start with an Arabic character" });
      }
      const transliteration = await transliterate_word(word);
      res.json({ success: true, transliteration });
    } catch (error: any) {
      console.error("API transliterate error:", error);
      res.status(500).json({ success: false, error: error.message || "Failed to transliterate word" });
    }
  });

  // Arabic brand suggestions API route
  app.post("/api/suggest", async (req, res) => {
    try {
      const { word, letter_count, tone, mode } = req.body;
      
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
