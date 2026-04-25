from __future__ import annotations

from functools import lru_cache
from supabase import Client, create_client

from app.supabase import get_supabase_config


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    cfg = get_supabase_config()
    return create_client(cfg.url, cfg.service_role_key)

