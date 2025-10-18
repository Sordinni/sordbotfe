/* processVideo.js – compatível com Baileys 6.7.20 (JS) */
const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { Sticker, StickerTypes } = require('wa-sticker-formatter');
const { getUserMeta } = require('./userMeta');
const ffmpeg = require('fluent-ffmpeg');
const { tmpdir } = require('os');
const { join } = require('path');
const fs = require('fs');

const FPS_POOL = [60, 30, 20, 17, 16, 15, 12, 10, 9];

// evita processamento duplicado
const processing = new Map();          // key => "chat_jid_user"

function lockKey(jid, user) {
  return `${jid}_${user}`;
}

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
        const inputPath = join(tmpdir(), `${key}_input.mp4`);
        const outputPath = join(tmpdir(), `${key}_output.mp4`);

        fs.writeFileSync(inputPath, buffer);

        await new Promise((resolve, reject) => {
          ffmpeg(inputPath)
            .outputOptions([
              '-vf scale=512:512:force_original_aspect_ratio=increase,crop=512:512',
              '-r', fps.toString(),
              '-t', '10',
              '-an'
            ])
            .output(outputPath)
            .on('end', resolve)
            .on('error', reject)
            .run();
        });

        const croppedBuffer = fs.readFileSync(outputPath);

        const webp = await new Sticker(croppedBuffer, {
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

        // limpeza
        fs.unlinkSync(inputPath);
        fs.unlinkSync(outputPath);
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