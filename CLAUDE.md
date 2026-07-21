# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev      # runs server.ts via tsx (vite in middleware mode, HMR enabled)
pnpm build    # vite build (client) + esbuild bundle of server.ts -> dist/server.cjs
pnpm start    # node dist/server.cjs (production, serves dist/ as static + SPA fallback)
pnpm lint     # tsc --noEmit (no separate test suite or linter config in this repo)
```

There is no test runner configured — `lint` (type-checking) is the only verification command available.

Package manager is pnpm (`pnpm-lock.yaml`, `pnpm-workspace.yaml`); a `bun.lock` also exists but pnpm is the one wired into scripts.

## Architecture

This is an Arabic brand-name generator: an Express server + Vite-served React SPA, backed by Gemini for word suggestion/transliteration. There is no database — everything is generated live via LLM calls (see `Readme.md` for the original product rationale: no static Arabic lexicon was available, so semantic expansion + morphological generation via LLM prompting was chosen over a lookup table).

**Server (`server.ts`)** is a single Express app with two JSON API routes:
- `POST /api/suggest` — calls `suggest_brand_names()`, validates the seed word starts with an Arabic character before hitting the model.
- `POST /api/transliterate` — calls `transliterate_word()` for an English capital-letter phonetic rendering of an Arabic word.

In dev, Vite runs in Express middleware mode (`server.middlewareMode`) so the same server process serves both the API and the SPA with HMR. In production it serves the pre-built `dist/` static assets with an SPA fallback.

**LLM layer (`services/brand-suggester.ts`)** talks directly to `@google/genai` (Gemini) using `DEFAULT_TEXT_MODEL = "gemini-3.1-flash-lite"` and `MAX_SUGGESTIONS = 5`. Three generation modes exist, selected by the `mode` param from the client:
- default (no mode) — `suggest_brand_names()` sends one combined prompt asking for semantically-related words, morphological derivatives, and metaphorical/associated words all mixed together (deliberately, to avoid over-indexing on direct derivation).
- `mode: "derivatives"` — `extractDerivatives()` asks specifically for morphological derivatives sharing the same root.
- `mode: "plurals"` — `extractPlurals()` asks specifically for valid plural forms.

All three return `{ word, transliteration }[]`; prompts are in Arabic and request a JSON array response via `responseSchema` (structured output), with defensive JSON parsing that returns `[]` on failure rather than throwing.

**`services/ai-provider/`** is a generic multi-provider (OpenAI-compatible) client/registry abstraction (presets for OpenAI, Anthropic, Gemini, Mistral, Groq, etc., a `ProviderRegistry` for resolving API keys from env vars, a shared `createClient()`). It is currently **not wired into `brand-suggester.ts`** (which calls `@google/genai` directly) — treat it as available infrastructure for a future provider-swap, not as the active code path.

**Client (`src/`)** is a single-page app (no router) built around `@xyflow/react` (React Flow) to render the suggestion tree:
- `App.tsx` — top-level UI shell: onboarding seed-entry screen vs. the workspace view, theme switching, favorites sidebar, settings sidebar (edge shape/style, "Smoke Run" fake-data mode for offline testing without hitting the API), back-confirmation dialog. Holds most cross-cutting state (`rootWord`, `favorites`, `selectedWord`, theme, edge style) and passes it down.
- `components/ExplorationTree.tsx` — owns the React Flow `nodes`/`edges` state and all tree mutation logic: expanding a node (calls `/api/suggest`, computes fanned-out child positions with `resolveOverlaps` to avoid overlapping nodes), regenerating a node's children, deleting a node + its descendants, dragging a node along with its descendants, save/load project to/from a local JSON file, and an `isFakeMode` path that returns shuffled `MOCK_TEST_WORDS` instead of calling the API (for fast UI iteration). Node callbacks (`onExpand`, `onRegenerate`, etc.) are threaded through `handleExpandRef`/`regenerateRef` refs so node `data` closures stay stable across re-expansions.
- `components/BrandNode.tsx` — the custom React Flow node: displays the Arabic word + transliteration, and exposes per-node "satellite" controls on hover (letter-count filter, tone filter/pin, favorite, regenerate, inline word edit, derivatives/plurals mode toggle). Tone can be "pinned" via `localStorage` (`pinned_brand_tone_active`/`pinned_brand_tone`) so it propagates to all nodes across the tree via a custom `brand_tone_pinned_changed` window event.
- `types.ts` — shared `BrandNodeData` shape and the `TONE_PRESETS` list (tech/elegant/poetic/playful/corporate) used by the tone-selector UI.

Arabic-script validation (`/^[؀-ۿ]/`) is duplicated in several places (client onboarding form, server routes, `handleEditWord`, project-load validation) — any change to seed-word validation rules needs to be applied consistently across all of them.

Styling is Tailwind v4 via the `@tailwindcss/vite` plugin; theme colors (`theme-amber`, `theme-slate`, etc.) are applied as a class on the root div and presumably defined in `src/index.css`.
