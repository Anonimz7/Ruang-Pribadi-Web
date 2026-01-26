const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const readline = require('readline');
const os = require('os');
const { exec } = require('child_process');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const {
  UPLOAD_DIR,
  TEMP_UPLOAD_DIR,
  PORT,
  HOST
} = require('./lib/config');
const { initDatabase, getDb } = require('./lib/db');
const asyncHandler = require('./lib/async-handler');
const { nowISO } = require('./lib/time');
const { logActivity } = require('./lib/logging');
const { getSessionUser, requireAuth } = require('./lib/auth');
const { cleanupUnusedFiles } = require('./lib/files');
const { loadSupabaseConfig, fetchSupabaseNews } = require('./lib/supabase');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/read.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'read.html'));
});

const upload = multer({
  dest: TEMP_UPLOAD_DIR,
  limits: { fileSize: 25 * 1024 * 1024 }
});

let db;

function openBrowser(url) {
  const command =
    process.platform === 'win32' ? `start "" "${url}"` :
    process.platform === 'darwin' ? `open "${url}"` :
    `xdg-open "${url}"`;

  exec(command, err => {
    if (err) {
      console.warn('⚠️ Unable to open browser automatically.');
    }
  });
}

function getLanAddresses() {
  const nets = os.networkInterfaces();
  const addresses = [];
  Object.values(nets).forEach(netInfo => {
    if (!netInfo) return;
    netInfo.forEach(details => {
      if (details.family === 'IPv4' && !details.internal) {
        addresses.push(details.address);
      }
    });
  });
  return addresses;
}

