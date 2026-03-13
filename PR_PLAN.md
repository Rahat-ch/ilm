# Ilm — PR Breakdown

Each PR is scoped to be independently reviewable and mergeable. PRs are ordered by dependency — later PRs build on earlier ones.

## Citation Contract (used everywhere)

All PRs must use this single citation shape. No string IDs — always structured objects.

**Stored in data files** (quran.json, bukhari.json, muslim.json):
```json
// Quran verse
{ "surah": 2, "ayah": 255, "surah_name_en": "Al-Baqarah", "surah_name_ar": "البقرة", "arabic_text": "...", "english_text": "..." }

// Hadith
{ "collection": "bukhari", "number": 1, "book": 1, "arabic_text": "...", "english_text": "...", "narrator_chain": "..." }
```

**Python agent API response** (`POST /query`):
```json
{
  "summary": "string",
  "citations": [
    { "type": "quran", "surah": 2, "ayah": 255 },
    { "type": "hadith", "collection": "bukhari", "number": 1 }
  ],
  "is_fatwa_request": false,
  "no_relevant_content": false
}
```

**TS validator/renderer** uses the same structured objects — `{ type, surah, ayah }` or `{ type, collection, number }`. Lookup functions take these objects directly, not string IDs.

**Display format** (user-facing, for reference commands):
- Quran: `Surah Al-Baqarah (2:255)`
- Hadith: `Sahih Bukhari, Hadith 1`

**Internal indexing exception**: ChromaDB metadata and internal lookups may use string keys like `"quran:2:255"` or `"bukhari:1"` for storage/retrieval convenience. But all **API boundaries** (Python→TS, TS→user) and **validation logic** use the structured objects above. String keys are an internal implementation detail, never exposed across service boundaries.

This contract is the single source of truth. PR 1 defines the data shape, PR 2 defines the API response shape, PR 4 defines the TS types — all must match exactly.

---

## PR 1: Project scaffolding + data pipeline
**Branch**: `feat/scaffolding-and-data`
**Depends on**: none

Monorepo structure, tooling config, data fetch scripts, and raw data files. No application code — just the foundation and verified datasets.

**Files**:
- `bot/package.json`, `bot/tsconfig.json`
- `agent/requirements.txt`, `agent/src/config.py`
- `scripts/fetch_quran.py` — downloads Sahih International from Tanzil, outputs `data/quran.json`
- `scripts/fetch_hadith.ts` — extracts Bukhari + Muslim from hadith-json (pinned commit), outputs `data/hadith/bukhari.json`, `data/hadith/muslim.json`
- `bot/data/quran.json`, `bot/data/hadith/bukhari.json`, `bot/data/hadith/muslim.json`
- `agent/data/quran.json`, `agent/data/hadith/bukhari.json`, `agent/data/hadith/muslim.json`
- `.gitignore`, `.env.example`

**Checklist**:
- [ ] Init bot/ with package.json, tsconfig, eslint
- [ ] Init agent/ with requirements.txt, pyproject or similar
- [ ] Write `scripts/fetch_quran.py` — download + normalize Tanzil data. Each verse keyed by `{surah, ayah}` per citation contract.
- [ ] Write `scripts/fetch_hadith.ts` — extract + normalize. Each hadith keyed by `{collection, number}` per citation contract.
- [ ] Define shared TypeScript types file (`bot/src/types/citation.ts`) matching the citation contract exactly
- [ ] Run scripts, commit data files
- [ ] Verify record counts: Quran = 6,236 verses, Bukhari ~7,563, Muslim ~7,500
- [ ] Spot-check 10 random entries per collection against sunnah.com / quran.com
- [ ] Pin hadith-json to specific git commit in package.json
- [ ] Add data integrity test: `scripts/verify_data.ts` — counts, no nulls, IDs unique

**Review focus**: data correctness, canonical ID format, record counts match expectations.

---

## PR 2: RAG index + Python agent backend
**Branch**: `feat/rag-agent`
**Depends on**: PR 1

Qwen-Agent setup, RAG indexing with context windows, FastAPI server exposing `/query` and `/lookup` endpoints. No bot — just the Python backend that returns structured JSON.

