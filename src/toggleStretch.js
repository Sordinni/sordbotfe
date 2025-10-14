const { toggleStretch } = require('./userMeta');

async function handleToggle(client, message) {
  if (!message.isGroupMsg) return; // só em grupos

  const body = (message.body || '').trim().toLowerCase();
  if (body !== 'alternar') return; // não é o comando

  const userId = message.sender.id;
  const newState = toggleStretch(userId);

  await client.reply(
    message.chatId,
    `✅ *Stretch* ${newState ? 'ativado' : 'desativado'} para as suas figurinhas.`,
    message.id
  );
}

module.exports = { handleToggle };