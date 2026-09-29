# Payment Chatbot (Telegram / WhatsApp + Midtrans)

Chatbot Telegram sederhana yang bisa membuatkan link pembayaran Midtrans dan
otomatis memberi tahu pembeli & admin saat pembayaran berhasil.

## Versi WhatsApp

Versi WhatsApp memakai **WhatsApp Cloud API resmi dari Meta**. Pengguna cukup
membalas angka untuk memilih menu, ukuran, rasa, dan metode pembayaran.

Tambahkan variabel berikut ke `.env`:

```env
WHATSAPP_ACCESS_TOKEN=token_permanent_dari_meta
WHATSAPP_PHONE_NUMBER_ID=id_nomor_whatsapp_meta
WHATSAPP_VERIFY_TOKEN=token_bebas_untuk_verifikasi_webhook
WHATSAPP_ADMIN_PHONE_NUMBER=628xxxxxxxxxx
```

Daftarkan webhook `https://domain-kamu/whatsapp/webhook` di Meta Developers
dengan metode `GET` untuk verifikasi dan `POST` untuk pesan masuk. URL publik
dapat dibuat saat testing lokal dengan `ngrok http 3000`.

Jalankan server WhatsApp dengan:

```bash
npm run start:whatsapp
```

Atur Payment Notification URL Midtrans ke:
`https://domain-kamu/midtrans/notification`.

## Backend admin dan owner

Setiap user yang mengirim pesan dicatat secara unik di `data/users.json`.
Order yang selesai checkout langsung diteruskan ke owner dan admin yang
terdaftar, lengkap dengan produk, total, dan alamat.

Isi role awal di `.env`:

```env
OWNER_IDS=tg:123456789,wa:628xxxxxxxxxx
ADMIN_IDS=tg:987654321,wa:628xxxxxxxxxx
```

Di Telegram, owner dapat memakai `/addadmin tg:<id>`, `/addowner tg:<id>`,
`/deladmin tg:<id>`, `/delowner tg:<id>`, `/users`, dan `/roles`.
Di WhatsApp, owner mengirim `addadmin wa:<nomor>`, `addowner wa:<nomor>`,
`deladmin wa:<nomor>`, `delowner wa:<nomor>`, `users`, atau `roles`.
Nomor WhatsApp memakai format internasional tanpa tanda `+`.

## 1. Install dependencies

```bash
cd payment-chatbot
npm install
```

## 2. Buat file `.env`

Salin `.env.example` menjadi `.env`, lalu isi:

```bash
cp .env.example .env
```

- `TELEGRAM_BOT_TOKEN`: dapatkan dari **@BotFather** di Telegram (`/newbot` atau
  `/mybots` > pilih bot > API Token).
- `MIDTRANS_SERVER_KEY` & `MIDTRANS_CLIENT_KEY`: dari
  https://dashboard.midtrans.com > **Settings > Access Keys** (pakai akun
  **Sandbox** dulu untuk testing).
- `ADMIN_CHAT_ID` (opsional): chat ID Telegram kamu sendiri, supaya dapat
  notifikasi tiap ada pesanan sukses. Cara dapat chat ID: chat bot
  **@userinfobot** di Telegram.

⚠️ **Jangan pernah upload file `.env` ke GitHub atau kirim screenshot isinya**
— siapa pun yang punya token itu bisa mengendalikan bot dan akun Midtrans kamu.

## 3. Jalankan

```bash
npm start
```

Kalau berhasil, di terminal akan muncul:
```
🚀 Server webhook Midtrans jalan di port 3000
🤖 Bot Telegram jalan dan siap menerima pesan (polling mode).
```

Kalau tidak muncul dua baris ini, atau muncul pesan error, itu tandanya ada
masalah konfigurasi — baca pesan errornya, biasanya sudah cukup jelas
(token salah, package belum ke-install, dll).

## 4. Coba chat bot-nya

Di Telegram, cari bot kamu, lalu:
```
/start
```

Bot akan menampilkan menu interaktif. Pilih tipe menu, ukuran, dan rasa, lalu
pilih **Tambah pesanan** bila ingin menambahkan item lain. Semua item akan
digabung menjadi satu order dan satu pembayaran saat checkout. Setelah itu
kirim alamat pengantaran. Alamat ikut disimpan pada order dan dikirim dalam
notifikasi admin.

### Daftar menu

- **Offline**: Small Rp2.000, Medium Rp5.000, Large Rp12.000.
- **Online**: satu ukuran Rp15.000.
- **Pilihan rasa**: Original, Pedas, Manis, atau Pedas & Manis.

Untuk menu **Online**, pembayaran wajib berhasil terlebih dahulu sebelum
pesanan disiapkan untuk diantar. Status awalnya menunggu pembayaran dan berubah
menjadi siap diantar setelah webhook Midtrans menerima status berhasil.

Perintah lama `/pesan <nama_produk> <harga>` tetap tersedia untuk membuat
pesanan manual.

## 5. Supaya notifikasi pembayaran masuk (webhook)

Saat testing lokal, Midtrans tidak bisa mengakses `localhost` kamu langsung.
Gunakan **ngrok** untuk membuat URL publik sementara:

```bash
ngrok http 3000
```

Salin URL `https://xxxx.ngrok-free.app`, lalu daftarkan sebagai
**Payment Notification URL** di:
Dashboard Midtrans > Settings > Configuration, isi dengan:
```
https://xxxx.ngrok-free.app/midtrans/notification
```

Setelah itu, setiap perubahan status pembayaran (berhasil/gagal/pending) akan
otomatis dikirim ke bot, dan bot akan meneruskannya ke pembeli + admin.

## Catatan penting

- Penyimpanan pesanan saat ini masih **di memori** (`src/orderStore.js`) —
  artinya data hilang tiap kali server di-restart. Untuk produksi, ganti
  dengan database (misalnya SQLite atau PostgreSQL).
- Kalau nanti mau deploy ke server (bukan cuma testing lokal), sebaiknya
  ganti bot dari **polling** (`bot.launch()`) ke **webhook Telegram**, supaya
  lebih efisien dan tidak perlu proses yang terus "nanya" ke server Telegram.
