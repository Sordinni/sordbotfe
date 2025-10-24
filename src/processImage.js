const { downloadMediaMessage } = require('@whiskeysockets/baileys');
const { createCanvas, loadImage } = require('canvas');
const { getUseStretch, getUserMeta } = require('./utils');
const sharp = require('sharp');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const webp = require('node-webpmux');
const crypto = require('crypto');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const r = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function stretchImage(buffer) {
  const img = await loadImage(buffer);
  const max = Math.max(img.width, img.height);
  const canvas = createCanvas(max, max);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, max, max);
  return canvas.toBuffer('image/jpeg');
}

async function createSticker(buffer, pack, author) {
  try {
    const stickerBuffer = await sharp(buffer)
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90 })
      .toBuffer();

    const exifBuffer = await createExifBuffer(pack, author);
    const finalBuffer = await addExifToWebp(stickerBuffer, exifBuffer);

    return finalBuffer;
  } catch (err) {
    throw err;
  }
}

async function createExifBuffer(pack, author) {
  const json = {
    'sticker-pack-id': crypto.randomBytes(32).toString('hex'),
    'sticker-pack-name': pack,
    'sticker-pack-publisher': author,
  };
  const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
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

async function processImage(sock, mediaMsg, fullMsg) {
  try {
    const jid = fullMsg.key.remoteJid;
    const user = fullMsg.participant || fullMsg.key.remoteJid;
    const msgKey = fullMsg.key;

    await sock.sendMessage(jid, { react: { text: '🟠', key: msgKey } });

    const meta = getUserMeta(user) || {};
    const pack = meta.pack || 'figurinha por';
    const author = meta.author || 'So𝘳dBOT';

    const buffer = await downloadMediaMessage(
      { key: msgKey, message: { imageMessage: mediaMsg } },
      'buffer',
      {},
      { logger: sock.logger }
    );

    const finalBuffer = getUseStretch(user)
      ? await stretchImage(buffer)
      : buffer;

    const stickerBuffer = await createSticker(finalBuffer, pack, author);

    await sleep(r(1000, 3000));
    await sock.sendMessage(jid, {
      sticker: stickerBuffer,
      pack,
      author,
    }, { quoted: fullMsg });


    await sock.sendMessage(jid, { react: { text: '🟢', key: msgKey } });
  } catch (err) {
    console.error('Erro ao processar imagem:', err);
    await sock.sendMessage(jid, {
      text: '❌ Erro ao processar a imagem.'
    }, { quoted: fullMsg });
    await sock.sendMessage(jid, { react: { text: '🔴', key: fullMsg.key } });
  }
}

module.exports = { processImage };