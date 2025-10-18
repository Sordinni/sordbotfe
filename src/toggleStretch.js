/* toggleStretch.js – reescrito para Baileys 6.7.20 (JS puro) */
const { toggleStretch } = require('./userMeta');

async function handleToggle(sock, msg) {
  const jid = msg.key.remoteJid;
  if (!jid.endsWith('@g.us')) return false;          // só grupos

  const body = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '')
    .trim()
    .toLowerCase();
  if (body !== 'alternar') return false;

  const userId = msg.participant || msg.key.participant;
  const newState = toggleStretch(userId);            // true/false

  await sock.sendMessage(jid, {
    text: `✅ Figurinhas esticadas ${newState ? 'ativadas' : 'desativadas'} para você.`
  }, { quoted: msg });

  return true;
}

module.exports = { handleToggle };