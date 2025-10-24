const fs   = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const r = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const ADMIN_GROUP_ID  = '120363287595102262@g.us';
const AVISOS_GROUP_ID = '120363046428170312@g.us';
const DB_FILE         = path.join(__dirname, '..', 'db', 'users.json');
fs.ensureFileSync(DB_FILE);

function loadAll() {
  try { return fs.readJsonSync(DB_FILE) || {}; }
  catch { return {}; }
}
function saveAll(data) { fs.writeJsonSync(DB_FILE, data, { spaces: 2 }); }

function ensureUser(db, userId) {
  if (!userId) return;
  if (!db[userId]) {
    db[userId] = {
      firstSeen: Date.now(),
      stickers: { static: 0, animated: 0 },
      name: 'Desconhecido'
    };
  }
}

function incSticker(jid, pushName, type /* 'static' | 'animated' */) {
  const db = loadAll();
  ensureUser(db, jid);
  db[jid].stickers[type] = (db[jid].stickers[type] || 0) + 1;
  if (pushName) db[jid].name = pushName;
  saveAll(db);
}

function getStats(jid) {
  const db = loadAll();
  if (!db[jid]) {
    return {
      firstSeen: Date.now(),
      stickers: { static: 0, animated: 0 },
      name: 'Desconhecido'
    };
  }
  return db[jid];
}

function toggleStretch(userId) {
  if (!userId) return true;
  const db = loadAll();
  ensureUser(db, userId);
db[userId].useStretch = !(db[userId].useStretch ?? true);
  saveAll(db);
  return db[userId].useStretch;
}

function getUseStretch(userId) {
  if (!userId) return true;
  const db = loadAll();
  return db[userId]?.useStretch ?? true;
}

function getUserMeta(userId) {
  if (!userId) return null;
  const db = loadAll();
  if (!db[userId] || (!db[userId].pack && !db[userId].author)) return null;
  return { pack: db[userId].pack, author: db[userId].author };
}

function setUserMeta(userId, { pack, author }) {
  if (!userId) return;
  const db = loadAll();
  ensureUser(db, userId);
  db[userId].pack   = pack;
  db[userId].author = author;
  saveAll(db);
}

function resetUserMeta(userId) {
  if (!userId) return;
  const db = loadAll();
  if (db[userId]) {
    delete db[userId].pack;
    delete db[userId].author;
    saveAll(db);
  }
}


async function isUserInAvisosGroup(sock, userJid) {
  try {
    const meta = await sock.groupMetadata(AVISOS_GROUP_ID);
    const participantsIds = meta.participants.map(p => p.id);

    if (participantsIds.includes(userJid)) {
      return true;
    }

    await sleep(r(1000, 3000));
    await sock.updateBlockStatus(userJid, 'block');
    await notifyAdminsBlock(sock, userJid);
    return false;
  } catch (e) {
    console.error('[AVISOS] Erro ao buscar grupo de avisos:', e);
    return false;
  }
}

async function notifyAdminsBlock(sock, userJid) {
  const text = `⚠️ *Número bloqueado:* @${userJid.split('@')[0]}\n\nResponda esta mensagem com:\n• "autorizar" → desbloqueia\n• "negar" → mantém bloqueado`;
  await sleep(r(1000, 3000));
  await sock.sendMessage(ADMIN_GROUP_ID, { text, mentions: [userJid] });
}

async function handleAdminResponse(sock, msg) {
  const body = msg.message?.conversation ||
               msg.message?.extendedTextMessage?.text ||
               '';
  const contextInfo = msg.message?.extendedTextMessage?.contextInfo;
  if (!contextInfo) return;

  const quoted = contextInfo.quotedMessage;
  if (!quoted) return;

  const quotedText = quoted.conversation || quoted.extendedTextMessage?.text || '';
  const isBlockNotification = quotedText.startsWith('⚠️ *Número bloqueado:*') &&
                              quotedText.includes('Responda esta mensagem');

  if (!isBlockNotification) return;

  const userId = quotedText.match(/@(\d+)/)?.[1];
  const userJid = userId ? `${userId}@s.whatsapp.net` : null;
  if (!userJid) return;

  const response = body.trim().toLowerCase();
  const adminJid = msg.key.participant || msg.key.remoteJid;

  if (response === 'autorizar') {
    await sock.updateBlockStatus(userJid, 'unblock');
    setTimeout(() => {
      sock.sendMessage(userJid, {
        text: `@${adminJid.split('@')[0]} liberou o seu número\n\nPara ver meus comandos digite *ajuda*.\n\n⚠️ Por favor, permaneça no grupo de avisos: https://chat.whatsapp.com/K1VVUPjqLZvKIW0GYFPZ8q\nCaso contrário, será bloqueado automaticamente ao sair.`,
        mentions: [adminJid]
      });
    }, Math.floor(Math.random() * 5000) + 4000);

    await sock.sendMessage(ADMIN_GROUP_ID, {
      text: `✅ @${userJid.split('@')[0]} foi desbloqueado por @${adminJid.split('@')[0]}`,
      mentions: [userJid, adminJid]
    });
  } else if (response === 'negar') {
    await sock.sendMessage(ADMIN_GROUP_ID, { text: `🚫 ${userJid} continua bloqueado.` });
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
  console.log(
    `\x1b[36m[${ts}]\x1b[0m ` +
    `\x1b[33m${action}\x1b[0m – ` +
    `\x1b[32m${user || 'Desconhecido'}\x1b[0m ` +
    `(\x1b[31m${elapsed}ms\x1b[0m)`
  );
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