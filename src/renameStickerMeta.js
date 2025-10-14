const { decryptMedia } = require('@open-wa/wa-automate');
const { getUserMeta, setUserMeta, resetUserMeta } = require('./userMeta');

const ALIASES = ['renomear', 'r', 'ren'];

async function handleRenameSticker(client, message) {
  if (!message.isGroupMsg) return;

  const body = (message.body || '').trim();
  const cmd = body.split(/\s+/)[0].toLowerCase();

  if (!ALIASES.includes(cmd)) return;

  const args = body.slice(cmd.length).trim();
  const userId = message.sender.id;

  // Comando para resetar metadados
  if (args === 'resetar') {
    resetUserMeta(userId);
    await client.reply(
      message.chatId,
      '✅ Metadados *resetados* para os padrões do bot.',
      message.id
    );
    return;
  }

  // Se respondeu uma figurinha
  if (message.quotedMsg && message.quotedMsg.type === 'sticker') {
    const match = args.match(/^["“](.+?)["”]\s+["“](.+?)["”]$/);
    if (!match) {
      await client.reply(
        message.chatId,
        '❕ Resposta a uma figurinha:\n`renomear "pacote" "autor"`',
        message.id
      );
      return;
    }
    const [, pack, author] = match;

    try {
      // Baixa a figurinha original
      const mediaData = await decryptMedia(message.quotedMsg);

      // Monta novos metadados
      const stickerMetadata = {
        author,
        pack,
        keepScale: true,
        crop: false,
      };

      // Re-envia com novos metadados
      const result = await client.sendImageAsStickerAsReply(
        message.chatId,
        mediaData,
        message.id,
        stickerMetadata
      );

      if (result) {
        await client.react(message.id, '✅');
      } else {
        await client.reply(message.chatId, '❌ Erro ao re-enviar figurinha.', message.id);
      }
    } catch (e) {
      console.error('Erro ao renomear figurinha:', e);
      await client.reply(message.chatId, '❌ Erro ao processar figurinha.', message.id);
    }
    return;
  }

  // Renomear padrão (antigo)
  const match = args.match(/^["“](.+?)["”]\s+["“](.+?)["”]$/);
  if (!match) {
    await client.reply(
      message.chatId,
      '❕ Uso:\n`renomear "pacote" "autor"`\n`renomear resetar`',
      message.id
    );
    return;
  }
  const [, pack, author] = match;
  setUserMeta(userId, { pack, author });

  await client.reply(
    message.chatId,
    `✅ Metadados atualizados!\n📦 *Pacote:* ${pack}\n✍️ *Autor:* ${author}`,
    message.id
  );
}

module.exports = { handleRenameSticker };