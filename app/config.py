from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Dict

import yaml
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_CONFIG_PATH = BASE_DIR / "config" / "settings.yaml"


def _load_env_file() -> None:
    env_file = os.getenv("APP_ENV_FILE", ".env")
    env_path = Path(env_file)
    if not env_path.is_absolute():
        env_path = BASE_DIR / env_file
    if env_path.exists():
        load_dotenv(env_path, override=True)


def _load_yaml_config(path: Path) -> Dict[str, Any]:
    if not path.exists():
        return {}
    with path.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh) or {}


def load_app_config(config_path: Path | None = None) -> Dict[str, Any]:
    _load_env_file()
    cfg_path = config_path or DEFAULT_CONFIG_PATH
    file_cfg = _load_yaml_config(cfg_path)

    youtube_cfg = file_cfg.get("youtube", {})
    search_cfg = file_cfg.get("search", {})

    return {
        "YOUTUBE": {
            "api_key": os.getenv("YOUTUBE_API_KEY", youtube_cfg.get("api_key")),
        },
        "SEARCH": {
            "max_results": int(
                os.getenv(
                    "SEARCH_MAX_RESULTS",
                    search_cfg.get("max_results", 50),
                )
            ),
        },
    }
