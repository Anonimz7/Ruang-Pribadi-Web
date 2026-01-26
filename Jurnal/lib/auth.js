const asyncHandler = require('./async-handler');
const { getDb } = require('./db');

async function getSessionUser(token) {
  if (!token) return null;
  const db = getDb();
  return db.get(`
    SELECT sessions.token, users.id, users.username
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `, token);
}

const requireAuth = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const user = await getSessionUser(token);
  if (!user) {
    res.status(401).json({ message: 'Unauthorized' });
    return;
  }
  req.user = user;
  req.token = token;
  next();
});

module.exports = {
  getSessionUser,
  requireAuth
};
