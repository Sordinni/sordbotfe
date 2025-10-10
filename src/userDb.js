const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '../db/usuarios.json');

/* Garante que a pasta db existe */
function ensureDbFolder() {
  const dir = path.dirname(DB_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/* Carrega o JSON (se não existir retorna objeto vazio) */
function loadUsers() {
  ensureDbFolder();
  if (!fs.existsSync(DB_FILE)) return {};
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

/* Salva o JSON */
function saveUsers(data) {
  ensureDbFolder();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

/* Alterna o flag useStretch de um usuário */
function toggleStretch(userId) {
  const users = loadUsers();
  if (!users[userId]) users[userId] = { useStretch: true };
  users[userId].useStretch = !users[userId].useStretch;
  saveUsers(users);
  return users[userId].useStretch;
}

/* Consulta o flag atual (default false) */
function getUseStretch(userId) {
  const users = loadUsers();
  return users[userId]?.useStretch ?? true;
}

module.exports = { toggleStretch, getUseStretch };