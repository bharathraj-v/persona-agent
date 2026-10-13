from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    APP_NAME: str = "Persona Agent"
    DEBUG: bool = True
    PORT: int = 8000
    HOST: str = "0.0.0.0"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/persona_agent"
    CHECKPOINTER_DB_URL: str = "postgresql://postgres:postgres@localhost:5432/persona_agent"

    # API Keys
    OPENAI_API_KEY: Optional[str] = None
    ANTHROPIC_API_KEY: Optional[str] = None

    # Model defaults
    DEFAULT_CHAT_MODEL: str = "gpt-4o-mini"
    DEFAULT_EXTRACTOR_MODEL: str = "gpt-4o-mini"


settings = Settings()
