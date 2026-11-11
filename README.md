# Aura

Conversational personality profiling agent. A LangGraph pipeline drives a streaming chat, and a separate extraction step scores users on 8 behavioral traits from their messages. Scores and supporting evidence are stored in PostgreSQL and shown live in a Next.js UI.

**Stack:** LangGraph, FastAPI + SSE, PostgreSQL (SQLAlchemy async + LangGraph checkpointer), Gemini via `langchain-google-genai`, Next.js 16 / React 19 / Tailwind 4

---

## How it works

Each user message runs through a LangGraph state graph ([graph.py](app/agent/graph.py)):

```mermaid
flowchart TD
    START([User Message]) --> SA[style_analyzer<br/>Deterministic heuristics, no LLM]
    SA --> PP[persona_profiler<br/>Gemini structured output<br/>Freezes persona in first 3 turns]
    PP --> ES[elicitation_selector<br/>Reads scores from Postgres, picks target trait]
    ES --> GEN[generator<br/>Gemini, streamed reply + trait probe]
    GEN --> TE[trait_evaluator<br/>Gemini structured output, temp 0]

    TE --> EVAL{Sufficient evidence?}
    EVAL -- Yes --> SAVE[Insert TraitObservation<br/>Update UserTraitScore<br/>Clear target]
    EVAL -- No --> KEEP[No-op, target kept]

    SAVE --> END([END])
    KEEP --> END
```

