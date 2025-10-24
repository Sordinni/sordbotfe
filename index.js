require('dotenv').config();
const pino = require('pino');
const {
  default: makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');

const { processImage } = require('./src/processImage');
const { processVideo } = require('./src/processVideo');
const { handleToggle } = require('./src/toggleStretch');
const { handleSocialMediaDownload } = require('./src/social-downloader');
const { handleRenameSticker } = require('./src/renameStickerMeta');
const { handleEmoji } = require('./src/processEmoji');
const { handlePing } = require('./src/ping');
const { isUserInAvisosGroup, sendHelp, logAction, handleAdminResponse, incSticker } = require('./src/utils');
const { checkLimit, sendLimitStatus } = require('./src/rateLimiteSticker');

const logger = pino({ level: 'fatal' });
let startTime = new Date();

let qrAttempts = 0;
const MAX_QR = 5;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const r = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

async function start() {
  try {
    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('./sessao');

    const sock = makeWASocket({
      version,
      logger,
      auth: state,
      browser: ['SordBOT-Privado', 'macOS', '14.4.1'],
      markOnlineOnConnect: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && qrAttempts < MAX_QR) {
        qrAttempts++;
        const qrcode = require('qrcode-terminal');
        qrcode.generate(qr, { small: true });
      }

      if (connection === 'close') {
        const shouldReconnect =
          (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
        console.log('Conexão fechada. Reconectando...', shouldReconnect);
        if (shouldReconnect) start();
      } else if (connection === 'open') {
        qrAttempts = 0;
        console.log('🤖 SordBOT Privado conectado!');
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;

      for (const msg of messages) {
        if (!msg.message) continue;

        // grupo de admins
        if (msg.key.remoteJid === '120363287595102262@g.us') {
          await handleAdminResponse(sock, msg);
          continue;
        }

        const isPrivate = !msg.key.remoteJid.endsWith('@g.us');
        if (!isPrivate) continue;

        const safeMessage = {
          ...msg,
          message: msg.message || {},
          key: msg.key || {},
          pushName: msg.pushName || 'Desconhecido',
        };

        const body =
          safeMessage.message.conversation ||
          safeMessage.message.extendedTextMessage?.text ||
          '';
        const lower = body.trim().toLowerCase();
        let processed = false;

        // Função para sempre priorizar LID
        const extractLid = (jid, alt) => (jid?.endsWith('@lid') ? jid : alt) || jid;

        // Identificação LID segura
        const userLid = extractLid(msg.key.remoteJid, msg.key.remoteJidAlt);
        const senderLid = extractLid(msg.key.participant, msg.key.participantAlt);

        // Determina o alvo certo
        const userId = senderLid || userLid;

        const isAvisos = await isUserInAvisosGroup(sock, userId);

        if (!isAvisos) {
          await sleep(r(1000, 3000));
          await sock.updateBlockStatus(userId, 'block');
          return;
        }

        const helpAliases = [
          '!ajuda', 'ajuda', '!help', 'help', '!comandos', 'comandos', '!cmds', 'cmds',
          '!menu', 'menu', '!lista', 'lista', '!bot', 'bot',
          '!suporte', 'suporte', '!funcoes', 'funcoes', '!funções', 'funções'
        ];

        if (helpAliases.includes(lower)) {
          await sleep(r(1000, 3000));
          await sendHelp(sock, userId, { quoted: safeMessage });
          logAction('Comando ajuda executado', safeMessage.pushName, Date.now());
          processed = true;
        }

        const limitAliases = ['!limite', 'limite', '!limit', 'limit'];
        if (!processed && limitAliases.includes(lower)) {
          await sleep(r(1000, 3000));
          await sendLimitStatus(sock, safeMessage);
          logAction('Comando limite executado', safeMessage.pushName, Date.now());
          processed = true;
        }

        if (!processed) {
          const toggled = await handleToggle(sock, safeMessage);
          if (toggled) {
            logAction('Comando alternar executado', safeMessage.pushName, Date.now());
            processed = true;
          }
        }
        if (!processed) {
          const renamed = await handleRenameSticker(sock, safeMessage);
          if (renamed) {
            logAction('Comando renomear executado', safeMessage.pushName, Date.now());
            processed = true;
          }
        }

        if (!processed) {
          const socialProcessed = await handleSocialMediaDownload(sock, safeMessage);
          if (socialProcessed) {
            logAction('Download de mídia social executado', safeMessage.pushName, Date.now());
            processed = true;
          }
        }

        if (!processed && lower === 'fig') {
          const quoted = safeMessage.message.extendedTextMessage?.contextInfo?.quotedMessage;
          if (!quoted) {
            await sleep(r(1000, 3000));
            await sock.sendMessage(userId, { text: '❕ Responda uma imagem, vídeo ou GIF com *fig* para virar sticker.' }, { quoted: safeMessage });
            logAction('Tentativa de fig sem mídia respondida', safeMessage.pushName, Date.now());
            processed = true;
            continue;
          }

          const limit = checkLimit(userId, true);
          if (!limit.allowed) {
            logAction('Rate-limit bloqueou figurinha', safeMessage.pushName, Date.now());
            processed = true;
            continue;
          }
          if (limit.blockedNow) {
            await sleep(r(1000, 3000));
            await sock.sendMessage(userId, { text: `⏳ Você atingiu 5 figurinhas. Aguarde 6 minutos.` }, { quoted: safeMessage });
          }

          const type = Object.keys(quoted)[0];
          switch (type) {
            case 'imageMessage':
              await processImage(sock, quoted.imageMessage, safeMessage);
              logAction('Sticker criado (imagem via fig)', safeMessage.pushName, Date.now());
              incSticker(userId, msg.pushName, 'static');
              processed = true;
              break;
            case 'videoMessage':
              await processVideo(sock, quoted.videoMessage, safeMessage);
              logAction('Sticker animado criado (vídeo via fig)', safeMessage.pushName, Date.now());
              incSticker(userId, msg.pushName, 'animated');
              processed = true;
              break;
          }
        }

        if (!processed && lower === 'stats') {
          const { getStats } = require('./src/utils');
          const st = getStats(userId);
          const nome = msg.pushName || 'Você';
          const total = st.stickers.static + st.stickers.animated;
          const texto =
            `*Suas estatísticas, ${nome}*\n\n` +
            `📦 Total: ${total}\n` +
            `🖼️ Estáticas: ${st.stickers.static}\n` +
            `🎞️ Animadas: ${st.stickers.animated}\n` +
            `📅 Desde: ${new Date(st.firstSeen).toLocaleString('pt-BR')}`;
          await sleep(r(1000, 3000));
          await sock.sendMessage(userId, { text: texto }, { quoted: safeMessage });
          processed = true;
        }

        if (!processed && (lower === 'info' || lower === '!info')) {
          const texto =
            `🔴 *So𝘳dBOT Rouge*\n` +
            `🧩 *Versão:* d2410h1805\n` +
            `📅 *Online desde:* ${startTime.toLocaleString('pt-BR')}\n\n` +
            `💰 *Gastos Mensais*\n- Números: €37,98\n- VPS 16GB: €35,99\n\n` +
            `📦 *Libs:* Baileys v7, NodeJS\n\n` +
            `💡 Dúvidas ou sugestões? Fale com o criador.`;
          await sleep(r(1000, 3000));
          await sock.sendMessage(userId, { text: texto }, { quoted: safeMessage });
          processed = true;
        }

        if (!processed && lower === 'ping') {
          await sleep(r(1000, 3000));
          await handlePing(sock, safeMessage);
          logAction('Comando ping executado', safeMessage.pushName, Date.now());
          processed = true;
        }

        if (!processed) {
          const emojiSent = await handleEmoji(sock, safeMessage);
          if (emojiSent) {
            logAction('Sticker de emoji criado', safeMessage.pushName, Date.now());
            processed = true;
          }
        }

        if (!processed) {
          const type = Object.keys(safeMessage.message)[0];
          switch (type) {
            case 'imageMessage': {
              const limit = checkLimit(userId, true);
              if (!limit.allowed) {
                const { min, sec } = limit.remaining;
                await sock.sendMessage(userId, { text: `⏳ Aguarde ${min}min ${sec}s.` }, { quoted: safeMessage });
                processed = true;
                break;
              }
              await processImage(sock, safeMessage.message.imageMessage, safeMessage);
              incSticker(userId, msg.pushName, 'static');
              processed = true;
              break;
            }
            case 'videoMessage': {
              const limit = checkLimit(userId, true);
              if (!limit.allowed) {
                await sock.sendMessage(userId, { text: `⏳ Aguarde um pouco.` }, { quoted: safeMessage });
                processed = true;
                break;
              }
              await processVideo(sock, safeMessage.message.videoMessage, safeMessage);
              incSticker(userId, msg.pushName, 'animated');
              processed = true;
              break;
            }
          }
        }
      }
    });
  } catch (err) {
    console.error('Erro fatal ao iniciar:', err);
    process.exit(1);
  }
}

module.exports = { get startTime() { return startTime; } };

start().catch(console.error);
