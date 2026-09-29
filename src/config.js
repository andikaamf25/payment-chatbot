require('dotenv').config();

const required = ['MIDTRANS_SERVER_KEY', 'MIDTRANS_CLIENT_KEY'];
const missing = required.filter((key) => !process.env[key]);

function parseIds(value) {
  return (value || '').split(',').map((item) => item.trim().replace(/^\+/, '')).filter(Boolean);
}

if (missing.length > 0) {
  console.error('❌ Environment variable belum diisi:', missing.join(', '));
  console.error('   Cek file .env kamu (lihat .env.example sebagai contoh).');
  process.exit(1);
}

module.exports = {
  port: process.env.PORT || 3000,
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  midtrans: {
    serverKey: process.env.MIDTRANS_SERVER_KEY,
    clientKey: process.env.MIDTRANS_CLIENT_KEY,
    isProduction: process.env.MIDTRANS_IS_PRODUCTION === 'true',
  },
  adminChatId: process.env.ADMIN_CHAT_ID || null,
  ownerIds: parseIds(process.env.OWNER_IDS),
  adminIds: parseIds(process.env.ADMIN_IDS),
  whatsapp: {
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN || null,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID || null,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || null,
    adminPhoneNumber: process.env.WHATSAPP_ADMIN_PHONE_NUMBER || null,
  },
};