app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    if (!req.path.startsWith('/api')) {
      return;
    }
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    getSessionUser(token)
      .then(user => {
        const userLabel = user ? `${user.username}#${user.id}` : 'guest';
        const duration = Date.now() - start;
        logActivity(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms user=${userLabel}`);
      })
      .catch(err => {
        console.error('Failed to load session user for logging:', err);
      });
  });
  next();
});

app.post('/api/login', asyncHandler(async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ message: 'Username and password are required.' });
    return;
  }

  const user = await db.get('SELECT * FROM users WHERE username = ?', username);
  if (!user) {
    res.status(401).json({ message: 'Invalid credentials.' });
    return;
  }

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) {
    res.status(401).json({ message: 'Invalid credentials.' });
    return;
  }

  const token = crypto.randomUUID();
  await db.run('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)', token, user.id, nowISO());

  res.json({
    token,
    user: { id: user.id, username: user.username }
  });
}));

app.post('/api/logout', requireAuth, asyncHandler(async (req, res) => {
  await db.run('DELETE FROM sessions WHERE token = ?', req.token);
  res.json({ success: true });
}));

app.get('/api/session', requireAuth, (req, res) => {
  res.json({ user: { id: req.user.id, username: req.user.username } });
});

app.get('/api/articles', requireAuth, asyncHandler(async (req, res) => {
  const type = req.query.type || 'observation';
  const searchTitle = req.query.searchTitle || '';
  const searchTag = req.query.searchTag || '';
  const category = req.query.category || 'Semua';
  const status = req.query.status || 'Semua';
  const start = req.query.start || '';
  const end = req.query.end || '';

  const clauses = ['articles.user_id = ?', 'articles.type = ?'];
  const params = [req.user.id, type];

  if (category && category !== 'Semua') {
    clauses.push('articles.category = ?');
    params.push(category);
  }

  if (status && status !== 'Semua') {
    clauses.push('articles.status = ?');
    params.push(status);
  }

  if (start) {
    clauses.push('articles.date >= ?');
    params.push(start);
  }

  if (end) {
    clauses.push('articles.date <= ?');
    params.push(end);
  }

  if (searchTitle) {
    clauses.push('(articles.title LIKE ? OR articles.url LIKE ? OR articles.description LIKE ?)');
    const like = `%${searchTitle}%`;
    params.push(like, like, like);
  }

  if (searchTag) {
    const tags = searchTag
      .split(',')
      .map(tag => tag.trim().replace(/^#/, '').toLowerCase())
      .filter(Boolean);
    tags.forEach(tag => {
      clauses.push(`(',' || lower(replace(ifnull(articles.tags, ''), ' ', '')) || ',') LIKE ?`);
      params.push(`%,${tag.replace(/\s+/g, '')},%`);
    });
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const rows = await db.all(`
    SELECT articles.*
    FROM articles
    ${where}
    ORDER BY articles.pinned DESC, articles.updated_at DESC, articles.date DESC, articles.id DESC
  `, params);

  const articleIds = rows.map(row => row.id);
  const attachmentMap = new Map();

  if (articleIds.length) {
    const placeholders = articleIds.map(() => '?').join(',');
    const attachmentRows = await db.all(`
      SELECT article_files.article_id,
             files.id AS file_id,
             files.original_name,
             files.storage_name
      FROM article_files
      JOIN files ON files.id = article_files.file_id
      WHERE article_files.article_id IN (${placeholders})
      ORDER BY article_files.id ASC
    `, articleIds);

    attachmentRows.forEach(row => {
      if (!attachmentMap.has(row.article_id)) {
        attachmentMap.set(row.article_id, []);
      }
      attachmentMap.get(row.article_id).push({
        id: row.file_id,
        original_name: row.original_name,
        url: `/uploads/${row.storage_name}`
      });
    });
  }

  const items = [];
  for (const row of rows) {
    const attachments = attachmentMap.get(row.id) || [];
    if (attachments.length === 0 && row.attachment_id) {
      const legacyFile = await db.get(
        'SELECT id, original_name, storage_name FROM files WHERE id = ?',
        row.attachment_id
      );
      if (legacyFile) {
        attachments.push({
          id: legacyFile.id,
          original_name: legacyFile.original_name,
          url: `/uploads/${legacyFile.storage_name}`
        });
      }
    }

    items.push({
      id: row.id,
      user_id: row.user_id,
      type: row.type,
      title: row.title,
      date: row.date,
      url: row.url,
      status: row.status,
      category: row.category,
      tags: row.tags,
      description: row.description,
      pinned: Boolean(row.pinned),
      attachments,
      attachment: attachments[0] || null
    });
  }

  res.json({ items });
}));

app.get('/api/tags', requireAuth, asyncHandler(async (req, res) => {
  const rows = await db.all(`
    SELECT tags
    FROM articles
    WHERE user_id = ?
      AND tags IS NOT NULL
      AND trim(tags) != ''
  `, req.user.id);

  const tagMap = new Map();

  rows.forEach(row => {
    const tags = String(row.tags || '')
      .split(',')
      .map(tag => tag.trim().replace(/^#/, ''))
      .filter(Boolean);

    tags.forEach(tag => {
      const key = tag.toLowerCase();
      const entry = tagMap.get(key) || { label: tag, count: 0 };
      entry.count += 1;
      tagMap.set(key, entry);
    });
  });

  const tags = Array.from(tagMap.values()).sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.label.localeCompare(b.label);
  });

  res.json({ tags });
}));

app.get('/api/news', asyncHandler(async (req, res) => {
  const search = req.query.search || '';
  const category = req.query.category || 'Semua';
  const start = req.query.start || '';
  const end = req.query.end || '';
  const order = req.query.order || 'latest';

  const clauses = [];
  const params = [];

  if (category && category !== 'Semua') {
    clauses.push('news.kategori = ?');
    params.push(category);
  }

  if (start) {
    clauses.push('news.published_date >= ?');
    params.push(start);
  }

  if (end) {
    clauses.push('news.published_date <= ?');
    params.push(end);
  }

  if (search) {
    clauses.push('(news.judul LIKE ? OR news.tautan LIKE ? OR news.kata_kunci LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const orderBy = order === 'oldest'
    ? 'news.published_date ASC, news.id ASC'
    : 'news.published_date DESC, news.id DESC';

  const rows = await db.all(`
    SELECT news.*
    FROM news
    ${where}
    ORDER BY ${orderBy}
  `, params);

  res.json({ items: rows });
}));

app.get('/api/news/meta', asyncHandler(async (req, res) => {
  const rows = await db.all(`
    SELECT DISTINCT kategori
    FROM news
    WHERE kategori IS NOT NULL AND trim(kategori) != ''
    ORDER BY kategori ASC
  `);

  const categories = rows.map(row => row.kategori);
  res.json({ categories });
}));

app.post('/api/news/sync', asyncHandler(async (req, res) => {
  const config = loadSupabaseConfig();
  const existing = await db.get('SELECT COUNT(*) AS count, MAX(id) AS maxId FROM news');
  const sinceId = existing?.count ? existing.maxId : null;
  const supabaseItems = await fetchSupabaseNews(config, { sinceId });

  let inserted = 0;

  await db.run('BEGIN');
  try {
    for (const item of supabaseItems) {
      const result = await db.run(
        `INSERT OR IGNORE INTO news
          (id, kategori, judul, tautan, kata_kunci, published_date, scraped_at_wib)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        item.id,
        item.kategori || null,
        item.judul || null,
        item.tautan || null,
        item.kata_kunci || null,
        item.published_date || null,
        item.scraped_at_wib || null
      );
      if (result?.changes) {
        inserted += result.changes;
      }
    }
    await db.run('COMMIT');
  } catch (err) {
    await db.run('ROLLBACK');
    throw err;
  }

  res.json({
    inserted,
    fetched: supabaseItems.length,
    sinceId
  });
}));

