/* renameStickerMeta.js – reescrito para Baileys 6.7.20 (JS puro) */
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { getUserMeta, setUserMeta, resetUserMeta } = require('./userMeta');

const ALIASES = ['renomear', 'r', 'ren'];

async function handleRenameSticker(sock, msg) {
  const jid = msg.key.remoteJid;
  if (!jid.endsWith('@g.us')) return false;          // só grupos

  const body = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '')
    .trim();
  const cmd = body.split(/\s+/)[0].toLowerCase();
  if (!ALIASES.includes(cmd)) return false;

  const args = body.slice(cmd.length).trim();
  const userId = msg.participant || msg.key.participant;

  /* ---------- resetar ---------- */
  if (args === 'resetar') {
    resetUserMeta(userId);
    await sock.sendMessage(jid, {
      text: '✅ Metadados *resetados* para os padrões do bot.'
    }, { quoted: msg });
    return true;
  }

  /* ---------- renomear via resposta a figurinha ---------- */
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  const isReplySticker = quoted && quoted.stickerMessage;

  const match = args.match(/^["“](.+?)["”]\s+["“](.+?)["”]$/);
  if (!match) {
    await sock.sendMessage(jid, {
      text: '❕ Uso:\n`renomear "pacote" "autor"`\n`renomear resetar`'
    }, { quoted: msg });
    return true;
  }
  const [, pack, author] = match;

  if (isReplySticker) {
    try {
      const mediaBuffer = await downloadMediaMessage(
        { key: msg.message.extendedTextMessage.contextInfo.stanzaId, message: quoted },
        'buffer',
        {},
        { logger: sock.logger }
      );

      await sock.sendMessage(jid, {
        sticker: mediaBuffer,
        packname: pack,
        author: author
      }, { quoted: msg });

      await sock.sendMessage(jid, { react: { text: '✅', key: msg.key } });
    } catch (e) {
      console.error('Erro ao renomear figurinha:', e);
      await sock.sendMessage(jid, {
        text: '❌ Erro ao processar figurinha.'
      }, { quoted: msg });
    }
    return true;
  }

  /* ---------- apenas salva metadados pro usuário ---------- */
  setUserMeta(userId, { pack, author });
  await sock.sendMessage(jid, {
    text: `✅ Metadados atualizados!\n📦 *Pacote:* ${pack}\n✍️ *Autor:* ${author}`
  }, { quoted: msg });

  return true;
}

module.exports = { handleRenameSticker };