const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { DB_PATH } = require('./config');

let db;

async function initDatabase() {
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  await db.exec('PRAGMA journal_mode = WAL');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      storage_name TEXT NOT NULL,
      hash TEXT NOT NULL,
      size INTEGER NOT NULL,
      mime_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(user_id, hash),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      url TEXT,
      status TEXT,
      category TEXT,
      tags TEXT,
      description TEXT,
      attachment_id INTEGER,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(attachment_id) REFERENCES files(id)
    );

    CREATE TABLE IF NOT EXISTS article_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER NOT NULL,
      file_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(article_id, file_id),
      FOREIGN KEY(article_id) REFERENCES articles(id),
      FOREIGN KEY(file_id) REFERENCES files(id)
    );

    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY,
      kategori TEXT,
      judul TEXT,
      tautan TEXT,
      kata_kunci TEXT,
      published_date TEXT,
      scraped_at_wib TEXT
    );
  `);

  const articleColumns = await db.all('PRAGMA table_info(articles)');
  const hasPinned = articleColumns.some(column => column.name === 'pinned');
  if (!hasPinned) {
    await db.exec('ALTER TABLE articles ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0');
  }

  const newsColumns = await db.all('PRAGMA table_info(news)');
  const newsFields = new Set(newsColumns.map(column => column.name));
  if (!newsFields.has('kategori')) {
    await db.exec('ALTER TABLE news ADD COLUMN kategori TEXT');
  }
  if (!newsFields.has('judul')) {
    await db.exec('ALTER TABLE news ADD COLUMN judul TEXT');
  }
  if (!newsFields.has('tautan')) {
    await db.exec('ALTER TABLE news ADD COLUMN tautan TEXT');
  }
  if (!newsFields.has('kata_kunci')) {
    await db.exec('ALTER TABLE news ADD COLUMN kata_kunci TEXT');
  }
  if (!newsFields.has('published_date')) {
    await db.exec('ALTER TABLE news ADD COLUMN published_date TEXT');
  }
  if (!newsFields.has('scraped_at_wib')) {
    await db.exec('ALTER TABLE news ADD COLUMN scraped_at_wib TEXT');
  }
}

function getDb() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

module.exports = {
  initDatabase,
  getDb
};
