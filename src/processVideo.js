const { decryptMedia } = require('@open-wa/wa-automate');
const { autoSaveSticker } = require('./stickerManager');
const { getUserMeta } = require('./userMeta');

const FPS_POOL = [60, 30, 20, 17, 16, 15, 12, 10, 9];

// Mapa de bloqueio para evitar processamento concorrente
const processing = new Map(); // key => "chatId_senderId"

function lockKey(message) {
  return `${message.chatId}_${message.sender.id}`;
}

async function processVideo(client, message) {
  const key = lockKey(message);
  const chatId = message.chatId;
  const messageId = message.id;
  const userId = message.sender.id;

  await client.react(messageId, `🖐️`);

// 1. verifica se já está processando
  if (processing.has(key)) {
    return;
  }

// 2. coloca o lock
  processing.set(key, true);

  try {
    const mediaData = await decryptMedia(message);

    /* ⭐️ METADADOS DINÂMICOS COM FALLBACK ⭐️ */
    const userMeta = getUserMeta(userId) || {};
    const stickerMetadata = {
      author: userMeta.author || 'So𝘳dBOT',
      pack: userMeta.pack || 'figurinha por',
    };

    for (const fps of FPS_POOL) {
      const opts = {
        fps,
        startTime: '00:00:00.0',
        endTime: '00:00:10.0',
        loop: 0,
        square: 240,
      };

      try {
        const result = await client.sendMp4AsSticker(
          chatId,
          mediaData,
          opts,
          stickerMetadata,
          messageId
        );

        if (result) {
          await autoSaveSticker(userId, mediaData).then(() => {
            client.deleteMessage(chatId, message.id);
          });
          return; // sucesso
        }
      } catch (e) {
        console.warn(`❌ ${fps} FPS falhou para ${key}:`, e.message);
      }
    }

    await client.reply(
      chatId,
      '❌ Não consegui gerar a figurinha em nenhuma taxa de FPS.',
      messageId
    );
    await client.react(messageId, `🥲`);
  } catch (err) {
    console.error('Erro ao processar vídeo:', err);
    await client.reply(chatId, '❌ Erro ao processar o vídeo.', messageId);
  } finally {
    // 3. sempre libera o lock
    processing.delete(key);
  }
}

module.exports = { processVideo };