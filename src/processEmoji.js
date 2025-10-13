// src/processEmoji.js
const { getUserMeta } = require('./userMeta');   // ← fix do import
const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const STICKERS_DIR = path.join(__dirname, '..', 'stickers_temp');
if (!fs.existsSync(STICKERS_DIR)) fs.mkdirSync(STICKERS_DIR, { recursive: true });

/* ---------- downloader ---------- */
async function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`Status ${res.statusCode}`));
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', (err) => {
      fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

/* ---------- gif → mp4 ---------- */
async function gifToMp4(gifPath) {
  const mp4Path = gifPath.replace(/\.gif$/i, '.mp4');
  await execPromise(
    `ffmpeg -y -i "${gifPath}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" "${mp4Path}"`
  );
  return mp4Path;
}

/* ---------- extrai ID ---------- */
function extractId(text) {
  const match =
    text.match(/emoji\.gg\/\w+\/(\d+-[\w-]+)/i) ||
    text.match(/stickers\.gg\/sticker\/(\d+-[\w-]+)/i) ||
    text.match(/^(\d+-[\w-]+)$/i);
  return match ? match[1] || match[2] || match[3] : null;
}

/* ---------- gera URLs ---------- */
function buildUrls(id) {
  return [
    `https://cdn.stickers.gg/stickers/${id}.gif`,
    `https://cdn.stickers.gg/stickers/${id}.png`,
    `https://cdn3.emoji.gg/stickers/${id}.gif`,
    `https://cdn3.emoji.gg/emojis/${id}.gif`,
    `https://cdn3.emoji.gg/stickers/${id}.png`,
    `https://cdn3.emoji.gg/emojis/${id}.png`,
  ];
}

/* ---------- handler ---------- */
async function handleEmoji(client, message) {
  const text = (message.body || '').trim();
  console.log(`[EMOJI-GG/STICKERS-GG] Texto recebido: "${text}"`);

  const emojiId = extractId(text);
  if (!emojiId) return false;

  const userId = message.sender.id;
  console.log(`[EMOJI-GG/STICKERS-GG] ID extraído: ${emojiId}`);

  const userMeta = getUserMeta(userId) || { pack: 'figurinha por', author: 'So𝘳dBOT' };
  console.log(`[EMOJI-GG/STICKERS-GG] Metadados – pack: "${userMeta.pack}" | author: "${userMeta.author}"`);

  const safeName = `${emojiId}_${userMeta.pack}_${userMeta.author}`.replace(/[^a-z0-9_-]/gi, '_');
  const urls = buildUrls(emojiId);

  let localPath = null;
  let isGif = false;

  for (const url of urls) {
    const ext = path.extname(url);
    const fullPath = path.join(STICKERS_DIR, safeName + ext);
    try {
      console.log(`[EMOJI-GG/STICKERS-GG] ⬇️  Tentando: ${url}`);
      await downloadFile(url, fullPath);
      localPath = fullPath;
      isGif = ext === '.gif';
      break;
    } catch (e) {
      console.log(`[EMOJI-GG/STICKERS-GG] ⚠️  Falhou (${e.message}) – tentando próximo...`);
    }
  }

  if (!localPath) {
    console.error(`[EMOJI-GG/STICKERS-GG] ❌ Nenhuma versão encontrada.`);
    await client.reply(message.chatId, '❌ Não consegui baixar esse emoji/sticker.', message.id);
    return true;
  }

  try {
    const stickerMetadata = {
      author: userMeta.author,
      pack: userMeta.pack,
      keepScale: true,
      crop: false,
    };

    let finalBuffer;
    let mp4Path = null;

    if (isGif) {
      console.log(`[EMOJI-GG/STICKERS-GG] 🎥 Convertendo GIF → MP4...`);
      mp4Path = await gifToMp4(localPath);
      finalBuffer = fs.readFileSync(mp4Path);
    } else {
      finalBuffer = fs.readFileSync(localPath);
    }

    if (isGif) {
      await client.sendMp4AsSticker(
        message.chatId,
        finalBuffer,
        { fps: 60, startTime: '00:00:00.0', endTime: '00:00:10.0', loop: 0, square: 240 },
        stickerMetadata,
        message.id
      );
    } else {
      await client.sendImageAsStickerAsReply(
        message.chatId,
        finalBuffer,
        message.id,
        stickerMetadata
      );
    }

    console.log(`[EMOJI-GG/STICKERS-GG] ✅ Sticker enviado (${emojiId})`);
  } catch (err) {
    console.error(`[EMOJI-GG/STICKERS-GG] ❌ Erro ao enviar sticker:`, err.message);
    await client.reply(message.chatId, '❌ Não consegui enviar esse emoji/sticker.', message.id);
  } finally {
    if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath);
    const mp4Path = localPath?.replace(/\.gif$/i, '.mp4');
    if (mp4Path && fs.existsSync(mp4Path)) fs.unlinkSync(mp4Path);
  }
  return true;
}

module.exports = { handleEmoji };