const midtransClient = require('midtrans-client');
const crypto = require('crypto');
const config = require('./config');

const snap = new midtransClient.Snap({
  isProduction: config.midtrans.isProduction,
  serverKey: config.midtrans.serverKey,
  clientKey: config.midtrans.clientKey,
});

const coreApi = new midtransClient.CoreApi({
  isProduction: config.midtrans.isProduction,
  serverKey: config.midtrans.serverKey,
  clientKey: config.midtrans.clientKey,
});

/**
 * Membuat transaksi Snap dan mengembalikan link pembayaran.
 */
async function createPaymentLink({ orderId, amount, customerName }) {
  const parameter = {
    transaction_details: {
      order_id: orderId,
      gross_amount: amount,
    },
    customer_details: {
      first_name: customerName || 'Pelanggan',
    },
    // Batas waktu bayar 24 jam, sesuaikan kalau perlu
    expiry: {
      unit: 'hours',
      duration: 24,
    },
  };

  const transaction = await snap.createTransaction(parameter);
  return transaction.redirect_url;
}

/**
 * Membuat transaksi QRIS langsung (Core API), mengembalikan URL gambar QR code.
 * Beda dengan createPaymentLink (Snap) yang membuka halaman berisi semua metode,
 * ini fokus khusus QRIS supaya bisa langsung ditampilkan sebagai gambar di chat.
 */
async function createQrisPayment({ orderId, amount, customerName }) {
  const parameter = {
    payment_type: 'qris',
    transaction_details: {
      order_id: orderId,
      gross_amount: amount,
    },
    customer_details: {
      first_name: customerName || 'Pelanggan',
    },
  };

  const chargeResponse = await coreApi.charge(parameter);
  const qrAction = (chargeResponse.actions || []).find((action) => action.name === 'generate-qr-code');

  if (!qrAction) {
    throw new Error('URL QR code tidak ditemukan pada respons Midtrans.');
  }

  return {
    qrUrl: qrAction.url,
    expiryTime: chargeResponse.expiry_time,
  };
}

/**
 * Verifikasi signature notifikasi dari Midtrans supaya tidak dipalsukan orang lain.
 */
function isValidSignature({ order_id, status_code, gross_amount, signature_key }) {
  const expected = crypto
    .createHash('sha512')
    .update(`${order_id}${status_code}${gross_amount}${config.midtrans.serverKey}`)
    .digest('hex');
  return expected === signature_key;
}

/**
 * Menerjemahkan status transaksi Midtrans jadi status internal yang lebih simpel.
 */
function mapTransactionStatus(transactionStatus, fraudStatus) {
  if (transactionStatus === 'capture') {
    return fraudStatus === 'accept' ? 'success' : 'pending';
  }
  if (transactionStatus === 'settlement') return 'success';
  if (['cancel', 'deny', 'expire'].includes(transactionStatus)) return 'failed';
  if (transactionStatus === 'pending') return 'pending';
  return 'unknown';
}

module.exports = { createPaymentLink, createQrisPayment, isValidSignature, mapTransactionStatus };
