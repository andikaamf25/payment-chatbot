require('dotenv').config();

// Konfigurasi wajib.
const required = ['MIDTRANS_SERVER_KEY', 'MIDTRANS_CLIENT_KEY'];
const missing = required.filter((key) => !process.env[key]);
if (!process.env.TELEGRAM_BOT_TOKEN && process.env.WHATSAPP_ENABLED !== 'true') {
  missing.push('TELEGRAM_BOT_TOKEN atau WHATSAPP_ENABLED=true');
}

// Baca daftar ID dari .env.
function parseIds(value) {
  return (value || '')
    .split(',')
    .map((item) => item.trim().replace(/^\+/, ''))
    .filter(Boolean);
}

if (missing.length > 0) {
  console.error('❌ Environment variable belum diisi:', missing.join(', '));
  console.error('   Cek file .env kamu (lihat .env.example sebagai contoh).');
  process.exit(1);
}

module.exports = {
  // Server dan bot.
  port: process.env.PORT || 3000,
  telegramToken: process.env.TELEGRAM_BOT_TOKEN || null,
  whatsappEnabled: process.env.WHATSAPP_ENABLED === 'true',
  whatsappAuthPath: process.env.WHATSAPP_AUTH_PATH || '.whatsapp_auth',

  // Pembayaran.
  midtrans: {
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY,
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  },

  // Chat admin untuk notifikasi pembayaran.
  adminChatId: process.env.ADMIN_CHAT_ID || null,

  // ID owner dan admin.
  ownerIds: parseIds(process.env.OWNER_IDS),
  adminIds: parseIds(process.env.ADMIN_IDS),
  whatsappAdminIds: parseIds(process.env.WHATSAPP_ADMIN_IDS),
};