**Files**:
- `agent/src/main.py` — FastAPI app
- `agent/src/agent.py` — Qwen-Agent config (FnCallAgent, Ollama model server)
- `agent/src/tools/quran_search.py` — RAG tool returning canonical IDs + context
- `agent/src/tools/hadith_search.py` — RAG tool returning canonical IDs + context
- `agent/src/rag/indexer.py` — build ChromaDB index with context windows (verse + 2 neighbors)
- `agent/src/guardrails.py` — LLM-based fatwa/fiqh classification
- `agent/src/config.py`
- `agent/Dockerfile`
- `scripts/build_index.py`

**Checklist**:
- [ ] `scripts/build_index.py` — embed all docs with all-MiniLM-L6-v2, store in ChromaDB with metadata (canonical_id, source, collection, book, chapter)
- [ ] Context windowing: each doc's embedding text includes verse + 2 neighbors
- [ ] `agent/src/agent.py` — Qwen-Agent with Ollama at localhost:11434, structured JSON output
- [ ] System prompt enforcing extractive ID-grounded responses
- [ ] `quran_search` tool — takes query, returns top-k relevant verses with canonical IDs
- [ ] `hadith_search` tool — takes query, returns top-k relevant hadiths with canonical IDs
- [ ] `guardrails.py` — LLM classifies ambiguous fatwa/fiqh requests
- [ ] FastAPI `POST /query` — accepts `{message, user_id}`, returns structured response per citation contract: `{summary, citations: [{type, surah, ayah} | {type, collection, number}], is_fatwa_request, no_relevant_content}`
- [ ] FastAPI `POST /lookup` — accepts `{type: "quran", surah: 2, ayah: 255}` or `{type: "hadith", collection: "bukhari", number: 1}` (structured, not string IDs), returns raw record from DB
- [ ] Define Pydantic models for request/response matching the citation contract exactly
- [ ] Test: 10 sample queries, verify all returned citation IDs exist in data files
- [ ] Test: fatwa request → `is_fatwa_request: true`, empty citations
- [ ] Dockerfile for agent service

**Review focus**: structured output format, citation IDs always valid, guardrail accuracy, retrieval quality.

---

## PR 3: TS bot core — message router, adapters, SQLite store
**Branch**: `feat/bot-core`
**Depends on**: PR 1

Bot skeleton with unified message interface, Telegram adapter (grammY), platform-prefixed user IDs, and SQLite user state store. No WhatsApp yet, no agent integration — just the messaging framework.

**Files**:
- `bot/src/index.ts`
- `bot/src/adapters/types.ts` — `IncomingMessage`, `OutgoingMessage`, `Adapter` interface
- `bot/src/adapters/telegram.ts` — grammY polling adapter
- `bot/src/handlers/router.ts` — routes normalized messages to handlers
- `bot/src/handlers/commands.ts` — `/start`, `/help`, `/about` (static responses)
- `bot/src/store/users.ts` — SQLite via better-sqlite3: user table (platform_id, lat, lng, timezone, created_at)
- `bot/src/config.ts`

**Checklist**:
- [ ] `types.ts` — `IncomingMessage { platformId: string, text: string, location?: {lat, lng}, messageId: string }`, `OutgoingMessage { text: string, platformId: string }`, `Adapter { start(), send(msg) }`
- [ ] Platform-prefixed IDs: `tg:{telegram_user_id}`
- [ ] `telegram.ts` — grammY bot in polling mode, normalizes to `IncomingMessage`, sends via `OutgoingMessage`
- [ ] `router.ts` — checks if command or free-form, dispatches to handler
- [ ] `commands.ts` — `/start` welcome message, `/help` lists commands, `/about` describes Ilm
- [ ] `users.ts` — SQLite init, `upsertLocation(platformId, lat, lng, tz)`, `getUser(platformId)`
- [ ] `/setlocation` — accepts Telegram location share, derives timezone from coords using tz-lookup, saves to SQLite
- [ ] Test: bot starts, responds to /start, /help, /about on Telegram
- [ ] Test: /setlocation saves and retrieves coords + tz correctly

**Review focus**: adapter interface is clean and extensible, SQLite schema, platform ID format.

---

## PR 4: Citation rendering + validation + agent client
**Branch**: `feat/citation-rendering`
**Depends on**: PR 1, PR 2, PR 3

The core value loop: user sends message → agent returns structured JSON → bot verifies citation IDs against local DB → renders actual text. This PR wires the TS bot to the Python agent and implements extractive rendering.

