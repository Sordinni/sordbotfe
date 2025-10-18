/* processVideo.js – compatível com Baileys 6.7.20 (JS) */
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const { getUserMeta } = require('./userMeta');

const FPS_POOL = [60, 30, 20, 17, 16, 15, 12, 10, 9];

// evita processamento duplicado
const processing = new Map();          // key => "chat_jid_user"

function lockKey(jid, user) {
  return `${jid}_${user}`;
}

/**
 * Converte vídeo/GIF recebido pelo Baileys em sticker animado
 * @param {Wasocket} sock  – instância Baileys
 * @param {videoMessage|gifMessage} mediaObj – mensagem de mídia
 * @param {WAMessage} fullMsg – mensagem completa (para quoted, reações, etc.)
 */
async function processVideo(sock, mediaObj, fullMsg) {
  const jid   = fullMsg.key.remoteJid;
  const user  = fullMsg.participant || fullMsg.key.participant;
  const key   = lockKey(jid, user);

  if (processing.has(key)) return;          // já está rodando
  processing.set(key, true);

  try {
    /* reação inicial */
    await sock.sendMessage(jid, { react: { text: '🖐️', key: fullMsg.key } });

    /* metadados dinâmicos */
    const meta = getUserMeta(user) || {};
    const pack = meta.pack || 'figurinha por';
    const author = meta.author || 'So𝘳dBOT';

    /* baixa o vídeo/GIF */
    const buffer = await downloadMediaMessage(
      { key: fullMsg.key, message: { videoMessage: mediaObj } },
      'buffer',
      {},
      { logger: sock.logger }
    );

    /* tenta gerar o webp em cada FPS do pool */
    for (const fps of FPS_POOL) {
      try {
        const webp = await new Sticker(buffer, {
          type: StickerTypes.FULL,
          pack,
          author,
          fps,
          startTime: '00:00:00.0',
          endTime: '00:00:10.0',
          quality: 40,
        }).toBuffer();

        /* envia sticker */
        await sock.sendMessage(jid, { sticker: webp }, { quoted: fullMsg });

        /* apaga mensagem original (opcional) */
        await sock.sendMessage(jid, { delete: fullMsg.key });
        return;                       // sucesso → sai
      } catch (e) {
        console.warn(`❌ ${fps} FPS falhou para ${key}:`, e.message);
      }
    }

    /* nenhum FPS funcionou */
    await sock.sendMessage(jid, {
      text: '❌ Não consegui gerar a figurinha em nenhuma taxa de FPS.'
    }, { quoted: fullMsg });
    await sock.sendMessage(jid, { react: { text: '🥲', key: fullMsg.key } });
  } catch (err) {
    console.error('Erro ao processar vídeo:', err);
    await sock.sendMessage(jid, {
      text: '❌ Erro ao processar o vídeo.'
    }, { quoted: fullMsg });
  } finally {
    processing.delete(key);
  }
}

module.exports = { processVideo };