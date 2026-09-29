const { Telegraf, Markup } = require('telegraf');
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

if (!config.telegramToken) {
  throw new Error('TELEGRAM_BOT_TOKEN wajib diisi untuk menjalankan versi Telegram.');
}

const bot = new Telegraf(config.telegramToken);
const telegramSessions = new Map();
bootstrapRoles({
  ownerIds: config.ownerIds,
  adminIds: [...config.adminIds, ...(config.adminChatId ? [`tg:${config.adminChatId}`] : [])],
});

bot.use((ctx, next) => {
  if (ctx.from) registerUser({ id: ctx.from.id, channel: 'telegram', name: ctx.from.first_name });
  return next();
});

const MENU = {
  offline: {
    label: 'Offline',
    sizes: [
      { id: 'small', label: 'Small', amount: 2000 },
      { id: 'medium', label: 'Medium', amount: 5000 },
      { id: 'large', label: 'Large', amount: 12000 },
    ],
  },
  online: {
    label: 'Online',
    sizes: [{ id: 'online', label: 'Satu ukuran', amount: 15000 }],
  },
};

const FLAVORS = [
  { id: 'original', label: 'Original' },
  { id: 'pedas', label: 'Pedas' },
  { id: 'manis', label: 'Manis' },
  { id: 'pedas-manis', label: 'Pedas & Manis' },
];

function formatRupiah(amount) {
  return `Rp${amount.toLocaleString('id-ID')}`;
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

function findSize(mode, sizeId) {
  return MENU[mode]?.sizes.find((size) => size.id === sizeId);
}

function findFlavor(flavorId) {
  return FLAVORS.find((flavor) => flavor.id === flavorId);
}

function menuKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback(' Menu Offline', 'mode|offline')],
    [Markup.button.callback(' Menu Online', 'mode|online')],
  ]);
}

function flavorKeyboard(mode, sizeId) {
  return Markup.inlineKeyboard(
    FLAVORS.map((flavor) => [
      Markup.button.callback(` ${flavor.label}`, `flavor|${mode}|${sizeId}|${flavor.id}`),
    ])
  );
}

function cartTotal(items) {
  return items.reduce((total, item) => total + item.amount, 0);
}

function cartProductName(items) {
  return items.map((item) => `${item.modeLabel} ${item.sizeLabel} - ${item.flavorLabel}`).join(', ');
}

function cartText(items) {
  const lines = items.map((item, index) =>
    `${index + 1}. ${item.modeLabel} ${item.sizeLabel} - ${item.flavorLabel} (${formatRupiah(item.amount)})`
  );
  return ` <b>Isi pesanan</b>\n━━━━━━━━━━━━━━━\n${lines.join('\n')}\n━━━━━━━━━━━━━━━\n Total: <b>${formatRupiah(cartTotal(items))}</b>`;
}

async function notifyTelegramStaff(order) {
  const targets = [...new Set([
    ...getRoleRecipients('owner', 'telegram'),
    ...getRoleRecipients('admin', 'telegram'),
  ])];
  const message =
    ` <b>Pesanan baru masuk</b>\n` +
    `━━━━━━━━━━━━━━━\n` +
    ` ID: <code>${order.orderId}</code>\n` +
    ` Produk: <b>${escapeHtml(order.productName)}</b>\n` +
    ` Total: <b>${formatRupiah(order.amount)}</b>\n` +
    ` Alamat: <b>${escapeHtml(order.address || 'Belum diisi')}</b>\n` +
    ` Pembeli: ${escapeHtml(order.customerName || 'Pelanggan')}\n` +
    ` Status antar: <b>${order.deliveryStatus}</b>`;

  await Promise.all(targets.map(async (target) => {
    try {
      await bot.telegram.sendMessage(target, message, { parse_mode: 'HTML' });
    } catch (err) {
      console.error(`Gagal meneruskan order ke Telegram ${target}:`, err.message);
    }
  }));
}

