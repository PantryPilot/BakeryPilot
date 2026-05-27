"""Environment-driven settings."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=("../.env", ".env"), extra="ignore")

    database_url: str = "postgresql://bakery:bakery@localhost:5432/bakery"
    redis_url: str = "redis://localhost:6379"
    allowed_origins: str = "http://localhost:3000"

    anthropic_api_key: str = ""
    google_api_key: str = ""
    groq_api_key: str = ""
    supplier_use_mock: bool = True
    mes_use_mock: bool = True
    cmms_use_mock: bool = True
    gmail_use_mock: bool = True

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()
