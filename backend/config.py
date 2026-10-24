"""Settings, .env loading and the shared model client.

The .env is read from the repo folder first, then the folder above it (that is
where the teaching staff keep theirs). Neither overrides a variable that is
already set, so the repo's own .env wins and real environment variables
(Render dashboard) win over both.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

os.environ.setdefault("PYDANTIC_AI_NO_BANNER", "1")

BACKEND_DIR = Path(__file__).resolve().parent
ROOT = BACKEND_DIR.parent
DATA_DIR = ROOT / "data"
PROMPTS_DIR = BACKEND_DIR / "prompts"

for env_file in (ROOT / ".env", ROOT.parent / ".env"):
    if env_file.exists():
        load_dotenv(env_file, override=False)

# The course key only allows gpt-6-luna.
MODEL_NAME = os.getenv("MODEL_NAME", "gpt-6-luna")
PORTKEY_BASE_URL = os.getenv("PORTKEY_BASE_URL", "https://api.portkey.ai/v1").rstrip("/")

DATABASE_URL = os.getenv("DATABASE_URL", "").strip() or f"sqlite:///{DATA_DIR / 'app.db'}"
# Render (and most free hosts) wipe the local disk on every deploy or restart, so a SQLite
# file there loses every account. Online, use a managed Postgres (e.g. Neon) via DATABASE_URL.
ON_HOSTED_PLATFORM = bool(os.getenv("RENDER") or os.getenv("FLY_APP_NAME") or os.getenv("RAILWAY_ENVIRONMENT"))
STORAGE_IS_EPHEMERAL = ON_HOSTED_PLATFORM and DATABASE_URL.startswith("sqlite")

# Spend guard rails (USD). Per chat turn, and per student per day.
RUN_BUDGET_USD = float(os.getenv("RUN_BUDGET_USD", "0.05"))
DAILY_BUDGET_USD = float(os.getenv("DAILY_BUDGET_USD", "0.50"))
MAX_MODEL_REQUESTS = int(os.getenv("MAX_MODEL_REQUESTS", "12"))
MAX_MESSAGE_CHARS = 2000

SESSION_DAYS = int(os.getenv("SESSION_DAYS", "30"))  # renewed while in use, so active students stay signed in
SECURE_COOKIES = os.getenv("SECURE_COOKIES", "auto")  # auto = Secure when served over https


def api_key() -> tuple[str, str]:
    """Return (key, kind). PORTKEY_API_KEY is preferred; OPENAI_API_KEY also works."""
    portkey = os.getenv("PORTKEY_API_KEY", "").strip()
    if portkey and not portkey.startswith("your-"):
        return portkey, "portkey"
    openai = os.getenv("OPENAI_API_KEY", "").strip()
    if openai and not openai.startswith("your-"):
        return openai, "openai"
    return "", ""


def ai_available() -> bool:
    return bool(api_key()[0])


@lru_cache(maxsize=4)
def build_model(model_name: str | None = None):
    """The PydanticAI model, routed through Portkey (or straight to OpenAI)."""
    from openai import AsyncOpenAI
    from pydantic_ai.models.openai import OpenAIResponsesModel
    from pydantic_ai.providers.openai import OpenAIProvider

    key, kind = api_key()
    if not key:
        raise RuntimeError(
            "No API key found. Put PORTKEY_API_KEY (or OPENAI_API_KEY) in a .env file "
            "in this folder or the folder above it."
        )
    if kind == "portkey":
        client = AsyncOpenAI(
            api_key=key,
            base_url=PORTKEY_BASE_URL,
            default_headers={"x-portkey-provider": "openai"},
            timeout=90.0,
            max_retries=1,
        )
    else:
        client = AsyncOpenAI(api_key=key, timeout=90.0, max_retries=1)
    return OpenAIResponsesModel(model_name or MODEL_NAME, provider=OpenAIProvider(openai_client=client))
