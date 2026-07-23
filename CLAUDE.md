# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev      # runs server.ts via tsx (vite in middleware mode, HMR enabled)
pnpm build    # vite build (client) + esbuild bundle of server.ts -> dist/server.cjs
pnpm start    # node dist/server.cjs (production, serves dist/ as static + SPA fallback)
pnpm lint     # tsc --noEmit (no separate test suite or linter config in this repo)
pnpm clean    # rm -rf dist server.js
```

There is no test runner configured — `lint` (type-checking) is the only verification command available.

Package manager is pnpm (enforced by a `preinstall` `only-allow pnpm` guard).

## Architecture

This is an Arabic brand-name generator: an Express server + Vite-served React SPA, backed by an LLM for word suggestion/transliteration. There is no database — everything is generated live via LLM calls (see `Readme.md` for the original product rationale: no static Arabic lexicon was available, so semantic expansion + morphological generation via LLM prompting was chosen over a lookup table).

**Entry / server (`server.ts`)** is thin: it loads env, calls `createApiApp()` for the JSON routes, then either mounts Vite in middleware mode (dev, so the same process serves API + SPA with HMR) or serves the pre-built `dist/` static assets with an SPA fallback (production). Listens on port 3000.

**API app (`services/api-app.ts`)** — `createApiApp()` builds the Express app holding only the JSON routes, and is shared between the local long-running server (`server.ts`) and the Vercel serverless entry (`api/index.ts`, wired via `vercel.json` rewrites that funnel `/api/:path*` → `/api`). Routes:
- `POST /api/suggest` — validates the seed word starts with an Arabic character, then dispatches by `mode`: `synonyms` / `antonyms` / `nisba` / `rhymes` / `compounds` go through `WORD_LIST_EXTRACTORS` (extractor → `transliterate_words_batch`); everything else (no mode, `derivatives`, `plurals`) goes through `suggest_brand_names()`.
- `POST /api/transliterate` — `transliterate_word()` for an English capital-letter phonetic rendering of an Arabic word.
- `POST /api/ai-provider/test` — pings a provider's `/models` endpoint to validate a base URL + API key (used by the AI Settings modal's "test connection").

**LLM layer (`services/new-brand-suggester.ts`)** is the core engine. It supports **two backends**, chosen per-request:
- If the client forwards a `provider` object (`{ baseURL, model, apiKey?, envVar? }`) that resolves to an API key, `generateWithProvider()` runs the prompt through an **OpenAI-compatible** endpoint (`openai` SDK).
- Otherwise it falls back to `@google/genai` (Gemini) with `DEFAULT_TEXT_MODEL = "gemini-flash-lite-latest"` and structured output (`responseSchema`).

`generateJson()` is the shared "call provider or Gemini → parse JSON → retry once" flow used by every extractor; `extractJson()` strips markdown fences / stray prose before parsing. `MAX_SUGGESTIONS = 5` caps every list. Generation functions (all take an optional `ProviderRequest`):
- `suggest_brand_names()` — default combined prompt (semantic + morphological + metaphorical, mixed deliberately); also handles `mode: "derivatives"` / `"plurals"` internally.
- `extractDerivatives`, `extractPlurals`, `extractSynonyms`, `extractAntonyms`, `extractNisba`, `extractRhymes`, `suggestCompoundNames`, `extractRoot` — targeted single-purpose extractors returning `string[]`.
- `transliterate_word` / `transliterate_words_batch` — Latin capital-letter phonetics.
- `crossLingualEcho`, `extractDefinition` — **exported but not currently routed** in `api-app.ts`; treat as available-but-inactive infrastructure.

`isValidArabicWord()` guards against empty/diacritics-only/overlong input and prompt injection via `ARABIC_WORD_RE = /^[؀-ۿ\s'\-]{1,50}$/`. Note this is a *stricter* validator than the `/^[؀-ۿ]/` "starts-with-Arabic" check used in the API routes and client — both regexes exist in the codebase.

**`services/ai-provider/`** (`client.ts`, `presets.ts`, `registry.ts`, `types.ts`) is a separate generic multi-provider abstraction (presets, a registry resolving keys from env vars, a shared `createClient()`). The **active** provider-swap path is the `ProviderRequest` + `generateWithProvider()` flow inside `new-brand-suggester.ts` driven by the AI Settings modal — this `ai-provider/` directory is parallel infrastructure, not the wired path.

**Client (`src/`)** is a single-page app (no router) built around `@xyflow/react` (React Flow), with `motion` for animations and `lucide-react` icons:
- `App.tsx` — top-level UI shell and cross-cutting state (`rootWord`, `favorites`, `selectedWord`, theme, `edgeType`/`isEdgeDashed`, `isCompactMoreMenu`, `isFakeMode`). Conditional render: `<LandingPage />` when `rootWord == null`, otherwise the `<ExplorationTree />` workspace with favorites sidebar, settings sidebar ("Smoke Run" fake-data mode, edge shape/style), AI Settings modal, and back-confirmation dialog.
- `components/LandingPage.tsx` — onboarding seed-entry screen.
- `components/ExplorationTree.tsx` — owns React Flow `nodes`/`edges` and all tree mutation: expanding (calls `/api/suggest`, fans out children via `resolveOverlaps` radial spacing), regenerating, deleting a node + descendants, dragging a node with its descendants, **save/load project to/from a local JSON file** (`<rootWord>-project.json`), and an `isFakeMode` path returning shuffled `MOCK_TEST_WORDS` instead of hitting the API. Auto-persists the tree to `localStorage` under `brand_tree_last_session`. Node callbacks are threaded through refs so node `data` closures stay stable across re-expansions.
- `components/BrandNode.tsx` — the custom React Flow node: Arabic word + transliteration, plus on-hover "satellite" controls (letter-count filter, tone filter/pin, favorite, regenerate, inline word edit) and a "..." More menu exposing the extra suggestion modes (synonyms/antonyms/nisba/rhymes/compounds/derivatives/plurals). Tone can be "pinned" via `localStorage` (`pinned_brand_tone_active` / `pinned_brand_tone`) and propagates across the tree via a custom `brand_tone_pinned_changed` window event. Transliteration is fetched lazily from `/api/transliterate`.
- `components/AISettingsModal.tsx` — configures the OpenAI-compatible provider (base URL, model, API key / env var); persists to `localStorage` under `ai_provider_settings`. The stored provider is forwarded on every `/api/suggest` and `/api/transliterate` call.
- `components/Tooltip.tsx` — hover tooltip helper.
- `types.ts` — shared `BrandNodeData`, the `SuggestionMode` union (`derivatives | plurals | synonyms | antonyms | nisba | rhymes | compounds`), and the `TONE_PRESETS` list (tech/elegant/poetic/playful/corporate).

**Deployment** — dual target: the local Express server (`server.ts`) and Vercel serverless (`api/index.ts` + `vercel.json`), both sharing `createApiApp()`.

Arabic-script validation is duplicated across client onboarding, server routes, `handleEditWord`, and project-load validation — any change to seed-word rules must be applied consistently (and note the two distinct regexes above).

Styling is Tailwind v4 via the `@tailwindcss/vite` plugin; theme colors (`theme-amber`, `theme-slate`, etc.) are applied as a class on the root div and defined in `src/index.css`.