| Node | LLM | Source | Behavior |
| :--- | :---: | :--- | :--- |
| `style_analyzer` | No | [style_analyzer.py](app/agent/nodes/style_analyzer.py) | Classifies the latest user message by word count, capitalization, slang word list, emoji regex, and punctuation. Produces `length_preference`, `capitalization`, `slang_level`, `emoji_usage`, `energy`. |
| `persona_profiler` | Yes (temp 0) | [persona_profiler.py](app/agent/nodes/persona_profiler.py) | Runs only while the persona is unlocked. Freezes the conversation persona, see [Persona freezing](#persona-freezing). |
| `elicitation_selector` | No | [elicitation.py](app/agent/nodes/elicitation.py) | Loads the user's per-trait confidence from `user_trait_scores`. Candidates are traits below 0.75, sorted lowest first. Keeps the current target for up to 2 turns unless it was just extracted or reached 0.75. Builds an elicitation directive from [elicitation.md](app/agent/prompts/elicitation.md). Sets `all_traits_filled` when no candidates remain. |
| `generator` | Yes (temp 0.7) | [generator.py](app/agent/nodes/generator.py) | Builds the system prompt from base prompt, active persona prompt, style-derived length and tone guidance, and the elicitation directive. Turn 1 adds a greeting instruction, and an unlocked persona adds a neutral discovery note. Falls back from `astream` to `ainvoke`, then to a canned reply if the response is empty. |
| `trait_evaluator` | Yes (temp 0) | [extractor.py](app/agent/nodes/extractor.py) | Skips if there is no target or the message is under 2 words. Otherwise calls Gemini with `with_structured_output(SingleTraitEvaluation)` over the last 4 messages. |

### Scoring

`trait_evaluator` returns `has_sufficient_evidence`, `observed_score`, `confidence_delta`, `quote`, and `reasoning`. If evidence is sufficient:

- `observed_score` is clamped to the trait's scale (default 1.0–7.0).
- `confidence_delta` is clamped to 0.10–0.35.
- A `TraitObservation` row is inserted.
- `UserTraitScore.score` becomes the running mean over `observation_count`. `confidence` increases by the delta and is capped at 0.95.
- `current_target_trait` is cleared so the selector picks another trait next turn.

Profiling is complete when all 8 traits have confidence of at least 0.75.

### Persona freezing

The conversation starts in `discovery` (Nova). During the first 3 user turns, `persona_profiler` picks one of four archetypes and locks it for the rest of the thread:

1. It skips the LLM call for messages under 3 words (e.g. "hi") before turn 3.
2. Otherwise it sends the last 6 messages plus the `style_analyzer` output to Gemini with `with_structured_output(PersonaAssessment)`. The result is a `persona_id` (always one of the four archetypes), a `confidence` from 0 to 1, and a one-line `reasoning`.
3. It freezes immediately if `confidence >= 0.75`.
4. It freezes unconditionally on turn 3, using the model's pick even at low confidence.
5. If the LLM call fails or no API key is set, turn 3 falls back to a heuristic: `curious_banter` for slang or playful/upbeat energy, otherwise `pragmatic_mentor`.

On freeze the node sets `persona_id`, `persona_locked`, and `persona_assessment` (confidence, reasoning, turn). The stream route emits a `persona` SSE event, and the client sends the persona back on later requests so it stays locked. A request can also pass `persona_id` to start locked, which skips the profiler. Tunables (`MAX_DISCOVERY_TURNS`, `LOCK_CONFIDENCE`, `MIN_WORDS_FOR_ASSESSMENT`) are constants in [persona_profiler.py](app/agent/nodes/persona_profiler.py), and the model is set by `DEFAULT_PERSONA_MODEL`.

| ID | Name | Selected for |
| :--- | :--- | :--- |
| `curious_banter` | Leo | Casual slang, humor, playful tone |
| `pragmatic_mentor` | Marcus | Grounded, candid, practical |
| `empathetic_confidant` | Maya | Personal feelings, stress, vulnerability |
| `analytical_challenger` | Zane | Debate, logic, challenging assumptions |

Definitions are in [registry.py](app/agent/personas/registry.py). Prompts are in [app/agent/prompts/archetypes/](app/agent/prompts/archetypes).

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

The catalog is defined in [catalog.py](app/agent/traits/catalog.py) (`SEED_TRAITS`) and seeded into `trait_catalog` on startup. The extractor rubric is in [extraction.md](app/agent/prompts/extraction.md).

---

## Project layout

```text
app/
├── main.py                  # FastAPI app, lifespan (DB init, graph init)
├── config.py                # Settings from env / .env
├── agent/
│   ├── graph.py             # StateGraph definition, checkpointer setup
│   ├── state.py             # AgentState, DetectedStyle, TargetedTrait
│   ├── nodes/               # style_analyzer, persona_profiler, elicitation, generator, extractor
│   ├── personas/registry.py
│   ├── traits/              # catalog + schema
│   └── prompts/             # Markdown prompts + cached loader
│       ├── base_aura.md
│       ├── elicitation.md
│       ├── extraction.md
│       └── archetypes/      # one file per persona
├── api/
│   ├── schemas.py
│   └── routes/              # chat, profile, traits, personas
└── db/                      # models, session, init_db
frontend/                    # Next.js app
├── app/                     # page, layout, globals.css
└── components/chat/         # chat-interface, chat-sessions-sidebar, signals-drawer
tests/                       # pytest: graph, persona profiler, personas, style analyzer
```

### State and persistence

The graph is compiled with `AsyncPostgresSaver` (psycopg pool on `CHECKPOINTER_DB_URL`), keyed by `thread_id`. If Postgres is unavailable at startup it falls back to in-memory `MemorySaver`, and thread state is then lost on restart.

| Table | Purpose |
| :--- | :--- |
| `trait_catalog` | Trait definitions and scale anchors |
| `user_trait_scores` | Running score, confidence, and observation count, unique per (user, trait) |
| `trait_observations` | Evidence rows: observed score, quote, reasoning, thread |
| `unstructured_memory` | Per-user free-text memory (one row per user) |
| `chat_messages` | Message-level chat history used by the sessions sidebar |

---

## API

| Method | Path | Description |
| :--- | :--- | :--- |
| POST | `/api/chat/stream` | Send a message; response is an SSE stream |
| POST | `/api/chat/message` | Non-streaming variant |
| GET | `/api/chat/threads/{thread_id}/history` | Checkpointed messages for a thread |
| GET | `/api/chat/sessions` | List chat sessions |
| GET | `/api/chat/sessions/{thread_id}/messages` | Messages in a session |
| DELETE | `/api/chat/sessions/{thread_id}` | Delete a session |
| GET | `/api/profile/{user_id}/traits` | Current trait scores |
| GET | `/api/profile/{user_id}/observations` | Evidence records |
| POST | `/api/profile/{user_id}/reset` | Clear scores, observations, and memory |
| GET | `/api/traits`, `/api/traits/{trait_id}` | Trait catalog |
| GET | `/api/personas`, `/api/personas/{persona_id}` | Persona list |

### SSE events (`/api/chat/stream`)

The stream is produced from LangGraph `astream_events`. Tokens are forwarded only from the generator, never from the extractor or profiler.

| Event | Payload | Emitted when |
| :--- | :--- | :--- |
| `style` | `{"length_preference", "capitalization", "slang_level", "emoji_usage", "energy"}` | `style_analyzer` finishes |
| `target_trait` | `{"trait_id", "name", "domain"}` | `elicitation_selector` finishes with a target |
| `persona` | `{"persona_id", "locked"}` | `persona_profiler` freezes the persona |
| `delta` | `{"token": "..."}` | Generator emits text |
| `trait_updated` | `{"trait_id", "score", "confidence", "quote", "reasoning", ...}` | `trait_evaluator` saves an observation |
| `done` | `{"thread_id", "done": true}` | End of turn |

User and assistant messages are written to `chat_messages` per turn. If a turn streams zero tokens, the route retries once with a fresh LLM call built from the persisted state and elicitation directive.

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

Configuration in `.env` (`GOOGLE_API_KEY` is accepted as an alternative to `GEMINI_API_KEY`):

```env
GEMINI_API_KEY=your_gemini_api_key_here
DEFAULT_CHAT_MODEL=gemini-3.5-flash-lite
DEFAULT_EXTRACTOR_MODEL=gemini-3.5-flash-lite
DEFAULT_PERSONA_MODEL=gemini-3.5-flash-lite
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/persona_agent
CHECKPOINTER_DB_URL=postgresql://postgres:postgres@localhost:5432/persona_agent
```

Without an API key the generator returns a canned reply, the extractor is skipped, and the persona is frozen by the heuristic fallback on turn 3.

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
