import os
import sqlite3
from datetime import datetime
from urllib.parse import urlparse

import pytz
import requests
from bs4 import BeautifulSoup

KONTAN_SITEMAPS = {
    "Nasional": "https://nasional.kontan.co.id/news/sitemap.xml",
    "Keuangan": "https://keuangan.kontan.co.id/news/sitemap.xml",
    "Industri": "https://industri.kontan.co.id/news/sitemap.xml",
    "Insight": "https://insight.kontan.co.id/news/sitemap.xml",
    "Investasi": "https://investasi.kontan.co.id/news/sitemap.xml",
}

REUTERS_SITEMAP = "https://www.reuters.com/arc/outboundfeeds/news-sitemap/?outputType=xml"
BLOMBERG_SITEMAP = "https://www.bloomberg.com/sitemaps/news/latest.xml"

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
DB_PATH = os.path.join(DATA_DIR, "data.db")
SOURCE_TABLES = ("kontan", "reuters", "blomberg")
IGNORED_SUBDIRECTORIES = {"es", "pt", "de", "it", "fr", "sports", "lifestyle"}
IGNORE_FIRST_SUBDIRECTORY_ONLY = True


def init_db(connection):
    for table_name in SOURCE_TABLES:
        connection.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {table_name} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category TEXT NOT NULL,
                title TEXT NOT NULL,
                link TEXT NOT NULL UNIQUE,
                keywords TEXT,
                published_date TEXT NOT NULL,
                scraped_at_wib TEXT NOT NULL
            )
            """
        )
    connection.commit()


def normalize_category(category):
    if not category:
        return None
    return category.lower()


def map_world_category(source_name, link):
    parsed_url = urlparse(link)
    path_parts = [part for part in parsed_url.path.split("/") if part]
    if not path_parts:
        return None

    if source_name.lower() in {"bloomberg", "blomberg"}:
        category = path_parts[0]
        if category == "opinion":
            return "opini"
        return normalize_category(category)

    if source_name.lower() == "reuters":
        return normalize_category(path_parts[0])

    return None


def should_skip_link(link):
    if not IGNORED_SUBDIRECTORIES:
        return False
    parsed_url = urlparse(link)
    path_parts = [part for part in parsed_url.path.split("/") if part]
    if not path_parts:
        return False
    if IGNORE_FIRST_SUBDIRECTORY_ONLY:
        return path_parts[0] in IGNORED_SUBDIRECTORIES
    return bool(set(path_parts).intersection(IGNORED_SUBDIRECTORIES))


def upsert_articles(connection, table_name, category, articles):
    if table_name not in SOURCE_TABLES:
        raise ValueError(f"Unknown table name: {table_name}")
    for article in articles:
        connection.execute(
            f"""
            INSERT INTO {table_name} (
                category,
                title,
                link,
                keywords,
                published_date,
                scraped_at_wib
            )
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(link) DO UPDATE SET
                category = excluded.category,
                title = excluded.title,
                keywords = excluded.keywords,
                published_date = excluded.published_date,
                scraped_at_wib = excluded.scraped_at_wib
            """,
            (
                category,
                article["title"],
                article["link"],
                article.get("keywords", ""),
                article["published_date"],
                article["scraped_at_wib"],
            ),
        )
    connection.commit()


def fetch_existing_links(connection, table_name, links):
    if not links:
        return set()
    existing_links = set()
    chunk_size = 900
    for start_index in range(0, len(links), chunk_size):
        chunk = links[start_index : start_index + chunk_size]
        placeholders = ",".join("?" for _ in chunk)
        query = f"SELECT link FROM {table_name} WHERE link IN ({placeholders})"
        rows = connection.execute(query, chunk).fetchall()
        existing_links.update(row[0] for row in rows)
    return existing_links


def filter_new_articles(connection, table_name, articles):
    links = [article["link"] for article in articles]
    existing_links = fetch_existing_links(connection, table_name, links)
    if not existing_links:
        return articles, 0
    new_articles = [
        article for article in articles if article["link"] not in existing_links
    ]
    skipped = len(articles) - len(new_articles)
    return new_articles, skipped

def scrape_kontan_source():
    tz_jakarta = pytz.timezone("Asia/Jakarta")
    now_jakarta = datetime.now(tz_jakarta)

    pending_updates = {}

    print(f"[{now_jakarta.strftime('%H:%M:%S')}] Memulai scraping Kontan per kategori...")

    for category, url in KONTAN_SITEMAPS.items():
        try:
            response = requests.get(url, headers=HEADERS, timeout=20)
            soup = BeautifulSoup(response.content, "xml")
            items = soup.find_all("url")

            if category not in pending_updates:
                pending_updates[category] = {}

            for item in items:
                link = item.find("loc").text.strip()
                if should_skip_link(link):
                    continue
                pub_date_raw = item.find("news:publication_date").text.strip()
                actual_date = pub_date_raw.split("T")[0]

                if actual_date not in pending_updates[category]:
                    pending_updates[category][actual_date] = []

                title = item.find("news:title").text.strip()
                keywords_tag = item.find("news:keywords")
                keywords = " ".join(keywords_tag.text.strip().split()) if keywords_tag else ""

                pending_updates[category][actual_date].append(
                    {
                        "title": title,
                        "link": link,
                        "keywords": keywords,
                        "published_date": pub_date_raw,
                        "scraped_at_wib": now_jakarta.strftime("%Y-%m-%d %H:%M:%S"),
                    }
                )

        except Exception as e:
            print(f"Error pada Kontan {category}: {e}")

    return pending_updates


def scrape_world_source(source_name, sitemap_url):
    tz_jakarta = pytz.timezone("Asia/Jakarta")
    now_jakarta = datetime.now(tz_jakarta)

    pending_updates = {}

    try:
        response = requests.get(sitemap_url, headers=HEADERS, timeout=20)
        soup = BeautifulSoup(response.content, "xml")
        items = soup.find_all("url")

        for item in items:
            link_tag = item.find("loc")
            if not link_tag:
                continue
            link = link_tag.text.strip()
            if should_skip_link(link):
                continue
            category = map_world_category(source_name, link)
            if not category:
                continue
            pub_date_tag = item.find("news:publication_date") or item.find("lastmod")
            if not pub_date_tag:
                continue
            pub_date_raw = pub_date_tag.text.strip()
            actual_date = pub_date_raw.split("T")[0]

            if category not in pending_updates:
                pending_updates[category] = {}

            if actual_date not in pending_updates[category]:
                pending_updates[category][actual_date] = []

            title_tag = item.find("news:title")
            title = title_tag.text.strip() if title_tag else ""
            if source_name.lower() == "reuters":
                keywords = ""
            else:
                keywords_tag = item.find("news:keywords")
                keywords = (
                    " ".join(keywords_tag.text.strip().split())
                    if keywords_tag
                    else ""
                )

            pending_updates[category][actual_date].append(
                {
                    "title": title,
                    "link": link,
                    "keywords": keywords,
                    "published_date": pub_date_raw,
                    "scraped_at_wib": now_jakarta.strftime("%Y-%m-%d %H:%M:%S"),
                }
            )
    except Exception as e:
        print(f"Error pada {source_name}: {e}")

    return pending_updates


def write_source_data(connection, source, pending_updates):
    for category, dates in pending_updates.items():
        for target_date, articles in dates.items():
            if not articles:
                continue
            new_articles, skipped = filter_new_articles(
                connection, source, articles
            )
            if new_articles:
                upsert_articles(connection, source, category, new_articles)
            print(
                f"  -> [{source}] {category} {target_date}: +{len(new_articles)} berita"
                f" (skip {skipped} duplikat)."
            )


def scrape_all_sources():
    tz_jakarta = pytz.timezone("Asia/Jakarta")
    now_jakarta = datetime.now(tz_jakarta)

    print(f"[{now_jakarta.strftime('%H:%M:%S')}] Memulai scraping multi-sumber...")

    kontan_updates = scrape_kontan_source()
    reuters_updates = scrape_world_source("Reuters", REUTERS_SITEMAP)
    blomberg_updates = scrape_world_source("Blomberg", BLOMBERG_SITEMAP)

    os.makedirs(DATA_DIR, exist_ok=True)

    with sqlite3.connect(DB_PATH) as connection:
        init_db(connection)

        write_source_data(connection, "kontan", kontan_updates)
        write_source_data(connection, "reuters", reuters_updates)
        write_source_data(connection, "blomberg", blomberg_updates)


if __name__ == "__main__":
    scrape_all_sources()
