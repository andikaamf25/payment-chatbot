const orders = new Map();

// Order disimpan sementara di memori.
function createOrder(orderId, data) {
  // Status awal pembayaran.
  orders.set(orderId, {
    ...data,
    orderId,
    status: 'pending',
    createdAt: new Date(),
    receiptSent: false,
    receiptSending: false,
  });
}

function getOrder(orderId) {
  return orders.get(orderId);
}

// Perbarui status pembayaran.
function updateOrderStatus(orderId, status) {
  const order = orders.get(orderId);
  if (order) {
    order.status = status;
    if (status === 'success' && !order.paidAt) order.paidAt = new Date();
    orders.set(orderId, order);
  }
  return order;
}

// Perbarui status pengantaran.
function updateDeliveryStatus(orderId, deliveryStatus) {
  const order = orders.get(orderId);
  if (order) {
    order.deliveryStatus = deliveryStatus;
    orders.set(orderId, order);
  }
  return order;
}

function claimReceipt(orderId) {
  const order = orders.get(orderId);
  if (!order || order.receiptSent || order.receiptSending) return false;
  order.receiptSending = true;
  return true;
}

function finishReceipt(orderId, sent) {
  const order = orders.get(orderId);
  if (!order) return;
  order.receiptSending = false;
  if (sent) order.receiptSent = true;
}

module.exports = {
  createOrder,
  getOrder,
  updateOrderStatus,
  updateDeliveryStatus,
  claimReceipt,
  finishReceipt,
};
