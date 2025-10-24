const { instagramGetUrl } = require("instagram-url-direct");
const { pinterest } = require('btch-downloader');
const download = require('yt-stream');
const { tikdown, twitterdown } = require("cyber-media-downloader");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// ---------- Funções auxiliares ----------
function createTempFilePath(url) {
  if (!url || typeof url !== 'string') url = 'https://example.com/fallback.tmp';
  const tempDir = path.join(__dirname, 'temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  let ext = 'tmp';
  try { ext = path.extname(new URL(url).pathname).slice(1) || 'tmp'; } catch {}
  if (ext === 'tmp') {
    if (url.includes('.mp4') || url.includes('video')) ext = 'mp4';
    else if (url.includes('.jpg') || url.includes('.jpeg')) ext = 'jpg';
    else if (url.includes('.png')) ext = 'png';
    else if (url.includes('.gif')) ext = 'gif';
  }
  const stamp = Date.now() + '_' + Math.random().toString(36).slice(-6);
  return path.join(tempDir, `media_${stamp}.${ext}`);
}

async function downloadFile(url, filePath) {
  try {
    const response = await axios({
      method: 'GET',
      url,
      responseType: 'stream',
      timeout: 60000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36',
        Referer: 'https://www.youtube.com/'
      }
    });
    return new Promise((resolve, reject) => {
      const writer = fs.createWriteStream(filePath);
      response.data.pipe(writer);
      writer.on('finish', () => resolve(filePath));
      writer.on('error', reject);
    });
  } catch (error) {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    throw new Error(`Falha ao baixar ${url.substring(0, 50)}...`);
  }
}

function cleanupTempFiles(filePaths) {
  filePaths.forEach(filePath => {
    if (fs.existsSync(filePath)) {
      try { fs.unlinkSync(filePath); } catch (e) { console.error('Erro ao remover temp:', e); }
    }
  });
}

async function processInstagramMedia(mediaData) {
  if (!mediaData?.url_list?.length) throw new Error('Nenhuma mídia no Instagram');
  const seen = new Set();
  const out = [];
  for (const u of mediaData.url_list) {
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push({ url: u, type: u.includes('.mp4') ? 'video' : 'image' });
  }
  return out;
}

async function processPinterestMedia(mediaData) {
  const m = mediaData?.result?.result || mediaData?.result || mediaData;
  if (!m?.url && !m?.image) throw new Error('Nenhuma mídia no Pinterest');
  const url = m.url || m.image;
  return [{ url, type: url.includes('.mp4') ? 'video' : 'image' }];
}

async function processTikTokMedia(tiktokData) {
  if (!tiktokData?.status || !tiktokData.data) throw new Error('Falha no TikTok');
  const data = tiktokData.data;
  const medias = [];
  if (data.images?.length) {
    data.images.forEach(u => medias.push({ url: u, type: 'image', caption: '' }));
  } else if (data.video) {
    medias.push({ url: data.video, type: 'video', caption: '' });
  }
  if (!medias.length) throw new Error('Nenhuma mídia no TikTok');
  return medias;
}

async function processTwitterMedia(mediaData) {
  if (!mediaData?.status || !mediaData.data) throw new Error('Falha no Twitter');
  const d = mediaData.data;
  if (d.HD || d.SD) return [{ url: d.HD || d.SD, type: 'video' }];
  if (d.image) return [{ url: d.image, type: 'image' }];
  throw new Error('Nenhuma mídia no Twitter');
}

