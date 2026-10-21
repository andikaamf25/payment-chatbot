const { getRoleRecipients } = require('./userStore');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[character]));
}

async function sendTelegramMessage(bot, recipient, message, options) {
  return bot.telegram.sendMessage(recipient, message, options);
}

async function notifyOrderCreated(bot, order) {
  const targets = [...new Set([
    ...getRoleRecipients('owner'),
    ...getRoleRecipients('admin'),
  ])];

  await Promise.all(targets.map(async (recipient) => {
    try {
      const productName = `<b>${escapeHtml(order.productName)}</b>`;
      const address = `<b>${escapeHtml(order.address || 'Belum diisi')}</b>`;
      const customerName = escapeHtml(order.customerName || 'Pelanggan');
      const status = `<b>${order.deliveryStatus}</b>`;
      const orderId = `<code>${order.orderId}</code>`;
      const message =
        `Pesanan baru masuk\n` +
        `━━━━━━━━━━━━━━━\n` +
        `ID: ${orderId}\n` +
        `Produk: ${productName}\n` +
        `Total: Rp${order.amount.toLocaleString('id-ID')}\n` +
        `Alamat: ${address}\n` +
        `Pembeli: ${customerName}\n` +
        `Status antar: ${status}`;
      await sendTelegramMessage(bot, recipient, message, { parse_mode: 'HTML' });
    } catch (err) {
      console.error(`Gagal meneruskan order ke Telegram ${recipient}:`, err.message);
    }
  }));
}

async function notifyBuyer(bot, order, message) {
  try {
    await sendTelegramMessage(bot, order.chatId, message);
  } catch (err) {
    console.error('Gagal kirim notifikasi ke pembeli:', err.message);
  }
}

async function notifyTelegramAdmin(bot, adminChatId, order) {
  try {
    await bot.telegram.sendMessage(
      adminChatId,
      ` Pesanan baru masuk!\nID: ${order.orderId}\nProduk: ${order.productName}\nJumlah: Rp${order.amount.toLocaleString('id-ID')}\n📍 Alamat: ${order.address || 'Belum diisi'}\n🚚 Status antar: ${order.orderMode === 'online' ? 'Siap diantar (sudah dibayar)' : 'Diproses'}\nPembeli: ${order.customerName}`
    );
  } catch (err) {
    console.error('Gagal kirim notifikasi ke admin:', err.message);
  }
}

module.exports = {
  sendTelegramMessage,
  notifyOrderCreated,
  notifyBuyer,
  notifyTelegramAdmin,
};
