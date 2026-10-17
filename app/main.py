import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db.init_db import init_database
from app.api.routes import chat, personas, traits, profile
from app.agent.graph import init_app_graph, close_app_graph

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting persona-agent...")
    try:
        await init_database()
        logger.info("Database initialized.")
    except Exception as e:
        logger.warning(f"Database initialization skipped or connection pending: {e}")

    try:
        await init_app_graph()
    except Exception as e:
        logger.warning(f"Graph initialization warning: {e}")

    logger.info("persona-agent ready.")
    yield

    # Shutdown
    logger.info("Shutting down persona-agent...")
    await close_app_graph()


app = FastAPI(
    title=settings.APP_NAME,
    description="Persona-driven conversational agent with continuous memory, style adaptation, and directional trait elicitation.",
    version="0.1.0",
    lifespan=lifespan
)

# Enable CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount API Routers
app.include_router(chat.router)
app.include_router(personas.router)
app.include_router(traits.router)
app.include_router(profile.router)


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "app": settings.APP_NAME,
        "debug": settings.DEBUG
    }


@app.get("/")
async def root():
    return {
        "message": "Persona Agent API is running.",
        "docs_url": "/docs",
        "health_url": "/health"
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=settings.DEBUG)
