/**
 * !ping → responde com estatísticas rápidas do host
 */
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
  const jid = msg.key.remoteJid;
  const t0  = Date.now();

  /* coleta tudo de uma vez */
  const [
    arch, plat, release, type, version, machine, endian,
    hostname, uptime, load, homedir, tmpdir, devNull
  ] = [
    os.arch(), os.platform(), os.release(), os.type(),
    os.version(), os.machine(), os.endianness(),
    os.hostname(), os.uptime(), os.loadavg(), os.homedir(),
    os.tmpdir(), os.devNull
  ];

  const total = os.totalmem();
  const free  = os.freemem();
  const used  = total - free;
  const cpus  = os.cpus().length;
  const cores = os.availableParallelism();
  const user  = os.userInfo();
  const eol   = os.EOL === '\r\n' ? 'CRLF (Windows)' : 'LF (Unix)';

  const texto = `
🏓 *Pong!* – \`${Date.now() - t0} ms\`

📟 *Sistema*
Arch: \`${arch}\`
Platform: \`${plat}\`
Release: \`${release}\`
Type: \`${type}\`
Version: \`${version}\`
Machine: \`${machine}\`
Endianness: \`${endian}\`
Hostname: \`${hostname}\`
EOL: \`${eol}\`

🧠 *CPU*
Cores físicos: \`${cpus}\`
Paralelismo disponível: \`${cores}\`
Uso médio: \`${cpuAvg()} %\`
LoadAvg (1/5/15 min): \`${load.map(l => l.toFixed(2)).join(' / ')}\`

💾 *Memória*
Total: \`${formatBytes(total)}\`
Usada: \`${formatBytes(used)}\`
Livre: \`${formatBytes(free)}\`

👤 *User*
Nome: \`${user.username}\`
Shell: \`${user.shell || '—'}\`
Home: \`${homedir}\`
Tmp: \`${tmpdir}\`
DevNull: \`${devNull}\`

⏱️ *Uptime*: \`${(uptime / 3600).toFixed(2)} h\`
`;

  await sock.sendMessage(jid, { text: texto.trim() }, { quoted: msg });
}

module.exports = { handlePing };