const express = require('express');
const bodyParser = require('body-parser');
const config = require('./config');
const bot = require('./channels/telegram');
const { isValidSignature, mapTransactionStatus } = require('./services/midtrans');
const { formatReceipt } = require('./services/receipt');
const {
  sendTelegramMessage,
  notifyBuyer,
  notifyTelegramAdmin,
} = require('./services/notifier');
const {
  getOrder,
  updateOrderStatus,
  updateDeliveryStatus,
  claimReceipt,
  finishReceipt,
} = require('./services/orderStore');

// Webhook Midtrans.
const app = express();
app.use(bodyParser.json());
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
    const deliveryStatusByPayment = {
      success: 'siap_diantar',
      failed: 'pembayaran_gagal',
      pending: 'menunggu_pembayaran',
      unknown: 'menunggu_pembayaran',
    };
    updateDeliveryStatus(order_id, deliveryStatusByPayment[status]);
  }

  // Pesan untuk pembeli sesuai status pembayaran.
  const pesanUntukPembeli = {
    success: ` Pembayaran untuk pesanan ${order_id} berhasil!\n Alamat: ${order.address || 'Belum diisi'}${order.orderMode === 'online' ? '\n Pesanan online sudah siap diantar.' : ''}\nTerima kasih.`,
    pending: ` Pembayaran untuk pesanan ${order_id} masih menunggu konfirmasi.\n Alamat: ${order.address || 'Belum diisi'}`,
    failed: ` Pembayaran untuk pesanan ${order_id} gagal/dibatalkan.\n Alamat: ${order.address || 'Belum diisi'}`,
    unknown: `Status pesanan ${order_id} berubah: ${transaction_status}\n Alamat: ${order.address || 'Belum diisi'}`,
  }[status];

  await notifyBuyer(bot, order, pesanUntukPembeli);

  if (status === 'success' && claimReceipt(order_id)) {
    let receiptSent = false;
    try {
      await sendTelegramMessage(
        bot,
        order.chatId,
        formatReceipt(order)
      );
      receiptSent = true;
    } catch (err) {
      console.error('Gagal kirim struk ke pembeli:', err.message);
    } finally {
      finishReceipt(order_id, receiptSent);
    }
  }

  // Beri tahu admin jika pembayaran berhasil.
  if (config.adminChatId && status === 'success') {
    await notifyTelegramAdmin(bot, config.adminChatId, order);
  }

  res.status(200).json({ message: 'OK' });
});

app.get('/', (_req, res) => res.send('Payment chatbot server is running.'));

// Jalankan server dan bot.
app.listen(config.port, () => {
  console.log(` Server webhook Midtrans jalan di port ${config.port}`);
});

bot
  .launch()
  .then(() => console.log(' Bot Telegram jalan dan siap menerima pesan (polling mode).'))
  .catch((err) => {
    console.error('Gagal menjalankan bot Telegram:', err.message);
    process.exit(1);
  });

// Hentikan bot saat proses ditutup.
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
