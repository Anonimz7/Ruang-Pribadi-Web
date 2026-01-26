import json
import os
import sqlite3
from typing import List, Dict

import requests


def load_articles(db_path: str, table_name: str) -> List[Dict[str, str]]:
    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """
            SELECT category,
                   title,
                   link,
                   keywords,
                   published_date,
                   scraped_at_wib
            FROM {table_name}
            """.format(
                table_name=table_name
            )
        ).fetchall()

    return [dict(row) for row in rows]


def chunk_items(items: List[Dict[str, str]], size: int) -> List[List[Dict[str, str]]]:
    return [items[i : i + size] for i in range(0, len(items), size)]


def upsert_to_supabase(
    articles: List[Dict[str, str]], base_url: str, api_key: str, table_name: str
) -> None:
    if not articles:
        print(f"No articles to sync for {table_name}.")
        return

    endpoint = f"{base_url.rstrip('/')}/rest/v1/{table_name}"
    headers = {
        "apikey": api_key,
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }

    for batch in chunk_items(articles, 500):
        response = requests.post(
            endpoint,
            headers=headers,
            params={"on_conflict": "link"},
            data=json.dumps(batch),
            timeout=30,
        )
        try:
            response.raise_for_status()
        except requests.HTTPError as exc:
            raise SystemExit(
                f"Failed to sync batch: {response.status_code} {response.text}"
            ) from exc

    print(f"Synced {len(articles)} articles to Supabase ({table_name}).")


def main() -> None:
    db_path = os.getenv("DATA_DB_PATH", "data/data.db")
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

    if not supabase_url or not supabase_key:
        raise SystemExit(
            "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables."
        )

    for table_name in ("kontan", "reuters", "blomberg"):
        articles = load_articles(db_path, table_name)
        upsert_to_supabase(articles, supabase_url, supabase_key, table_name)


if __name__ == "__main__":
    main()
