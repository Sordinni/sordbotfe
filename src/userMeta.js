const fs   = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', 'db', 'users.json');

function ensureFolder() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  ensureFolder();
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, '{}');   // inicia vazio
    return {};
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
  } catch {
    fs.writeFileSync(DB_FILE, '{}');
    return {};
  }
}

function save(data) {
  ensureFolder();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function toggleStretch(userId) {
  const db = load();
  if (!db[userId]) db[userId] = {};
  db[userId].useStretch = !db[userId].useStretch ?? true;
  save(db);
  return db[userId].useStretch;
}

function getUseStretch(userId) {
  const db = load();
  return db[userId]?.useStretch ?? true;   // padrão: true
}

function getUserMeta(userId) {
  const db = load();
  if (!db[userId] || (!db[userId].pack && !db[userId].author)) return null;
  return { pack: db[userId].pack, author: db[userId].author };
}

function setUserMeta(userId, { pack, author }) {
  const db = load();
  if (!db[userId]) db[userId] = {};
  db[userId].pack   = pack;
  db[userId].author = author;
  save(db);
}

function resetUserMeta(userId) {
  const db = load();
  if (db[userId]) {
    delete db[userId].pack;
    delete db[userId].author;
    if (Object.keys(db[userId]).length === 0) delete db[userId];
    save(db);
  }
}

module.exports = {
  toggleStretch,
  getUseStretch,
  getUserMeta,
  setUserMeta,
  resetUserMeta,
};