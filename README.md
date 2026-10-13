# persona-agent

> LangGraph-based conversational AI agent with continuous memory, dynamic LLM persona selection, adaptive communication pacing, and directional trait elicitation for behavioral profiling.

---

## Overview

`persona-agent` is an asynchronous conversational agent backend implemented with **LangGraph**, **FastAPI**, **Google Gemini**, and **PostgreSQL**. The system provides multi-turn conversational interactions across distinct character archetypes while concurrently functioning as an automated behavioral observation engine that constructs a user personality profile through natural dialogue.

Rather than requiring static persona selection at initialization, `persona-agent` begins in an adaptive discovery mode. An LLM-driven evaluation node analyzes the user's communication style, vocabulary, tone, and topical engagement over the initial turns to select and bind the optimal companion archetype dynamically.

---

## Architecture and Core Components

### Workflow Pipeline

```text
[Next.js Chat Frontend]
          │
          │ (SSE Streaming / REST)
          ▼
   [FastAPI Backend]
          │
          ▼
 [LangGraph State Machine]
   1. Style Analyzer Node     ──> Extracts message brevity, syntax, informal density
   2. Persona Selector Node   ──> Evaluates turns 1-3 to classify and lock persona
   3. Elicitation Goal Node   ──> Identifies low-confidence traits requiring signal
   4. Persona Generator Node  ──> Generates in-character response with style pacing (Gemini)
          │
          ▼
   [Streamed to Client via SSE]
```

### Key Capabilities

- **Dynamic LLM Persona Selection**:
  - Initializes with `discovery` (Nova), an open conversational baseline.
  - Across turns 1–3, an evaluation model assesses dialogue characteristics to transition into one of four focused archetypes:
    - **Leo (`curious_banter`)**: Observant, conversational, informal pacing.
    - **Marcus (`pragmatic_mentor`)**: Grounded, reflective, direct, and pragmatic.
    - **Maya (`empathetic_confidant`)**: Attentive, emotionally perceptive, and supportive.
    - **Zane (`analytical_challenger`)**: Structured, dialectical, and logically rigorous.
- **Adaptive Communication Pacing**: Inspects incoming messages in real time (token length, capitalization patterns, informal slang, and punctuation) to adjust generation constraints to match user cadence.
- **Directional Trait Elicitation**: Evaluates the user's personality profile to identify dimensions with low confidence scores, seeding situational prompts that elicit diagnostic behavioral signals without disclosing the underlying rubric.
- **State Persistence and Memory**:
  - **Thread-Scoped State**: Managed via LangGraph checkpointing (`AsyncPostgresSaver`) for multi-turn dialogue continuity.
  - **Long-Term Trait Repository**: Maintained in PostgreSQL with running Bayesian confidence estimates, observation counts, and recorded user evidence snippets.
- **Model Integration**: Utilizes Google Gemini (`gemini-3.5-flash-lite`) via `langchain-google-genai` for low-latency generation and structured extraction.

---

## Tracked Personality Traits

The baseline system profiles 8 behavioral traits on normalized continuous scales:

| Trait Identifier | Domain | Spectrum Anchors (Low / High) |
| :--- | :--- | :--- |
| `communication_directness` | Communication | Diplomatic & Indirect / Direct & Unambiguous |
| `curiosity_breadth` | Intellect & Learning | Focused Specialist / Broad Generalist |
| `decision_speed` | Decision Making | Deliberate & Analytical / Rapid & Intuitive |
| `structure_preference` | Work & Lifestyle | Fluid & Spontaneous / Structured & Methodical |
| `social_energy` | Social & Energy | Solitary & Internally Focused / Extroverted & Interactive |
| `humor_style` | Social & Energy | Dry & Deadpan / Light & Warm |
| `risk_tolerance` | Disposition | Risk-Averse & Predictable / High Risk & Exploratory |
| `stress_composure` | Disposition | Emotionally Expressive / Composed & Solution-Focused |

---

## Getting Started

### Prerequisites

- Python 3.11+
- Docker and Docker Compose
- Google Gemini API Key

### 1. Database Initialization

Start the PostgreSQL service:

```bash
docker compose up -d
```

### 2. Environment Setup

Create and activate a virtual environment:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Configure environment variables:

```bash
cp .env.example .env
```

Ensure the following variables are defined in `.env`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
DEFAULT_CHAT_MODEL=gemini-3.5-flash-lite
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/persona_agent
CHECKPOINTER_DB_URL=postgresql://postgres:postgres@localhost:5432/persona_agent
```

### 3. Running the Application

Start the FastAPI application with Uvicorn:

```bash
uvicorn app.main:app --reload --port 8000
```

- API Documentation: `http://localhost:8000/docs`
- Health Endpoint: `http://localhost:8000/health`

---

## API Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `POST` | `/api/chat/stream` | Server-Sent Events (SSE) token stream for dialogue turns. |
| `POST` | `/api/chat/message` | Synchronous REST execution for dialogue turns. |
| `GET` | `/api/personas` | Lists configured persona archetypes and baseline settings. |
| `GET` | `/api/traits` | Returns the active trait catalog and scoring definitions. |
| `GET` | `/api/profile/{user_id}/traits` | Returns computed trait scores, confidence levels, and observations. |
| `GET` | `/api/profile/{user_id}/observations` | Retrieves raw observation history with quote evidence. |
| `GET` | `/api/threads/{thread_id}/history` | Retrieves conversation history from the checkpointer. |

---

## Verification and Testing

Execute the test suite using pytest:

```bash
pytest tests/
```