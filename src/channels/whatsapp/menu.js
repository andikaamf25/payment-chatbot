const { MENU, FLAVORS, MIN_ADDRESS_LENGTH, MAX_ADDRESS_LENGTH } = require('../../services/catalog');
const { cartText, createCustomerOrder } = require('./orders');

function formatRupiah(amount) {
  return `Rp${amount.toLocaleString('id-ID')}`;
}

function isValidAddress(address) {
  return address.length >= MIN_ADDRESS_LENGTH && address.length <= MAX_ADDRESS_LENGTH;
}

async function showMainMenu({ jid, name, sessions, sendMessage }) {
  sessions.set(jid, { step: 'mode' });
  await sendMessage(
    jid,
    `Selamat datang di Gurih Gacor${name ? `, ${name}` : ''}!\n\n` +
      `Pilih menu untuk mulai memesan:\n1. Menu Offline\n2. Menu Online\n\n` +
      `Ketik angka pilihan. Ketik bantuan untuk panduan.`
      `Jangan Lupa mampur ke Instagram kami @gurih.gacor untuk melihat menu terbaru dan promo menarik!`
  );
}

async function handleMenuStep({
  jid,
  phone,
  customerName,
  text,
  command,
  session,
  sessions,
  sendMessage,
}) {
  if (!session?.step) return false;

  if (session.step === 'mode') {
    const mode = command === '1' || command === 'offline' ? 'offline'
      : command === '2' || command === 'online' ? 'online'
        : null;
    if (!mode) {
      await sendMessage(jid, 'Pilih 1 untuk Offline atau 2 untuk Online.');
      return true;
    }
    session.step = 'size';
    session.mode = mode;
    sessions.set(jid, session);
    const sizes = MENU[mode].sizes
      .map((size, index) => `${index + 1}. ${size.label} — ${formatRupiah(size.amount)}`)
      .join('\n');
    await sendMessage(jid, `Menu ${MENU[mode].label}\n${sizes}\n\nBalas dengan nomor ukuran.`);
    return true;
  }

  if (session.step === 'size') {
    const size = MENU[session.mode]?.sizes[Number.parseInt(command, 10) - 1];
    if (!size) {
      await sendMessage(jid, 'Pilihan ukuran tidak tersedia. Balas dengan nomor ukuran pada daftar.');
      return true;
    }
    session.sizeId = size.id;
    session.step = 'flavor';
    sessions.set(jid, session);
    const flavors = FLAVORS.map((flavor, index) => `${index + 1}. ${flavor.label}`).join('\n');
    await sendMessage(jid, `Pilih rasa untuk ${size.label} (${formatRupiah(size.amount)}):\n${flavors}`);
    return true;
  }

  if (session.step === 'flavor') {
    const flavor = FLAVORS[Number.parseInt(command, 10) - 1];
    const size = MENU[session.mode]?.sizes.find((item) => item.id === session.sizeId);
    if (!flavor || !size) {
      await sendMessage(jid, 'Pilihan rasa tidak tersedia. Balas dengan nomor rasa pada daftar.');
      return true;
    }
    session.cart = session.cart || [];
    session.cart.push({
      mode: session.mode,
      modeLabel: MENU[session.mode].label,
      sizeLabel: size.label,
      flavorLabel: flavor.label,
      amount: size.amount,
    });
    session.step = 'cart';
    delete session.mode;
    delete session.sizeId;
    sessions.set(jid, session);
    await sendMessage(jid, `${cartText(session.cart)}\n\n1. Tambah pesanan\n2. Checkout semua`);
    return true;
  }

  if (session.step === 'cart') {
    if (command === '1' || command === 'tambah') {
      session.step = 'mode';
      sessions.set(jid, session);
      await sendMessage(jid, 'Pilih jenis menu:\n1. Offline\n2. Online');
      return true;
    }
    if (command === '2' || command === 'checkout') {
      session.step = 'address';
      sessions.set(jid, session);
      await sendMessage(jid, 'Masukkan alamat pesanan lengkap, termasuk patokan bila ada.');
      return true;
    }
    await sendMessage(jid, 'Balas 1 untuk tambah pesanan atau 2 untuk checkout.');
    return true;
  }

  if (session.step === 'address' || session.step === 'manual-address') {
    if (!isValidAddress(text)) {
      await sendMessage(
        jid,
        `Alamat harus berisi ${MIN_ADDRESS_LENGTH} sampai ${MAX_ADDRESS_LENGTH} karakter. Silakan kirim ulang.`
      );
      return true;
    }
    try {
      await createCustomerOrder({
        jid,
        phone,
        customerName,
        session,
        address: text,
        isManual: session.step === 'manual-address',
        sessions,
        sendMessage,
      });
    } catch (err) {
      console.error('Gagal membuat pesanan WhatsApp:', err.message);
      await sendMessage(jid, 'Maaf, pesanan belum bisa dibuat. Coba lagi nanti.');
    }
    return true;
  }

  return false;
}

module.exports = { showMainMenu, handleMenuStep };
