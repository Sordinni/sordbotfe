const { decryptMedia } = require('@open-wa/wa-decrypt');
const axios = require('axios');
const { getUserMeta } = require('./utils');
const crypto = require('crypto');
const webp = require('node-webpmux');

const FPS_POOL = [60, 30, 20, 17, 16, 15, 12, 10, 9];
const MAX_STICKER_SIZE = 1 * 1024 * 1024; // 1 MB em bytes

/* evita processamento duplicado */
const processing = new Map();
function lockKey(jid, user) { return `${jid}_${user}`; }

const STICKER_ENDPOINT = 'https://sticker-api.openwa.dev/convertMp4BufferToWebpDataUrl';


/* ---------- helpers de metadados ---------- */
async function createExifBuffer(pack, author) {
  const json = {
    'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
    'sticker-pack-name': pack,
    'sticker-pack-publisher': author,
  };
  const exifAttr = Buffer.from([
    0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57,
    0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00,
  ]);
  const jsonBuffer = Buffer.from(JSON.stringify(json), 'utf8');
  const exif = Buffer.concat([exifAttr, jsonBuffer]);
  exif.writeUIntLE(jsonBuffer.length, 14, 4);
  return exif;
}

async function addExifToWebp(webpBuffer, exifBuffer) {
  const img = new webp.Image();
  await img.load(webpBuffer);
  img.exif = exifBuffer;
  return await img.save(null);
}

async function processVideo(sock, mediaObj, fullMsg) {
  const jid = fullMsg.key.remoteJid;
  const user = fullMsg.participant || fullMsg.key.remoteJid;
  const key = lockKey(jid, user);
  if (processing.has(key)) return;
  processing.set(key, true);

  try {
    await sock.sendMessage(jid, { react: { text: '🟠', key: fullMsg.key } });

    const meta = getUserMeta(user) || {};
    const pack = meta.pack || 'figurinha por';
    const author = meta.author || 'So𝘳dBOT';

    /* ---------- 1. validação ---------- */
    if (!mediaObj.url || !mediaObj.mediaKey || !mediaObj.mimetype) {
      await sock.sendMessage(jid, { text: '❌ Mídia inválida ou ainda não foi descarregada pelo WhatsApp.' }, { quoted: fullMsg });
      return;
    }

    /* ---------- 2. decriptação ---------- */
    const decryptParams = {
      clientUrl: mediaObj.url,
      deprecatedMms3Url: mediaObj.url,
      mediaKey: mediaObj.mediaKey,
      mimetype: mediaObj.mimetype,
      filehash: Buffer.from(mediaObj.fileSha256).toString('base64'),
      type: mediaObj.mimetype.split('/')[0],
      size: Number(mediaObj.fileLength) || 0,
    };

    let mediaBuffer;
    try {
      mediaBuffer = await decryptMedia(decryptParams);
    } catch (decryptErr) {
      await sock.sendMessage(jid, { text: '❌ Erro ao decriptar a mídia.' }, { quoted: fullMsg });
      return;
    }

    /* ---------- 3. loop de FPS ---------- */
    for (const fps of FPS_POOL) {
      try {
        const { data: webpDataUrl } = await axios.post(
          STICKER_ENDPOINT,
          {
            file: mediaBuffer.toString('base64'),
            processOptions: { fps, startTime: '00:00:00.0', endTime: '00:00:10.0', square: 210 },
            stickerMetadata: { pack, author } // ainda usado pela API, mas vamos sobrescrever
          },
          { maxBodyLength: 20 * 1024 * 1024 }
        );

        let webpBuffer = Buffer.from(webpDataUrl.replace(/^data:image\/webp;base64,/, ''), 'base64');

        /* ---------- 4. adiciona EXIF manualmente ---------- */
        const exifBuffer = await createExifBuffer(pack, author);
        webpBuffer = await addExifToWebp(webpBuffer, exifBuffer);

        /* ---------- 5. VERIFICA TAMANHO FINAL ---------- */
        if (webpBuffer.length > MAX_STICKER_SIZE) {
          continue; // tenta próximo FPS
        }

        await sock.sendMessage(jid, { sticker: webpBuffer }, { quoted: fullMsg });
        await sock.sendMessage(jid, { react: { text: '🟢', key: fullMsg.key } });
        return;
      } catch (e) {
      }
    }

    /* ---------- 6. nenhuma tentativa atendeu ao limite ---------- */
    await sock.sendMessage(jid, { text: '❌ A figurinha ficou maior que 1 MB em todas as taxas de FPS.' }, { quoted: fullMsg });
    await sock.sendMessage(jid, { react: { text: '🔴', key: fullMsg.key } });
  } catch (e) {
    await sock.sendMessage(jid, { text: '❌ Erro ao processar o vídeo.' }, { quoted: fullMsg });
  } finally {
    processing.delete(key);
  }
}

module.exports = { processVideo };