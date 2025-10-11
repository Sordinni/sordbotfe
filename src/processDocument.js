const { decryptMedia } = require('@open-wa/wa-automate');
const { getUserMeta } = require('./userMeta');

/**
 * Converte documento de imagem em figurinha
 * @param {import('@open-wa/wa-automate').Client} client
 * @param {import('@open-wa/wa-automate').Message} message
 */
async function processDocument(client, message) {
  try {
    const chatId = message.chatId;
    const messageId = message.id;
    const mimeType = message.mimetype;
    const userId = message.sender.id;

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

    console.log('📄 Processando documento...');

    if (!mimeType || !mimeType.startsWith('image/')) {
      await client.sendText(
        chatId,
        '📁 Por favor, envie uma imagem para converter em figurinha.',
        messageId
      );
      return;
    }

    const mediaData = await decryptMedia(message);

    const result = await client.sendImageAsStickerAsReply(
      chatId,
      mediaData,
      messageId,
      stickerMetadata
    );

    if (result) {
      console.log('✅ Figurinha de documento enviada com sucesso!');
    } else {
      await client.sendText(chatId, '❌ Erro ao criar figurinha do arquivo.', messageId);
    }
  } catch (error) {
    console.error('Erro ao processar documento:', error);
    await client.sendText(message.chatId, '❌ Erro ao processar o arquivo.', message.id);
  }
}

module.exports = { processDocument };