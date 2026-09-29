const config = require('./config');
const { createPaymentLink, createQrisPayment } = require('./midtrans');
const { createOrder, getOrder } = require('./orderStore');
const {
  registerUser,
  hasRole,
  addRole,
  removeRole,
  getStats,
  getRoles,
  getRoleRecipients,
  bootstrapRoles,
} = require('./userStore');

bootstrapRoles({ ownerIds: config.ownerIds, adminIds: config.adminIds });

const MENU = {
  offline: {
    label: 'Offline',
    sizes: [
      { id: '1', label: 'Small', amount: 2000 },
      { id: '2', label: 'Medium', amount: 5000 },
      { id: '3', label: 'Large', amount: 12000 },
    ],
  },
  online: {
    label: 'Online',
    sizes: [{ id: '1', label: 'Satu ukuran', amount: 15000 }],
  },
};

const FLAVORS = [
  { id: '1', label: 'Original' },
  { id: '2', label: 'Pedas' },
  { id: '3', label: 'Manis' },
  { id: '4', label: 'Pedas dan Manis' },
];

const sessions = new Map();

function formatRupiah(amount) {
  return `Rp${amount.toLocaleString('id-ID')}`;
}

function getSession(phone) {
  if (!sessions.has(phone)) sessions.set(phone, { step: 'mode' });
  return sessions.get(phone);
}

function menuText() {
  return `✨ *Selamat datang!*

Pilih jenis menu:

1️⃣ *Offline*
2️⃣ *Online*

Balas dengan angka *1* atau *2*.`;
}

function sizeText(mode) {
  const sizes = MENU[mode].sizes
    .map((size) => `${size.id}️⃣ ${size.label} - *${formatRupiah(size.amount)}*`)
    .join('\n');
  return ` *Menu ${MENU[mode].label}*\n\n${sizes}\n\nBalas dengan nomor ukuran.`;
}

function flavorText() {
  return '🌶️ *Pilih rasa:*\n\n1️⃣ Original\n2️⃣ Pedas\n3️⃣ Manis\n4️⃣ Pedas dan Manis\n\nBalas dengan nomor rasa.';
}

function addressText() {
  return '📍 *Masukkan alamat pesanan*\n\nKetik alamat lengkap untuk pengantaran, termasuk patokan bila ada.';
}

function cartTotal(items) {
  return items.reduce((total, item) => total + item.amount, 0);
}

function cartText(items) {
  const lines = items.map((item, index) =>
    `${index + 1}. ${item.modeLabel} ${item.sizeLabel} - ${item.flavorLabel} (${formatRupiah(item.amount)})`
  );
  return ` *Isi pesanan*\n━━━━━━━━━━━━━━━\n${lines.join('\n')}\n━━━━━━━━━━━━━━━\n Total: *${formatRupiah(cartTotal(items))}*`;
}

