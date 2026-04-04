# 🎭 CosTeleBot (Ultimate Cosplay Scraper Bot)

![Cosplay Scraper](https://img.shields.io/badge/Node.js-Telegram_Bot-blue)
![Version](https://img.shields.io/badge/Version-1.0.0--Ultimate-success)
![Build](https://img.shields.io/badge/Build-Passing-brightgreen)

**CosTeleBot** adalah *engine* Telegram Bot multi-fungsional tingkat lanjut (Advanced) yang di desain spesifik untuk menelusuri, mengekstrak, dan mengirimkan arsip *High Quality Cosplay* dari sumber seperti `Cosplaytele` dan `4KHD` secara otomatis. Ditulis dengan Node.js dan dirancang siap *deploy* untuk server/VPS skala kecil maupun menengah.

---

## 🔥 Fitur Utama (Features)

🔹 **Cosplaytele Interactive Scraper:** Jelajahi ribuan *gallery* secara mulus langsung dari *chat* Telegram dengan antarmuka penomoran halaman pintar (*pagination*).  
🔹 **Smart Gofile/Terabox Extractor:** Tidak perlu *copy-paste link*! Bot dapat mendeteksi _folder Gofile_ dan menembus antrean *password* Terabox (`4KHD`) menggunakan permesinan rahasia dari `xAPIverse`, semuanya terekstrak otomatis di belakang layar.  
🔹 **Gacha Mode (Random SSR):** Bosan *search*? Tekan mode _Gacha_ (`/gacha`) untuk menerjunkan bot secara vertikal ke sembarang halaman web, lalu mengembalikan *Thumbnail SSR* acak!  
🔹 **Telegram's MediaGroup Album Auto-Build:** Bot mengunggah ulang arsip `.ZIP` / `.RAR` raksasa dengan membaraikan isinya, dirakit dan dijadikan bentuk _Multiple-Images Album_ Telegram secara instan. Termasuk dukungan untuk otomatis-memutar berkas Video `.MP4`!  
🔹 **Anti-Crash & Sharp Compressor Engine:** Sistem algoritma _Media Chunker_ yang mengkalkulasi bobot Payload Telegram 50MB. Dilengkapi integrasi modul `sharp` (*AI Compressor*) untuk diam-diam merampingkan resolusi foto raksasa (contoh: 4K 12MB) menjadi mode aman (ukuran standar) demi mencegah eror `PHOTO_INVALID_DIMENSIONS`.  
🔹 **Auto-Clean UX (Wipe UI):** Riwayat komando menu pengguna selalu disapu bersih pada hitungan sepersekian detik menghasilkan tata letak chat yang bersih anti numpuk!

---

## 🚀 Panduan Instalasi (Deployment Guide)

### 1. Kebutuhan Sistem
1. [Node.js](https://nodejs.org/en/) >= v18.0
2. Package Manager (`npm` atau `yarn`)
3. Server VPS (Opsional namun sangat disarankan via Linux Ubuntu/Debian)

### 2. Cara Meng-install
```bash
# Lakukan Clone Repositori
git clone https://github.com/fiore-cmd/costelebot.git
cd costelebot

# Install seluruh Pustaka Dependensi (sangat wajib)
npm install

# Instalasi Mesin Browser Web untuk Scraper Gofile
npx playwright install
```

### 3. Setup Konfigurasi Kunci (Environment Variables)
Anda WAJIB memberikan asupan "Kunci API" rahasia sebelum bot dijalankan. Buatlah file rahasia bernama `.env` di luar folder (sejajar dengan package.json).
```env
BOT_TOKEN=8xxxxxxx:AAFz...                       # Token Telegram Bot
XAPIVERSE_KEY=sk_882fd19...                      # Token Terabox Resolver 
```

---

## 🏃 Menjalankan Bot di VPS (PM2 Mode)

Bot didesain untuk menyala 24 jam penuh di baliknya. Gunakan `PM2` untuk menjaga ekosistem Bot Anda tidak pernah tidur.

```bash
# Menyalakan untuk pertama kali
npx pm2 start telegram-bot.js --name "costelebot"

# Melihat riwayat kerja (Monitoring Log)
npx pm2 logs costelebot

# Restart sistem sewaktu waktu jika ada update code
npx pm2 restart costelebot
```

---

## 🎮 Command Tersedia

Ketikkan command berikut langsung di layar Telegram Bot Anda untuk bermanuver!

- `/start` - Menyiapkan pemanggilan Antarmuka Menu Utama GUI.
- `/browse` - Memanggil perpustakaan `Cosplaytele`.
- `/search <query>` - Langsung menusuk _database server_ lewat teks tertentu secara estetik.
- `/gacha` - Merandom foto rilis terbaik (*Surprise me*!).
- `/clear` - Tombak sihir yang menghilangkan 800 pesan obrolan di layar seketika!.
- `/stats` - Dashboard eksklusif Intelijen. Mengintai memori VPS, trafik jaringan, dan seluruh tugas unduhan yang dibongkar. 

> *Developed with ❤️ by Fiore.*
