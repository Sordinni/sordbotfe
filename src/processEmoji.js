const { getUserMeta } = require('./userMeta');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const {autoSaveSticker}= require('./stickerManager')

const STICKERS_DIR = path.join(__dirname, '..', 'stickers_temp');
if (!fs.existsSync(STICKERS_DIR)) fs.mkdirSync(STICKERS_DIR, { recursive: true });

// Download
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

// Formato GIF → MP4
async function gifToMp4(gifPath) {
  const mp4Path = gifPath.replace(/\.gif$/i, '.mp4');
  await execPromise(
    `ffmpeg -y -i "${gifPath}" -movflags faststart -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" "${mp4Path}"`
  );
  return mp4Path;
}

// Extrai ID do texto
function extractId(text) {
  const match =
    text.match(/emoji\.gg\/\w+\/(\d+-[\w-]+)/i) ||
    text.match(/stickers\.gg\/sticker\/(\d+-[\w-]+)/i) ||
    text.match(/^(\d+-[\w-]+)$/i);
  return match ? match[1] || match[2] || match[3] : null;
}

// Gera URLs possíveis
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

// Manipula mensagem de emoji
async function handleEmoji(client, message) {
  const text = (message.body || '').trim();

  const emojiId = extractId(text);
  if (!emojiId) return false;

  const userId = message.sender.id;

  const userMeta = getUserMeta(userId) || { pack: 'figurinha por', author: 'So𝘳dBOT' };

  const safeName = `${emojiId}_${userMeta.pack}_${userMeta.author}`.replace(/[^a-z0-9_-]/gi, '_');
  const urls = buildUrls(emojiId);

  let localPath = null;
  let isGif = false;

  for (const url of urls) {
    const ext = path.extname(url);
    const fullPath = path.join(STICKERS_DIR, safeName + ext);
    try {
      await downloadFile(url, fullPath);
      localPath = fullPath;
      isGif = ext === '.gif';
      break;
    } catch (e) {
    }
  }

  if (!localPath) {
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
      mp4Path = await gifToMp4(localPath);
      finalBuffer = fs.readFileSync(mp4Path);
    } else {
      finalBuffer = fs.readFileSync(localPath);
    }

    if (isGif) {
      await client.sendMp4AsSticker(
        message.chatId,
        finalBuffer,
        { fps: 60, endTime: '00:00:10.0', loop: 0, square: 240 },
        stickerMetadata,
        message.id
      );
      await autoSaveSticker(userId, finalBuffer);            // ✅
    } else {
      await client.sendImageAsStickerAsReply(
        message.chatId,
        finalBuffer,
        message.id,
        stickerMetadata
      );
      await autoSaveSticker(userId, finalBuffer);            // ✅
    }

  } catch (err) {
    await client.reply(message.chatId, '❌ Não consegui enviar esse emoji/sticker.', message.id);
  } finally {
    if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath);
    const mp4Path = localPath?.replace(/\.gif$/i, '.mp4');
    if (mp4Path && fs.existsSync(mp4Path)) fs.unlinkSync(mp4Path);
  }
  return true;
}

module.exports = { handleEmoji };