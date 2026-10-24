const { createPaymentLink, createQrisPayment } = require('../../services/midtrans');
const { createOrder, getOrder } = require('../../services/orderStore');
const { notifyOrderCreated } = require('../../services/notifier');
const { MENU } = require('../../services/catalog');

function formatRupiah(amount) {
  return `Rp${amount.toLocaleString('id-ID')}`;
}

function cartTotal(items) {
  return items.reduce((total, item) => total + item.amount, 0);
}

function cartText(items) {
  const lines = items.map((item, index) =>
    `${index + 1}. ${item.modeLabel} ${item.sizeLabel} - ${item.flavorLabel} (${formatRupiah(item.amount)})`
  );
  return `Isi pesanan\n━━━━━━━━━━━━━━━\n${lines.join('\n')}\n━━━━━━━━━━━━━━━\nTotal: ${formatRupiah(cartTotal(items))}`;
}

async function createCustomerOrder({
  jid,
  phone,
  customerName,
  session,
  address,
  isManual = false,
  sessions,
  sendMessage,
}) {
  const orderId = `ORDER-${Date.now()}-WA-${phone}`;
  const items = isManual ? undefined : session.cart;
  const productName = isManual
    ? session.productName
    : items.map((item) => `${item.modeLabel} ${item.sizeLabel} - ${item.flavorLabel}`).join(', ');
  const amount = isManual ? session.amount : cartTotal(items);
  const hasOnline = items?.some((item) => item.mode === 'online') || false;
  const deliveryStatus = hasOnline ? 'menunggu_pembayaran' : 'diproses';

  createOrder(orderId, {
    chatId: jid,
    channel: 'whatsapp',
    productName,
    amount,
    customerName,
    orderMode: hasOnline ? 'online' : 'offline',
    items,
    address,
    deliveryStatus,
  });
  await notifyOrderCreated({
    orderId,
    productName,
    amount,
    address,
    customerName,
    deliveryStatus: hasOnline ? 'Menunggu pembayaran' : 'Diproses',
  });
  sessions.set(jid, { paymentOrderId: orderId });
  await sendMessage(
    jid,
    `${isManual ? 'Pesanan baru' : cartText(items)}\n` +
      `Alamat: ${address}\nTotal: ${formatRupiah(amount)}\n` +
      `Status antar: ${hasOnline ? 'Menunggu pembayaran' : 'Diproses'}\n` +
      `ID Pesanan: ${orderId}\n\n` +
      `Pilih pembayaran:\n1. QRIS\n2. Transfer / E-wallet / Kartu`
  );
}

async function payForOrder({ jid, orderId, method, sendMessage, sendImage }) {
  const order = getOrder(orderId);
  if (!order) {
    await sendMessage(jid, 'Pesanan tidak ditemukan atau sudah kedaluwarsa. Silakan buat pesanan baru dengan ketik menu.');
    return;
  }

  if (method === 'qris') {
    const { qrUrl } = await createQrisPayment({
      orderId,
      amount: order.amount,
      customerName: order.customerName,
    });
    await sendImage(
      jid,
      qrUrl,
      `Scan QRIS untuk membayar\nID: ${orderId}\nProduk: ${order.productName}\n` +
      `Total: ${formatRupiah(order.amount)}\nBerlaku sekitar 15 menit.`
    );
    return;
  }

  const paymentUrl = await createPaymentLink({
    orderId,
    amount: order.amount,
    customerName: order.customerName,
  });
  await sendMessage(
    jid,
    `Link pembayaran siap untuk pesanan ${orderId}.\n` +
      `Pilih metode transfer bank, e-wallet, atau kartu pada halaman Midtrans. Link berlaku 24 jam.\n` +
      (order.orderMode === 'online' ? 'Pesanan online akan diantar setelah pembayaran berhasil.\n' : '') +
      paymentUrl
  );
}

async function handlePaymentChoice({ jid, command, session, sendMessage, sendImage }) {
  if (!session?.paymentOrderId) return false;

  const method = command === '1' || command === 'qris' ? 'qris'
    : command === '2' || ['transfer', 'ewallet', 'e-wallet'].includes(command) ? 'snap'
      : null;
  if (!method) {
    await sendMessage(jid, 'Balas 1 untuk QRIS atau 2 untuk Transfer / E-wallet / Kartu.');
    return true;
  }
  try {
    await payForOrder({
      jid,
      orderId: session.paymentOrderId,
      method,
      sendMessage,
      sendImage,
    });
  } catch (err) {
    console.error('Gagal membuat pembayaran WhatsApp:', err.message);
    await sendMessage(jid, 'Gagal membuat pembayaran. Coba lagi atau pilih metode pembayaran lain.');
  }
  return true;
}

module.exports = { cartTotal, cartText, createCustomerOrder, handlePaymentChoice };