**Files**:
- `bot/src/services/agent-client.ts` — HTTP client calling Python agent `/query` and `/lookup`
- `bot/src/validation/quran.ts` — verify `{surah, ayah}` exists in local `quran.json`
- `bot/src/validation/hadith.ts` — verify `{collection, number}` exists in local hadith JSONs
- `bot/src/rendering/citations.ts` — given structured response, look up each ID, build formatted text
- `bot/src/rendering/formatter.ts` — platform-aware formatting (Telegram markdown vs WhatsApp plain text)
- `bot/src/handlers/messages.ts` — free-form message handler: keyword guardrail → agent-client → validate → render → send
- `bot/src/services/guardrails.ts` — keyword-based fatwa detection (fast path before hitting agent)

**Checklist**:
- [ ] `agent-client.ts` — POST to `http://localhost:8000/query`, typed response interface using shared citation types from `bot/src/types/citation.ts`
- [ ] `quran.ts` — load `quran.json` into memory at startup, `exists(cite: QuranCitation): boolean`, `get(cite: QuranCitation): QuranVerse`
- [ ] `hadith.ts` — load hadith JSONs at startup, `exists(cite: HadithCitation): boolean`, `get(cite: HadithCitation): Hadith`
- [ ] `citations.ts` — iterate structured response citations, verify each, fetch text, drop invalid, format output
- [ ] `formatter.ts` — Telegram: bold surah name, Arabic text, English translation. WhatsApp: similar but plain markdown.
- [ ] `guardrails.ts` — keyword list (fatwa, halal, haram, permissible, ruling, allowed, forbidden, etc.). Match → return scholar redirect without hitting agent.
- [ ] `messages.ts` — full flow: guardrail check → agent query → validate citations → render → send
- [ ] Test: send question via Telegram → get formatted response with real Quran/hadith text from DB
- [ ] Test: hallucinated citation ID from agent → silently dropped, remaining valid citations shown
- [ ] Test: "is X halal" → keyword guardrail catches, redirects to scholar

**Review focus**: citation verification is airtight, no LLM-generated religious text reaches users, guardrail keyword list coverage.

---

## PR 5: Direct lookup + prayer times
**Branch**: `feat/lookup-and-prayer`
**Depends on**: PR 3, PR 4

Commands that don't need the LLM: direct verse/hadith lookup by reference and offline prayer time calculation.

**Files**:
- `bot/src/handlers/commands.ts` — add `/quran`, `/hadith`, `/pray` handlers
- `bot/src/services/prayer.ts` — adhan-js integration + tz-lookup

**Checklist**:
- [ ] `/quran 2:255` — parse surah:ayah, look up in local DB, render Arabic + English. Support ranges: `/quran 1:1-7`
- [ ] `/hadith bukhari:1` — parse collection:number, look up in local DB, render full hadith text
- [ ] Error handling: invalid references → "Verse/hadith not found" with valid format hint
- [ ] `prayer.ts` — `getPrayerTimes(lat, lng, timezone, date)` using adhan-js. Returns Fajr, Dhuhr, Asr, Maghrib, Isha times.
- [ ] `/pray` — check user has saved location (SQLite). If not → prompt to /setlocation. If yes → calculate and render today's times.
- [ ] Test: `/quran 2:255` returns Ayat al-Kursi text
- [ ] Test: `/quran 999:1` returns not-found error
- [ ] Test: `/hadith bukhari:1` returns "Actions are by intentions" hadith
- [ ] Test: `/pray` with saved NYC location returns correct times for today

**Review focus**: parse edge cases (bad input, ranges, missing location), prayer time accuracy vs known reference.

---

## PR 6: WhatsApp adapter + Evolution API
**Branch**: `feat/whatsapp`
**Depends on**: PR 3, PR 4

Evolution API Docker setup + WhatsApp adapter in the TS bot. All existing functionality works on both platforms after this PR.

**Files**:
- `bot/src/adapters/whatsapp.ts` — Evolution API webhook adapter
- `docker-compose.yml` — add evolution-api service
- `bot/src/store/users.ts` — add message dedup table for webhook idempotency

