# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Ilm — self-hosted Islamic knowledge agent (Telegram + WhatsApp bot). RAG-only, no fine-tuning. Extractive ID-grounded answers: LLM returns citation IDs, app renders actual text from local DB. No fatwas ever.

## Architecture

Hybrid monorepo: TypeScript (`bot/`) + Python (`agent/`), communicating via HTTP.

- **bot/** — grammY (Telegram) + Evolution API (WhatsApp), message routing, citation rendering, validation, prayer times (adhan-js), user state (SQLite)
- **agent/** — Qwen-Agent + FastAPI, RAG over Quran/hadith via ChromaDB, LLM guardrails, Ollama (qwen3.5:9b at localhost:11434)
- **scripts/** — one-time data fetch (Tanzil for Quran, hadith-json for hadith) and index building
- **eval/** — automated evaluation runner + test set

## Citation Contract

All API boundaries use structured citation objects, never string IDs:
- Quran: `{ type: "quran", surah: number, ayah: number }`
- Hadith: `{ type: "hadith", collection: "bukhari"|"muslim", number: number }`

String keys (`quran:2:255`) allowed only internally in ChromaDB. See PR_PLAN.md top section for full contract.

## Commands

```bash
# Bot (TypeScript)
cd bot && npm install
npm run build        # tsc
npm run dev          # development mode
npm test

# Agent (Python)
cd agent && pip install -r requirements.txt
python src/main.py   # starts FastAPI on :8000

# Data pipeline
python scripts/fetch_quran.py
npx tsx scripts/fetch_hadith.ts
python scripts/build_index.py

# Docker (all services)
docker compose up

# Eval
python eval/run_eval.py
```

## Key Constraints

- Non-commercial project — Sahih International translation used under non-commercial terms
- No frontier AI APIs — fully self-hosted, Ollama only
- LLM never generates religious text shown to users — always rendered from local DB
- quran-validator is ingestion/test-time only, not hot-path
- Rate limiting is per `platformId` — no cross-platform user linking
- Platform-prefixed user IDs: `tg:123456`, `wa:1234567890`

## Implementation Plan

See PLAN.md for full architecture and PR_PLAN.md for the 10-PR breakdown with dependency graph. Implementation order: PR 1 (scaffolding+data) → PR 2 (RAG+agent) + PR 3 (bot core) in parallel → PR 4-6 → PR 7-10.