async function sendPaymentOptions(ctx, { items, address }) {
  const amount = cartTotal(items);
  const hasOnline = items.some((item) => item.mode === 'online');
  const orderId = `ORDER-${Date.now()}-${ctx.from.id}`;
  const productName = cartProductName(items);

  createOrder(orderId, {
    chatId: ctx.chat.id,
    productName,
    amount,
    customerName: ctx.from.first_name,
    orderMode: hasOnline ? 'online' : 'offline',
    items,
    address,
    deliveryStatus: hasOnline ? 'menunggu_pembayaran' : 'diproses',
  });
  await notifyTelegramStaff({
    orderId,
    productName,
    amount,
    address,
    customerName: ctx.from.first_name,
    deliveryStatus: hasOnline ? 'Menunggu pembayaran' : 'Diproses',
  });

  await ctx.replyWithHTML(
    ` <b>Pesanan siap!</b>\n` +
      `━━━━━━━━━━━━━━━\n` +
      `${cartText(items)}\n` +
      ` Alamat     : <b>${escapeHtml(address)}</b>\n` +
      ` Total      : <b>${formatRupiah(amount)}</b>\n` +
      (hasOnline
        ? ` Status antar: <b>Menunggu pembayaran</b>\n`
        : ` Status antar: <b>Diproses</b>\n`) +
      ` ID Pesanan : <code>${orderId}</code>\n` +
      `━━━━━━━━━━━━━━━\n` +
      `Pilih metode pembayaran:`,
    Markup.inlineKeyboard([
      [Markup.button.callback(' Bayar via QRIS', `qris|${orderId}`)],
      [Markup.button.callback(' Transfer / E-wallet / Kartu', `snap|${orderId}`)],
      [Markup.button.callback(' Pesan lagi', 'menu')],
    ])
  );
}

bot.start((ctx) => {
  telegramSessions.delete(ctx.chat.id);
  ctx.replyWithHTML(
    ` <b>Selamat datang Gurih Gacor ${ctx.from.first_name ? `, ${ctx.from.first_name}` : ''}!</b>\n\n` +
      `Nikmati pilihan menu favoritmu dengan rasa yang bisa disesuaikan.\n\n` +
      ` <b>Pilih menu untuk mulai memesan:</b>`,
    menuKeyboard()
  );
});

bot.command('menu', (ctx) => {
  telegramSessions.delete(ctx.chat.id);
  ctx.replyWithHTML(' <b>Pilih jenis menu</b>\n\n Offline: tiga pilihan ukuran\n Online: satu ukuran spesial', menuKeyboard());
});

bot.action('menu', async (ctx) => {
  telegramSessions.delete(ctx.chat.id);
  await ctx.answerCbQuery();
  return ctx.replyWithHTML(' <b>Pilih jenis menu</b>\n\n Offline: tiga pilihan ukuran\n Online: satu ukuran spesial', menuKeyboard());
});

bot.action('add', async (ctx) => {
  const session = telegramSessions.get(ctx.chat.id);
  if (!session?.cart?.length) return ctx.reply(' Keranjang kosong. Silakan mulai dari /start.');
  session.step = 'mode';
  await ctx.answerCbQuery();
  return ctx.replyWithHTML('➕ <b>Tambah pesanan</b>\n\nPilih jenis menu:', menuKeyboard());
});

bot.action('checkout', async (ctx) => {
  const session = telegramSessions.get(ctx.chat.id);
  if (!session?.cart?.length) return ctx.reply(' Keranjang kosong. Silakan mulai dari /start.');
  session.step = 'address';
  await ctx.answerCbQuery();
  return ctx.replyWithHTML(' <b>Masukkan alamat pesanan</b>\n\nKetik alamat lengkap untuk pengantaran, termasuk patokan bila ada.');
});

bot.action(/^mode\|(offline|online)$/, async (ctx) => {
  const mode = ctx.match[1];
  await ctx.answerCbQuery();
  const buttons = MENU[mode].sizes.map((size) => [
    Markup.button.callback(`${size.label} · ${formatRupiah(size.amount)}`, `size|${mode}|${size.id}`),
  ]);
  return ctx.replyWithHTML(
    ` <b>Menu ${MENU[mode].label}</b>\n\nPilih ukuran yang kamu inginkan:`,
    Markup.inlineKeyboard([...buttons, [Markup.button.callback('↩️ Kembali', 'menu')]])
  );
});

bot.action(/^size\|(offline|online)\|([a-z]+)$/, async (ctx) => {
  const [, mode, sizeId] = ctx.match;
  const size = findSize(mode, sizeId);
  await ctx.answerCbQuery();
  if (!size) return ctx.reply(' Pilihan ukuran tidak tersedia. Silakan mulai lagi dengan /start.');
  return ctx.replyWithHTML(
    ` <b>Pilih rasa</b>\n\nUkuran: <b>${size.label}</b> · ${formatRupiah(size.amount)}`,
    flavorKeyboard(mode, size.id)
  );
});

