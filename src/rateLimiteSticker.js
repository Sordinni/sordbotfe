const { loadAll, saveAll } = require('./utils'); // mesmo arquivo de utils

const RATE_LIMIT       = 5;
const COOLDOWN_MINUTES = 6;
const COOLDOWN_MS      = COOLDOWN_MINUTES * 60 * 1000;

/* ---------- helpers ---------- */
function formatRemaining(until) {
  const now = Date.now();
  if (now >= until) return null;
  const diff = Math.max(0, until - now);
  const min = Math.floor(diff / 60000);
  const sec = Math.ceil((diff % 60000) / 1000);
  return { min, sec };
}

/* ---------- core ---------- */
function checkLimit(userId, consume = false) {
  if (!userId) return { allowed: false }; // segurança
  const db  = loadAll();
  const now = Date.now();

  // garante que o usuário existe
  if (!db[userId]) {
    db[userId] = {
      firstSeen: now,
      stickers: { static: 0, animated: 0 },
      name: 'Desconhecido'
    };
  }

  const entry = db[userId]._limit || { count: 0, cooldown_until: 0 };

  /* em cooldown? */
  if (now < entry.cooldown_until) {
    return { allowed: false, ...entry, remaining: formatRemaining(entry.cooldown_until) };
  }

  /* resetou o ciclo */
  if (entry.cooldown_until && now >= entry.cooldown_until) {
    entry.count = 0;
    entry.cooldown_until = 0;
  }

  if (!consume) {
    return { allowed: true, ...entry, left: RATE_LIMIT - entry.count };
  }

  /* consome 1 slot */
  entry.count += 1;
  if (entry.count >= RATE_LIMIT) entry.cooldown_until = now + COOLDOWN_MS;

  db[userId]._limit = entry; // salva dentro do objeto do usuário
  saveAll(db);

  return {
    allowed: true,
    ...entry,
    blockedNow: entry.count >= RATE_LIMIT
  };
}

/* ---------- comando !limite ---------- */
async function sendLimitStatus(sock, msg) {
  const userId = msg.key.remoteJid;
  const res    = checkLimit(userId, false);

  let text;
  if (res.cooldown_until && Date.now() < res.cooldown_until) {
    const { min, sec } = res.remaining;
    text = `⏳ Seu limite de criação foi atingido. Você poderá criar novamente em *${min}* minutos e *${sec}* segundos.`;
  } else {
    text = `✅ Você tem *${res.left}* figurinhas disponíveis para criação neste ciclo.`;
  }
  await sock.sendMessage(userId, { text }, { quoted: msg });
}

module.exports = { checkLimit, sendLimitStatus };