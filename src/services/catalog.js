const MENU = {
  offline: {
    label: 'Offline',
    sizes: [
      { id: 'small', label: 'Small', amount: 5000 },
      { id: 'medium', label: 'Medium', amount: 10000 },
      { id: 'large', label: 'Large', amount: 15000 },
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

const MIN_ADDRESS_LENGTH = 5;
const MAX_ADDRESS_LENGTH = 500;

module.exports = { MENU, FLAVORS, MIN_ADDRESS_LENGTH, MAX_ADDRESS_LENGTH };
