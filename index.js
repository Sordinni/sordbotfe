require('dotenv').config();
const pino = require('pino');
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');

// ---------- Módulos auxiliares ----------
const { processImage }    = require('./src/processImage');
const { processVideo }    = require('./src/processVideo');
const { handleToggle }    = require('./src/toggleStretch');
const { handleSocialMediaDownload } = require('./src/social-downloader');
const { handleRenameSticker }       = require('./src/renameStickerMeta');
const { handleEmoji }     = require('./src/processEmoji');

/* ---------- Logger ---------- */
const logger = pino({ level: 'fatal' });

function logAction(action, user, chat, start = Date.now()) {
  const elapsed = Date.now() - start;
  const ts = new Date().toLocaleString('pt-BR');
  console.log(
    `\x1b[36m[${ts}]\x1b[0m ` +
    `\x1b[33m${action}\x1b[0m – ` +
    `\x1b[32m${user || 'Desconhecido'}\x1b[0m ` +
    `no grupo \x1b[35m${chat?.name || chat}\x1b[0m ` +
    `(\x1b[31m${elapsed}ms\x1b[0m)`
  );
}

/* ---------- Inicialização ---------- */
async function start() {
  const { version } = await fetchLatestBaileysVersion();
  const { state, saveCreds } = await useMultiFileAuthState('./sessão');

  const sock = makeWASocket({
    version,
    logger,
    auth: state,
    browser: ['SordBOT-FE', 'Chrome', '1.0.0'],
    markOnlineOnConnect: false,
  });

  let msgCount = 0;

  async function cleanCache() {
    console.log('🧹 200 msgs – limpando caches...');
    msgCount = 0;
    console.log('✅ Cache limpo (simulado)');
  }

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const qrcode = require('qrcode-terminal');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Conexão fechada. Reconectando...', shouldReconnect);
      if (shouldReconnect) start();
    } else if (connection === 'open') {
      console.log('🤖 SordBOT FE conectado!');
    }
  });

  /* ---------- Handler de mensagens ---------- */
  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      if (!msg.message) continue;
      const isGroup = msg.key.remoteJid.endsWith('@g.us');
      if (!isGroup) continue;

      msgCount++;
      if (msgCount >= 200) await cleanCache();

      const safeMessage = {
        ...msg,
        message: msg.message || {},
        key: msg.key || {},
        pushName: msg.pushName || 'Desconhecido',
      };

      const body = safeMessage.message.conversation || safeMessage.message.extendedTextMessage?.text || '';
      const lower = body.trim().toLowerCase();
      let processed = false;

      /* ---------- AJUDA ---------- */
      if (lower === '!ajuda' || lower === 'ajuda') {
        const t0 = Date.now();
        await sendHelp(sock, safeMessage.key.remoteJid, { quoted: safeMessage });
        logAction('Comando ajuda executado', safeMessage.pushName, { name: safeMessage.key.remoteJid }, t0);
        processed = true;
      }

      /* ---------- ALTERNAR ---------- */
      if (!processed) {
        const t1 = Date.now();
        const toggled = await handleToggle(sock, safeMessage);
        if (toggled) {
          logAction('Comando alternar executado', safeMessage.pushName, { name: safeMessage.key.remoteJid }, t1);
          processed = true;
        }
      }

      /* ---------- RENOMEAR ---------- */
      if (!processed) {
        const t2 = Date.now();
        const renamed = await handleRenameSticker(sock, safeMessage);
        if (renamed) {
          logAction('Comando renomear executado', safeMessage.pushName, { name: safeMessage.key.remoteJid }, t2);
          processed = true;
        }
      }

      /* ---------- DOWNLOAD REDE SOCIAL ---------- */
      if (!processed) {
        const t3 = Date.now();
        const socialProcessed = await handleSocialMediaDownload(sock, safeMessage);
        if (socialProcessed) {
          logAction('Download de mídia social executado', safeMessage.pushName, { name: safeMessage.key.remoteJid }, t3);
          processed = true;
        }
      }

      /* ---------- FIG ---------- */
      if (!processed && lower === 'fig') {
        const t4 = Date.now();
        const quoted = safeMessage.message.extendedTextMessage?.contextInfo?.quotedMessage;
        if (!quoted) {
          await sock.sendMessage(safeMessage.key.remoteJid, {
            text: '❕ Responda uma imagem, vídeo ou GIF com *fig* para virar sticker.',
          }, { quoted: safeMessage });
          logAction('Tentativa de fig sem mídia respondida', safeMessage.pushName, { name: safeMessage.key.remoteJid }, t4);
          processed = true;
        } else {
          const type = Object.keys(quoted)[0];
          switch (type) {
            case 'imageMessage':
              await processImage(sock, quoted.imageMessage, safeMessage);
              logAction('Sticker criado (imagem via fig)', safeMessage.pushName, { name: safeMessage.key.remoteJid }, t4);
              processed = true;
              break;
            case 'videoMessage':
              await processVideo(sock, quoted.videoMessage, safeMessage);
              logAction('Sticker animado criado (vídeo via fig)', safeMessage.pushName, { name: safeMessage.key.remoteJid }, t4);
              processed = true;
              break;
            default:
              await sock.sendMessage(safeMessage.key.remoteJid, {
                text: '❕ A mensagem respondida não é uma mídia válida.',
              }, { quoted: safeMessage });
              logAction('Tentativa de fig com mídia inválida', safeMessage.pushName, { name: safeMessage.key.remoteJid }, t4);
              processed = true;
          }
        }
      }

      /* ---------- EMOJI ---------- */
      if (!processed) {
        const t5 = Date.now();
        const emojiSent = await handleEmoji(sock, safeMessage);
        if (emojiSent) {
          logAction('Sticker de emoji criado', safeMessage.pushName, { name: safeMessage.key.remoteJid }, t5);
          processed = true;
        }
      }

      /* ---------- MÍDIA DIRETA ---------- */
      if (!processed) {
        const t6 = Date.now();
        const type = Object.keys(safeMessage.message)[0];
        switch (type) {
          case 'imageMessage':
            await processImage(sock, safeMessage.message.imageMessage, safeMessage);
            logAction('Sticker criado (imagem direta)', safeMessage.pushName, { name: safeMessage.key.remoteJid }, t6);
            processed = true;
            break;
          case 'videoMessage':
            await processVideo(sock, safeMessage.message.videoMessage, safeMessage);
            logAction('Sticker animado criado (vídeo direto)', safeMessage.pushName, { name: safeMessage.key.remoteJid }, t6);
            processed = true;
            break;
        }
      }
    }
  });
}

/* ---------- Ajuda ---------- */
async function sendHelp(sock, jid, quote) {
  const text = `🤖 *SordBOT FE – Central de Ajuda*

*Como usar*
• 📷 Envie uma imagem → vira sticker
• 🎥 Envie vídeo/GIF (até 10 s) → sticker animado
• ⬇️ Envie link de Twitter, Instagram, TikTok ou Pinterest → baixa mídia
Comandos:
• \`ajuda\` → esta mensagem
• \`alternar\` → liga/desliga stretch
• \`fig\` → responda mídia com fig para virar sticker
• \`renomear "nome" "autor"\` → renomeia os stickers
Extras:
• Cache limpo a cada 200 mensagens
• Só funciona em grupos`;
await sock.sendMessage(jid, { text }, quote);
}
/* ---------- Start ---------- */
start().catch(console.error);