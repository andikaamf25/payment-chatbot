require('dotenv').config();

// Konfigurasi wajib.
const required = ['TELEGRAM_BOT_TOKEN', 'MIDTRANS_SERVER_KEY', 'MIDTRANS_CLIENT_KEY'];
const missing = required.filter((key) => !process.env[key]);

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
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,

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
};
