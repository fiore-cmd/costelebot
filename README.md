# 4KHD.com Scraper + Auto Downloader

Script Node.js untuk scraping dan auto-download konten dari [4khd.com](https://www.4khd.com/).

## Instalasi

```bash
cd 4khd-scraper
npm install
npx playwright install chromium   # Install browser untuk auto-downloader
```

---

## 🔍 SCRAPER — `scraper.js`

### Scrape listing saja (cepat)
```bash
node scraper.js
```

### Scrape dengan batasan halaman
```bash
node scraper.js --pages 5
```

### Scrape listing + detail (link download, password, preview)
```bash
node scraper.js --detail --pages 3
```

### Pilih kategori
```bash
node scraper.js --category popular
node scraper.js --category cosplay
node scraper.js --category album
```

### Semua opsi scraper
| Option | Keterangan |
|--------|-----------|
| `--pages <n>` | Batasi jumlah halaman |
| `--detail` | Scrape detail tiap post |
| `--category <cat>` | home \| popular \| cosplay \| album |

---

## ⬇️ DOWNLOADER — `downloader.js`

Gunakan **Playwright** (browser otomatis) untuk download file dari TeraBox.

### Workflow lengkap (scrape lalu download)
```bash
# Step 1: Scrape dulu
node scraper.js --pages 5

# Step 2: Download semua hasil scrape
node downloader.js
```

### Download dengan filter
```bash
# Hanya download file kecil (<= 200MB)
node downloader.js --max-size 200MB

# Hanya download post dengan keyword tertentu
node downloader.js --filter "TiTi"

# Batasi 3 download saja
node downloader.js --limit 3
```

### Mode debug (browser terlihat)
```bash
node downloader.js --headed --limit 1
```

### Cek status queue
```bash
node downloader.js --status
```

### Semua opsi downloader
| Option | Keterangan |
|--------|-----------|
| `--input <file>` | File JSON sumber (default: output/latest.json) |
| `--limit <n>` | Batasi jumlah download |
| `--filter <keyword>` | Filter berdasarkan keyword judul |
| `--max-size <size>` | Hanya file <= ukuran ini (e.g. 200MB, 1GB) |
| `--download-dir <dir>` | Folder tujuan (default: ./downloads) |
| `--headed` | Tampilkan browser (mode debug) |
| `--status` | Tampilkan status queue saja |

---

## 📁 Output File

| File/Folder | Keterangan |
|-------------|-----------|
| `output/latest.json` | Data scrape terbaru |
| `output/results_<ts>.json` | Data scrape dengan timestamp |
| `output/results_<ts>.csv` | Format CSV (bisa dibuka Excel) |
| `output/download_queue.json` | Status queue download |
| `downloads/<judul>/` | File yang sudah terdownload |
| `output/debug_*.png` | Screenshot debug jika download gagal |

---

## 🔄 Cara Kerja Downloader

```
scraper.js              downloader.js
─────────────           ─────────────────────────────────────────
Listing page   →  JSON  →  Queue Manager
                                ↓
                        Buka post 4khd.com
                                ↓
                        Ambil link m.4khd.com/XXXX
                                ↓
                        Follow JS redirect → TeraBox share URL
                                ↓
                        Buka TeraBox share page (Playwright)
                                ↓
                        Klik "Download All" / extrak via API
                                ↓
                        Simpan ke ./downloads/<judul>/
```

## ✅ Fitur

- **Scraper**: Pagination otomatis, retry, random User-Agent, export JSON+CSV
- **Downloader**: Queue dengan resume, download TeraBox via browser otomatis, filter ukuran/keyword, mode debug, screenshot jika error
