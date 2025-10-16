// Carrega as dependências
const { create } = require('@open-wa/wa-automate');
const { processImage } = require('./src/processImage');
const { processVideo } = require('./src/processVideo');
const { processDocument } = require('./src/processDocument');
const { handleToggle } = require('./src/toggleStretch');
const { handleSocialMediaDownload } = require('./src/social-downloader');
const { handleRenameSticker } = require('./src/renameStickerMeta');
const { handleEmoji } = require('./src/processEmoji');
const { handleGuardar, handleEnviarFavs, handleFavLista} = require('./src/stickerManager'); // importa a função handleGuardar

// Configurações do SordBOT FE
const config = {
    sessionId: 'SordBOT_FE',
    multiDevice: true,
    authTimeout: 60,
    sessionDataPath: './sessão',
    blockCrashLogs: true,
    disableSpins: true,
    headless: true,
    hostNotificationLang: 'PT_BR',
    logConsole: false,
    popup: true,
    qrTimeout: 0,
};

// Inicia o bot
create(config)
    .then(start)
    .catch(console.error);

// Função para logar ações com detalhes e tempo decorrido
const logAction = (action, user, chat, start = Date.now()) => {
  const elapsed = Date.now() - start;
  const ts = new Date().toLocaleString('pt-BR');
  console.log(
    `\x1b[36m[${ts}]\x1b[0m ` +
    `\x1b[33m${action}\x1b[0m ` +
    `– \x1b[32m${user.pushname} (${user.id})\x1b[0m ` +
    `no grupo \x1b[35m${chat.name}\x1b[0m ` +
    `(\x1b[31m${elapsed}ms\x1b[0m)`
  );
};