bot.action(/^flavor\|(offline|online)\|([a-z]+)\|([a-z-]+)$/, async (ctx) => {
  const [, mode, sizeId, flavorId] = ctx.match;
  const size = findSize(mode, sizeId);
  const flavor = findFlavor(flavorId);
  await ctx.answerCbQuery();
  if (!size || !flavor) return ctx.reply(' Pilihan tidak tersedia. Silakan mulai lagi dengan /start.');
  const session = telegramSessions.get(ctx.chat.id) || { cart: [] };
  session.cart = session.cart || [];
  session.cart.push({
    mode,
    modeLabel: MENU[mode].label,
    sizeLabel: size.label,
    flavorLabel: flavor.label,
    amount: size.amount,
  });
  session.step = 'cart';
  telegramSessions.set(ctx.chat.id, session);
  return ctx.replyWithHTML(
    `${cartText(session.cart)}\n\nPilih aksi berikutnya:`,
    Markup.inlineKeyboard([
      [Markup.button.callback('➕ Tambah pesanan', 'add')],
      [Markup.button.callback(' Checkout semua', 'checkout')],
    ])
  );
});

bot.help((ctx) => {
  ctx.replyWithHTML(
    `🛠 <b>Perintah yang tersedia</b>\n\n` +
      `• /start — mulai & lihat menu\n` +
      `• /menu — lihat pilihan menu\n` +
      `• /pesan &lt;nama_produk&gt; &lt;harga&gt; — buat pesanan &amp; pilih metode bayar`
  );
});

bot.command('addadmin', (ctx) => manageRoleCommand(ctx, 'admin', addRole));
bot.command('addowner', (ctx) => manageRoleCommand(ctx, 'owner', addRole));
bot.command('deladmin', (ctx) => manageRoleCommand(ctx, 'admin', removeRole));
bot.command('delowner', (ctx) => manageRoleCommand(ctx, 'owner', removeRole));
bot.command('users', (ctx) => {
  if (!hasRole(ctx.from.id, 'owner')) return ctx.reply(' Perintah ini hanya untuk owner.');
  const stats = getStats();
  return ctx.reply(` Total user unik: ${stats.totalUsers}\n👑 Owner: ${stats.totalOwners}\n Admin: ${stats.totalAdmins}`);
});
bot.command('roles', (ctx) => {
  if (!hasRole(ctx.from.id, 'owner')) return ctx.reply(' Perintah ini hanya untuk owner.');
  const roles = getRoles();
  return ctx.reply(` Owner: ${roles.owner.join(', ') || '-'}\n Admin: ${roles.admin.join(', ') || '-'}`);
});

function manageRoleCommand(ctx, role, action) {
  if (!hasRole(ctx.from.id, 'owner')) return ctx.reply('⛔ Hanya owner yang boleh mengatur role.');
  const target = ctx.message.text.trim().split(/\s+/)[1];
  if (!target) return ctx.reply(`Format: /${action === addRole ? 'add' : 'del'}${role} tg:<telegram_id>`);
  action(target.startsWith('tg:') || target.startsWith('wa:') ? target : `tg:${target}`, role);
  return ctx.reply(` Role ${role} berhasil diperbarui untuk ${target}.`);
}

bot.command('pesan', async (ctx) => {
  try {
    // ctx.message.text contoh: "/pesan KaosPolos 75000"
    const parts = ctx.message.text.trim().split(/\s+/);
    const harga = parseInt(parts[parts.length - 1], 10);
    const namaProduk = parts.slice(1, parts.length - 1).join(' ');

    if (!namaProduk || !Number.isFinite(harga) || harga <= 0) {
      return ctx.reply(' Format salah.\n\nContoh yang benar:\n/pesan KaosPolos 75000');
    }

    telegramSessions.set(ctx.chat.id, {
      step: 'manual-address',
      productName: namaProduk,
      amount: harga,
    });
    await ctx.replyWithHTML('📍 <b>Masukkan alamat pesanan</b>\n\nKetik alamat lengkap untuk pengantaran, termasuk patokan bila ada.');
  } catch (err) {
    console.error('Error di /pesan:', err);
    ctx.reply(' Maaf, terjadi kesalahan saat membuat pesanan. Coba lagi nanti.');
  }
});

// Tombol "Bayar via QRIS" ditekan -> generate & kirim gambar QR langsung di chat
bot.action(/^qris\|(.+)$/, async (ctx) => {
  const orderId = ctx.match[1];
  await ctx.answerCbQuery('Membuat QRIS...');

  try {
    const order = getOrder(orderId);
    if (!order) {
      return ctx.reply(' Pesanan tidak ditemukan atau sudah kedaluwarsa. Coba /pesan lagi.');
    }

    const { qrUrl } = await createQrisPayment({
      orderId,
      amount: order.amount,
      customerName: order.customerName,
    });

    await ctx.replyWithPhoto(qrUrl, {
      caption:
        `📱 <b>Scan QRIS untuk Bayar</b>\n` +
        `━━━━━━━━━━━━━━━\n` +
        ` Produk : <b>${order.productName}</b>\n` +
        ` Alamat : <b>${escapeHtml(order.address || 'Belum diisi')}</b>\n` +
        ` Total    : <b>${formatRupiah(order.amount)}</b>\n\n` +
        `Buka aplikasi e-wallet/mobile banking mana pun yang mendukung QRIS, lalu scan kode di atas. Berlaku ±15 menit.`,
      parse_mode: 'HTML',
    });
  } catch (err) {
    console.error('Error di aksi qris:', err.message);
    ctx.reply(' Gagal membuat QRIS. Coba lagi, atau pilih metode lain.');
  }
});