app.get('/api/articles/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ message: 'Invalid article id.' });
    return;
  }

  const row = await db.get(`
    SELECT articles.*
    FROM articles
    WHERE articles.id = ? AND articles.user_id = ?
  `, id, req.user.id);

  if (!row) {
    res.status(404).json({ message: 'Article not found.' });
    return;
  }

  const attachments = (await db.all(`
    SELECT files.id, files.original_name, files.storage_name
    FROM article_files
    JOIN files ON files.id = article_files.file_id
    WHERE article_files.article_id = ?
    ORDER BY article_files.id ASC
  `, row.id)).map(file => ({
    id: file.id,
    original_name: file.original_name,
    url: `/uploads/${file.storage_name}`
  }));

  if (attachments.length === 0 && row.attachment_id) {
    const legacyFile = await db.get(
      'SELECT id, original_name, storage_name FROM files WHERE id = ?',
      row.attachment_id
    );
    if (legacyFile) {
      attachments.push({
        id: legacyFile.id,
        original_name: legacyFile.original_name,
        url: `/uploads/${legacyFile.storage_name}`
      });
    }
  }

  res.json({
    item: {
      id: row.id,
      user_id: row.user_id,
      type: row.type,
      title: row.title,
      date: row.date,
      url: row.url,
      status: row.status,
      category: row.category,
      tags: row.tags,
      description: row.description,
      pinned: Boolean(row.pinned),
      attachments,
      attachment: attachments[0] || null
    }
  });
}));

app.post('/api/articles', requireAuth, asyncHandler(async (req, res) => {
  const {
    type,
    title,
    date,
    url,
    status,
    category,
    tags,
    description,
    attachment_id,
    attachment_ids,
    pinned
  } = req.body || {};

  if (!title || !date) {
    res.status(400).json({ message: 'Title and date are required.' });
    return;
  }

  const now = nowISO();
  const pinnedValue = pinned ? 1 : 0;
  const attachmentIds = Array.isArray(attachment_ids)
    ? attachment_ids.map(Number).filter(Boolean)
    : (attachment_id ? [Number(attachment_id)] : []);

  const result = await db.run(`
    INSERT INTO articles (
      user_id, type, title, date, url, status, category, tags, description, attachment_id, pinned, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `,
  req.user.id,
  type || 'observation',
  title,
  date,
  url || null,
  status || null,
  category || null,
  tags || null,
  description || '',
  attachmentIds[0] || null,
  pinnedValue,
  now,
  now);

  const articleId = result.lastID;
  if (attachmentIds.length) {
    const timestamp = nowISO();
    for (const fileId of attachmentIds) {
      await db.run(
        `INSERT OR IGNORE INTO article_files (article_id, file_id, created_at)
         VALUES (?, ?, ?)`
      , articleId, fileId, timestamp);
    }
  }

  res.json({ id: articleId });
}));

