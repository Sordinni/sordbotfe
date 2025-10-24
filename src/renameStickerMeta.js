/* renameStickerMeta.js – com debug completo */
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { getUserMeta, setUserMeta, resetUserMeta } = require('./utils');

const ALIASES = ['renomear', 'r', 'ren'];

async function handleRenameSticker(sock, msg) {
  const jid   = msg.key.remoteJid;
  const body  = (msg.message?.conversation || msg.message?.extendedTextMessage?.text || '').trim();
  const cmd   = body.split(/\s+/)[0].toLowerCase();

  if (!ALIASES.includes(cmd)) return false;

  const args   = body.slice(cmd.length).trim();
const userId = msg.key.participant || msg.key.remoteJid;

  console.log(`[renameStickerMeta] userId=${userId}  cmd=${cmd}  args="${args}"`);

  /* ---------- resetar ---------- */
  if (args === 'resetar') {
    console.log(`[renameStickerMeta] resetando metadados para ${userId}`);
    resetUserMeta(userId);
    await sock.sendMessage(jid, { text: '✅ Metadados *resetados* para os padrões do bot.' }, { quoted: msg });
    return true;
  }

  /* ---------- regex: "pack" "author" ---------- */
  const match = args.match(/^["“](.+?)["”]\s+["“](.+?)["”]$/);
  if (!match) {
    const texto =
      `*❕ Como usar renomear*\n\n` +
      `• Salvar metadados pessoais:\n` +
      `  \`renomear "Nome do Pacote" "Seu Nome"\`\n\n` +
      `• Voltar ao padrão:\n` +
      `  \`renomear resetar\`\n\n` +
      `💡 Dica: os metadados salvos valem para todos os seus stickers futuros.`;
    await sock.sendMessage(jid, { text: texto }, { quoted: msg });
    return true;
  }
  const [, pack, author] = match;
  console.log(`[renameStickerMeta] pack="${pack}"  author="${author}"`);

  /* ---------- renomear figurinha respondida ---------- */
  const quoted = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (quoted?.stickerMessage) {
    try {
      const buffer = await downloadMediaMessage(
        { key: msg.message.extendedTextMessage.contextInfo.stanzaId, message: quoted },
        'buffer',
        {},
        { logger: sock.logger }
      );
      await sock.sendMessage(jid, { sticker: buffer, packname: pack, author }, { quoted: msg });
      await sock.sendMessage(jid, { react: { text: '🟢', key: msg.key } });
    } catch (e) {
      console.error('[renameStickerMeta] Erro ao renomear figurinha:', e);
      await sock.sendMessage(jid, { text: '❌ Erro ao processar figurinha.' }, { quoted: msg });
    }
    return true;
  }

  /* ---------- apenas salva metadados ---------- */
  console.log(`[renameStickerMeta] salvando metadados para ${userId}`);
  setUserMeta(userId, { pack, author });

  /* confirmação visual no WhatsApp */
  await sock.sendMessage(
    jid,
    { text: `📦 *Suas figurinhas ficarão assim:* ${pack} • ${author}` },
    { quoted: msg }
  );
  return true;
}

module.exports = { handleRenameSticker };