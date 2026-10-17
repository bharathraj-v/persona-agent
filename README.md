# Aura · Personality & Vibe Profiling Agent

> An emotionally intelligent, adaptive AI companion implemented with **LangGraph**, **FastAPI**, **Google Gemini**, and **PostgreSQL**. Aura naturally engages users in dialogue, aligns with their communication vibe, and systematically maps their authentic personality traits in real time.

---

## Purpose & Core Thesis

Aura is designed to **identify, understand, and map a user's authentic personality—their communication vibe, decision-making instincts, lifestyle structure, social energy, and emotional composure—through natural conversation**.

Rather than subjecting users to sterile psychological surveys or clinical questionnaires, Aura converses like a real companion:
- **Discovers Communication Vibe**: Observes how you text (brevity, slang, humor, punctuation, energy) and calibrates its tone in real time.
- **Dynamic Modality Handoff**: If your vibe resonates with a specific conversational archetype (witty banter, pragmatic mentorship, deep emotional empathy, or intellectual challenge), Aura seamlessly transitions into that modality via tool handoff.
- **Directional Trait Elicitation**: Subtly weaves everyday scenarios and dilemmas into the flow of dialogue without ever using psychological jargon.
- **Subagent Profiling & Live Map**: An internal profiling subagent derives concrete behavioral observations from your statements, calculates Bayesian confidence scores, and updates your live Personality Map in the UI as the chat progresses.

---

## The 4-Stage Conversational Loop

```mermaid
flowchart TD
    START([User Message]) --> SA[1. Style Analyzer<br/>Regex heuristic: brevity, slang, energy]
    SA --> TS[2. Trait Target Selector<br/>Selects lowest-confidence unmapped trait]
    TS --> GEN[3. Aura Conversational Generator<br/>In-character streaming reply + situational probe]
    
    GEN --> ROUTE{Tool called?}
    ROUTE -- "switch_persona" --> PT[persona_tools<br/>Switches archetype & emits SSE persona]
    PT --> GEN
    
    ROUTE -- "No (Text Streamed)" --> TE[4. Trait Profiler Subagent<br/>Analyzes dialogue for targeted trait evidence]
    
    TE --> EVAL{Sufficient evidence?}
    EVAL -- Yes --> SAVE[Persist UserTraitScore & Observation in PostgreSQL<br/>Emit SSE 'trait_updated'<br/>Reset target to select next trait]
    EVAL -- No --> KEEP[Retain target trait for follow-up turn]
    
    SAVE --> END([END])
    KEEP --> END([END])
```

### Stage Breakdown:
1. **Stage 1 (Personality Alignment & Modality Handoff)**: Aura begins in discovery mode (Nova). During turns 1–3, Aura assesses user style. If a distinct style matches an archetype (Leo, Marcus, Maya, Zane), Aura invokes the tool `switch_persona` to lock that modality.
2. **Stage 2 (Dynamic Trait Targeting)**: Inspects the user's running profile in PostgreSQL and selects the single trait with the lowest confidence score (< 75%) to explore next.
3. **Stage 3 (In-Character Elicitation & Token Streaming)**: Generates the conversational response as Aura, adapting to user texting cadence and weaving in a relatable probe. Tokens stream directly to the client via SSE with zero blocking.
4. **Stage 4 (Subagent Trait Extraction & Persistence)**: A specialized profiling subagent evaluates the conversation specifically for the targeted trait. If sufficient evidence is present:
   - Formulates the structured extraction (score, quote, reasoning, confidence delta).
   - Persists the observation and running weighted score to PostgreSQL.
   - Emits an SSE `trait_updated` event to the frontend.
   - Clears the target so Stage 2 picks the next trait on the following turn.
   - Repeats until all 8 traits reach confident completion (75%+).

---

## Tracked Personality Dimensions

Aura profiles 8 behavioral traits on normalized continuous scales (1.0 to 7.0):

| Trait Identifier | Domain | Spectrum Anchors (Low / High) |
| :--- | :--- | :--- |
| `communication_directness` | Communication | Diplomatic & Indirect / Direct & Candid |
| `curiosity_breadth` | Intellect & Learning | Focused Specialist / Omnivorous Generalist |
| `decision_speed` | Decision Making | Deliberate & Analytical / Rapid & Instinctive |
| `structure_preference` | Work & Lifestyle | Fluid & Spontaneous / Structured & Methodical |
| `social_energy` | Social & Energy | Solitary & Internally Focused / Extroverted & Interactive |
| `humor_style` | Social & Energy | Dry & Deadpan / Light & Warmly Playful |
| `risk_tolerance` | Disposition | Risk-Averse & Predictable / High Risk & Exploratory |
| `stress_composure` | Disposition | Emotionally Expressive / Composed & Solution-Focused |

---

## Modular Prompts Architecture

All system prompts are organized in clean, maintainable Markdown files under `app/agent/prompts/`:

```text
app/agent/prompts/
├── base_aura.md               # Core thesis, identity, and mission of Aura
├── elicitation.md             # Guidelines for natural scenario probes
├── extraction.md              # Trait Profiler subagent scoring rubrics
├── loader.py                  # Prompt loader with caching
└── archetypes/
    ├── discovery.md           # Nova: adaptive companion discovering vibe
    ├── curious_banter.md      # Leo: witty, quick banter, playful friend
    ├── pragmatic_mentor.md    # Marcus: grounded, calm, candid perspective
    ├── empathetic_confidant.md# Maya: warm, intuitive, emotional depth
    └── analytical_challenger.md # Zane: sharp intellectual sparring partner
```

---

## Server-Sent Events (SSE) Streaming

The `/api/chat/stream` endpoint streams real-time events to the frontend:

| Event Type | Payload | Description |
| :--- | :--- | :--- |
| `delta` | `{"token": "..."}` | Live token-by-token conversational text stream. |
| `persona` | `{"persona_id": "...", "locked": true}` | Emitted when Aura switches archetype modality. |
| `target_trait` | `{"trait_id": "...", "name": "..."}` | Informs client of the active trait being explored. |
| `trait_updated` | `{"trait_id": "...", "score": 6.2, "quote": "...", ...}` | Emitted when a trait observation is extracted and saved. |
| `style` | `{"length_preference": "...", "energy": "..."}` | Live detected user texting cadence. |
| `done` | `{"thread_id": "...", "done": true}` | Indicates end of turn streaming. |

---

## Getting Started

### Prerequisites
- Python 3.11+
- Node.js 18+ & npm
- Docker and Docker Compose
- Google Gemini API Key

### 1. Database Initialization
Start PostgreSQL via Docker Compose:
```bash
docker compose up -d
```

### 2. Backend Setup
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Ensure `.env` contains your Gemini API key:
```env
GEMINI_API_KEY=your_gemini_api_key_here
DEFAULT_CHAT_MODEL=gemini-3.5-flash-lite
DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/persona_agent
CHECKPOINTER_DB_URL=postgresql://postgres:postgres@localhost:5432/persona_agent
```

Start the FastAPI application:
```bash
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend Setup
In a new terminal:
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000` to chat with Aura and watch your Personality Map develop in real time!

---

## Testing

Run the test suite with pytest:
```bash
pytest tests/
```