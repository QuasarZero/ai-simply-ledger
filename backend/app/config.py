from __future__ import annotations

from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "prod"
    debug: bool = False
    log_dir: str = "logs"
    timezone: str = "Asia/Shanghai"

    secret_key: str = "change-me"
    access_token_expire_minutes: int = 60 * 24 * 7
    cors_origins: str = "http://localhost:5173"

    db_host: str = "db"
    db_port: int = 5432
    db_name: str = "expense_db"
    db_user: str = "expense_user"
    db_password: str = "expense_pass"

    fx_base_url: str = "https://api.frankfurter.app"
    fx_cache_ttl_seconds: int = 60 * 60 * 6

    admin_username: str = "admin"
    admin_email: str = "admin@example.com"
    admin_password: str = "123qaz"

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def tzinfo(self) -> ZoneInfo:
        return ZoneInfo(self.timezone)


@lru_cache
def get_settings() -> Settings:
    return Settings()
