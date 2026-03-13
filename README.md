# Ilm

Self-hosted Islamic knowledge agent for Telegram and WhatsApp. RAG-only, no fine-tuning. Extractive ID-grounded answers: the LLM returns citation IDs, the app renders actual text from a local database. No fatwas, ever.

## Architecture

Hybrid monorepo: TypeScript bot + Python agent, communicating via HTTP.

```
User (Telegram/WhatsApp)
  -> TS Bot (grammY / Evolution API)
    -> Keyword guardrail (fast fatwa detection)
    -> Python Agent (Qwen-Agent + FastAPI)
      -> RAG search (ChromaDB + all-MiniLM-L6-v2)
      -> LLM (Ollama / Qwen 3.5 9B)
    <- Structured JSON response {summary, citation IDs}
    -> Validate citation IDs against local DB
    -> Render actual Quran/hadith text from DB
  <- Formatted message to user
```

The LLM never generates religious text shown to users. All Quran and hadith text is rendered from verified local data files.

## Setup

### Prerequisites

- Node.js 22+
- Python 3.11+
- Ollama with `qwen3.5:9b` model
- Docker (optional, for full stack)

### Data Pipeline

```bash
# Fetch Quran (Sahih International via alquran.cloud / Tanzil)
python scripts/fetch_quran.py

# Fetch Hadith (Bukhari + Muslim from hadith-json, pinned commit)
npx tsx scripts/fetch_hadith.ts

# Verify data integrity
npx tsx scripts/verify_data.ts

# Build vector index
python scripts/build_index.py
```

### Bot (TypeScript)

```bash
cd bot
npm install
cp ../.env.example ../.env  # edit with your tokens
npm run dev
```

### Agent (Python)

```bash
cd agent
pip install -r requirements.txt
python src/main.py  # starts FastAPI on :8000
```

### Docker (all services)

```bash
docker compose up
```

## Features

- **Quran Q&A** — free-form questions answered with verified Quran citations
- **Hadith Q&A** — free-form questions answered with verified hadith citations
- **Direct lookup** — `/quran 2:255` or `/hadith bukhari:1`
- **Prayer times** — `/pray` using saved GPS location (offline calculation via adhan-js)
- **Guardrails** — fatwa/ruling requests redirected to scholars
- **Dual platform** — Telegram + WhatsApp via unified message router

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/help` | List available commands |
| `/about` | About Ilm + data attributions |
| `/quran 2:255` | Look up a specific verse |
| `/hadith bukhari:1` | Look up a specific hadith |
| `/pray` | Today's prayer times (requires location) |
| `/setlocation` | Save your location for prayer times |

## Data Sources & Attribution

### Quran Text

- **Arabic text**: Uthmani script from [Tanzil.net](https://tanzil.net/)
  - License: Creative Commons Attribution 3.0
  - Attribution: "Quran text from Tanzil.net"

- **English translation**: Sahih International via [Tanzil.net](https://tanzil.net/)
  - License: Non-commercial use with attribution
  - Attribution: "Sahih International translation, courtesy of Tanzil.net"

### Hadith Text

- **Source**: [AhmedBaset/hadith-json](https://github.com/AhmedBaset/hadith-json)
  - Pinned to commit `ca32fd72aa16eeeb9a819c80bb65c9e78766532d`
  - Collections: Sahih Bukhari, Sahih Muslim

### Prayer Times

- **Calculation**: [adhan-js](https://github.com/batoulapps/adhan-js) (offline, no API calls)

## Key Constraints

- Non-commercial project — free forever, no monetization
- Fully self-hosted — no frontier AI APIs, Ollama only
- LLM never generates religious text shown to users
- Citation IDs validated against local DB before rendering
- No fatwas, no rulings — always redirects to scholars

## License

This project is for non-commercial use only, in accordance with the Sahih International translation terms from Tanzil.net.
