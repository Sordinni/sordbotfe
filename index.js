// index.js – SordBOT FE (limpo, só limpa cache e processa mídias/comandos)
const { create } = require('@open-wa/wa-automate');
const { processImage } = require('./src/processImage');
const { processVideo } = require('./src/processVideo');
const { processDocument } = require('./src/processDocument');
const { handleToggle } = require('./src/toggleStretch');
const { handleSocialMediaDownload } = require('./src/social-downloader');
const { handleRenameSticker } = require('./src/renameStickerMeta');

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

create(config)
    .then(start)
    .catch(console.error);

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
            if (!message.isGroupMsg) return;

            msgCount++;
            if (msgCount >= 200) await cleanCache();

            await handleToggle(client, message);
            await handleRenameSticker(client, message);
            const socialMediaProcessed = await handleSocialMediaDownload({
                client,
                message,
                sender: message.sender.id,
                groupId: message.chatId
            });

            if (socialMediaProcessed) return;
            const body = (message.body || '').trim().toLowerCase();
            if (body === '!ajuda' || body === 'ajuda') {
                await sendHelp(client, message.chatId, message.id);
                return;
            }
            /* ---- comando !fig ---- */
            if (body === 'fig') {
                if (!message.quotedMsg) {
                    await client.reply(message.chatId, '❕ Responda uma imagem, vídeo ou GIF com *fig* para virar sticker.', message.id);
                    return;
                }

                const quoted = message.quotedMsg;
                // redireciona para o handler correto
                switch (quoted.type) {
                    case 'image': await processImage(client, quoted); break;
                    case 'video': await processVideo(client, quoted); break;
                    case 'document': await processDocument(client, quoted); break;
                    default:
                        await client.reply(message.chatId, '❕ A mensagem respondida não é uma mídia válida.', message.id);
                }
                return; // fim do fluxo do comando fig
            }

            switch (message.type) {
                case 'image': await processImage(client, message); break;
                case 'video': await processVideo(client, message); break;
                case 'document': await processDocument(client, message); break;
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
