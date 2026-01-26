const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'api.ini');

function parseIni(content) {
  const result = {};
  let section = result;

  content.split(/\r?\n/).forEach(line => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) {
      return;
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const name = trimmed.slice(1, -1).trim();
      if (!result[name]) {
        result[name] = {};
      }
      section = result[name];
      return;
    }
    const [rawKey, ...rest] = trimmed.split('=');
    if (!rawKey || rest.length === 0) {
      return;
    }
    const key = rawKey.trim();
    const value = rest.join('=').trim();
    section[key] = value;
  });

  return result;
}

function loadSupabaseConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error('Supabase config not found. Create api.ini first.');
  }

  const raw = fs.readFileSync(CONFIG_PATH, 'utf8');
  const parsed = parseIni(raw);
  const section = parsed.supabase || parsed.SUPABASE || parsed;
  const normalized = {};

  Object.entries(section || {}).forEach(([key, value]) => {
    normalized[key.toLowerCase()] = value;
  });

  const url = normalized.url || normalized.supabase_url;
  const anonKey = normalized.anon_key || normalized.supabase_anon_key || normalized.apikey;
  const table = normalized.table || 'Artikel';
  const schema = normalized.schema || 'public';
  const pageSize = Number(normalized.page_size || 500);

  if (!url || !anonKey) {
    throw new Error('Supabase url/anon_key belum diisi di api.ini.');
  }

  return {
    url,
    anonKey,
    table,
    schema,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? pageSize : 500
  };
}

async function fetchSupabaseNews(config, { sinceId } = {}) {
  const items = [];
  let offset = 0;
  const limit = config.pageSize;

  while (true) {
    const params = new URLSearchParams({
      select: '*',
      order: 'id.asc',
      limit: String(limit),
      offset: String(offset)
    });

    if (sinceId) {
      params.set('id', `gt.${sinceId}`);
    }

    const response = await fetch(`${config.url}/rest/v1/${config.table}?${params.toString()}`, {
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        'Accept-Profile': config.schema
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supabase request failed: ${response.status} ${errorText}`);
    }

    const batch = await response.json();
    const normalizedBatch = batch.map(row => normalizeSupabaseRow(row));
    items.push(...normalizedBatch);

    if (batch.length < limit) {
      break;
    }
    offset += limit;
  }

  return items;
}

function normalizeSupabaseRow(row) {
  const normalized = {};

  Object.entries(row || {}).forEach(([key, value]) => {
    const cleaned = key
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_');
    normalized[cleaned] = value;
  });

  return {
    id: normalized.id,
    kategori: normalized.kategori ?? normalized.category ?? null,
    judul: normalized.judul ?? normalized.title ?? null,
    tautan: normalized.tautan ?? normalized.link ?? null,
    kata_kunci: normalized.kata_kunci ?? normalized.keyword ?? normalized.keywords ?? null,
    published_date: normalized.published_date ?? normalized.published ?? null,
    scraped_at_wib: normalized.scraped_at_wib ?? normalized.scraped_at ?? null
  };
}

module.exports = {
  loadSupabaseConfig,
  fetchSupabaseNews
};
