const { createCanvas, loadImage } = require('canvas');
const sharp = require('sharp');
const fs   = require('fs');
const path = require('path');
const { decryptMedia } = require('@open-wa/wa-decrypt');
const uaOverride = 'WhatsApp/2.2029.4 Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.116 Safari/537.36';
const crypto = require('crypto');

const FAV_FILE = path.join(__dirname, '..', 'favs.json');
const DELAY_MS = 1500; // 1,5 s entre cada sticker (ajuste aqui)



function hashFromBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('base64');
}

function loadFavs() {
  if (!fs.existsSync(FAV_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(FAV_FILE, 'utf-8'));
  } catch (_) {
    return {};
  }
}
function saveFavs(data) {
  fs.writeFileSync(FAV_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

async function handleGuardar(client, message) {
  if (!message.isGroupMsg) return false;
  if (!message.quotedMsg || message.quotedMsg.type !== 'sticker') {
    await client.reply(
      message.chatId,
      '❕ Responda um *sticker* com *guardar* para salvá-lo.',
      message.id
    );
    return false;
  }

  const stickerMsg = message.quotedMsg;
  const userNumber = message.sender.id;

  try {
    // 1. hash para nome do arquivo
    const fileHash = await client.favSticker(stickerMsg.id, true);
    const safeName = fileHash.replace(/\//g, '_');

    // 2. descriptografa 
    const mediaData = await decryptMedia(stickerMsg, uaOverride);

    // 3. converte WebP -> JPEG com sharp
    const jpgBuffer = await sharp(mediaData)
                          .jpeg({ quality: 92 })
                          .toBuffer();

    // 4. salva o JPG convertido
    const STICKERS_DIR = path.join(__dirname, '..', 'stickers');
    if (!fs.existsSync(STICKERS_DIR)) fs.mkdirSync(STICKERS_DIR, { recursive: true });

    const jpgPath = path.join(STICKERS_DIR, `${safeName}.jpg`);
    fs.writeFileSync(jpgPath, jpgBuffer);

    // 5. atualiza favs.json
    const favs = loadFavs();
    if (!favs[userNumber]) favs[userNumber] = [];
    if (!favs[userNumber].includes(fileHash)) favs[userNumber].push(fileHash);
    saveFavs(favs);

    await client.reply(message.chatId, '✅ Sticker guardado com sucesso!', message.id);
    return true;

  } catch (err) {
    console.error('Erro ao guardar sticker:', err);
    await client.reply(message.chatId, '❌ Não consegui guardar esse sticker.', message.id);
    return false;
  }
}

async function handleEnviarFavs(client, message) {
  if (!message.isGroupMsg) return false;
  const userNumber = message.sender.id;
  const favs = loadFavs();
  const userFavs = favs[userNumber] || [];

  if (userFavs.length === 0) {
    await client.reply(message.chatId,
      '❕ Você ainda não guardou nenhum sticker.',
      message.id);
    return false;
  }

  await client.reply(message.chatId,
    `⭐ Enviando ${userFavs.length} sticker(s) guardado(s)…`,
    message.id);

  for (const hash of userFavs) {
    try {
      await client.sendFavSticker(message.chatId, hash);
      await new Promise(r => setTimeout(r, DELAY_MS)); // 1,5 s (padrão)
    } catch (err) {
      console.error('Erro ao enviar fav:', err);
    }
  }
  return true;
}

async function handleFavLista(client, message) {
  if (!message.isGroupMsg) return false;

  const userNumber = message.sender.id;
  const favs = loadFavs();
  const userFavs = favs[userNumber] || [];

  if (userFavs.length === 0) {
    await client.reply(message.chatId,
      '❕ Você ainda não guardou nenhum sticker.',
      message.id);
    return false;
  }

  const args = (message.body || '').trim().split(/\s+/);
  let page = 1;
  if (args[2] && !isNaN(args[2])) page = Math.max(1, parseInt(args[2], 10));

  const PER_PAGE = 16;              // 4×4 grid
  const totalPages = Math.ceil(userFavs.length / PER_PAGE);

  if (page > totalPages) {
    await client.reply(message.chatId,
      `❕ Só existem ${totalPages} página(s).`,
      message.id);
    return false;
  }

  const start = (page - 1) * PER_PAGE;
  const end   = start + PER_PAGE;
  const slice = userFavs.slice(start, end);

  await client.reply(message.chatId,
    `🖼️ Gerando página ${page}/${totalPages} da sua colagem…`,
    message.id);

  try {
    const STICKERS_DIR = path.join(__dirname, '..', 'stickers');
    const COLLAGE_SIZE = 1080;
    const COLS = 4;
    const THUMB_SIZE = COLLAGE_SIZE / COLS;

    const canvas = createCanvas(COLLAGE_SIZE, COLLAGE_SIZE);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, COLLAGE_SIZE, COLLAGE_SIZE);

    let x = 0, y = 0;

    for (const [idx, hash] of slice.entries()) {
      const safeName = hash.replace(/\//g, '_');
      const jpgPath  = path.join(STICKERS_DIR, `${safeName}.jpg`);

      if (!fs.existsSync(jpgPath)) continue; // pula faltantes

      const img = await loadImage(jpgPath);
      ctx.drawImage(img, x, y, THUMB_SIZE, THUMB_SIZE);

      x += THUMB_SIZE;
      if (x >= COLLAGE_SIZE) { x = 0; y += THUMB_SIZE; }
    }

    const tempPageFile = path.join(__dirname, '..', `temp_collage_p${page}.png`);
    const out = fs.createWriteStream(tempPageFile);
    const stream = canvas.createPNGStream();
    stream.pipe(out);
    await new Promise((res, rej) => {
      out.once('finish', res);
      out.once('error', rej);
    });

    await client.sendImage(
      message.chatId,
      tempPageFile,
      `colagem_p${page}.png`,
      `⭐ Página ${page}/${totalPages} dos seus favoritos!`
    );
    fs.unlinkSync(tempPageFile);

    return true;

  } catch (err) {
    console.error('[handleFavLista] outer catch:', err);
    await client.reply(message.chatId,
      '❌ Erro ao montar a colagem.',
      message.id);
    return false;
  }
}

async function autoSaveSticker(userId, mediaBuffer) {
  const STICKERS_DIR = path.join(__dirname, '..', 'stickers');
  if (!fs.existsSync(STICKERS_DIR)) fs.mkdirSync(STICKERS_DIR, { recursive: true });

  // converte para JPG
  const jpgBuffer = await sharp(mediaBuffer)
                        .jpeg({ quality: 92 })
                        .toBuffer();

  const fileHash = hashFromBuffer(jpgBuffer);
  const safeName = fileHash.replace(/\//g, '_');
  const jpgPath    = path.join(STICKERS_DIR, `${safeName}.jpg`);

  fs.writeFileSync(jpgPath, jpgBuffer);

  // atualiza favs.json
  const favs = loadFavs();
  if (!favs[userId]) favs[userId] = [];
  if (!favs[userId].includes(fileHash)) favs[userId].push(fileHash);
  saveFavs(favs);

  return fileHash;
}

module.exports = {
  handleGuardar,
  handleEnviarFavs,
  handleFavLista,
  autoSaveSticker
};