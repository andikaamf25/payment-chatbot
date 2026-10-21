function formatRupiah(amount) {
  return `Rp${amount.toLocaleString('id-ID')}`;
}

function formatReceipt(order) {
  const items = Array.isArray(order.items) && order.items.length > 0
    ? order.items.map((item, index) =>
      `${index + 1}. ${item.modeLabel} ${item.sizeLabel} - ${item.flavorLabel}: ${formatRupiah(item.amount)}`
    )
    : [`1. ${order.productName}: ${formatRupiah(order.amount)}`];
  const paidAt = order.paidAt || order.createdAt;
  const date = paidAt instanceof Date ? paidAt : new Date(paidAt);
  const formattedDate = new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Jakarta',
  }).format(date);

  return [
    'STRUK PEMBAYARAN',
    '━━━━━━━━━━━━━━━',
    `ID Pesanan: ${order.orderId}`,
    `Waktu pembayaran: ${formattedDate} WIB`,
    '',
    'Rincian:',
    ...items,
    '━━━━━━━━━━━━━━━',
    `Total: ${formatRupiah(order.amount)}`,
    'Status: LUNAS',
    `Alamat: ${order.address || 'Belum diisi'}`,
    '',
    'Terima kasih telah berbelanja!',
  ].join('\n');
}

module.exports = { formatReceipt };
