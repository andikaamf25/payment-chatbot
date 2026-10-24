const config = require('../../config');
const {
  hasRole,
  addRole,
  removeRole,
  getStats,
  getRoles,
  getRoleRecipientEntries,
  bootstrapRoles,
} = require('../../services/userStore');
const { sendChannelMessage } = require('../../services/notifier');
const { MIN_ADDRESS_LENGTH, MAX_ADDRESS_LENGTH } = require('../../services/catalog');

function recipientsForRoles() {
  const unique = new Map();
  for (const role of ['owner', 'admin']) {
    for (const entry of getRoleRecipientEntries(role)) {
      unique.set(`${entry.channel}:${entry.recipient}`, entry);
    }
  }
  return [...unique.values()];
}

async function forwardSupport({ jid, customerName, phone, issue, sendMessage }) {
  const recipients = recipientsForRoles();
  if (!recipients.length) {
    await sendMessage(jid, 'Bantuan belum dapat diteruskan karena admin belum dikonfigurasi.');
    return;
  }
  const message =
    `Laporan kendala pelanggan (WhatsApp)\nNama: ${customerName}\nNomor: ${phone}\n\n${issue}`;
  const delivered = await Promise.all(recipients.map(async ({ channel, recipient }) => {
    try {
      if (channel === 'whatsapp') {
        await sendMessage(recipient, message);
      } else {
        await sendChannelMessage(channel, recipient, message);
      }
      return true;
    } catch (err) {
      console.error(`Gagal meneruskan laporan bantuan ke ${channel} ${recipient}:`, err.message);
      return false;
    }
  }));
  const count = delivered.filter(Boolean).length;
  await sendMessage(
    jid,
    count
      ? 'Laporan sudah diteruskan ke admin. Mereka akan menindaklanjuti kendalamu.'
      : 'Laporan gagal dikirim ke admin. Silakan coba lagi nanti.'
  );
}

async function handleRoleCommand({ jid, userKey, text, command, role, action, sendMessage }) {
  if (!hasRole(userKey, 'owner')) {
    await sendMessage(jid, 'Perintah ini hanya untuk owner.');
    return;
  }
  const target = text.trim().split(/\s+/)[1];
  if (!target) {
    await sendMessage(jid, `Format: ${command} wa:<nomor> atau ${command} tg:<telegram_id>`);
    return;
  }
  const normalizedTarget = /^(wa|tg):/.test(target) ? target : `tg:${target}`;
  action(normalizedTarget, role);
  await sendMessage(jid, `Role ${role} berhasil diperbarui untuk ${target}.`);
}

async function handleCommand({
  jid,
  userKey,
  text,
  command,
  customerName,
  phone,
  session,
  sessions,
  sendMessage,
}) {
  if (/^\/?bantuan(?:\s|$)/i.test(text)) {
    sessions.set(jid, { ...(session || {}), supportRequested: true });
    await sendMessage(jid, 'Ceritakan kendala yang kamu alami dalam satu pesan. Sertakan ID pesanan jika ada.');
    return true;
  }

  if (['help', '/help', 'panduan'].includes(command)) {
    await sendMessage(
      jid,
      `Panduan Gurih Gacor\n` +
        `• menu — mulai atau lihat menu\n• stop — hentikan pemesanan\n` +
        `• pesan <nama_produk> <harga> — pesanan manual\n• bantuan — kirim kendala ke admin\n\n` +
        `Alamat harus berisi ${MIN_ADDRESS_LENGTH}-${MAX_ADDRESS_LENGTH} karakter. ` +
        `Untuk melaporkan kendala, ketik bantuan lalu kirim isi laporan.`
    );
    return true;
  }

  const roleCommands = [
    { name: '/addadmin', role: 'admin', action: addRole },
    { name: '/addowner', role: 'owner', action: addRole },
    { name: '/deladmin', role: 'admin', action: removeRole },
    { name: '/delowner', role: 'owner', action: removeRole },
  ];
  for (const item of roleCommands) {
    if (command.startsWith(`${item.name} `) || command === item.name) {
      await handleRoleCommand({
        jid,
        userKey,
        text,
        command: item.name,
        role: item.role,
        action: item.action,
        sendMessage,
      });
      return true;
    }
  }

  if (command === '/users') {
    if (!hasRole(userKey, 'owner')) {
      await sendMessage(jid, 'Perintah ini hanya untuk owner.');
      return true;
    }
    const stats = getStats();
    await sendMessage(jid, `Total user unik: ${stats.totalUsers}\nOwner: ${stats.totalOwners}\nAdmin: ${stats.totalAdmins}`);
    return true;
  }
  if (command === '/roles') {
    if (!hasRole(userKey, 'owner')) {
      await sendMessage(jid, 'Perintah ini hanya untuk owner.');
      return true;
    }
    const roles = getRoles();
    await sendMessage(jid, `Owner: ${roles.owner.join(', ') || '-'}\nAdmin: ${roles.admin.join(', ') || '-'}`);
    return true;
  }

  if (/^\/?pesan(?:\s|$)/i.test(text)) {
    const parts = text.trim().split(/\s+/);
    const amount = Number.parseInt(parts[parts.length - 1], 10);
    const productName = parts.slice(1, -1).join(' ');
    if (!productName || !Number.isSafeInteger(amount) || amount <= 0) {
      await sendMessage(jid, 'Format salah.\nContoh: /pesan KaosPolos 75000');
      return true;
    }
    sessions.set(jid, { step: 'manual-address', productName, amount });
    await sendMessage(jid, 'Masukkan alamat pesanan lengkap, termasuk patokan bila ada.');
    return true;
  }

  if (session?.supportRequested) {
    if (!text || text.length > 3000) {
      await sendMessage(jid, 'Laporan harus berisi 1 sampai 3000 karakter. Silakan kirim ulang.');
      return true;
    }
    delete session.supportRequested;
    await forwardSupport({ jid, customerName, phone, issue: text, sendMessage });
    if (Object.keys(session).length === 0) sessions.delete(jid);
    else sessions.set(jid, session);
    return true;
  }

  return false;
}

function bootstrapWhatsAppRoles() {
  bootstrapRoles({
    ownerIds: config.ownerIds,
    adminIds: [
      ...config.adminIds,
      ...(config.adminChatId ? [`tg:${config.adminChatId}`] : []),
      ...config.whatsappAdminIds.map((id) => `wa:${id}`),
    ],
  });
}

module.exports = { handleCommand, bootstrapWhatsAppRoles };
