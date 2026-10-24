const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const config = require('../../config');
const { registerUser } = require('../../services/userStore');
const { bootstrapWhatsAppRoles, handleCommand } = require('./commands');
const { showMainMenu, handleMenuStep } = require('./menu');
const { handlePaymentChoice } = require('./orders');

bootstrapWhatsAppRoles();

const sessions = new Map();
let socket;
let stopping = false;
let reconnectTimer;

function getText(message) {
  const content = message.message || {};
  return content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.buttonsResponseMessage?.selectedDisplayText ||
    content.listResponseMessage?.title ||
    '';
}

function formatJid(recipient) {
  const value = String(recipient);
  return value.includes('@') ? value : `${value.replace(/^\+/, '')}@s.whatsapp.net`;
}

function sendMessage(recipient, text) {
  if (!socket) throw new Error('WhatsApp belum terhubung.');
  return socket.sendMessage(formatJid(recipient), { text: String(text) });
}

function sendImage(recipient, imageUrl, caption) {
  if (!socket) throw new Error('WhatsApp belum terhubung.');
  return socket.sendMessage(recipient, { image: { url: imageUrl }, caption });
}

async function handleMessage(message) {
  const jid = message.key.remoteJid;
  if (!jid || jid.endsWith('@g.us') || jid === 'status@broadcast') return;

  const text = getText(message).trim();
  if (!text) return;

  const phone = jid.split('@')[0].split(':')[0];
  const userKey = `wa:${phone}`;
  const customerName = message.pushName || phone || 'Pelanggan';
  registerUser({ id: userKey, name: customerName });
  const command = text.toLowerCase();
  const session = sessions.get(jid);

  if (['menu', '/menu', 'start', '/start', 'mulai', 'halo', 'hai'].includes(command)) {
    await showMainMenu({ jid, name: customerName, sessions, sendMessage });
    return;
  }
  if (['stop', 'batal', 'hentikan'].includes(command)) {
    sessions.delete(jid);
    await sendMessage(jid, 'Proses pemesanan dihentikan. Ketik menu untuk mulai lagi.');
    return;
  }

  const commandHandled = await handleCommand({
    jid,
    userKey,
    text,
    command,
    customerName,
    phone,
    session,
    sessions,
    sendMessage,
  });
  if (commandHandled) return;

  const paymentHandled = await handlePaymentChoice({
    jid,
    command,
    session,
    sendMessage,
    sendImage,
  });
  if (paymentHandled) return;

  const menuHandled = await handleMenuStep({
    jid,
    phone,
    customerName,
    text,
    command,
    session,
    sessions,
    sendMessage,
  });
  if (menuHandled) return;

  await sendMessage(jid, 'Perintah tidak dikenali. Ketik menu untuk memesan atau bantuan untuk panduan.');
}

async function startWhatsApp() {
  const baileys = await import('@whiskeysockets/baileys');
  const makeWASocket = baileys.default || baileys.makeWASocket;
  const { useMultiFileAuthState, DisconnectReason } = baileys;
  const authPath = path.resolve(config.whatsappAuthPath);
  fs.mkdirSync(authPath, { recursive: true });

  async function connect() {
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    socket = makeWASocket({ auth: state, printQRInTerminal: false });
    let qrWasShown = false;
    socket.ev.on('creds.update', saveCreds);
    socket.ev.on('connection.update', (update) => {
      if (update.qr) {
        qrWasShown = true;
        console.log('Scan QR WhatsApp ini dari WhatsApp > Perangkat tertaut:');
        qrcode.generate(update.qr, { small: true });
      }
      if (update.connection === 'open') {
        console.log(
          qrWasShown
            ? '✅ QR berhasil dipindai! WhatsApp terhubung dan chatbot siap menerima pesan.'
            : '✅ WhatsApp terhubung dan chatbot siap menerima pesan.'
        );
      }
      if (update.connection === 'close' && !stopping) {
        const statusCode = update.lastDisconnect?.error?.output?.statusCode;
        if (statusCode === DisconnectReason.loggedOut) {
          console.error('Sesi WhatsApp terputus. Hapus sesi tersimpan dan scan ulang QR untuk menghubungkan kembali.');
          return;
        }
        console.warn('Koneksi WhatsApp terputus; mencoba menghubungkan kembali.');
        reconnectTimer = setTimeout(() => {
          connect().catch((err) => console.error('Gagal menghubungkan ulang WhatsApp:', err.message));
        }, 3000);
      }
    });
    socket.ev.on('messages.upsert', ({ messages, type }) => {
      if (type !== 'notify') return;
      messages
        .filter((incomingMessage) => !incomingMessage.key.fromMe)
        .forEach((incomingMessage) => {
          handleMessage(incomingMessage).catch((err) => {
            console.error('Gagal memproses pesan WhatsApp:', err);
          });
        });
    });
  }

  await connect();
  return {
    sendMessage,
    stop() {
      stopping = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.end(undefined);
    },
  };
}

module.exports = { startWhatsApp };
