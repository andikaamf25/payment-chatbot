const express = require('express');
const bodyParser = require('body-parser');
const config = require('./config');
const bot = require('./bot');
const { isValidSignature, mapTransactionStatus } = require('./midtrans');
const { getOrder, updateOrderStatus, updateDeliveryStatus } = require('./orderStore');

const app = express();
app.use(bodyParser.json());

// Endpoint yang didaftarkan sebagai "Payment Notification URL" di dashboard Midtrans
app.post('/midtrans/notification', async (req, res) => {
  const notification = req.body;

  if (!isValidSignature(notification)) {
    console.warn('  Notifikasi Midtrans dengan signature tidak valid, ditolak.');
    return res.status(403).json({ message: 'Invalid signature' });
  }

  const { order_id, transaction_status, fraud_status } = notification;
  const status = mapTransactionStatus(transaction_status, fraud_status);
  const order = updateOrderStatus(order_id, status);

  if (!order) {
    console.warn(`  Order ${order_id} tidak ditemukan di memori (mungkin server sudah restart).`);
    return res.status(200).json({ message: 'OK' });
  }

  if (order.orderMode === 'online') {
    updateDeliveryStatus(order_id, status === 'success' ? 'siap_diantar' : status === 'failed' ? 'pembayaran_gagal' : 'menunggu_pembayaran');
  }

  // Kirim update ke pembeli
  const pesanUntukPembeli = {
    success: ` Pembayaran untuk pesanan ${order_id} berhasil!\n Alamat: ${order.address || 'Belum diisi'}${order.orderMode === 'online' ? '\n Pesanan online sudah siap diantar.' : ''}\nTerima kasih.`,
    pending: ` Pembayaran untuk pesanan ${order_id} masih menunggu konfirmasi.\n Alamat: ${order.address || 'Belum diisi'}`,
    failed: ` Pembayaran untuk pesanan ${order_id} gagal/dibatalkan.\n Alamat: ${order.address || 'Belum diisi'}`,
    unknown: `Status pesanan ${order_id} berubah: ${transaction_status}\n Alamat: ${order.address || 'Belum diisi'}`,
  }[status];

  try {
    await bot.telegram.sendMessage(order.chatId, pesanUntukPembeli);
  } catch (err) {
    console.error('Gagal kirim notifikasi ke pembeli:', err.message);
  }

  // Kirim notifikasi ke admin/pemilik toko (kalau diisi di .env)
  if (config.adminChatId && status === 'success') {
    try {
      await bot.telegram.sendMessage(
        config.adminChatId,
        ` Pesanan baru masuk!\nID: ${order_id}\nProduk: ${order.productName}\nJumlah: Rp${order.amount.toLocaleString('id-ID')}\n📍 Alamat: ${order.address || 'Belum diisi'}\n🚚 Status antar: ${order.orderMode === 'online' ? 'Siap diantar (sudah dibayar)' : 'Diproses'}\nPembeli: ${order.customerName}`
      );
    } catch (err) {
      console.error('Gagal kirim notifikasi ke admin:', err.message);
    }
  }

  res.status(200).json({ message: 'OK' });
});

app.get('/', (_req, res) => res.send('Payment chatbot server is running.'));

app.listen(config.port, () => {
  console.log(` Server webhook Midtrans jalan di port ${config.port}`);
});

// Jalankan bot Telegram dengan polling (cocok untuk testing lokal)
bot
  .launch()
  .then(() => console.log('🤖 Bot Telegram jalan dan siap menerima pesan (polling mode).'))
  .catch((err) => {
    console.error('❌ Gagal menjalankan bot Telegram:', err.message);
    process.exit(1);
  });

// Matikan bot dengan rapi saat proses dihentikan (Ctrl+C)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
