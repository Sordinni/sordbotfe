const fs   = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const r     = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const ADMIN_GROUP_ID  = '120363287595102262@g.us';
const AVISOS_GROUP_ID = '120363046428170312@g.us';
const DB_FILE         = path.join(__dirname, '..', 'db', 'users.json');
fs.ensureFileSync(DB_FILE);

const normalizeJid = (jid) => jid?.replace(/@.+/, '') + '@s.whatsapp.net';

function loadAll() {
  try { return fs.readJsonSync(DB_FILE) || {}; }
  catch { return {}; }
}
function saveAll(data) { fs.writeJsonSync(DB_FILE, data, { spaces: 2 }); }

function ensureUser(db, userId) {
  if (!userId) return;
  const njid = normalizeJid(userId);
  if (!db[njid]) {
    db[njid] = {
      firstSeen: Date.now(),
      stickers: { static: 0, animated: 0 },
      name: 'Desconhecido'
    };
  }
}

function incSticker(jid, pushName, type /* 'static' | 'animated' */) {
  const db = loadAll();
  const njid = normalizeJid(jid);
  ensureUser(db, njid);
  db[njid].stickers[type] = (db[njid].stickers[type] || 0) + 1;
  if (pushName) db[njid].name = pushName;
  saveAll(db);
}

function getStats(jid) {
  const db = loadAll();
  const njid = normalizeJid(jid);
  if (!db[njid]) {
    return {
      firstSeen: Date.now(),
      stickers: { static: 0, animated: 0 },
      name: 'Desconhecido'
    };
  }
  return db[njid];
}

function toggleStretch(userId) {
  if (!userId) return true;
  const db = loadAll();
  const njid = normalizeJid(userId);
  ensureUser(db, njid);
  db[njid].useStretch = !(db[njid].useStretch ?? true);
  saveAll(db);
  return db[njid].useStretch;
}

function getUseStretch(userId) {
  if (!userId) return true;
  const db = loadAll();
  const njid = normalizeJid(userId);
  return db[njid]?.useStretch ?? true;
}

function getUserMeta(userId) {
  if (!userId) return null;
  const db = loadAll();
  const njid = normalizeJid(userId);
  if (!db[njid] || (!db[njid].pack && !db[njid].author)) return null;
  return { pack: db[njid].pack, author: db[njid].author };
}

function setUserMeta(userId, { pack, author }) {
  if (!userId) return;
  const db = loadAll();
  const njid = normalizeJid(userId);
  ensureUser(db, njid);
  db[njid].pack   = pack;
  db[njid].author = author;
  saveAll(db);
}

function resetUserMeta(userId) {
  if (!userId) return;
  const db = loadAll();
  const njid = normalizeJid(userId);
  if (db[njid]) {
    delete db[njid].pack;
    delete db[njid].author;
    saveAll(db);
  }
}

async function isUserInAvisosGroup(sock, userLid) {
  const traceId = `[LIDCHK-${Date.now().toString(36).toUpperCase()}]`;
  const njid = normalizeJid(userLid);
  console.log(`${traceId} 🔍 Verificando grupo de avisos para ${njid}`);

  try {
    const meta = await sock.groupMetadata(AVISOS_GROUP_ID);
    const participantsIds = meta.participants.map(p => normalizeJid(p.id));
    const isPresent = participantsIds.includes(njid);
    if (isPresent) return true;

    console.log(`${traceId} ❌ Usuário NÃO está no grupo de avisos. Será bloqueado.`);
    await sleep(r(1000, 3000));
    await sock.updateBlockStatus(njid, 'block');
    await notifyAdminsBlock(sock, njid);
    return false;
  } catch (e) {
    console.error(`${traceId} ⚠️ Erro ao verificar grupo: ${e.message}`);
    return true;
  }
}

async function notifyAdminsBlock(sock, userLid) {
  const njid = normalizeJid(userLid);
  const text = `⚠️ *Usuário bloqueado:* ${njid}\n\nResponda esta mensagem com:\n• "autorizar" → desbloqueia\n• "negar" → mantém bloqueado`;
  await sleep(r(1000, 3000));
  await sock.sendMessage(ADMIN_GROUP_ID, { text });
}

async function handleAdminResponse(sock, msg) {
  const traceId = `[ADM-${Date.now().toString(36).toUpperCase()}]`;

  const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  if (!contextInfo) return;

  const quoted = contextInfo.quotedMessage;
  if (!quoted) return;

  const quotedText = quoted.conversation || quoted.extendedTextMessage?.text || '';
  const isBlockNotification = quotedText.startsWith('⚠️ *Usuário bloqueado:*');

  if (!isBlockNotification) return;

  const match = quotedText.match(/([0-9A-Za-z]+@s\.whatsapp\.net)/);
  const userLid = match ? match[1] : null;
  if (!userLid) return;

  const response = body.trim().toLowerCase();

  if (response === 'autorizar') {
    await sock.updateBlockStatus(userLid, 'unblock');
    await sock.sendMessage(userLid, {
      text: `✅ Você foi autorizado a usar o So𝘳dBOT novamente.\nPor favor, permaneça no grupo de avisos.`,
    });
    await sock.sendMessage(ADMIN_GROUP_ID, { text: `✅ ${userLid} foi desbloqueado.` });
  } else if (response === 'negar') {
    await sock.sendMessage(ADMIN_GROUP_ID, { text: `🚫 ${userLid} continua bloqueado.` });
  }
}

async function sendHelp(sock, jid, quote) {
  const text = `🔴 *So𝘳dBOT Rouge* · Central de Ajuda

*🧩 Como fazer figurinhas*
• 📷 Envie uma imagem → vira sticker.
• 🎥 Envie vídeo/GIF → sticker animado.
• 🎨 Envie um código do emoji.gg ou stickers.gg → gera sticker.

*⬇️ Para baixar vídeos*
• Envie link de Twitter, Instagram, TikTok ou Pinterest.

*📋 Outros comandos*
• \`ajuda\` → esta mensagem.
• \`alternar\` → liga/desliga figurinha esticada.
• \`fig\` → responda mídia com fig para virar sticker.
• \`renomear "nome" "autor"\` → renomeia os stickers.
• \`ping\` → verifica se estou online.
• \`stats\` → mostra suas estatísticas.
• \`info\` → informações do So𝘳dBOT.

📫 Ajuda ou sugestão? Envie \`info\``;
await sleep(r(1000, 3000));
  await sock.sendMessage(jid, { text }, quote);
}

function logAction(action, user, start = Date.now()) {
  const elapsed = Date.now() - start;
  const ts = new Date().toLocaleString('pt-BR');
  console.log(`\x1b[36m[${ts}]\x1b[0m ${action} – ${user || 'Desconhecido'} (${elapsed}ms)`);
}

module.exports = {
  incSticker,
  getStats,

  toggleStretch,
  getUseStretch,
  getUserMeta,
  setUserMeta,
  resetUserMeta,

  isUserInAvisosGroup,
  handleAdminResponse,
  sendHelp,
  logAction,

  loadAll,
  saveAll
};