# persona-agent

> **LangGraph-based conversational AI agent with continuous memory, dynamic LLM persona selection, adaptive texting pacing, and directional trait elicitation for behavioral profiling.**

---

## 🌟 Overview

`persona-agent` is an AI companion backend built with **LangGraph**, **FastAPI**, **Google Gemini**, and **PostgreSQL**. It is designed to engage in organic, human conversations across distinct character archetypes while simultaneously serving as an **intelligent data collection engine** that maps out a user's personality traits through natural conversation.

Rather than forcing the user to pick a persona upfront or deterministically guessing, `persona-agent` starts in an adaptive discovery mode. An **LLM selector node** observes the user's communication style, slang, tone, and interests over the first 2–3 turns to dynamically choose the ideal companion archetype for them.

---

## ⚡ Core Features

- **🤖 Dynamic LLM Persona Selection**:
  - Starts as **Nova (`discovery`)**, a welcoming, open companion observing the user's vibe.
  - Across the first 1–3 turns, an internal LLM agent evaluates the conversation and locks in the best complementary persona:
    - **Leo (`curious_banter`)**: Witty, fast-paced, observant, and playful.
    - **Marcus (`pragmatic_mentor`)**: Grounded, calm, direct, and reflective.
    - **Maya (`empathetic_confidant`)**: Warm, emotionally perceptive, and patient.
    - **Zane (`analytical_challenger`)**: Sharp intellectual sparring partner who loves probing "why".
- **📱 Adaptive Texting Style (Pacing)**: Analyzes incoming user messages in real time (brevity, lowercase formatting, slang density, and emojis) and dynamically adapts the character's pacing to match the user's natural communication cadence.
- **🎯 Directional Trait Elicitation**: Inspects the user's personality profile to find low-confidence traits, then subtly steers conversations with situational probes without ever revealing trait names or breaking character.
- **🧠 Continuous & Persistent Memory**:
  - **Short-Term Thread Memory**: Managed via LangGraph checkpointing (`AsyncPostgresSaver`) for multi-turn conversational context.
  - **Long-Term User Trait Profile**: Stored in PostgreSQL with running Bayesian confidence scores, observation counts, and direct user quote evidence.
- **🔮 Powered by Google Gemini**: Uses `gemini-2.5-flash` via `langchain-google-genai` for fast, cost-effective, and nuanced generation.

---

## 🏗️ Architecture

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
   2. Persona Selector Node   ──> LLM assesses first 1-3 turns to select & lock persona
   3. Elicitation Goal Node   ──> Identifies lowest-confidence traits to target
   4. Persona Generator Node  ──> Generates in-character response with style pacing (Gemini)
          │
          ▼
   [Streamed to User immediately via SSE]
```

*(Note: Trait extraction triggering is decoupled and currently planned for scheduled batches/milestone-based checkpoints.)*

---

## 📊 Tracked Personality Traits

The MVP tracks 8 core behavioral personality traits:

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

## 🚀 Quick Start

### 1. Prerequisites
- Python 3.11+
- Docker & Docker Compose
- Google Gemini API Key

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
Copy `.env.example` and set your `GEMINI_API_KEY`:
```bash
cp .env.example .env
```
Key variables:
- `GEMINI_API_KEY`: Your Google Gemini API key.
- `DEFAULT_CHAT_MODEL`: `gemini-2.5-flash`
- `DATABASE_URL`: `postgresql+asyncpg://postgres:postgres@localhost:5432/persona_agent`
- `CHECKPOINTER_DB_URL`: `postgresql://postgres:postgres@localhost:5432/persona_agent`

### 5. Launch the Server
```bash
uvicorn app.main:app --reload --port 8000
```
- Interactive API Docs: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

---

## 📡 API Reference

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

## 🧪 Testing

Run automated tests:
```bash
pytest tests/
```