import express from "express";
import {
  suggest_brand_names,
  transliterate_word,
  transliterate_words_batch,
  extractSynonyms,
  extractAntonyms,
  extractNisba,
  extractRhymes,
  suggestCompoundNames,
  LLMError,
  type LLMErrorKind,
} from "./new-brand-suggester.js";

// Maps a typed engine failure to an HTTP status + a machine-readable `kind` the
// client renders as an Arabic message. Non-LLMError throws stay generic 500s.
const KIND_STATUS: Record<LLMErrorKind, number> = {
  auth: 401,
  rate_limit: 429,
  network: 502,
  parse: 502,
  unknown: 500,
};

function sendError(res: import("express").Response, error: any, fallback: string) {
  if (error instanceof LLMError) {
    return res.status(KIND_STATUS[error.kind]).json({ success: false, kind: error.kind, error: error.message || fallback });
  }
  return res.status(500).json({ success: false, kind: "unknown", error: error?.message || fallback });
}

// Extraction modes handled directly via the dedicated new-brand-suggester functions
// (kept out of suggest_brand_names, which only knows "derivatives"/"plurals").
const WORD_LIST_EXTRACTORS: Record<string, (word: string, provider?: any) => Promise<string[]>> = {
  synonyms: extractSynonyms,
  antonyms: extractAntonyms,
  nisba: extractNisba,
  rhymes: extractRhymes,
  compounds: suggestCompoundNames,
};

// Express app holding only the JSON API routes, shared between the local
// long-running server (server.ts) and the Vercel serverless function (api/[...path].ts).
export function createApiApp() {
  const app = express();
  app.use(express.json());

  app.post("/api/transliterate", async (req, res) => {
    try {
      const { word, provider } = req.body;
      if (!word) {
        return res.status(400).json({ success: false, kind: "validation", error: "Word is required" });
      }
      const isArabic = /^[؀-ۿ]/.test(word.trim());
      if (!isArabic) {
        return res.status(400).json({ success: false, kind: "validation", error: "Word must start with an Arabic character" });
      }
      const transliteration = await transliterate_word(word, provider);
      res.json({ success: true, transliteration });
    } catch (error: any) {
      console.error("API transliterate error:", error);
      sendError(res, error, "Failed to transliterate word");
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
        return res.json({ success: false, kind: "auth", error: envVar ? `No API key found in env var "${envVar}"` : "API key is required" });
      }

      const response = await fetch(`${baseURL.replace(/\/$/, "")}/models`, {
        headers: { Authorization: `Bearer ${resolvedKey}` },
      });

      if (!response.ok) {
        // Read the provider's own error message (e.g. "Invalid API Key") rather than a bare status.
        const body: any = await response.json().catch(() => null);
        const providerMsg = body?.error?.message || body?.message;
        const kind: LLMErrorKind =
          response.status === 401 || response.status === 403 ? "auth"
          : response.status === 429 ? "rate_limit"
          : response.status >= 500 ? "network"
          : "unknown";
        return res.json({ success: false, kind, error: providerMsg || `Provider responded with ${response.status}` });
      }
      res.json({ success: true });
    } catch (error: any) {
      res.json({ success: false, kind: "network", error: error.message || "Connection failed" });
    }
  });

  app.post("/api/suggest", async (req, res) => {
    try {
      const { word, letter_count, tone, mode, provider } = req.body;

      if (!word) {
        return res.status(400).json({ success: false, kind: "validation", error: "Seed word is required" });
      }
      const isArabic = /^[؀-ۿ]/.test(word.trim());
      if (!isArabic) {
        return res.status(400).json({ success: false, kind: "validation", error: "Seed word must start with an Arabic character" });
      }

      const extractor = mode ? WORD_LIST_EXTRACTORS[mode] : undefined;
      let suggestions;
      if (extractor) {
        const words = await extractor(word, provider || null);
        const translitMap = await transliterate_words_batch(words, provider || null);
        suggestions = words.map((w) => ({ word: w, transliteration: translitMap[w] ?? w.toUpperCase() }));
      } else {
        suggestions = await suggest_brand_names({
          word,
          letter_count: letter_count ? Number(letter_count) : null,
          tone: tone || null,
          mode: mode || null,
          provider: provider || null,
        });
      }

      res.json({ success: true, suggestions });
    } catch (error: any) {
      console.error("API suggest error:", error);
      sendError(res, error, "Failed to fetch brand names");
    }
  });

  return app;
}
