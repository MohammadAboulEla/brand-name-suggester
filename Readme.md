# Arabic Brand Name Suggester — Project Summary

## Request

The client needed a tool to help propose Arabic-flavored brand names. The core idea:
give the tool a seed word, and it suggests other words carrying a similar meaning —
with optional constraints such as an exact letter count (e.g. 3, 4, or 5 letters).

A key constraint on the build: **no pre-existing database of Arabic words and their
meanings was available**, so the solution couldn't rely on a static lexicon lookup.

## Proposed Approach

Since Arabic vocabulary is built from **roots** (typically 3 letters) poured into
**morphological patterns** (أوزان) to form related derived words, two complementary
techniques were proposed instead of a database:

1. **Semantic expansion** — use an LLM (Gemini) to identify the word's root and
   generate synonyms / semantically related words, since the model already has
   strong built-in knowledge of Arabic semantics.
2. **Morphological generation** — apply a fixed, rule-based table of Arabic
   derivational patterns to the root to produce variants of different lengths.
3. **Filtering** — apply the user's constraints (letter count, tone, avoiding
   negative connotations) to narrow down the candidates.

This was illustrated with a worked example: starting from **"روضة"** with a
4-letter constraint and a "creative real estate" tone, producing ranked candidates
such as رياض، ريّان، واحة، وارف، نضير، نسيم.

## Final Architecture Decided

To keep implementation simple, the client requested collapsing the pipeline into
**a single function** rather than multiple pipeline stages:

- **Function:** `suggest_brand_names(word, letter_count=None, tone=None)`
- **Required parameter:** `word` — the seed Arabic word
- **Optional parameters:** `letter_count`, `tone`
- **Return value:** a plain Python list of candidate words (strings only, no
  explanations)

### How it works
Rather than separating semantic expansion and morphological generation into
distinct steps, the function sends **one combined prompt** to the Gemini API
that asks the model to:
- Identify the root and related/derived words in one pass
- Apply the given constraints (letter count, tone)
- Return exactly 6 candidate words as a clean JSON array

The function parses the JSON response, strips any markdown formatting, and
returns a Python list. If parsing fails, it safely returns an empty list instead
of raising an error.

### Why 6 results
Six candidates were chosen as a practical default — enough variety for a client
to choose from without overwhelming them. This number is easily adjustable in
the prompt.

### Trade-offs
- **Pros:** Simple to build and maintain, no local dataset or pattern-table
  required, works well as a first working version.
- **Cons:** Less controllable than a multi-stage pipeline (e.g. no guaranteed
  root-based derivation or offline mode). If more precision is needed later, the
  function can be split back into separate semantic-expansion and morphological-
  generation stages.

## Deliverable

`brand_name_suggester.py` — a single Python file containing the
`suggest_brand_names()` function, using the Anthropic API (`anthropic` package),
with example usage included.