app.put('/api/articles/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ message: 'Invalid article id.' });
    return;
  }

  const {
    type,
    title,
    date,
    url,
    status,
    category,
    tags,
    description,
    attachment_id,
    attachment_ids,
    pinned
  } = req.body || {};

  if (!title || !date) {
    res.status(400).json({ message: 'Title and date are required.' });
    return;
  }

  const existing = await db.get(
    'SELECT id, attachment_id, pinned FROM articles WHERE id = ? AND user_id = ?',
    id,
    req.user.id
  );
  if (!existing) {
    res.status(404).json({ message: 'Article not found.' });
    return;
  }

  const currentAttachmentRows = await db.all(
    'SELECT file_id FROM article_files WHERE article_id = ?',
    id
  );
  const currentAttachmentIds = currentAttachmentRows.map(row => row.file_id);
  if (existing.attachment_id) {
    currentAttachmentIds.push(existing.attachment_id);
  }

  const attachmentIds = Array.isArray(attachment_ids)
    ? attachment_ids.map(Number).filter(Boolean)
    : (attachment_id ? [Number(attachment_id)] : []);
  const pinnedValue = typeof pinned === 'undefined' ? existing.pinned : (pinned ? 1 : 0);

  await db.run(`
    UPDATE articles
    SET type = ?,
        title = ?,
        date = ?,
        url = ?,
        status = ?,
        category = ?,
        tags = ?,
        description = ?,
        attachment_id = ?,
        pinned = ?,
        updated_at = ?
    WHERE id = ? AND user_id = ?
  `,
  type || 'observation',
  title,
  date,
  url || null,
  status || null,
  category || null,
  tags || null,
  description || '',
  attachmentIds[0] || null,
  pinnedValue,
  nowISO(),
  id,
  req.user.id);

  await db.run('DELETE FROM article_files WHERE article_id = ?', id);
  if (attachmentIds.length) {
    const timestamp = nowISO();
    for (const fileId of attachmentIds) {
      await db.run(
        `INSERT OR IGNORE INTO article_files (article_id, file_id, created_at)
         VALUES (?, ?, ?)`
      , id, fileId, timestamp);
    }
  }

  const removedIds = currentAttachmentIds.filter(fileId => !attachmentIds.includes(fileId));
  if (removedIds.length) {
    await cleanupUnusedFiles(removedIds, req.user.id);
  }

  res.json({ success: true });
}));

app.delete('/api/articles/:id', requireAuth, asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  if (!id) {
    res.status(400).json({ message: 'Invalid article id.' });
    return;
  }

  await db.run('DELETE FROM articles WHERE id = ? AND user_id = ?', id, req.user.id);
  await db.run('DELETE FROM article_files WHERE article_id = ?', id);
  res.json({ success: true });
}));

