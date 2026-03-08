from pydantic_settings import BaseSettings
from typing import Optional
import secrets


class Settings(BaseSettings):
    # App
    APP_NAME: str = "PhishGuard"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    SECRET_KEY: str = secrets.token_urlsafe(32)
    
    # Database
    DATABASE_URL: str = "postgresql://phishguard:phishguard_pass@postgres:5432/phishguard"
    
    # Redis
    REDIS_URL: str = "redis://redis:6379/0"
    
    # JWT
    JWT_SECRET_KEY: str = secrets.token_urlsafe(32)
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7
    
    # Encryption
    ENCRYPTION_KEY: Optional[str] = None  # 32-byte base64 key for AES-256
    
    # OpenAI (optional)
    OPENAI_API_KEY: Optional[str] = None
    # Google Gemini API
    GEMINI_API_KEY: Optional[str] = None
    # Groq API (fast LLM inference)
    GROQ_API_KEY: Optional[str] = None
    # VirusTotal threat intelligence (free tier: 4 req/min, 500 req/day)
    VIRUSTOTAL_API_KEY: Optional[str] = None
    # File uploads
    MAX_FILE_SIZE_MB: int = 10
    UPLOAD_DIR: str = "/app/uploads"
    
    # Rate limiting
    RATE_LIMIT_PER_MINUTE: int = 30
    
    # FIX: ADMIN_EMAIL was referenced in auth.py but never defined here,
    # causing AttributeError → 500 on every admin login attempt.
    # Default is the seeded demo admin account email.
    ADMIN_EMAIL: str = "admin@phishguard.io"
    
    # CORS
    ALLOWED_ORIGINS: list = [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://phishguard.io",
        "https://phishguard-brown.vercel.app",
    ]
    
    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
