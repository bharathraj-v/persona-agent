from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional
import os


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

    # Gemini API Key (support both GEMINI_API_KEY and GOOGLE_API_KEY)
    GEMINI_API_KEY: Optional[str] = None
    GOOGLE_API_KEY: Optional[str] = None

    # Default Models
    DEFAULT_CHAT_MODEL: str = "gemini-3.5-flash-lite"
    DEFAULT_EXTRACTOR_MODEL: str = "gemini-3.5-flash-lite"

    def get_gemini_key(self) -> Optional[str]:
        return self.GEMINI_API_KEY or self.GOOGLE_API_KEY or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")


settings = Settings()
