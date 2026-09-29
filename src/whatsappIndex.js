const express = require('express');
const bodyParser = require('body-parser');
const config = require('./config');
const { handleMessage, sendText } = require('./whatsapp');
const { isValidSignature, mapTransactionStatus } = require('./midtrans');
const { updateOrderStatus, updateDeliveryStatus } = require('./orderStore');

const app = express();
app.use(bodyParser.json());

app.get('/whatsapp/webhook', (req, res) => {
  const { mode, token, challenge } = req.query;
  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) return res.status(200).send(challenge);
  return res.sendStatus(403);
});

app.post('/whatsapp/webhook', async (req, res) => {
  res.sendStatus(200);
  const messages = req.body.entry?.flatMap((entry) => entry.changes || [])
    .flatMap((change) => change.value?.messages || []);

  for (const message of messages) {
    if (message.type !== 'text') continue;
    try {
      await handleMessage(message);
    } catch (err) {
      console.error('Error pesan WhatsApp:', err.message);
      await sendText(message.from, ' Maaf, terjadi kendala. Silakan balas *menu* untuk mencoba lagi.');
    }
  }
});

app.post('/midtrans/notification', async (req, res) => {
  const notification = req.body;
  if (!isValidSignature(notification)) return res.status(403).json({ message: 'Invalid signature' });

  const { order_id, transaction_status, fraud_status } = notification;
  const status = mapTransactionStatus(transaction_status, fraud_status);
  const order = updateOrderStatus(order_id, status);
  if (!order) return res.status(200).json({ message: 'OK' });

  if (order.orderMode === 'online') {
    updateDeliveryStatus(order_id, status === 'success' ? 'siap_diantar' : status === 'failed' ? 'pembayaran_gagal' : 'menunggu_pembayaran');
  }

  const messages = {
    success: ` Pembayaran pesanan *${order_id}* berhasil!\n Alamat: ${order.address || 'Belum diisi'}${order.orderMode === 'online' ? '\n🚚 Pesanan online sudah siap diantar.' : ''}\nTerima kasih.`,
    pending: ` Pembayaran pesanan *${order_id}* masih menunggu konfirmasi.\n Alamat: ${order.address || 'Belum diisi'}`,
    failed: ` Pembayaran pesanan *${order_id}* gagal atau dibatalkan.\n Alamat: ${order.address || 'Belum diisi'}`,
    unknown: `Status pesanan *${order_id}*: ${transaction_status}\n Alamat: ${order.address || 'Belum diisi'}`,
  };

  if (order.channel === 'whatsapp') {
    try {
      await sendText(order.chatId, messages[status]);
    } catch (err) {
      console.error('Gagal kirim notifikasi WhatsApp:', err.message);
    }
  }

  if (config.whatsapp.adminPhoneNumber && status === 'success') {
    try {
      await sendText(
        config.whatsapp.adminPhoneNumber,
        ` *Pesanan baru masuk!*\nID: ${order_id}\nProduk: ${order.productName}\nJumlah: ${order.amount.toLocaleString('id-ID')}\n Alamat: ${order.address || 'Belum diisi'}\n 🚚 Status antar: ${order.orderMode === 'online' ? 'Siap diantar (sudah dibayar)' : 'Diproses'}\nPembeli: ${order.customerName}`
      );
    } catch (err) {
      console.error('Gagal kirim notifikasi admin WhatsApp:', err.message);
    }
  }

  return res.status(200).json({ message: 'OK' });
});

app.get('/', (_req, res) => res.send('WhatsApp payment chatbot server is running.'));

app.listen(config.port, () => {
  console.log(`WhatsApp webhook jalan di port ${config.port}`);
});
