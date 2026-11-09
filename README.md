# Aura

Conversational personality profiling agent. A LangGraph pipeline drives a streaming chat, and a separate extraction step scores users on 8 behavioral traits from their messages. Scores and supporting evidence are stored in PostgreSQL and shown live in a Next.js UI.

**Stack:** LangGraph, FastAPI, PostgreSQL (SQLAlchemy async + LangGraph checkpointer), Gemini, Next.js

---

## How it works

Each user message runs through a four-node LangGraph graph:

```mermaid
flowchart TD
    START([User Message]) --> SA[1. Style Analyzer<br/>Regex heuristics: length, slang, energy]
    SA --> TS[2. Trait Target Selector<br/>Picks lowest-confidence trait]
    TS --> GEN[3. Generator<br/>Streams reply with a trait probe]

    GEN --> ROUTE{Tool called?}
    ROUTE -- "switch_persona" --> PT[persona_tools<br/>Switch persona, emit SSE persona event]
    PT --> GEN

    ROUTE -- "No (text streamed)" --> TE[4. Trait Extractor<br/>Scores target trait from dialogue]

    TE --> EVAL{Sufficient evidence?}
    EVAL -- Yes --> SAVE[Persist score + observation<br/>Emit SSE trait_updated<br/>Clear target]
    EVAL -- No --> KEEP[Keep target for next turn]

    SAVE --> END([END])
    KEEP --> END
```

1. **Style analyzer** ([style_analyzer.py](app/agent/nodes/style_analyzer.py)): regex-based estimate of message length preference and energy. No LLM call.
2. **Trait target selector** ([elicitation.py](app/agent/nodes/elicitation.py)): reads the user's current scores from PostgreSQL and targets the trait with the lowest confidence (below 75%) that has no active target.
3. **Generator** ([generator.py](app/agent/nodes/generator.py)): streams the reply token by token. The prompt includes the detected style and the target trait, so the reply includes a scenario that elicits evidence for it. The model can call a `switch_persona` tool to change persona.
4. **Extractor** ([extractor.py](app/agent/nodes/extractor.py)): a separate LLM call that looks for evidence of the target trait in the conversation. If found, it returns a structured result (score, quote, reasoning, confidence delta), which is saved as a `TraitObservation` and merged into a running weighted `UserTraitScore`. The target is then cleared so the selector picks the next trait. Profiling is complete once all 8 traits reach 75% confidence.

### Personas

The agent starts in a discovery persona (Nova). During the first few turns it can switch to one of four fixed styles via the `switch_persona` tool, based on the user's detected style:

| Persona | Style |
| :--- | :--- |
| Leo | Witty, quick banter |
| Marcus | Grounded, direct |
| Maya | Warm, emotionally attentive |
| Zane | Analytical, challenging |

Persona definitions live in [registry.py](app/agent/personas/registry.py).

---

## Traits

8 traits, each scored on a continuous 1.0–7.0 scale:

| Trait ID | Low | High |
| :--- | :--- | :--- |
| `communication_directness` | Diplomatic, indirect | Direct, candid |
| `curiosity_breadth` | Focused specialist | Broad generalist |
| `decision_speed` | Deliberate, analytical | Rapid, instinctive |
| `structure_preference` | Fluid, spontaneous | Structured, methodical |
| `social_energy` | Solitary | Extroverted |
| `humor_style` | Dry, deadpan | Light, playful |
| `risk_tolerance` | Risk-averse | Risk-seeking |
| `stress_composure` | Emotionally expressive | Composed, solution-focused |

The catalog is defined in [catalog.py](app/agent/traits/catalog.py) and seeded into the `TraitCatalog` table on startup.

---

## Project layout

```text
app/
├── main.py                  # FastAPI app
├── config.py                # Settings (env)
├── agent/
│   ├── graph.py             # LangGraph definition
│   ├── state.py             # Graph state
│   ├── nodes/               # style_analyzer, elicitation, generator, extractor, persona_selector
│   ├── personas/registry.py
│   ├── traits/              # catalog + schemas
│   └── prompts/             # Markdown prompts + cached loader
│       ├── base_aura.md
│       ├── elicitation.md
│       ├── extraction.md
│       └── archetypes/      # one file per persona
├── api/
│   ├── schemas.py
│   └── routes/              # chat, profile, traits, personas
└── db/                      # models, session, init
frontend/                    # Next.js app (chat UI, sessions sidebar, signals drawer)
tests/                       # pytest
```

### Data model

| Table / model | Purpose |
| :--- | :--- |
| `TraitCatalog` | Trait definitions |
| `UserTraitScore` | Running score and confidence per user and trait |
| `TraitObservation` | Individual evidence records (quote, reasoning, score) |
| `UnstructuredMemory` | Free-form memory entries |
| `ChatMessageRecord` | Persisted chat messages for session history |

LangGraph checkpoint state is stored in the same database via `CHECKPOINTER_DB_URL`.

---

## API

| Method | Path | Description |
| :--- | :--- | :--- |
| POST | `/api/chat/stream` | Send a message; response is an SSE stream |
| POST | `/api/chat/message` | Non-streaming variant |
| GET | `/api/chat/threads/{thread_id}/history` | Checkpoint history for a thread |
| GET | `/api/chat/sessions` | List chat sessions |
| GET | `/api/chat/sessions/{thread_id}/messages` | Messages in a session |
| DELETE | `/api/chat/sessions/{thread_id}` | Delete a session |
| GET | `/api/profile/{user_id}/traits` | Current trait scores |
| GET | `/api/profile/{user_id}/observations` | Evidence records |
| POST | `/api/profile/{user_id}/reset` | Clear scores, observations, and memory |
| GET | `/api/traits`, `/api/traits/{trait_id}` | Trait catalog |
| GET | `/api/personas`, `/api/personas/{persona_id}` | Persona list |

### SSE events (`/api/chat/stream`)

| Event | Payload | Description |
| :--- | :--- | :--- |
| `delta` | `{"token": "..."}` | Next chunk of reply text |
| `persona` | `{"persona_id": "...", "locked": true}` | Persona switched |
| `target_trait` | `{"trait_id": "...", "name": "..."}` | Trait currently being probed |
| `trait_updated` | `{"trait_id": "...", "score": 6.2, "quote": "...", ...}` | Observation extracted and saved |
| `style` | `{"length_preference": "...", "energy": "..."}` | Detected user style |
| `done` | `{"thread_id": "...", "done": true}` | End of turn |

If the model returns zero tokens, the stream falls back to a fresh LLM retry with full context.

---

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- Docker and Docker Compose
- Gemini API key

### 1. Database

```bash
docker compose up -d
```

### 2. Backend

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set the following in `.env`:

```env
GEMINI_API_KEY=your_gemini_api_key_here
DEFAULT_CHAT_MODEL=gemini-3.5-flash-lite
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/persona_agent
CHECKPOINTER_DB_URL=postgresql://postgres:postgres@localhost:5432/persona_agent
```

Run the server:

```bash
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

The UI is at `http://localhost:3000`.

---

## Tests

```bash
pytest tests/
```
