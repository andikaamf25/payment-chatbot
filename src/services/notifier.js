const { getRoleRecipientEntries } = require('./userStore');

let channels = {};

function setChannels(availableChannels) {
  channels = availableChannels;
}

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

function plainText(message) {
  return message
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?b>/gi, '')
    .replace(/<\/?code>/gi, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function sendChannelMessage(channel, recipient, message, options) {
  const client = channels[channel];
  if (!client) {
    throw new Error(`Channel ${channel} belum aktif.`);
  }
  if (channel === 'telegram') {
    return sendTelegramMessage(client, recipient, message, options);
  }
  return client.sendMessage(recipient, plainText(message));
}

async function notifyRoleRecipients(recipients, message, options) {
  const activeRecipients = recipients.filter(({ channel }) => channels[channel]);
  await Promise.all(activeRecipients.map(async ({ channel, recipient }) => {
    try {
      await sendChannelMessage(channel, recipient, message, options);
    } catch (err) {
      console.error(`Gagal mengirim notifikasi ke ${channel} ${recipient}:`, err.message);
    }
  }));
}

async function notifyOrderCreated(order) {
  const targets = [...new Set([
    ...getRoleRecipientEntries('owner'),
    ...getRoleRecipientEntries('admin'),
  ].map((entry) => `${entry.channel}:${entry.recipient}`))].map((target) => {
    const separator = target.indexOf(':');
    return { channel: target.slice(0, separator), recipient: target.slice(separator + 1) };
  });

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
  await notifyRoleRecipients(targets, message, { parse_mode: 'HTML' });
}

async function notifyBuyer(availableChannels, order, message) {
  try {
    const channel = order.channel || 'telegram';
    const client = availableChannels[channel];
    if (!client) throw new Error(`Channel ${channel} belum aktif.`);
    if (channel === 'telegram') {
      await sendTelegramMessage(client, order.chatId, message);
    } else {
      await client.sendMessage(order.chatId, message);
    }
  } catch (err) {
    console.error('Gagal kirim notifikasi ke pembeli:', err.message);
  }
}

async function notifyPaymentSuccessAdmins(order) {
  const targets = [...new Set([
    ...getRoleRecipientEntries('owner'),
    ...getRoleRecipientEntries('admin'),
  ].map((entry) => `${entry.channel}:${entry.recipient}`))].map((target) => {
    const separator = target.indexOf(':');
    return { channel: target.slice(0, separator), recipient: target.slice(separator + 1) };
  });
  const message =
    `Pembayaran berhasil\nID: ${order.orderId}\nProduk: ${order.productName}\n` +
    `Jumlah: Rp${order.amount.toLocaleString('id-ID')}\nAlamat: ${order.address || 'Belum diisi'}\n` +
    `Status antar: ${order.orderMode === 'online' ? 'Siap diantar (sudah dibayar)' : 'Diproses'}\n` +
    `Pembeli: ${order.customerName || 'Pelanggan'}`;
  await notifyRoleRecipients(targets, message);
}

module.exports = {
  setChannels,
  sendTelegramMessage,
  sendChannelMessage,
  notifyOrderCreated,
  notifyBuyer,
  notifyPaymentSuccessAdmins,
};