**Checklist**:
- [ ] `docker-compose.yml` — evolution-api container (Baileys mode), port mapping, volume for session persistence
- [ ] `whatsapp.ts` — Express endpoint receiving Evolution API webhooks, normalizes to `IncomingMessage`
- [ ] WhatsApp location payload parsing: Evolution API sends location messages as `{latitude, longitude}`. Normalize into `IncomingMessage.location` field (same shape as Telegram location share).
- [ ] `/setlocation` works via WhatsApp native location share (not just Telegram). Derive timezone from coords, save to SQLite.
- [ ] Platform-prefixed IDs: `wa:{whatsapp_number}`
- [ ] Webhook idempotency: store message IDs in SQLite dedup table, skip duplicates
- [ ] Message splitting: if response > 4096 chars, split at citation boundaries
- [ ] Reconnect health check: periodic ping to Evolution API, log disconnects, alert if down > 5 min
- [ ] Send responses back via Evolution API REST endpoint
- [ ] Test: send WhatsApp message → receive response with citations
- [ ] Test: send WhatsApp location → /setlocation saves coords + tz correctly
- [ ] Test: /pray on WhatsApp after location set → returns correct times
- [ ] Test: duplicate webhook → only processed once
- [ ] Test: long response → split correctly
- [ ] Soak test: run Baileys connection for 48+ hours, log any disconnects

**Review focus**: idempotency logic, message splitting doesn't break mid-citation, reconnect behavior.

---

## PR 7: Docker Compose + integration tests
**Branch**: `feat/docker-integration`
**Depends on**: PR 2, PR 5, PR 6

Full docker-compose for all 3 services. Integration tests that exercise the complete flow end-to-end.

**Files**:
- `docker-compose.yml` — finalize: ts-bot, python-agent, evolution-api, shared data volume
- `bot/Dockerfile`
- `agent/Dockerfile` (already exists from PR 2, may need tweaks)
- `bot/tests/integration/` — end-to-end tests

**Checklist**:
- [ ] `docker-compose.yml` — all 3 services, health checks, proper startup order (agent before bot)
- [ ] `bot/Dockerfile` — Node.js, build TS, copy data files
- [ ] Shared data volume or data baked into images
- [ ] Integration test (Telegram): simulate message → agent → validate → render → verify output
- [ ] Integration test (WhatsApp): simulate webhook → agent → validate → render → verify output matches Telegram
- [ ] Integration test: fatwa request on both platforms → verify redirect, no citations
- [ ] Integration test: invalid citation ID from mocked agent → verify dropped on both platforms
- [ ] Integration test: WhatsApp webhook dedup → duplicate webhook skipped
- [ ] Integration test: WhatsApp long response → message split correctly at citation boundaries
- [ ] Integration test: formatting parity — same query on Telegram and WhatsApp produces equivalent content (different formatting allowed)
- [ ] Integration test: `/quran 2:255` renders correct verse on both platforms
- [ ] Integration test: `/hadith bukhari:1` renders correct hadith on both platforms
- [ ] Integration test: `/setlocation` + `/pray` returns correct prayer times on both platforms
- [ ] `docker compose up` works end-to-end on Mac Mini
- [ ] Basic logging: structured JSON logs from both services
- [ ] Rate limiting: per `platformId` rate limit (e.g., 10 queries/min). No cross-platform user linking — `tg:123` and `wa:456` are separate identities.

**Review focus**: docker networking, startup order, health checks, rate limit implementation.

---

## PR 8: Evaluation framework + eval set
**Branch**: `feat/eval`
**Depends on**: PR 7

Automated evaluation runner with fixed test set covering all categories from the plan.

**Files**:
- `eval/eval_set.json` — 110+ test cases (10 per category minimum)
- `eval/run_eval.py` — automated runner
- `eval/results/` — gitignored, output directory

**Checklist**:
- [ ] `eval_set.json` — 11 categories, 10+ cases each:
  - Direct Quran lookup
  - Semantic Quran Q&A
  - Direct hadith lookup
  - Semantic hadith Q&A
  - Multi-verse passages
  - Fake citation detection
  - Fatwa/ruling requests
  - Ambiguous fiqh questions
  - Arabic-term queries
  - No-answer cases
  - Out-of-scope
- [ ] `run_eval.py` — runs each test case through the **full bot flow** (not just agent), checks:
  - Citation ID validity = 100% (every returned ID must exist in DB)
  - Fatwa requests always get `is_fatwa_request: true`
  - No-answer cases get `no_relevant_content: true`
  - Response time < 30s
  - Bot-layer guardrails trigger correctly (keyword filter catches obvious fatwa requests before agent)
  - Rendered output contains actual DB text, not LLM-generated text
