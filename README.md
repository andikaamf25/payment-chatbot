# Payment Chatbot Gurih Gacor

Chatbot pemesanan Telegram dan WhatsApp dengan pembayaran Midtrans. Kedua channel dapat
dijalankan bersamaan; sesi WhatsApp dihubungkan melalui QR dari WhatsApp Web.
Chatbot ini tidak menyediakan website atau dashboard; interaksi pemesanan berlangsung
langsung lewat chat.

## Menjalankan

Gunakan Node.js 20 atau yang lebih baru.

1. Salin `.env.example` menjadi `.env`, lalu isi `MIDTRANS_SERVER_KEY` dan
   `MIDTRANS_CLIENT_KEY`.
2. Isi `TELEGRAM_BOT_TOKEN` jika ingin mengaktifkan Telegram.
3. Set `WHATSAPP_ENABLED=true` untuk mengaktifkan WhatsApp. Saat pertama dijalankan,
   scan QR terminal dari WhatsApp pada **Perangkat tertaut**. Sesi disimpan di
   `.whatsapp_auth/`; jangan bagikan atau commit folder tersebut.
4. Jalankan `npm start` (atau `npm run dev` saat pengembangan).

Minimal salah satu channel harus aktif. Notifikasi Midtrans memerlukan server ini dapat
dijangkau Midtrans di `/midtrans/notification`. Endpoint `/` hanya mengirim teks status
server, bukan halaman website.

Metode Transfer / E-wallet / Kartu membuka halaman checkout yang di-host oleh Midtrans.
Halaman tersebut adalah bagian dari proses pembayaran, bukan website chatbot.

## Fitur WhatsApp

Chat berbasis teks menyediakan katalog menu offline/online, ukuran dan rasa, keranjang,
checkout alamat, pesanan manual (`/pesan NamaProduk 75000`), pembayaran QRIS atau link
Midtrans, struk dan status pembayaran otomatis, serta bantuan pelanggan. Ketik `menu`
untuk memulai, `bantuan` untuk mengirim laporan kepada admin, dan `stop` untuk
membatalkan proses pemesanan.

Kode WhatsApp dipisahkan berdasarkan fitur: `src/channels/whatsapp/menu.js` untuk menu
dan checkout, `commands.js` untuk perintah/admin/bantuan, `orders.js` untuk pesanan dan
pembayaran, serta `index.js` untuk koneksi Baileys dan pengarah pesan.

Konfigurasikan admin WhatsApp di `WHATSAPP_ADMIN_IDS` sebagai nomor kode negara tanpa
tanda `+`, dipisahkan koma. `OWNER_IDS` dan `ADMIN_IDS` juga mendukung
`wa:<nomor>` dan `tg:<telegram_id>` untuk menetapkan role per channel.

## Catatan

WhatsApp Web berbasis QR menggunakan library Baileys dan bukan WhatsApp Business Cloud
API resmi. Jaga sesi perangkat tertaut dan kredensial Midtrans dengan aman.
