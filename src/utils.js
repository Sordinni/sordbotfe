const fs = require('fs-extra');
const path = require('path');
const { downloadMediaMessage } = require('@whiskeysockets/baileys');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const r = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const ADMIN_GROUP_ID  = '120363287595102262@g.us';
const AVISOS_GROUP_ID = '120363046428170312@g.us';
const DB_FILE = path.join(__dirname, '..', 'db', 'users.json');
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

function incSticker(jid, pushName, type) {
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

async function isUserInAvisosGroup(sock, userLid) {
  const traceId = `[LIDCHK-${Date.now().toString(36).toUpperCase()}]`;
  console.log(`${traceId} 🔍 Verificando grupo de avisos para ${userLid}`);

  try {
    const meta = await sock.groupMetadata(AVISOS_GROUP_ID);
    const participantsIds = meta.participants.map(p => p.id);
    const isPresent = participantsIds.includes(userLid);
    if (isPresent) return true;

    console.log(`${traceId} ❌ Usuário NÃO está no grupo de avisos. Será bloqueado.`);
    await sleep(r(1000, 3000));
    await sock.updateBlockStatus(userLid, 'block');
    await notifyAdminsBlock(sock, userLid);
    return false;
  } catch (e) {
    console.error(`${traceId} ⚠️ Erro ao verificar grupo: ${e.message}`);
    return true;
  }
}

async function notifyAdminsBlock(sock, userLid) {
  const text = `⚠️ *Usuário bloqueado:* ${userLid}\n\nResponda esta mensagem com:\n• "autorizar" → desbloqueia\n• "negar" → mantém bloqueado`;
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

  const match = quotedText.match(/([0-9A-Za-z]+@lid)/);
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

📸 Envie uma imagem → sticker
🎞️ Envie vídeo/GIF → sticker animado
🎨 Envie link do emoji.gg → sticker
⬇️ Links de Twitter, TikTok, Insta → vídeo
⚙️ \`alternar\` → esticar ou não sticker
📦 \`stats\` → suas estatísticas
🪄 \`renomear "nome" "autor"\` → editar sticker
📡 \`ping\` → testar conexão
📘 \`info\` → informações gerais`;
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
  isUserInAvisosGroup,
  handleAdminResponse,
  sendHelp,
  logAction,
  loadAll,
  saveAll
};
