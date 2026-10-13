# persona-agent

> **LangGraph-based conversational AI agent with continuous memory, adaptive personality pacing, and directional trait elicitation for behavioral profiling.**

---

## Overview

`persona-agent` is an AI chat agent backend built with **LangGraph**, **FastAPI**, and **PostgreSQL**. It is designed to engage in organic, human conversations across distinct character archetypes while simultaneously serving as an **intelligent data collection engine** that maps out a user's personality traits through natural conversation.

Unlike traditional quiz-based assessments, `persona-agent` works entirely through everyday banter and conversational storytelling.

---

## Core Features

- **🎭 Distinct Character Personas**: Select from multiple conversational archetypes:
  - **Leo (`curious_banter`)**: Witty, fast-paced, observant, and playful.
  - **Marcus (`pragmatic_mentor`)**: Grounded, calm, direct, and reflective.
  - **Maya (`empathetic_confidant`)**: Warm, emotionally perceptive, and patient.
  - **Zane (`analytical_challenger`)**: Sharp intellectual sparring partner who loves probing "why".
- **📱 Adaptive Texting Style (Pacing)**: Analyzes incoming user messages in real time (brevity, lowercase formatting, slang density, and emojis) and dynamically adapts the character's pacing to match the user's natural communication vibe.
- **🎯 Directional Trait Elicitation**: Inspects the user's personality profile to find low-confidence traits, then subtly steers conversations with situational probes without ever revealing trait names or breaking character.
- **🧠 Continuous & Persistent Memory**:
  - **Short-Term Thread Memory**: Managed via LangGraph checkpointing (`AsyncPostgresSaver`) for multi-turn conversational context.
  - **Long-Term User Trait Profile**: Stored in PostgreSQL with running Bayesian confidence scores, observation counts, and direct user quote evidence.
- **⚡ Non-Blocking Background Extraction**: Chat replies are streamed immediately via Server-Sent Events (SSE) for sub-second TTFB, while trait extraction runs in the background.

---

##  Architecture

```text
[Next.js Chat Frontend]
          │
          │ (SSE Streaming / REST)
          ▼
   [FastAPI Backend]
          │
          ▼
 [LangGraph State Machine]
   1. Style Analyzer Node     ──> Detects: length, tone, slang, formatting
   2. Elicitation Goal Node   ──> Identifies lowest-confidence traits to target
   3. Persona Generator Node  ──> Generates in-character response with style pacing
          │
          ├─► [Streamed to User immediately via SSE]
          │
          ▼ (Background Worker)
   4. Trait Extractor Node    ──> Analyzes turn, quotes user evidence, updates Postgres
```

---

## Tracked Personality Traits

The MVP tracks 8 universal personality traits:

| Trait | Domain | Spectrum (Low ↔ High) |
| :--- | :--- | :--- |
| `communication_directness` | Communication | *Diplomatic & Indirect* ↔ *Direct & Blunt* |
| `curiosity_breadth` | Intellect & Learning | *Specialist Focus* ↔ *Omnivorous Generalist* |
| `decision_speed` | Decision Making | *Deliberate & Analytical* ↔ *Fast & Instinctive* |
| `structure_preference` | Work & Lifestyle | *Spontaneous & Fluid* ↔ *Structured & Routine-Driven* |
| `social_energy` | Social & Energy | *Introverted Focus* ↔ *Extroverted Banter* |
| `humor_style` | Social & Energy | *Dry & Sarcastic* ↔ *Light & Warmly Playful* |
| `risk_tolerance` | Disposition | *Risk-Averse / Safe* ↔ *High Risk / Bold Bets* |
| `stress_composure` | Disposition | *Emotionally Expressive* ↔ *Calm & Solutions-First* |


---

##  Quick Start

### 1. Prerequisites
- Python 3.11+
- Docker & Docker Compose

### 2. Start PostgreSQL
```bash
docker compose up -d
```

### 3. Setup Python Environment
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 4. Configure Environment
Copy the example environment file and add your LLM API keys:
```bash
cp .env.example .env
```
Key variables:
- `OPENAI_API_KEY`: OpenAI API key for LLM generation and extraction.
- `DATABASE_URL`: `postgresql+asyncpg://postgres:postgres@localhost:5432/persona_agent`
- `CHECKPOINTER_DB_URL`: `postgresql://postgres:postgres@localhost:5432/persona_agent`

### 5. Launch the Server
```bash
uvicorn app.main:app --reload --port 8000
```
- Interactive API Docs: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

---

## API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/chat/stream` | `POST` | Real-time SSE token stream for a conversation turn. |
| `/api/chat/message` | `POST` | Standard REST turn execution. |
| `/api/personas` | `GET` | List available persona archetypes. |
| `/api/traits` | `GET` | View active trait catalog and scoring anchors. |
| `/api/profile/{user_id}/traits` | `GET` | View current user trait scores, confidence levels, and observations. |
| `/api/profile/{user_id}/observations` | `GET` | View raw user quotes and deduction reasoning history. |
| `/api/threads/{thread_id}/history` | `GET` | Retrieve conversation history from LangGraph checkpointer. |

---

## Testing

Run automated tests:
```bash
pytest tests/
```