async function processYouTubeMedia(url, quality = '720p') {
  try {
    const stream = download(url, { quality, type: 'video' });
    const tempDir = path.join(__dirname, 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const filePath = path.join(tempDir, `yt_${Date.now()}.mp4`);
    await new Promise((resolve, reject) => {
      const write = fs.createWriteStream(filePath);
      stream.pipe(write);
      write.on('finish', resolve);
      write.on('error', reject);
    });
    const caption = `YouTube\n🔗 ${url}`;
    return [{ url: filePath, type: 'video', caption, localFile: true }];
  } catch (e) {
    throw new Error('Não consegui baixar este vídeo do YouTube.');
  }
}

// ---------- Envio de mídia ----------
async function downloadAndSendMedia(sock, message, media, fullMsg = message) {
  const url = typeof media.url === 'string' ? media.url : media.url?.url;
  if (!url || typeof url !== 'string') throw new Error('URL inválida para download.');

  const filePath = media.localFile ? url : createTempFilePath(url);
  if (!media.localFile) await downloadFile(url, filePath);

  const caption = media.caption || '';

  if (media.type === 'video') {
    await sock.sendMessage(message.key.remoteJid, {
      video: fs.readFileSync(filePath),
      caption},
      {quoted: fullMsg}
    );
  } else if (media.type === 'image') {
    await sock.sendMessage(message.key.remoteJid, {
      image: fs.readFileSync(filePath),
      caption},
      {quoted: fullMsg}
    );
  } else if (media.type === 'audio') {
    await sock.sendMessage(message.key.remoteJid, {
      audio: fs.readFileSync(filePath),
      ptt: true},
      {quoted: fullMsg}
    );
  } else {
    await sock.sendMessage(message.key.remoteJid, {
      document: fs.readFileSync(filePath),
      fileName: 'arquivo.bin',
      caption},
      {quoted: fullMsg}
    );
  }

  return filePath;
}

// ---------- Handler principal ----------
async function handleSocialMediaDownload(sock, message) {
  if (!message?.key?.remoteJid || !message?.message) return false;

  const tempFiles = [];
  let platform = 'Mídia Social';

  try {
    const text = message.message.conversation ||
                 message.message.extendedTextMessage?.text ||
                 '';
    const urlMatch = text.trim().match(/https?:\/\/[^\s]+/);
    if (!urlMatch) return false;
    const url = urlMatch[0];

    let mediaProcessor;
    if (url.includes('instagram.com/') || url.includes('instagr.am/')) {
      platform = 'Instagram';
      mediaProcessor = () => instagramGetUrl(url).then(processInstagramMedia);
    } else if (url.includes('pinterest.com/') || url.includes('pin.it/')) {
      platform = 'Pinterest';
      mediaProcessor = () => pinterest(url).then(processPinterestMedia);
    } else if (url.includes('tiktok.com/') || url.includes('vm.tiktok.com/') || url.includes('vt.tiktok.com/')) {
      platform = 'TikTok';
      mediaProcessor = () => tikdown(url).then(processTikTokMedia);
    } else if (url.includes('twitter.com/') || url.includes('x.com/') || url.includes('t.co/')) {
      platform = 'Twitter';
      mediaProcessor = () => twitterdown(url).then(processTwitterMedia);
    } else if (url.includes('youtube.com/') || url.includes('youtu.be/')) {
      platform = 'YouTube';
      mediaProcessor = () => processYouTubeMedia(url, '720');
    } else {
      return false;
    }

    await sock.sendMessage(message.key.remoteJid, { react: { text: '🟠', key: message.key } });

    const medias = await mediaProcessor();
    if (!medias || medias.length === 0) {
      await sock.sendMessage(message.key.remoteJid, {
        text: `❌ Nenhuma mídia encontrada no link do ${platform}.`,
        quoted: message
      });
      await sock.sendMessage(message.key.remoteJid, { react: { text: '🔴', key: message.key } });
      return true;
    }

    for (const media of medias) {
      try {
        const filePath = await downloadAndSendMedia(sock, message, media);
        if (filePath && !media.localFile) tempFiles.push(filePath);
      } catch (err) {
        console.error(`❌ Falha ao enviar mídia de ${platform}:`, err);
        await sock.sendMessage(message.key.remoteJid, {
          text: `⚠️ Erro em uma das mídias: ${err.message}`,
          quoted: message
        });
      }
    }

    await sock.sendMessage(message.key.remoteJid, { react: { text: '🟢', key: message.key } });
    return true;
  } catch (error) {
    console.error(`❌ Erro ao processar ${platform}:`, error);
    await sock.sendMessage(message.key.remoteJid, {
      text: `❌ ${error.message}`,
      quoted: message
    });
    await sock.sendMessage(message.key.remoteJid, { react: { text: '🔴', key: message.key } });
    return true;
  } finally {
    if (tempFiles.length) setTimeout(() => cleanupTempFiles(tempFiles), 5000);
  }
}

module.exports = { handleSocialMediaDownload };