async function sendWhatsApp(to, payload) {
  const { accessToken, phoneNumberId } = config.whatsapp;
  if (!accessToken || !phoneNumberId) {
    throw new Error('Konfigurasi WhatsApp belum lengkap.');
  }

  const response = await fetch(`https://graph.facebook.com/v20.0/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ messaging_product: 'whatsapp', to, ...payload }),
  });

  if (!response.ok) {
    throw new Error(`WhatsApp API ${response.status}: ${await response.text()}`);
  }
}

async function sendText(to, text) {
  return sendWhatsApp(to, {
    type: 'text',
    text: { preview_url: true, body: text },
  });
}

async function notifyWhatsAppStaff(order) {
  const targets = [...new Set([
    ...getRoleRecipients('owner', 'whatsapp'),
    ...getRoleRecipients('admin', 'whatsapp'),
  ])];
  const message =
    ` *Pesanan baru masuk*\n` +
    `━━━━━━━━━━━━━━━\n` +
    ` ID: ${order.orderId}\n` +
    ` Produk: *${order.productName}*\n` +
    ` Total: *${formatRupiah(order.amount)}*\n` +
    ` Alamat: *${order.address || 'Belum diisi'}*\n` +
    ` Pembeli: ${order.customerName || 'Pelanggan'}\n` +
    ` Status antar: *${order.deliveryStatus}*`;

  await Promise.all(targets.map(async (target) => {
    try {
      await sendText(target, message);
    } catch (err) {
      console.error(`Gagal meneruskan order ke WhatsApp ${target}:`, err.message);
    }
  }));
}

async function sendOrderSummary(to, session) {
  const orderId = `ORDER-${Date.now()}-${to}`;
  const amount = cartTotal(session.cart);
  const productName = session.cart
    .map((item) => `${item.modeLabel} ${item.sizeLabel} - ${item.flavorLabel}`)
    .join(', ');
  const hasOnline = session.cart.some((item) => item.mode === 'online');

  createOrder(orderId, {
    chatId: to,
    channel: 'whatsapp',
    productName,
    amount,
    customerName: session.customerName || 'Pelanggan',
    orderMode: hasOnline ? 'online' : 'offline',
    items: session.cart,
    address: session.address,
    deliveryStatus: hasOnline ? 'menunggu_pembayaran' : 'diproses',
  });
  await notifyWhatsAppStaff({
    orderId,
    productName,
    amount,
    address: session.address,
    customerName: session.customerName,
    deliveryStatus: hasOnline ? 'Menunggu pembayaran' : 'Diproses',
  });

  session.step = 'payment';
  session.orderId = orderId;

  return sendText(
    to,
    ` *Pesanan siap!*
━━━━━━━━━━━━━━━
${cartText(session.cart)}
Alamat: *${session.address}*
Total: *${formatRupiah(amount)}*
Status antar: *${hasOnline ? 'Menunggu pembayaran' : 'Diproses'}*
ID: ${orderId}
━━━━━━━━━━━━━━━

Pilih pembayaran:
1️⃣ QRIS
2️⃣ Transfer / E-wallet / Kartu`
  );
}

async function handleMessage(message) {
  const from = message.from;
  const text = (message.text?.body || '').trim().toLowerCase();
  registerUser({ id: from, channel: 'whatsapp', name: message.contacts?.[0]?.profile?.name });
  const session = getSession(from);
  session.customerName = message.contacts?.[0]?.profile?.name || session.customerName || 'Pelanggan';

  const roleCommand = text.match(/^(addadmin|addowner|deladmin|delowner)\s+(\S+)$/);
  if (roleCommand) {
    if (!hasRole(from, 'owner')) return sendText(from, ' Hanya owner yang boleh mengatur role.');
    const [, command, target] = roleCommand;
    const role = command.endsWith('admin') ? 'admin' : 'owner';
    const roleTarget = target.startsWith('tg:') || target.startsWith('wa:') ? target : `wa:${target}`;
    (command.startsWith('add') ? addRole : removeRole)(roleTarget, role);
    return sendText(from, ` Role ${role} berhasil diperbarui untuk ${target}.`);
  }

  if (text === 'users' || text === 'stats') {
    if (!hasRole(from, 'owner')) return sendText(from, ' Perintah ini hanya untuk owner.');
    const stats = getStats();
    return sendText(from, ` Total user unik: ${stats.totalUsers}\n Owner: ${stats.totalOwners}\n Admin: ${stats.totalAdmins}`);
  }

  if (text === 'roles') {
    if (!hasRole(from, 'owner')) return sendText(from, ' Perintah ini hanya untuk owner.');
    const roles = getRoles();
    return sendText(from, ` Owner: ${roles.owner.join(', ') || '-'}\n Admin: ${roles.admin.join(', ') || '-'}`);
  }

  if (['halo', 'hai', 'menu', 'mulai', 'start', 'reset'].includes(text)) {
    sessions.set(from, { step: 'mode', customerName: session.customerName });
    return sendText(from, menuText());
  }

  if (session.step === 'mode') {
    if (text === '1' || text === 'offline') {
      session.mode = 'offline';
      session.step = 'size';
      return sendText(from, sizeText('offline'));
    }
    if (text === '2' || text === 'online') {
      session.mode = 'online';
      session.step = 'size';
      return sendText(from, sizeText('online'));
    }
  }

  if (session.step === 'size') {
    const size = MENU[session.mode].sizes.find((item) => item.id === text);
    if (size) {
      session.size = size;
      session.step = 'flavor';
      return sendText(from, flavorText());
    }
  }

  if (session.step === 'flavor') {
    const flavor = FLAVORS.find((item) => item.id === text);
    if (flavor) {
      session.flavor = flavor;
      session.cart = session.cart || [];
      session.cart.push({
        mode: session.mode,
        modeLabel: MENU[session.mode].label,
        sizeLabel: session.size.label,
        flavorLabel: flavor.label,
        amount: session.size.amount,
      });
      session.step = 'cart';
      return sendText(from, `${cartText(session.cart)}\n\nBalas *tambah* untuk menambah pesanan atau *checkout* untuk lanjut.`);
    }
  }

  if (session.step === 'cart') {
    if (['tambah', 'add', 'ya'].includes(text)) {
      session.step = 'mode';
      return sendText(from, '➕ *Tambah pesanan*\n\nPilih jenis menu:\n\n1️⃣ Offline\n2️⃣ Online');
    }
    if (['checkout', 'lanjut', 'selesai'].includes(text)) {
      session.step = 'address';
      return sendText(from, addressText());
    }
    return sendText(from, 'Balas *tambah* untuk menambah pesanan atau *checkout* untuk lanjut.');
  }

  if (session.step === 'address') {
    const address = message.text.body.trim();
    if (address.length < 5 || address.length > 500) {
      return sendText(from, ' Alamat harus diisi antara 5 sampai 500 karakter. Coba kirim lagi.');
    }
    session.address = address;
    return sendOrderSummary(from, session);
  }

  if (session.step === 'payment') {
    const order = getOrder(session.orderId);
    if (!order) return sendText(from, ' Pesanan tidak ditemukan. Balas *menu* untuk mulai lagi.');

    if (text === '1' || text === 'qris') {
      const { qrUrl } = await createQrisPayment({
        orderId: session.orderId,
        amount: order.amount,
        customerName: order.customerName,
      });
      return sendWhatsApp(from, {
        type: 'image',
        image: {
          link: qrUrl,
          caption: `📱 *Scan QRIS untuk membayar*\nTotal: *${formatRupiah(order.amount)}*\n${order.orderMode === 'online' ? '🚚 Pesanan Online akan diantar setelah pembayaran berhasil.\n' : ''}Berlaku sekitar 15 menit.`,
        },
      });
    }

    if (text === '2' || text === 'transfer' || text === 'ewallet' || text === 'kartu') {
      const paymentUrl = await createPaymentLink({
        orderId: session.orderId,
        amount: order.amount,
        customerName: order.customerName,
      });
      return sendText(from, ` *Link pembayaran siap*\n\nBayar di sini: ${paymentUrl}\n\n${order.orderMode === 'online' ? '🚚 Pesanan Online akan diantar setelah pembayaran berhasil.\n' : ''}Link berlaku 24 jam.`);
    }
  }

  return sendText(from, ' Pilihan belum dikenali. Balas *menu* untuk melihat pilihan lagi.');
}

module.exports = { handleMessage, sendText, sendWhatsApp };