async function start(client) {
    console.log('🤖 SordBOT FE iniciado!');

    let msgCount = 0;

    async function cleanCache() {
        console.log('🧹 200 msgs – limpando caches...');
        try {
            await client.cutChatCache();
            await client.cutMsgCache();
            console.log('✅ Cache limpo');
        } catch (e) {
            console.warn('⚠️ Falha ao limpar cache (pode estar vazio):', e.message);
        }
        msgCount = 0;
    }

client.onMessage(async (message) => {
  try {
    if (!message.isGroupMsg) return;          // ignora PV
    if (message.caption && message.caption.trim()) return; // ignora legendas

    msgCount++;
    if (msgCount >= 200) await cleanCache();

    const body = (message.body || '').trim().toLowerCase();
    let processed = false; // flag para saber se “fez algo”

    /* ---------- AJUDA ---------- */
    if (body === '!ajuda' || body === 'ajuda') {
      const t0 = Date.now();
      await sendHelp(client, message.chatId, message.id);
      logAction('Comando ajuda executado', message.sender, message.chat, t0);
      processed = true;
    }

    /* ---------- ALTERNAR ---------- */
    if (!processed) {
      const t1 = Date.now();
      const toggled = await handleToggle(client, message);
      if (toggled) {
        logAction('Comando alternar executado', message.sender, message.chat, t1);
        processed = true;
      }
    }

    /* ---------- RENOMEAR STICKER ---------- */
    if (!processed) {
      const t2 = Date.now();
      const renamed = await handleRenameSticker(client, message);
      if (renamed) {
        logAction('Comando renomear executado', message.sender, message.chat, t2);
        processed = true;
      }
    }

    /* ---------- DOWNLOAD REDE SOCIAL ---------- */
    if (!processed) {
      const t3 = Date.now();
      const socialProcessed = await handleSocialMediaDownload({
        client,
        message,
        sender: message.sender.id,
        groupId: message.chatId
      });
      if (socialProcessed) {
        logAction('Download de mídia social executado', message.sender, message.chat, t3);
        processed = true;
      }
    }

    /* ---------- FIG (resposta a mídia) ---------- */
    if (!processed && body === 'fig') {
      const t4 = Date.now();
      if (!message.quotedMsg) {
        await client.reply(
          message.chatId,
          '❕ Responda uma imagem, vídeo ou GIF com *fig* para virar sticker.',
          message.id
        );
        logAction('Tentativa de fig sem mídia respondida', message.sender, message.chat, t4);
        processed = true;
      } else {
        const quoted = message.quotedMsg;
        switch (quoted.type) {
          case 'image':
            await processImage(client, quoted);
            logAction('Sticker criado (imagem via fig)', message.sender, message.chat, t4);
            processed = true;
            break;
          case 'video':
            await processVideo(client, quoted);
            logAction('Sticker animado criado (vídeo via fig)', message.sender, message.chat, t4);
            processed = true;
            break;
          case 'document':
            await processDocument(client, quoted);
            logAction('Sticker criado (documento via fig)', message.sender, message.chat, t4);
            processed = true;
            break;
          default:
            await client.reply(
              message.chatId,
              '❕ A mensagem respondida não é uma mídia válida.',
              message.id
            );
            logAction('Tentativa de fig com mídia inválida', message.sender, message.chat, t4);
            processed = true;
        }
      }
    }

/* ---------- GUARDAR STICKER ---------- */
if (!processed && body === 'guardar') {
  const t7 = Date.now();
  const saved = await handleGuardar(client, message);
  if (saved) {
    logAction('Sticker guardado', message.sender, message.chat, t7);
    processed = true;
  }
}
/* ---------- ENVIAR FAVORITOS ---------- */
if (!processed && body === 'fav') {
  const t8 = Date.now();
  const sent = await handleEnviarFavs(client, message);
  if (sent) {
    logAction('Sticker favorito enviado', message.sender, message.chat, t8);
    processed = true;
  }
}
/* ---------- COLLAGE DE FAVORITOS ---------- */
if (!processed && body === 'fav lista') {
  const t9 = Date.now();
  const ok = await handleFavLista(client, message);
  if (ok) logAction('Collage de favs gerado', message.sender, message.chat, t9);
  processed = true;
}
    /* ---------- EMOJI → STICKER ---------- */
    if (!processed) {
      const t5 = Date.now();
      const emojiSent = await handleEmoji(client, message);
      if (emojiSent) {
        logAction('Sticker de emoji criado', message.sender, message.chat, t5);
        processed = true;
      }
    }

    /* ---------- MÍDIA DIRETA ---------- */
    if (!processed) {
      const t6 = Date.now();
      switch (message.type) {
        case 'image':
          await processImage(client, message);
          logAction('Sticker criado (imagem direta)', message.sender, message.chat, t6);
          processed = true;
          break;
        case 'video':
          await processVideo(client, message);
          logAction('Sticker animado criado (vídeo direto)', message.sender, message.chat, t6);
          processed = true;
          break;
        case 'document':
          await processDocument(client, message);
          logAction('Sticker criado (documento direto)', message.sender, message.chat, t6);
          processed = true;
          break;
      }
    }
  } catch (error) {
    console.error('Erro:', error.message);
  }
});

    client.onAnyMessage(async (message) => {
        if (message.isGroupMsg && message.type === 'video' && message.isGif) {
            await processVideo(client, message);
        }
    });
}

async function sendHelp(client, chatId, messageId) {
    const helpText = `🤖 *SordBOT FE – Central de Ajuda*

*Como usar:*
• 📷 Envie uma *imagem* → vira sticker
• 🎥 Envie *vídeo/GIF* (até 10 s) → sticker animado
• 📁 Envie *arquivo de imagem* → sticker
• ⬇️ Envie link de *Twitter, Instagram, TikTok ou Pinterest* → baixa mídia

*Comandos:*
• \`ajuda\` → esta mensagem
• \`alternar\` → liga/desliga *stretch*
• \`fig\` → responda mídia com *fig* para virar sticker
• \`renomear "nome" "autor"\` → renomeia os stickers

*Extras:*
• Cache limpo a cada 200 mensagens
• Só funciona em grupos`;

    await client.reply(chatId, helpText, messageId);
}
