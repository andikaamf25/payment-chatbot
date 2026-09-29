const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'data', 'users.json');
const defaultData = { users: {}, roles: { owner: [], admin: [] } };

function ensureDataFile() {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2));
}

function readData() {
  ensureDataFile();
  try {
    return { ...defaultData, ...JSON.parse(fs.readFileSync(filePath, 'utf8')) };
  } catch (err) {
    console.error('Gagal membaca data user:', err.message);
    return structuredClone(defaultData);
  }
}

function writeData(data) {
  ensureDataFile();
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function normalizeId(value) {
  return String(value || '').trim().replace(/^\+/, '');
}

function registerUser({ id, channel, name }) {
  const userId = normalizeId(id);
  if (!userId) return;
  const data = readData();
  const existing = data.users[userId] || { id: userId, firstSeenAt: new Date().toISOString() };
  data.users[userId] = {
    ...existing,
    channel: channel || existing.channel,
    name: name || existing.name || 'Pelanggan',
    lastSeenAt: new Date().toISOString(),
  };
  writeData(data);
}

function getRole(id) {
  const userId = normalizeId(id);
  const data = readData();
  const candidates = [userId, `tg:${userId}`, `wa:${userId}`];
  if (data.roles.owner.some((target) => candidates.includes(target))) return 'owner';
  if (data.roles.admin.some((target) => candidates.includes(target))) return 'admin';
  return 'user';
}

function hasRole(id, role) {
  return getRole(id) === role || (role === 'admin' && getRole(id) === 'owner');
}

function addRole(id, role) {
  const userId = normalizeId(id);
  if (!userId || !['owner', 'admin'].includes(role)) return false;
  const data = readData();
  data.roles[role] = [...new Set([...data.roles[role], userId])];
  if (role === 'owner') data.roles.admin = data.roles.admin.filter((item) => item !== userId);
  writeData(data);
  return true;
}

function removeRole(id, role) {
  const userId = normalizeId(id);
  const data = readData();
  if (!data.roles[role]) return false;
  data.roles[role] = data.roles[role].filter((item) => item !== userId);
  writeData(data);
  return true;
}

function getStats() {
  const data = readData();
  return {
    totalUsers: Object.keys(data.users).length,
    totalOwners: data.roles.owner.length,
    totalAdmins: data.roles.admin.length,
  };
}

function getRoles() {
  return readData().roles;
}

function getRoleRecipients(role, channel) {
  return getRoles()[role].filter((target) => {
    if (channel === 'telegram') return !target.startsWith('wa:');
    if (channel === 'whatsapp') return !target.startsWith('tg:');
    return true;
  }).map((target) => target.replace(/^(tg|wa):/, ''));
}

function bootstrapRoles({ ownerIds = [], adminIds = [] }) {
  ownerIds.forEach((id) => addRole(id, 'owner'));
  adminIds.forEach((id) => {
    if (getRole(id) !== 'owner') addRole(id, 'admin');
  });
}

module.exports = { registerUser, getRole, hasRole, addRole, removeRole, getStats, getRoles, getRoleRecipients, bootstrapRoles, normalizeId };
