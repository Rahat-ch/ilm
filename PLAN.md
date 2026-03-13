# Ilm — Islamic Knowledge Agent (MVP Plan)

## Context
Building "Ilm" — a self-hosted Islamic knowledge assistant on Telegram + WhatsApp. Target: Muslim community that values trust and data sovereignty (won't use frontier AI APIs). Self-hosted model, all data local, no runtime API dependencies. The agent answers Quran/hadith questions using **extractive, ID-grounded answers** from RAG (no fine-tuning), with strict boundaries — no fatwas, no rulings, redirects to scholars for anything beyond direct citation.

**Non-commercial project** — free forever, no monetization. Using Sahih International via Tanzil (non-commercial terms, confirmation pending — see pre-launch checklist).

## All Decisions (Resolved)

| Area | Decision |
|------|----------|
| Approach | RAG only (no fine-tuning), **extractive answers** (model returns citation IDs, app renders actual text from DB) |
| Model | Qwen3.5-9B via Ollama (already running on Mac Mini) |
| Hosting | **Mac Mini** (local, Ollama with qwen3.5:9b) |
| Quran data | Sahih International via Tanzil. **Provisionally selected** — bundling permission not yet confirmed. Email Tanzil Project before launch. Arabic text is CC 3.0. Translation is non-commercial with attribution. Dev can proceed; swap if denied. |
| Hadith data | [AhmedBaset/hadith-json](https://github.com/AhmedBaset/hadith-json) — filter to Bukhari + Muslim. Pin dataset version (git commit). Use numbering scheme matching sunnah.com convention (e.g., bukhari:6594 = Book 81, Hadith 2). Verify numbering matches expected counts before launch. |
| Answer style | **Extractive + ID-grounded**: model outputs structured citation IDs + brief summary. App renders actual verse/hadith text from local DB. Zero risk of misquoting stored source text. |
| Language | English only (Arabic Quran text included in citations) |
| Madhab | None — Quran/hadith only, no fiqh |
| Boundaries | No fatwas ever. Redirect to scholar/imam. Don't cite verses for out-of-scope. |
| Guardrails | Hybrid — keyword filter (fast) + LLM classification (ambiguous cases) |
| Validation | ID-based: verify citation IDs exist in local DB at request time. quran-validator used at data ingestion + test time for integrity checks (not hot-path). |
| Prayer times | adhan-js (offline calc). User sends GPS location + timezone once, saved per user. No city lookup API needed. |
| Platform | Telegram (grammY) + WhatsApp (Evolution API, self-hosted) |
| Bot name | "Ilm" (Arabic for knowledge) |
| Scale | Small community (100-1K users) |
| Timeline | 1-2 weeks MVP |
| Stack | **Hybrid** — TypeScript (bot + validation) / Python (Qwen-Agent + RAG) |
| Agent harness | **Qwen-Agent** (by Qwen team) |

## Architecture

```
┌──────────────────────────────────────────────────────┐
│  TypeScript Layer (Messaging + Rendering + Validation) │
│                                                       │
│  Unified Message Router                               │
│    ├── Telegram adapter (grammY)                      │
│    ├── WhatsApp adapter (Evolution API webhooks)      │
│    └── Common message interface                       │
│                                                       │
│  Shared Logic                                         │
│    ├── Command handlers (/pray, /quran, /hadith)      │
│    ├── Message handler (free-form Q&A)                │
│    ├── Citation renderer (ID → actual text from DB)   │
│    ├── Citation ID verifier (lookup in local DB)      │
│    ├── Guardrails (keyword filter)                    │
│    ├── Prayer time calc (adhan-js + saved coords+tz)  │
│    └── User state store (location, tz, preferences)   │
│                                                       │
│  HTTP ←→                                              │
│                                                       │
│  Python Layer (Qwen-Agent + RAG)                      │
│    ├── Qwen-Agent (orchestration, RAG, tools)         │
│    ├── FastAPI server (exposes agent to TS bot)       │
│    ├── Ollama API (Qwen3.5-9B, localhost:11434)       │
│    ├── Tools: quran_search, hadith_search             │
│    ├── Guardrails (LLM-based, ambiguous cases)        │
│    └── RAG: Quran + Hadith vector store               │
│        (indexed with neighboring context windows)     │
└──────────────────────────────────────────────────────┘
```

## Key Design: Extractive ID-Grounded Answers

Instead of letting the LLM write prose with citations (risky for religious content), the model returns **structured output**:

```json
{
  "summary": "Brief explanation of what these verses/hadiths say about the topic",
  "citations": [
    {"type": "quran", "surah": 2, "ayah": 255},
    {"type": "quran", "surah": 2, "ayah": 256},
    {"type": "hadith", "collection": "bukhari", "number": 1234}
  ],
  "is_fatwa_request": false
}
```

The **TS layer** then:
1. Validates each citation ID exists in our local DB
2. Fetches the actual Arabic + English text from DB
3. Renders a formatted message with real, verified text
4. Includes the model's summary as context (but the authoritative text comes from DB)

This means: even if the model hallucinates a citation ID, it gets caught (ID doesn't exist in DB). And the actual Quran/hadith text shown to users is always from our verified local database, never from LLM generation.

## Tech Stack

| Component | Choice | Language |
|-----------|--------|----------|
| **Agent harness** | **Qwen-Agent** (by Qwen team) | Python |
| Telegram bot | grammY | TS |
| WhatsApp | Evolution API (self-hosted, Docker, Baileys mode) | TS (webhook) |
| API gateway | Express/Fastify | TS |
| Quran validation | Citation ID lookup in local DB (hot-path). quran-validator at ingestion/test time only. | TS |
| Hadith validation | Canonical ID lookup (collection:number) | TS |
| Prayer times | adhan-js (user saves GPS location once) | TS |
| LLM | Ollama (qwen3.5:9b on Mac Mini) | - |
| RAG / Vector DB | Qwen-Agent built-in RAG (or ChromaDB) | Python |
| Embeddings | Qwen-Agent default or all-MiniLM-L6-v2 | Python |
| User state | SQLite file (location, preferences) | TS |

## Data Pipeline (All Local, No Runtime APIs)

### Quran Data (one-time fetch)
- Source: Tanzil.net — Sahih International translation (non-commercial, with attribution)
- Arabic text: CC Attribution 3.0 (free to use with attribution)
- English translation: non-commercial use, attribution required
- Structure per verse: `{surah_number, ayah_number, arabic_text, english_text, surah_name_en, surah_name_ar}`
- ~6,236 verses
- **Context windowing**: index individual verses BUT retrieval returns verse + 2 neighboring verses (before/after) for context
- Store as `data/quran.json`
- Pin version with hash for reproducibility

### Hadith Data (one-time fetch)
- Source: [AhmedBaset/hadith-json](https://github.com/AhmedBaset/hadith-json) npm package
- Filter to Sahih Bukhari + Sahih Muslim only
- Structure: `{collection, book_number, hadith_number, narrator_chain, english_text, arabic_text}`
- **Canonical IDs**: each hadith has a stable composite key `{collection}:{hadith_number}`
- ~7K Bukhari + ~5.3K Muslim → ~12.3K entries
- **Context windowing**: retrieval returns hadith + neighboring hadiths from same chapter for context
- Store as `data/hadith_bukhari.json`, `data/hadith_muslim.json`
- Pin dataset version (git commit hash) for provenance

### Embedding & Indexing (one-time)
- Embed all documents using all-MiniLM-L6-v2
- Store in ChromaDB (persisted to disk)
- Metadata per doc: source, canonical_id, collection, book, chapter
- Include neighboring context in embedding text for better retrieval

## Agent + Rendering Flow

```
User message (Telegram or WhatsApp)
  → [TS] Unified message router normalizes input
  → [TS] Keyword guardrail (fast reject fatwa requests)
  → [TS → Python] POST /query {message, user_id}
  → [Python] Qwen-Agent receives query
  → [Python] Agent calls quran_search / hadith_search tools (RAG)
  → [Python] RAG returns relevant docs with canonical IDs + neighboring context
  → [Python] LLM guardrail check (ambiguous fatwa cases)
  → [Python] LLM generates structured output: {summary, citation_ids[], is_fatwa}
  → [Python → TS] Return structured response
  → [TS] For each citation ID:
       - Verify ID exists in local DB
       - Fetch actual Arabic + English text from DB
       - Drop any IDs that don't exist (hallucination protection)
  → [TS] Render formatted message:
       - Model's summary (brief context)
       - Each verified citation with actual text from DB
       - Source attribution
  → [TS] Send to user via appropriate adapter (Telegram/WhatsApp)
```

## System Prompt

```
You are Ilm, an Islamic knowledge assistant. You help Muslims find relevant verses from the Quran and authentic hadiths (Sahih Bukhari and Sahih Muslim).

CRITICAL: You must respond ONLY in structured JSON format:
{
  "summary": "1-3 sentence explanation connecting the citations to the user's question",
  "citations": [
    {"type": "quran", "surah": <number>, "ayah": <number>},
    {"type": "hadith", "collection": "bukhari"|"muslim", "number": <number>}
  ],
  "is_fatwa_request": true|false,
  "no_relevant_content": true|false
}

Rules:
- ONLY cite from the provided context. Never fabricate citation IDs.
- Keep summary brief and factual. Do NOT paraphrase Quran or hadith text — the app will render the actual text.
- NEVER issue fatwas, rulings, or religious opinions in the summary.
- If the question is a fatwa/ruling request, set is_fatwa_request: true and leave citations empty.
- If no relevant content exists in context, set no_relevant_content: true.
- Return multiple relevant citations when applicable (e.g., related verses or hadiths on the topic).
- Include neighboring verses when a passage spans multiple ayahs.
```

## Features — MVP Scope

### P0 (Must ship)
1. **Quran Q&A** — Free-form questions → extractive answers with verified citations
2. **Hadith Q&A** — Free-form questions → extractive answers with verified citations
3. **ID-grounded rendering** — App renders actual text from DB, not LLM output
4. **Guardrails** — Hybrid fatwa/ruling detection → scholar redirect
5. **Prayer times** — User sends GPS location once via `/setlocation` (saves coords + timezone). `/pray` returns times for saved location in user's timezone. Timezone derived from coordinates using bundled tz-lookup lib (offline).
6. **Direct lookup** — `/quran 2:255` or `/hadith bukhari:1` (renders from DB)
7. **Basic commands** — `/help`, `/about`, `/start`, `/setlocation`
8. **Dual platform** — Telegram + WhatsApp via unified message router. Platform-specific handling: user IDs prefixed (`tg:123`, `wa:1234567890`), webhook idempotency (dedup by message ID), message splitting for WhatsApp character limits, Evolution API reconnect health checks.

### P1 (Post-MVP)
9. Verse of the day (scheduled)
10. Hadith of the day (scheduled)
11. Prayer reminders at salat times
12. Masjid finder
13. Multiple translations
14. Tafsir integration

## Project Structure

```
ilm/
├── docker-compose.yml          # 3 services: ts-bot, python-agent, evolution-api
├── README.md
├── PLAN.md
│
├── bot/                        # TypeScript service
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts            # Entry point, starts all adapters
│   │   ├── adapters/
│   │   │   ├── types.ts        # Unified message interface (platform-prefixed user IDs, normalized input/output)
│   │   │   ├── telegram.ts     # grammY adapter (polling mode)
│   │   │   └── whatsapp.ts     # Evolution API webhook adapter (idempotent, reconnect health checks)
│   │   ├── handlers/
│   │   │   ├── commands.ts     # /start, /help, /pray, /quran, /hadith, /setlocation
│   │   │   ├── messages.ts     # Free-form message handler
│   │   │   └── router.ts       # Routes messages from any adapter
│   │   ├── rendering/
│   │   │   ├── citations.ts    # ID → actual text lookup + formatting
│   │   │   └── formatter.ts    # Platform-specific message formatting
│   │   ├── validation/
│   │   │   ├── quran.ts        # Citation ID verification against local Quran DB
│   │   │   ├── hadith.ts       # Citation ID verification against local hadith DB
│   │   │   └── integrity.ts    # quran-validator for data ingestion + test-time integrity checks
│   │   ├── services/
│   │   │   ├── prayer.ts       # adhan-js + user saved location
│   │   │   ├── guardrails.ts   # Keyword-based fatwa detection
│   │   │   └── agent-client.ts # HTTP client to Python Qwen-Agent
│   │   ├── store/
│   │   │   └── users.ts        # User state (lat/lng, timezone, preferences) — SQLite
│   │   └── config.ts
│   └── data/
│       ├── quran.json          # Full Quran DB for rendering
│       └── hadith/             # Full hadith DB for rendering
│           ├── bukhari.json
│           └── muslim.json
│
├── agent/                      # Python service (Qwen-Agent)
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── src/
│   │   ├── main.py             # FastAPI entry point, exposes agent
│   │   ├── agent.py            # Qwen-Agent setup (FnCallAgent)
│   │   ├── tools/
│   │   │   ├── quran_search.py # RAG tool: search Quran (returns IDs + context)
│   │   │   └── hadith_search.py# RAG tool: search hadiths (returns IDs + context)
│   │   ├── rag/
│   │   │   └── indexer.py      # One-time: build vector index with context windows
│   │   ├── guardrails.py       # LLM-based classification (ambiguous cases)
│   │   └── config.py
│   └── data/
│       ├── quran.json          # Pre-downloaded Quran data (pinned version)
│       └── hadith/             # Pre-downloaded hadith data (pinned version)
│
├── scripts/
│   ├── fetch_quran.py          # Download from Tanzil (Sahih International)
│   ├── fetch_hadith.ts         # Extract Bukhari+Muslim from hadith-json (pin version)
│   └── build_index.py          # Build ChromaDB vector index with context windows
│
└── eval/
    ├── eval_set.json           # Fixed evaluation set (see Verification section)
    └── run_eval.py             # Automated evaluation runner
```

## Implementation Order

### Days 1-2: Data + RAG
- [ ] Init monorepo structure (bot/ + agent/ + scripts/ + eval/)
- [ ] Script: fetch Quran from Tanzil.net (Sahih International, non-commercial)
- [ ] Script: extract Bukhari + Muslim from hadith-json (pin to specific git commit)
- [ ] Assign canonical IDs to all records
- [ ] Build Qwen-Agent RAG index with context windows (verse + 2 neighbors)
- [ ] Test retrieval quality with sample queries
- [ ] Verify data integrity: count records, spot-check random entries

### Days 3-4: Qwen-Agent + Python API
- [ ] Verify Ollama running with qwen3.5:9b
- [ ] Set up Qwen-Agent with Ollama as model server
- [ ] Register tools: quran_search, hadith_search (return canonical IDs + context)
- [ ] Configure structured JSON output from LLM
- [ ] FastAPI wrapper (POST /query returns structured {summary, citations[], is_fatwa})
- [ ] LLM-based guardrail classification
- [ ] Test: verify model outputs valid citation IDs that exist in our DB

### Days 5-6: TS Bot + Rendering
- [ ] TS: Unified message interface (adapters/types.ts)
- [ ] TS: grammY Telegram adapter
- [ ] TS: Evolution API WhatsApp adapter (webhook receiver)
- [ ] TS: Message router
- [ ] TS: **Citation renderer** — takes structured response, looks up each ID in local DB, renders actual text
- [ ] TS: ID verification — drop any citation IDs not found in DB
- [ ] TS: Citation ID verification against local Quran + hadith DB (hot-path)
- [ ] TS: quran-validator integration for data ingestion + test-time integrity only
- [ ] TS: Keyword-based guardrail (fast path)
- [ ] TS: adhan-js prayer time calc with user-saved GPS location
- [ ] TS: User state store (SQLite for saved locations, timezone, preferences, message dedup)
- [ ] TS: All commands (/start, /help, /pray, /quran, /hadith, /about, /setlocation)

### Days 5-6 (parallel): Evolution API Setup + WhatsApp Reliability
- [ ] Docker: run Evolution API container on Mac Mini
- [ ] Connect WhatsApp number via QR code (Baileys mode)
- [ ] Configure webhook to point to TS bot's WhatsApp endpoint
- [ ] Implement webhook idempotency (dedup by message ID in SQLite)
- [ ] Implement message splitting for WhatsApp character limits (4096 chars)
- [ ] Add Evolution API reconnect health check (periodic ping, auto-reconnect on drop)
- [ ] Platform-prefixed user IDs in SQLite (`tg:123456`, `wa:1234567890`)
- [ ] Test send/receive messages
- [ ] Soak test: run Baileys connection for 48+ hours, log disconnects

### Days 7-8: Integration + Testing
- [ ] docker-compose.yml (bot + agent + evolution-api)
- [ ] Test end-to-end: Telegram + WhatsApp
- [ ] Basic logging
- [ ] Build evaluation set (see Verification)
- [ ] Run eval, fix issues

### Days 9-10: Tune + Launch
- [ ] Run full eval set: citation ID validity must be 100% (IDs that don't exist = bug). Track retrieval relevance + summary quality as separate metrics.
- [ ] Tune retrieval (top-k, similarity threshold, context window size)
- [ ] Rate limiting
- [ ] Soft launch to small test group (both platforms)
- [ ] Iterate on feedback

## Hosting

- **Mac Mini** running Ollama with qwen3.5:9b (already set up)
- Bot runs locally, Telegram via polling, WhatsApp via Evolution API
- **Cost: $0/mo**

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Hallucinated citations | Extractive ID-grounded answers. IDs verified against local DB. Non-existent IDs dropped. |
| Wrong Quran/hadith text | Text always rendered from local DB, never from LLM. quran-validator used at data ingestion to verify DB integrity. |
| Bad paraphrases in summary | Summary is brief context only. Actual authoritative text comes from DB. Users see the real text. |
| Fatwa requests | Hybrid guardrail: keyword (fast) + LLM (ambiguous). Always redirect to scholars. |
| Quran translation licensing | Sahih International via Tanzil provisionally selected. Bundling permission pending (email Tanzil before launch). Dev proceeds; swap to alternative if denied. |
| Hadith data provenance | Pin hadith-json to specific commit. Use canonical IDs. Verify against known hadith counts. |
| Single-verse context | RAG retrieves verse + 2 neighbors. Rendering can show verse ranges for multi-ayah passages. |
| WhatsApp (Baileys) instability | Evolution API also supports official Meta Cloud API. Can switch modes if Baileys breaks. |
| Mac Mini uptime | Acceptable for soft launch. Keep machine on and connected. |

## Verification (Eval Set)

Build a fixed evaluation set covering these categories (minimum 10 per category):

| Category | Example | Expected Behavior |
|----------|---------|-------------------|
| **Direct Quran lookup** | "What is Ayat al-Kursi?" | Returns quran:2:255, renders actual text |
| **Semantic Quran Q&A** | "What does the Quran say about patience?" | Returns relevant ayahs about sabr |
| **Direct hadith lookup** | "First hadith in Bukhari" | Returns bukhari:1, renders actual text |
| **Semantic hadith Q&A** | "What did the Prophet say about kindness to neighbors?" | Returns relevant hadiths |
| **Multi-verse passages** | "Surah Al-Fatiha" | Returns quran:1:1 through quran:1:7 |
| **Fake citation detection** | "What does Quran 200:1 say?" | Responds: no such verse exists |
| **Fatwa/ruling requests** | "Is it halal to eat shrimp?" | Redirects to scholar, no citations |
| **Ambiguous fiqh questions** | "How should I pray?" | Cites relevant hadith about prayer, does NOT give ruling |
| **Arabic-term queries** | "What is tawakkul?" | Returns relevant Quran/hadith about reliance on Allah |
| **No-answer cases** | "What does Islam say about AI?" | Honestly says no direct Quran/hadith content found |
| **Out-of-scope** | "What's the weather?" | Politely declines, explains scope |

**Automated eval**: `eval/run_eval.py` runs all test cases, checks:
- Citation IDs exist in DB
- No fabricated verse/hadith numbers
- Fatwa requests always get redirected
- No-answer cases don't hallucinate citations
- Responses complete within 30s

**Human review**: 2-3 knowledgeable Muslims review 50+ sample responses for accuracy and tone.

## Key Resources
- [Qwen-Agent](https://github.com/QwenLM/Qwen-Agent) — Agent harness
- [quran-validator](https://github.com/yazinsai/quran-validator) — Quran Arabic text validation
- [hadith-json](https://github.com/AhmedBaset/hadith-json) — Hadith dataset (50K+, pin version)
- [Evolution API](https://github.com/EvolutionAPI/evolution-api) — WhatsApp integration
- [grammY](https://grammy.dev/) — Telegram bot framework
- [adhan-js](https://github.com/batoulapps/adhan-js) — Prayer time calculation
- [Tanzil.net](https://tanzil.net/download/) — Quran text + translations (non-commercial)
- [fawazahmed0/quran-api](https://github.com/fawazahmed0/quran-api) — Alternative Quran data source

## Pre-Launch Checklist (Non-Blocking for Dev, Required Before Public Launch)
1. **Tanzil licensing**: Email Tanzil Project to confirm bundling Sahih International translation in a free, non-commercial app is permitted. Development can proceed; swap translation if denied.
2. **Hadith data quality**: Spot-check hadith-json against known canonical numbering (Bukhari book/chapter/hadith structure). Verify total counts match expected (Bukhari ~7,563, Muslim ~7,500). Flag any gaps or mismatches.
3. **Evolution API stability**: Test Baileys mode for 48+ hours before launch. Document reconnect behavior and webhook reliability. Have fallback plan (Telegram-only launch) if WhatsApp is unstable.
