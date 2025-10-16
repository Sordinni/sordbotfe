const { decryptMedia } = require('@open-wa/wa-automate');
const { getUserMeta } = require('./userMeta');
const { autoSaveSticker } = require('./stickerManager');

// Pool de FPS que serão testados (do mais alto para o mais baixo)
const FPS_POOL = [60, 30, 20, 17, 16, 15, 12, 10, 9];

// Evita que o mesmo vídeo seja processado mais de uma vez simultaneamente
const processing = new Map(); 

function lockKey(message) {
  return `${message.chatId}_${message.sender.id}`;
}

async function processVideo(client, message) {
  const key   = lockKey(message);
  const chatId = message.chatId;
  const msgId  = message.id;
  const userId = message.sender.id;

  // Reação inicial
  await client.react(msgId, '🖐️');

  // 1. Já está processando? Ignora
  if (processing.has(key)) return;

  // 2. Lock
  processing.set(key, true);

  try {
    // Decripta o vídeo
    const mediaData = await decryptMedia(message);

    /* METADADOS DINÂMICOS COM FALLBACK */
    const userMeta = getUserMeta(userId) || {};
    const stickerMetadata = {
      author: userMeta.author || 'So𝘳dBOT',
      pack:   userMeta.pack   || 'figurinha por',
    };

    // Tenta cada FPS até conseguir enviar
    for (const fps of FPS_POOL) {
      const opts = {
        fps,
        startTime: '00:00:00.0',
        endTime:   '00:00:10.0',
        loop: 0,
        square: 240,
      };

      try {
        const result = await client.sendMp4AsSticker(
          chatId,
          mediaData,
          opts,
          stickerMetadata,
          msgId
        );

        // SUCESSO: @open-wa pode retornar undefined, mas NÃO null/false
        if (result !== null && result !== false) {
          await autoSaveSticker(userId, mediaData); // salva no histórico
          await client.deleteMessage(chatId, message.id); // apaga o vídeo
          return; // ← interrompe o loop e a função
        }
      } catch (e) {
        console.warn(`❌ ${fps} FPS falhou para ${key}:`, e.message);
      }
    }

    // Se chegou aqui, nenhum FPS funcionou
    await client.reply(
      chatId,
      '❌ Não consegui gerar a figurinha em nenhuma taxa de FPS.',
      msgId
    );
    await client.react(msgId, '🥲');
  } catch (err) {
    console.error('Erro ao processar vídeo:', err);
    await client.reply(chatId, '❌ Erro ao processar o vídeo.', msgId);
  } finally {
    // Libera o lock SEMPRE
    processing.delete(key);
  }
}

module.exports = { processVideo };