const { decryptMedia } = require('@open-wa/wa-automate');
const { createCanvas, loadImage } = require('canvas');
const { getUseStretch, getUserMeta } = require('./userMeta');

// Função para aplicar stretch
const stretchImage = async (base64Image) => {
  const canvas = createCanvas();
  const img = await loadImage(base64Image);
  const maxSize = Math.max(img.width, img.height);
  canvas.width = maxSize;
  canvas.height = maxSize;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, maxSize, maxSize);
  return canvas.toBuffer('image/jpeg');
};

// Converte imagem em figurinha
async function processImage(client, message) {
  try {
    const chatId = message.chatId;
    const messageId = message.id;
    const userId = message.sender.id;
    await client.react(messageId, '🖐️');

    // ⭐️ METADADOS DINÂMICOS ⭐️
    const userMeta = getUserMeta(userId) || {
      pack: 'figurinha por',
      author: 'So𝘳dBOT'
    };
    const stickerMetadata = {
      author: userMeta.author,
      pack: userMeta.pack,
      keepScale: true,
      crop: false,
    };

    let mediaData = await decryptMedia(message);
    if (getUseStretch(userId)) {
      mediaData = await stretchImage(mediaData);
    }

    const result = await client.sendImageAsStickerAsReply(
      chatId,
      mediaData,
      messageId,
      stickerMetadata
    );

    if (result) {
      await client.deleteMessage(chatId, message.id);
    } else {
      await client.reply(chatId, '❌ Erro ao criar figurinha da imagem.', messageId);
    }
  } catch (error) {
    console.error('Erro ao processar imagem:', error);
    await client.reply(chatId, '❌ Erro ao processar a imagem.', messageId);
  }
}

module.exports = { processImage };