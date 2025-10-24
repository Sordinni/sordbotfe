const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { getUserMeta } = require('./utils');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const sharp = require('sharp');

const STICKERS_DIR = path.join(__dirname, '..', 'stickers_temp');
if (!fs.existsSync(STICKERS_DIR)) fs.mkdirSync(STICKERS_DIR, { recursive: true });

// Baixa arquivo de URL
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

// Converte GIF para MP4
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
async function handleEmoji(sock, message) {
  const text = (message.message?.conversation || message.message?.extendedTextMessage?.text || '').trim();
  const emojiId = extractId(text);
  if (!emojiId) return false;

  const userId = message.key.participant || message.key.remoteJid;

  const userMeta = getUserMeta(userId) || {
    pack: 'figurinha por',
    author: 'So𝘳dBOT'
  };

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
      // tenta próxima URL
    }
  }

  if (!localPath) {
    await sock.sendMessage(message.key.remoteJid, {
      text: '❌ Não consegui baixar esse emoji/sticker.',
      quoted: message
    });
    return true;
  }

  try {
    let finalBuffer;
    let mp4Path = null;

    if (isGif) {
      mp4Path = await gifToMp4(localPath);
      finalBuffer = fs.readFileSync(mp4Path);
    } else {
      finalBuffer = fs.readFileSync(localPath);
    }

    if (isGif) {
      // Envia sticker animado (video)
      await sock.sendMessage(message.key.remoteJid, {
        sticker: finalBuffer,
        quoted: message
      }, { url: mp4Path });
    } else {
      // Converte imagem para sticker
      const stickerBuffer = await sharp(finalBuffer)
        .webp()
        .toBuffer();

      await sock.sendMessage(message.key.remoteJid, {
        sticker: stickerBuffer,
        quoted: message
      });
    }

  } catch (err) {
    console.error('Erro ao enviar sticker:', err);
    await sock.sendMessage(message.key.remoteJid, {
      text: '❌ Não consegui enviar esse emoji/sticker.',
      quoted: message
    });
  } finally {
    if (localPath && fs.existsSync(localPath)) fs.unlinkSync(localPath);
    const mp4Path = localPath?.replace(/\.gif$/i, '.mp4');
    if (mp4Path && fs.existsSync(mp4Path)) fs.unlinkSync(mp4Path);
  }

  return true;
}

module.exports = { handleEmoji };