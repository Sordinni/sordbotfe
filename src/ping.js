const os = require('os');

function formatBytes(bytes) {
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(2)} MB`;
}

function cpuAvg() {
  const cpus = os.cpus();
  let idle = 0, tick = 0;
  cpus.forEach(c => {
    Object.values(c.times).forEach(t => tick += t);
    idle += c.times.idle;
  });
  return ((tick - idle) / tick * 100).toFixed(2);
}

async function handlePing(sock, msg) {
  const { startTime } = require('../index');
  const jid = msg.key.remoteJid;
  const t0  = Date.now();

  /* coleta tudo de uma vez */
  const [
    arch, plat, type, version, machine, uptime
  ] = [
    os.arch(), os.platform(), os.type(),
    os.version(), os.machine(), os.uptime()
  ];

  const total = os.totalmem();
  const free  = os.freemem();
  const used  = total - free;

  /* tempo do bot em hh:mm */
  const ms   = Date.now() - startTime.getTime();
  const hrs  = Math.floor(ms / 3_600_000);
  const mins = Math.floor((ms % 3_600_000) / 60_000);

  const texto = `
🏓 *Pong!* – \`${Date.now() - t0} ms\`

📟 *Sistema*
Arch: \`${arch}\`
Platform: \`${plat}\`
Type: \`${type}\`
Version: \`${version}\`
Machine: \`${machine}\`

🧠 *CPU*
Uso médio: \`${cpuAvg()} %\`

💾 *Memória*
Total: \`${formatBytes(total)}\`
Usada: \`${formatBytes(used)}\`
Livre: \`${formatBytes(free)}\`

⏱️ *Uptime do sistema*: \`${(uptime / 3600).toFixed(2)} h\`
⏳ *So𝘳dBOT rodando há*: \`${hrs}h ${mins}m\``;

  await sock.sendMessage(jid, { text: texto.trim() }, { quoted: msg });
}

module.exports = { handlePing };