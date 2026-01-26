const fs = require('fs');
const path = require('path');
const { UPLOAD_DIR } = require('./config');
const { getDb } = require('./db');

async function cleanupUnusedFiles(fileIds, userId) {
  const db = getDb();
  const uniqueIds = Array.from(new Set(fileIds)).filter(Boolean);

  for (const fileId of uniqueIds) {
    const hasUsage = await db.get('SELECT 1 FROM article_files WHERE file_id = ? LIMIT 1', fileId);
    if (hasUsage) {
      continue;
    }

    const hasLegacyUsage = await db.get('SELECT 1 FROM articles WHERE attachment_id = ? LIMIT 1', fileId);
    if (hasLegacyUsage) {
      continue;
    }

    const fileRow = await db.get(
      'SELECT id, storage_name FROM files WHERE id = ? AND user_id = ?',
      fileId,
      userId
    );
    if (!fileRow) {
      continue;
    }

    await db.run('DELETE FROM files WHERE id = ? AND user_id = ?', fileId, userId);
    const filePath = path.join(UPLOAD_DIR, fileRow.storage_name);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

module.exports = {
  cleanupUnusedFiles
};