app.post('/api/uploads', requireAuth, upload.fields([
  { name: 'files', maxCount: 10 },
  { name: 'file', maxCount: 1 }
]), asyncHandler(async (req, res) => {
  const files = [
    ...(req.files?.files || []),
    ...(req.files?.file || [])
  ];

  if (!files.length) {
    res.status(400).json({ message: 'No file uploaded.' });
    return;
  }

  const results = [];

  for (const file of files) {
    const fileBuffer = fs.readFileSync(file.path);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const existing = await db.get(
      'SELECT * FROM files WHERE user_id = ? AND hash = ?',
      req.user.id,
      hash
    );

    if (existing) {
      fs.unlinkSync(file.path);
      results.push({
        id: existing.id,
        original_name: existing.original_name,
        url: `/uploads/${existing.storage_name}`,
        duplicated: true
      });
      continue;
    }

    const ext = path.extname(file.originalname).toLowerCase();
    const storageName = `${hash}${ext}`;
    const finalPath = path.join(UPLOAD_DIR, storageName);

    fs.renameSync(file.path, finalPath);

    const result = await db.run(`
      INSERT INTO files (user_id, original_name, storage_name, hash, size, mime_type, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    req.user.id,
    file.originalname,
    storageName,
    hash,
    file.size,
    file.mimetype,
    nowISO());

    results.push({
      id: result.lastID,
      original_name: file.originalname,
      url: `/uploads/${storageName}`,
      duplicated: false
    });
  }

  res.json({ files: results });
}));

app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) {
    next(err);
    return;
  }
  res.status(500).json({ message: 'Internal server error.' });
});

function startServer() {
  app.listen(PORT, HOST, () => {
    logActivity(`✅ Server running at http://localhost:${PORT}`);
    const lanAddresses = getLanAddresses();
    if (lanAddresses.length) {
      logActivity('🌐 LAN access:');
      lanAddresses.forEach(address => {
        logActivity(`   http://${address}:${PORT}`);
      });
    }
    openBrowser(`http://localhost:${PORT}`);
  });
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function manageUsers() {
  let keepGoing = true;

  while (keepGoing) {
    console.log('\n=== User Management ===');
    console.log('1) Create user');
    console.log('2) Reset password');
    console.log('3) List users');
    console.log('4) Delete user');
    console.log('5) Back');

    const choice = await prompt('Choose an option: ');

    if (choice === '1') {
      const username = await prompt('New username: ');
      const password = await prompt('New password: ');
      if (!username || !password) {
        console.log('Username dan password wajib diisi.');
        continue;
      }

      const existing = await db.get('SELECT id FROM users WHERE username = ?', username);
      if (existing) {
        console.log('User sudah ada.');
        continue;
      }

      const hash = bcrypt.hashSync(password, 10);
      await db.run(
        'INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)',
        username,
        hash,
        nowISO()
      );
      console.log('✅ User created.');
    } else if (choice === '2') {
      const username = await prompt('Username to reset: ');
      const password = await prompt('New password: ');
      const user = await db.get('SELECT id FROM users WHERE username = ?', username);
      if (!user) {
        console.log('User tidak ditemukan.');
        continue;
      }
      const hash = bcrypt.hashSync(password, 10);
      await db.run('UPDATE users SET password_hash = ? WHERE id = ?', hash, user.id);
      console.log('✅ Password updated.');
    } else if (choice === '3') {
      const rows = await db.all('SELECT id, username, created_at FROM users ORDER BY username');
      if (rows.length === 0) {
        console.log('Belum ada user.');
      } else {
        console.table(rows);
      }
    } else if (choice === '4') {
      const username = await prompt('Username to delete: ');
      const user = await db.get('SELECT id FROM users WHERE username = ?', username);
      if (!user) {
        console.log('User tidak ditemukan.');
        continue;
      }
      await db.run('DELETE FROM users WHERE id = ?', user.id);
      await db.run('DELETE FROM sessions WHERE user_id = ?', user.id);
      console.log('✅ User deleted.');
    } else if (choice === '5') {
      keepGoing = false;
    } else {
      console.log('Pilihan tidak valid.');
    }
  }
}

async function mainMenu() {
  console.log('=== Analyst Hub Pro ===');
  console.log('1) Start server');
  console.log('2) User management');
  console.log('3) Exit');

  const choice = await prompt('Choose an option: ');

  if (choice === '1') {
    startServer();
  } else if (choice === '2') {
    await manageUsers();
    return mainMenu();
  } else {
    process.exit(0);
  }
}

async function bootstrap() {
  await initDatabase();
  db = getDb();
  if (!process.stdin.isTTY) {
    startServer();
  } else {
    await mainMenu();
  }
}

bootstrap();
