// src/userMetaDb.js
const fs = require('fs');
const path = require('path');
const DB_FILE = path.join(__dirname, '../db/userMeta.json');

function ensureFolder() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function load() {
  ensureFolder();
  if (!fs.existsSync(DB_FILE)) return {};
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function save(data) {
  ensureFolder();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function getUserMeta(userId) {
  const db = load();
  return db[userId] || null;
}

function setUserMeta(userId, meta) {
  const db = load();
  db[userId] = meta;
  save(db);
}

function resetUserMeta(userId) {
  const db = load();
  delete db[userId];
  save(db);
}

module.exports = { getUserMeta, setUserMeta, resetUserMeta };