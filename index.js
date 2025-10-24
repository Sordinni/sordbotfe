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

        const userJid = msg.key.participant || msg.key.remoteJid;
        const lid = msg.key.participantAlt || msg.key.remoteJidAlt || null;

        const finalJid = lid || userJid

        const isAvisos = await isUserInAvisosGroup(sock, finalJid);

        if (!isAvisos) {
          await sleep(r(1000, 3000));
          await sock.updateBlockStatus(finalJid, 'block');
          return;
        }

        const helpAliases = [
          '!ajuda', 'ajuda', '!help', 'help', '!comandos', 'comandos', '!cmds', 'cmds',
          '!menu', 'menu', '!lista', 'lista', '!bot', 'bot',
          '!suporte', 'suporte', '!funcoes', 'funcoes', '!funções', 'funções'
        ];

        if (helpAliases.includes(lower)) {
          await sleep(r(1000, 3000));
          await sendHelp(sock, safeMessage.key.remoteJid, { quoted: safeMessage });
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
            await sock.sendMessage(
              safeMessage.key.remoteJid,
              { text: '❕ Responda uma imagem, vídeo ou GIF com *fig* para virar sticker.' },
              { quoted: safeMessage }
            );
            logAction('Tentativa de fig sem mídia respondida', safeMessage.pushName, Date.now());
            processed = true;
            continue;
          }

          const limit = checkLimit(userJid, true);
          if (!limit.allowed) {
            logAction('Rate-limit bloqueou figurinha', safeMessage.pushName, Date.now());
            processed = true;
            continue;
          }
          if (limit.blockedNow) {
            await sleep(r(1000, 3000));
            await sock.sendMessage(
              userJid,
              { text: `⏳ Você atingiu 5 figurinhas. Aguarde 6 minutos para criar novamente.` },
              { quoted: safeMessage }
            );
          }

          const type = Object.keys(quoted)[0];
          switch (type) {
            case 'imageMessage':
              await processImage(sock, quoted.imageMessage, safeMessage);
              logAction('Sticker criado (imagem via fig)', safeMessage.pushName, Date.now());
              incSticker(userJid, msg.pushName, 'static');
              processed = true;
              break;
            case 'videoMessage':
              await processVideo(sock, quoted.videoMessage, safeMessage);
              logAction('Sticker animado criado (vídeo via fig)', safeMessage.pushName, Date.now());
              incSticker(userJid, msg.pushName, 'animated');
              processed = true;
              break;
            default:
              await sleep(r(1000, 3000));
              await sock.sendMessage(
                safeMessage.key.remoteJid,
                { text: '❕ A mensagem respondida não é uma mídia válida.' },
                { quoted: safeMessage }
              );
              logAction('Tentativa de fig com mídia inválida', safeMessage.pushName, Date.now());
              processed = true;
          }
        }

        if (!processed && lower === 'stats') {
          const { getStats } = require('./src/utils');
          const st = getStats(userJid);
          const nome = msg.pushName || 'Você';
          const total = st.stickers.static + st.stickers.animated;
          const texto =
            `*Suas estatísticas, ${nome}*\n\n` +
            `📦 Total de figurinhas: ${total}\n` +
            `       *Figurinhas*: ${st.stickers.static}\n` +
            `       *Figurinhas animadas*: ${st.stickers.animated}\n` +
            `📅 Primeiro uso: ${new Date(st.firstSeen).toLocaleString('pt-BR')}`;

          await sleep(r(1000, 3000));
          await sock.sendMessage(safeMessage.key.remoteJid, { text: texto }, { quoted: safeMessage });
          processed = true;
        }

        if (!processed && (lower === 'info' || lower === '!info')) {
          const repo = 'https://github.com/Sordinni/sordbotfe';
          const vcard =
            'BEGIN:VCARD\n' +
            'VERSION:3.0\n' +
            'FN:Juan Sordinni\n' +
            'ORG:SordBOT;\n' +
            'TEL;type=CELL;type=VOICE;waid=32472916180:+32 472 91 61 80\n' +
            'END:VCARD';
          const texto =
            `🔴 *So𝘳dBOT Rouge*\n` +
            `🔖 *Versão:* \´d2410h1730\´ \n\n` +
            `💰 *Gastos*\n` +
            `- Número (Rouge): €18,99/mês\n` +
            `- Número (Noir): €18,99/mês\n` +
            `- VPS 16GB 8vCPU: €35,99/mês\n\n` +
            `📅 *Online desde:* ${startTime.toLocaleString('pt-BR')}\n\n` +
            `📦 *Bibliotecas*\n` +
            `- @whiskeysockets/baileys\n` +
            `- @open-wa/wa-automate\n\n` +
            `📦 *Código-fonte:*\n${repo}\n\n` +
            `💡 Dúvidas ou alguma sugestão? Fale com o contato abaixo.`;

          await sleep(r(1000, 3000));
          await sock.sendMessage(safeMessage.key.remoteJid, { text: texto }, { quoted: safeMessage });
          await sleep(r(1000, 3000));
          await sock.sendMessage(
            safeMessage.key.remoteJid,
            {
              contacts: {
                displayName: 'Juan Sordinni',
                contacts: [{ vcard }]
              }
            }
          );
          logAction('Comando info executado', safeMessage.pushName, Date.now());
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
              const limit = checkLimit(userJid, true);
              if (!limit.allowed) {
                const { min, sec } = limit.remaining;
                await sleep(r(1000, 3000));
                await sock.sendMessage(
                  userJid,
                  { text: `⏳ Limite atingido! Aguarde *${min}* minutos e *${sec}* segundos.` },
                  { quoted: safeMessage }
                );
                logAction('Rate-limit bloqueou figurinha (imagem direta)', safeMessage.pushName, Date.now());
                processed = true;
                break;
              }
              if (limit.blockedNow) {
                await sleep(r(1000, 3000));
                await sock.sendMessage(
                  userJid,
                  { text: `⏳ Você atingiu 5 figurinhas. Aguarde 6 minutos para criar novamente.` },
                  { quoted: safeMessage }
                );
              }
              await processImage(sock, safeMessage.message.imageMessage, safeMessage);
              logAction('Sticker criado (imagem direta)', safeMessage.pushName, Date.now());
              incSticker(userJid, msg.pushName, 'static');
              processed = true;
              break;
            }
            case 'videoMessage': {
              const limit = checkLimit(userJid, true);
              if (!limit.allowed) {
                const { min, sec } = limit.remaining;
                await sleep(r(1000, 3000));
                await sock.sendMessage(
                  userJid,
                  { text: `⏳ Limite atingido! Aguarde *${min}* minutos e *${sec}* segundos.` },
                  { quoted: safeMessage }
                );
                logAction('Rate-limit bloqueou figurinha (vídeo direto)', safeMessage.pushName, Date.now());
                processed = true;
                break;
              }
              if (limit.blockedNow) {
                await sleep(r(1000, 3000));
                await sock.sendMessage(
                  userJid,
                  { text: `⏳ Você atingiu 5 figurinhas. Aguarde 6 minutos para criar novamente.` },
                  { quoted: safeMessage }
                );
              }
              await processVideo(sock, safeMessage.message.videoMessage, safeMessage);
              logAction('Sticker animado criado (vídeo direto)', safeMessage.pushName, Date.now());
              incSticker(userJid, msg.pushName, 'animated');
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