// Tombol "Transfer / E-wallet / Kartu" ditekan -> generate link Snap (semua metode selain QRIS)
bot.action(/^snap\|(.+)$/, async (ctx) => {
  const orderId = ctx.match[1];
  await ctx.answerCbQuery('Membuat link pembayaran...');

  try {
    const order = getOrder(orderId);
    if (!order) {
      return ctx.reply(' Pesanan tidak ditemukan atau sudah kedaluwarsa. Coba /pesan lagi.');
    }

    const paymentUrl = await createPaymentLink({
      orderId,
      amount: order.amount,
      customerName: order.customerName,
    });

    await ctx.replyWithHTML(
      ` <b>Link Pembayaran Siap</b>\n\n` +
        `Pilih metode transfer bank, e-wallet, atau kartu kredit di halaman Midtrans. Link berlaku 24 jam.\n\n` +
        (order.orderMode === 'online' ? ` Pesanan Online akan diantar setelah pembayaran berhasil.` : ''),
      Markup.inlineKeyboard([Markup.button.url(' Bayar Sekarang', paymentUrl)])
    );
  } catch (err) {
    console.error('Error di aksi snap:', err.message);
    ctx.reply(' Gagal membuat link pembayaran. Coba lagi, atau pilih metode lain.');
  }
});

// Fallback untuk pesan teks biasa (bukan command)
bot.on('text', async (ctx) => {
  const session = telegramSessions.get(ctx.chat.id);
  if (session?.step === 'manual-address') {
    const address = ctx.message.text.trim();
    if (address.length < 5 || address.length > 500) {
      return ctx.reply(' Alamat harus diisi antara 5 sampai 500 karakter. Coba kirim lagi.');
    }
    const orderId = `ORDER-${Date.now()}-${ctx.from.id}`;
    createOrder(orderId, {
      chatId: ctx.chat.id,
      productName: session.productName,
      amount: session.amount,
      customerName: ctx.from.first_name,
      address,
      deliveryStatus: 'diproses',
    });
    await notifyTelegramStaff({
      orderId,
      productName: session.productName,
      amount: session.amount,
      address,
      customerName: ctx.from.first_name,
      deliveryStatus: 'Diproses',
    });
    telegramSessions.delete(ctx.chat.id);
    return ctx.replyWithHTML(
      ` <b>Pesanan Baru</b>\n` +
        `━━━━━━━━━━━━━━━\n` +
        ` Produk  : <b>${escapeHtml(session.productName)}</b>\n` +
        ` Total   : <b>${formatRupiah(session.amount)}</b>\n` +
        ` Alamat  : <b>${escapeHtml(address)}</b>\n` +
        ` Status  : <b>Diproses</b>\n` +
        ` ID      : <code>${orderId}</code>\n` +
        `━━━━━━━━━━━━━━━\n` +
        `Pilih metode pembayaran:`,
      Markup.inlineKeyboard([
        [Markup.button.callback(' Bayar via QRIS', `qris|${orderId}`)],
        [Markup.button.callback(' Transfer / E-wallet / Kartu', `snap|${orderId}`)],
      ])
    );
  }

  if (session?.step === 'address') {
    const address = ctx.message.text.trim();
    if (address.length < 5 || address.length > 500) {
      return ctx.reply(' Alamat harus diisi antara 5 sampai 500 karakter. Coba kirim lagi.');
    }
    telegramSessions.delete(ctx.chat.id);
    try {
      await sendPaymentOptions(ctx, { items: session.cart, address });
    } catch (err) {
      console.error('Error saat membuat menu:', err);
      await ctx.reply('❌ Maaf, pesanan belum bisa dibuat. Coba lagi nanti.');
    }
    return;
  }

  ctx.replyWithHTML(
    'Perintah tidak dikenali.\n\nKetik /start atau /menu untuk melihat pilihan menu.'
  );
});

// Selalu log error supaya kelihatan di terminal, bukan diam-diam gagal
bot.catch((err, ctx) => {
  console.error(`Error untuk update ${ctx.updateType}:`, err);
});

module.exports = bot;
