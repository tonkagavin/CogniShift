from __future__ import annotations

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class SupabaseConfig:
    url: str
    service_role_key: str


def get_supabase_config() -> SupabaseConfig:
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url or not key:
        raise RuntimeError("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    return SupabaseConfig(url=url, service_role_key=key)


"""
We intentionally keep a lightweight boundary here.

In v1 we define HTTP endpoints + schema, and add Supabase persistence using the
official Python client once environment + dependency install is in place.
"""

