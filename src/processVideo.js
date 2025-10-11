const { decryptMedia } = require('@open-wa/wa-automate');
const { getUserMeta } = require('./userMetaDb');
const userMeta = getUserMeta(message.sender.id) || {
  pack: 'figurinha por',
  author: 'So𝘳dBOT'
};

const stickerMetadata = {
  author: userMeta.author,
  pack: userMeta.pack,
  keepScale: true,
  crop: false,
};

const FPS_POOL = [60, 30, 20, 17, 16, 15, 12, 10, 9];

const processing = new Map();            // lock por usuário
const lockKey = (m) => `${m.chatId}_${m.sender.id}`;

async function processVideo(client, message) {
  const key   = lockKey(message);
  const chatId = message.chatId;
  const msgId  = message.id;

  /* 1.  já está processando? */
  if (processing.has(key)) {
    return;
  }

  /* 2.  adquire lock + reação inicial */
  processing.set(key, true);
  await client.react(msgId, '🖐️');

  /* 3.  trabalho pesado com garantia de liberação */
  try {
    const media = await decryptMedia(message);

    for (const fps of FPS_POOL) {
      try {
        const result = await client.sendMp4AsSticker(
          chatId,
          media,
          { fps,endTime: '00:00:10.0', loop: 0, square: 240 },
          stickerMetadata,
          msgId
        );
        if (result) {   
          await client.deleteMessage(chatId, message.id)
          return;
        }
      } catch (e) {
        console.warn(`❌ ${fps} FPS falhou para ${key}:`, e.message);
      }
    }

    await client.reply(chatId, '❌ Não consegui gerar a figurinha, ficou maior que 1MB.', msgId);
    await client.react(msgId, '🥲');

  } catch (err) {
    console.error('Erro ao processar vídeo:', err);
    await client.reply(chatId, '❌ Erro ao processar o vídeo.', msgId);

  } finally {
    processing.delete(key);
  }
}

module.exports = { processVideo };