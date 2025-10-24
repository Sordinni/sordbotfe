const { toggleStretch } = require('./utils');

async function handleToggle(sock, msg) {
  const jid = msg.key.remoteJid;


  const body = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '')
    .trim()
    .toLowerCase();
  if (body !== 'alternar') return false;

  const userId = msg.key.participant || msg.key.remoteJid;
  const newState = toggleStretch(userId);

  await sock.sendMessage(jid, {
    text: `✅ Figurinhas esticadas ${newState ? 'ativadas' : 'desativadas'} para você.`
  }, { quoted: msg });

  return true;
}

module.exports = { handleToggle };