- [ ] Separate metrics tracked: retrieval relevance (manual), summary quality (manual)
- [ ] WhatsApp-specific eval cases: verify message splitting, formatting, and dedup don't corrupt citation rendering
- [ ] Output: JSON results file + summary table (pass/fail per category)
- [ ] Run eval, document baseline results in PR description
- [ ] Fix any failures found during eval

**Review focus**: test case quality and coverage, eval metrics are meaningful, baseline results acceptable.

---

## PR 9: Data integrity checks (quran-validator)
**Branch**: `feat/data-integrity`
**Depends on**: PR 1

quran-validator integration for verifying our Quran data at ingestion and test time. Not on the hot path — this is a CI/offline check.

**Files**:
- `bot/src/validation/integrity.ts` — quran-validator integration
- `scripts/verify_quran_integrity.ts` — run quran-validator against our `quran.json`
- `bot/tests/integrity/` — test suite

**Checklist**:
- [ ] `integrity.ts` — wrap quran-validator: for each verse in our DB, validate Arabic text matches quran-validator's bundled Quran
- [ ] `verify_quran_integrity.ts` — CLI script: load quran.json, run every verse through validator, report mismatches
- [ ] Test: run against full quran.json, expect 0 mismatches
- [ ] If mismatches found: investigate, fix data source or flag as known issue
- [ ] Add to CI (or pre-commit): run integrity check on data changes

**Review focus**: any data mismatches found and how they're resolved.

---

## PR 10: Tuning + launch prep
**Branch**: `feat/launch-prep`
**Depends on**: PR 7, PR 8, PR 9

Final tuning based on eval results, README, and launch readiness.

**Files**:
- `README.md` — setup instructions, architecture overview, how to run
- `agent/src/config.py` — tuned retrieval params (top-k, similarity threshold, context window)
- `agent/src/agent.py` — refined system prompt based on eval feedback
- `.env.example` — all required env vars documented

**Checklist**:

*Tuning*:
- [ ] Tune top-k, similarity threshold based on eval results
- [ ] Tune system prompt: tighten wording based on failure cases from eval
- [ ] Run full eval set, document final results

*Documentation*:
- [ ] README: what is Ilm, how to run locally, how to run with Docker, env vars, attribution notices
- [ ] Tanzil attribution notice in README and /about command
- [ ] hadith-json attribution in README and /about command
- [ ] .env.example: all required env vars documented

*Pre-launch gates (all must pass before v0.1.0 tag)*:
- [ ] **Tanzil licensing signoff**: email sent, response received confirming bundling in free non-commercial app is permitted. If denied or no response: swap to alternative translation before tagging.
- [ ] **Hadith provenance signoff**: spot-check hadith-json numbering against sunnah.com for 20+ random entries across both collections. Verify total counts (Bukhari ~7,563, Muslim ~7,500). Document any discrepancies and resolution.
- [ ] **WhatsApp go/no-go**: review soak test results from PR 6. If Baileys disconnects > 3x/day or webhook delivery < 95%: launch Telegram-only, move WhatsApp to post-launch.
- [ ] **Eval bar**: 100% citation ID validity, fatwa redirect accuracy, retrieval relevance acceptable per human review.
- [ ] Manual review: 2-3 knowledgeable Muslims test 50+ responses for accuracy and tone
- [ ] Tag v0.1.0 only after all gates pass

**Review focus**: all pre-launch gates documented with evidence (email screenshot, spot-check log, soak test results, eval output). Attribution is proper. README is complete.

---

## Dependency Graph

```
PR 1 (scaffolding + data)
  ├── PR 2 (RAG + agent) ─────────────────────┐
  ├── PR 3 (bot core)                          │
  │     ├── PR 4 (citations + agent client)    │
  │     │     ├── PR 5 (lookup + prayer) ──────┤
  │     │     └── PR 6 (WhatsApp) ─────────────┤
  │                                             ▼
  └── PR 9 (data integrity)    PR 7 (docker + integration) ← PR 2, PR 5, PR 6
                    │             │
                    │             ▼
                    │           PR 8 (eval)
                    │             │
                    └──────────►  ▼
                              PR 10 (launch) ← PR 7, PR 8, PR 9
```

**Parallel work**: PR 2 and PR 3 can be built simultaneously after PR 1 merges. PR 9 can happen anytime after PR 1.
