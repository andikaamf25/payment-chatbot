const orders = new Map();

function createOrder(orderId, data) {
  orders.set(orderId, { ...data, status: 'pending', createdAt: new Date() });
}

function getOrder(orderId) {
  return orders.get(orderId);
}

function updateOrderStatus(orderId, status) {
  const order = orders.get(orderId);
  if (order) {
    order.status = status;
    orders.set(orderId, order);
  }
  return order;
}

function updateDeliveryStatus(orderId, deliveryStatus) {
  const order = orders.get(orderId);
  if (order) {
    order.deliveryStatus = deliveryStatus;
    orders.set(orderId, order);
  }
  return order;
}

module.exports = { createOrder, getOrder, updateOrderStatus, updateDeliveryStatus };
