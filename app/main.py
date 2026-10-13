from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.db.init_db import init_database
from app.api.routes import chat, personas, traits, profile


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: attempt to initialize DB if reachable
    try:
        await init_database()
    except Exception as e:
        print(f"[Notice] Database initialization skipped or connection pending: {e}")
    yield
    # Shutdown logic if needed


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
