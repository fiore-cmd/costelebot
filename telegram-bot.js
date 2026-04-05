'use strict';
require('dotenv').config(); // Load environment variables dari file .env

const TelegramBot                 = require('node-telegram-bot-api');
const axios                       = require('axios');
const fs                          = require('fs');
const os                          = require('os');
const fsp                         = fs.promises;
const path                        = require('path');
// Modul unzipper dan node-unrar-js telah dinonaktifkan untuk menghemat RAM (Telah menggunakan native P7zip OS)
const sharp                       = require('sharp'); // Auto-Compressor
const cosplayteleScraper          = require('./scrapers/cosplaytele');
const gofileApi                   = require('./scrapers/gofile');
const mediafireApi                = require('./scrapers/mediafire');
const kemonoScraper               = require('./scrapers/kemono');

process.env.NTBA_FIX_350 = 1; // Fix node-telegram-bot-api deprecation warning
sharp.cache(false);   // Matikan seluruh RAM cache agar RAM tidak bengkak
// sharp.concurrency(1) sudah DICABUT. Mengembalikan Sharp ke multi-thread maksimum OS agar compress lebih ngebut!



// ─── CONFIG ──────────────────────────────────────────────────────────────────
const CONFIG = {
  BOT_TOKEN:        process.env.BOT_TOKEN,
  ALLOWED_USER_IDS: [], // kosong = semua
  XAPIVERSE_KEY:    process.env.XAPIVERSE_KEY,
  XAPIVERSE_URL:    'https://xapiverse.com/api/terabox-pro',
  TEMP_DIR:         './tmp_downloads',
  IMAGE_EXTS:       ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
  POSTS_PER_PAGE:   8,
  SEND_DELAY:       600,
  PHOTO_MAX_BYTES:  10 * 1024 * 1024,
  VIDEO_MAX_BYTES:  50 * 1024 * 1024,
  DOC_MAX_BYTES:    50 * 1024 * 1024,
};

// ─── LOGGER & UTILS ──────────────────────────────────────────────────────────
const log = {
  info:  (m) => console.log(`\x1b[36m[INFO]\x1b[0m  ${m}`),
  ok:    (m) => console.log(`\x1b[32m[OK]\x1b[0m    ${m}`),
  warn:  (m) => console.log(`\x1b[33m[WARN]\x1b[0m  ${m}`),
  error: (m) => console.log(`\x1b[31m[ERROR]\x1b[0m ${m}`),
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isImage   = (f) => CONFIG.IMAGE_EXTS.includes(path.extname(f).toLowerCase());
const isVideo   = (f) => ['.mp4', '.mov', '.webm', '.mkv'].includes(path.extname(f).toLowerCase());
const isMedia   = (f) => isImage(f) || isVideo(f);
const isArchive = (f) => ['.zip', '.rar', '.7z'].includes(path.extname(f).toLowerCase());

async function rimraf(dir) {
  if (fs.existsSync(dir)) {
    await fsp.rm(dir, { recursive: true, force: true });
    log.info(`Dihapus: ${dir}`);
  }
}

function collectFiles(dir) {
  const res = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d)) {
      const f = path.join(d, e);
      fs.statSync(f).isDirectory() ? walk(f) : res.push(f);
    }
  };
  walk(dir);
  return res.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

function chunkMediaByLimits(medias) {
  const MAX_ITEMS = 10;
  const MAX_BYTES = 45 * 1024 * 1024; // Limit gabungan upload Telegram Bot API (sekitar 45MB aman)
  
  const chunks = [];
  let currentChunk = [];
  let currentSize = 0;
  
  for (const mediaPath of medias) {
    const size = fs.existsSync(mediaPath) ? fs.statSync(mediaPath).size : 0;
    
    // Jika ada satu file yang sendirian sudah jumbo (>45MB), kita paksa sendirian di chunk terpisah.
    // Atau jika batas kuota 10 biji tercapai, atau batas gabungan 45MB tercapai... potong jadi chunk baru.
    if (currentChunk.length > 0 && (currentChunk.length >= MAX_ITEMS || currentSize + size >= MAX_BYTES)) {
        chunks.push(currentChunk);
        currentChunk = [];
        currentSize = 0;
    }
    
    currentChunk.push(mediaPath);
    currentSize += size;
  }
  
  if (currentChunk.length > 0) chunks.push(currentChunk);
  return chunks;
}

// ─── SHARP AUTO-COMPRESSOR ───────────────────────────────────────────────────
async function sanitizeMediasForTelegram(medias, statusCallback) {
  // Telegram batas maksimal: 10 MB per foto, resolusi gabungan (width+height) tidak melewati 10000px
  let needStatus = false;
  
  for (let i = 0; i < medias.length; i++) {
     const mPath = medias[i];
     const ext = path.extname(mPath).toLowerCase();
     
     if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
       try {
           const fStats = fs.statSync(mPath);
           const meta = await sharp(mPath).metadata();
           const sumDim = meta.width + meta.height;
            const ratio = Math.max(meta.width, meta.height) / Math.min(meta.width, meta.height);
           
           // Jika file tembus >9MB atau resolusi kepanjangan, KOMPRES!
           if (fStats.size > 9 * 1024 * 1024 || sumDim > 9000 || ratio > 19) {
               if (!needStatus) {
                   await statusCallback(`🗜️ <b>Sistem Cerdas Bekerja</b>: Terdapat beberapa foto 4K Raksasa! Mengkompres ukurannya sesaat...`);
                   needStatus = true;
               }
               
               const outPath = mPath + '_compressed.jpg';
               let s = sharp(mPath);
               
               // Resize jika rasio konyol
               if (meta.width > 4200) s = s.resize({ width: 4200 });
               else if (sumDim > 9000 && meta.height > 4200) s = s.resize({ height: 4200 });
                
                if (ratio > 19) {
                   const safeWidth = meta.width > meta.height ? Math.min(meta.width, Math.floor(meta.height * 18)) : undefined;
                   const safeHeight = meta.height > meta.width ? Math.min(meta.height, Math.floor(meta.width * 18)) : undefined;
                   s = s.resize({ width: safeWidth, height: safeHeight, fit: 'cover', position: 'top' });
                }
               
               // Kompres ke persentase aman ~80%
               await s.jpeg({ quality: 80 }).toFile(outPath);
               
               // Ganti tracker array media ke file versi kurus
               medias[i] = outPath; 
               
               // Jeda 200 milidetik agar CPU sempat "bernapas" dan Garbace Collector berjalan
               await new Promise(res => setTimeout(res, 200));
               global.gc && global.gc();
           }
       } catch (err) {
           console.log(`Gagal mem-bypass resolusi untuk ${mPath}: ` + err.message);
       }
     }
  }
}

// ─── STATE MANAGEMENT ────────────────────────────────────────────────────────
// Format: chatId -> { step: 'AWAITING_SOURCE' | 'AWAITING_PASSWORD', url: string }
const userStates = new Map();
const browseCache = new Map(); // chatId -> { posts: [], page, category, query }
const menuTracker = new Map(); // chatId -> lastMessageId (Untuk auto-clean menu lama)

// ─── ADMIN STATS TRACKER ─────────────────────────────────────────────────────
const botStats = {
  startTime: Date.now(),
  downloadedBytes: 0,
  extractedFiles: 0,
  totalJobs: 0
};

async function autoCleanOldMenu(bot, chatId, newMsgId) {
  const oldId = menuTracker.get(chatId);
  // Hapus menu lama jika ada
  if (oldId && oldId !== newMsgId) {
    bot.deleteMessage(chatId, oldId).catch(()=>{});
  }
  menuTracker.set(chatId, newMsgId);
}

// ─── TERABOX DOWNLOAD PIPELINE ───────────────────────────────────────────────
async function getApiResult(teraboxUrl) {
  const { data } = await axios.post(CONFIG.XAPIVERSE_URL, { url: teraboxUrl }, {
    headers: { 'Content-Type': 'application/json', 'xAPIverse-Key': CONFIG.XAPIVERSE_KEY },
    timeout: 30000,
  });
  if (!data.list || !data.list.length) return null;
  const item = data.list[0];
  return {
    zipDlink: item.zip_dlink || null,
    name:     item.name || 'archive',
    sizeMB:   (item.size / 1024 / 1024).toFixed(1),
    credits:  data.free_credits_remaining || '?',
  };
}

async function downloadStream(url, destPath, onProgress, cookie = null) {
  const headers = {};
  if (cookie) headers['Cookie'] = cookie;
  
  const res = await axios({ url, method: 'GET', responseType: 'stream', timeout: 600000, headers });
  const total = parseInt(res.headers['content-length'] || '0', 10);
  let downloaded = 0, lastPct = 0;

  return new Promise((resolve, reject) => {
    const writer = fs.createWriteStream(destPath);
    res.data.pipe(writer);
    res.data.on('data', (chunk) => {
      downloaded += chunk.length;
      botStats.downloadedBytes += chunk.length; // TRACKING TRAFIK
      if (total > 0 && onProgress) {
        const pct = Math.floor((downloaded / total) * 100);
        if (pct >= lastPct + 10) { lastPct = pct; onProgress(pct, downloaded, total); }
      }
    });
    writer.on('finish', () => { writer.close(); resolve(); });
    writer.on('error', (err) => {
      writer.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
  });
}

async function extractArchive(archivePath, destDir, password = null) {
  await fsp.mkdir(destDir, { recursive: true });
  const ext = path.extname(archivePath).toLowerCase();
  const { execSync } = require('child_process');

  if (ext === '.zip' || ext === '.rar') {
    const candidates = [password, 'cosplaytele', '4KHD', '4khd', null].filter((p, i, arr) => arr.indexOf(p) === i);
    let success = false;
    for (const pw of candidates) {
        try {
            if (ext === '.zip') {
                const pwFlag = pw ? `-p"${pw}"` : '';
                execSync(`7z x "${archivePath}" ${pwFlag} -o"${destDir}" -y`, { stdio: 'ignore' });
            } else {
                // Untuk Linux VPS, .rar jauh lebih handal di-decode menggunakan modul unrar asli bawaan VPS
                const pwFlag = pw ? `-p"${pw}"` : '-p-'; // -p- menolak password kosong prompt
                execSync(`unrar x -y ${pwFlag} "${archivePath}" "${destDir}/"`, { stdio: 'ignore' });
            }
            success = true;
            log.ok(`Archive extracted via Native OS (pw=${pw || 'none'})`);
            break;
        } catch (e) { }
    }
    if (!success) throw new Error("Gagal ekstrak Arsip via OS Native, password mungkin salah/corrupted.");
  }

  // Nested extract
  for (const file of collectFiles(destDir)) {
    if (!isArchive(file)) continue;
    const subDir = file.replace(/\.[^.]+$/, '_x');
    try {
      await extractArchive(file, subDir, password);
      fs.unlinkSync(file);
    } catch (e) { log.warn(`Nested extract fail: ${e.message}`); }
  }
}

async function sendOne(bot, chatId, filePath, explicitCaption = null) {
  const size = fs.statSync(filePath).size;
  const name = path.basename(filePath);
  const finalCaption = explicitCaption !== null ? explicitCaption : name;
  
  if (size > 100 * 1024 * 1024) return; // Skip too large > 100MB completely

  if (isVideo(filePath) && size < CONFIG.VIDEO_MAX_BYTES) {
    try {
      await bot.sendVideo(chatId, fs.createReadStream(filePath), { caption: finalCaption });
    } catch(e) {
      log.warn(`Gagal sendVideo (${name}), fallback doc: ${e.message}`);
      try { await bot.sendDocument(chatId, fs.createReadStream(filePath), { caption: finalCaption }); } catch (_) {}
    }
  } else if (isImage(filePath) && size < CONFIG.PHOTO_MAX_BYTES) {
    try { 
      // Kirim sebagai foto dari stream
      await bot.sendPhoto(chatId, fs.createReadStream(filePath), { caption: finalCaption }); 
    }
    catch (e) { 
      try { 
        log.warn(`Gagal sendPhoto (${name}), fallback document: ${e.message}`);
        await bot.sendDocument(chatId, fs.createReadStream(filePath), { caption: finalCaption }); 
      } catch (_) {} 
    }
  } else {
    try { await bot.sendDocument(chatId, fs.createReadStream(filePath), { caption: finalCaption }); } catch (_) {}
  }
}

async function processDownload(bot, chatId, url, password, isGofile = false) {
  log.info(`[User ${chatId}] Memulai processDownload: ${url}`);
  const tmpBase  = path.join(CONFIG.TEMP_DIR, `job_${Date.now()}`);
  let zipPath  = `${tmpBase}_raw.zip`;
  const unzipDir = `${tmpBase}_ext`;
  let statusMsg = null;
  const status = async (txt) => {
    try {
      if (statusMsg) await bot.editMessageText(txt, { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML' });
      else statusMsg = await bot.sendMessage(chatId, txt, { parse_mode: 'HTML' });
    } catch (_) {}
  };

  try {
    await fsp.mkdir(CONFIG.TEMP_DIR, { recursive: true });
    
    let downloadLink = null;
    let fileName = 'archive.zip';
    let cookie = null;

    if (isGofile) {
      await status('⚙️ <b>Memproses isi link Gofile...</b>');
      log.info(`[Process] Memeriksa isi Gofile lewat Playwright...`);
      const gofileRes = await gofileApi.resolveGofile(url);
      if (!gofileRes || gofileRes.files.length === 0) {
        log.warn(`[Process] Resolving Gofile gagal / kosong: ${url}`);
        return status('❌ Gagal meresolve isi Gofile, atau folder kosong.');
      }
      
      let targetFile;
      // Jika gofileRes.files dilempar dari button spesifik, kita cari id-nya. 
      // Tapi karena saat ini processDownload menerima `url` yang merupakan base url (misal gofile.io/d/123),
      // kalau ada M>1 file di dalam, bot seharusnya bertanya dulu.
      // Kita asumsikan saat memanggil `processDownload`, jika url mengandung "#file=", kita pilih spesifik.
      const fMatch = url.match(/#file=(.+)$/);
      if (fMatch) {
        targetFile = gofileRes.files.find(f => f.id === fMatch[1]);
      } else if (gofileRes.files.length === 1) {
        targetFile = gofileRes.files[0];
      } else {
        // Terdapat >1 file and tidak ada url/#file spesifik. Tampilkan opsi:
        let textOpts = `📁 <b>Terdapat ${gofileRes.files.length} file di Gofile.</b>\nPilih file yang ingin didownload:\n\n`;
        const btns = [];
        gofileRes.files.forEach((f, i) => {
           btns.push([{ text: `⬇️ ${f.name}`, callback_data: `dls_gofile_${f.id}` }]);
        });
        
        // Simpan url utama ke state agar callback query ntar tau url asalnya
        userStates.set(chatId, { step: 'SELECT_GOFILE_FILE', url: url });
        
        await bot.editMessageText(textOpts, {
           chat_id: chatId, message_id: statusMsg.message_id, parse_mode: 'HTML',
           reply_markup: { inline_keyboard: btns }
        });
        return; // Hentikan di sini.
      }

      if (!targetFile) return status('❌ File tidak ditemukan di dalam Gofile.');

      downloadLink = targetFile.link;
      fileName = targetFile.name || 'gofile_archive.zip';
      cookie = gofileRes.cookie;
      zipPath = `${tmpBase}_raw${path.extname(fileName)}`;
    } else {
      await status('⚙️ <b>Mapping via xAPIverse...</b>');
      const api = await getApiResult(url);
      if (!api || !api.zipDlink) return status('❌ API Gagal / Kuota Habis.');
      downloadLink = api.zipDlink;
      fileName = api.name;
    }
    
    await status(`⬇️ <b>Mengunduh ${fileName}...</b>\n📦`);
    await downloadStream(downloadLink, zipPath, async (pct, dl, tot) => {
      await status(`⬇️ <b>Mengunduh ${fileName}...</b>\n<code>${pct}%  ─  ${(dl/1048576).toFixed(1)} MB / ${(tot ? (tot/1048576).toFixed(1) : '?')} MB</code>`);
    }, cookie);

    await status('📦 <b>Mengekstrak arsip...</b>');
    await extractArchive(zipPath, unzipDir, password);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

    const files = collectFiles(unzipDir);
    const medias = files.filter(isMedia);
    const docs = files.filter(f => !isMedia(f) && !isArchive(f));
    const total = medias.length + docs.length;

    if (total === 0) return status('⚠️ Arsip kosong atau berpassword proteksi tingkat tinggi.');
    botStats.totalJobs += 1; // TRACKING KERJAAN
    botStats.extractedFiles += total; // TRACKING JUMLAH FILE
    
    // Auto-compressor Sharp Engine (Pre-flight checks) sebelum masuk antiller
    await sanitizeMediasForTelegram(medias, status);
    
    await status(`📤 <b>Mengirim ${total} file Media...</b>`);

    let sent = 0;
    const mediaChunks = chunkMediaByLimits(medias);
    let isFirstBatch = true; // Untuk memastikan caption hanya ditambahkan 1x

    // 1. Mengirim gambar/video secara massal (Media Group)
    for (const chunk of mediaChunks) {
      const mediaGroup = chunk.map((mediaPath, idx) => {
        const obj = { 
           type: isVideo(mediaPath) ? 'video' : 'photo', 
           media: fs.createReadStream(mediaPath) 
        };
        if (isFirstBatch && idx === 0) {
          obj.caption = fileName;
        }
        return obj;
      });

      try {
        await bot.sendMediaGroup(chatId, mediaGroup);
        sent += chunk.length;
      } catch (err) {
        log.warn(`[User ${chatId}] Gagal sendMediaGroup, fallback manual. Er: ${err.message}`);
        // Jika MediaGroup gagal (mungkin ukuran file aneh), kirim satu-satu fallback
        for (let idx = 0; idx < chunk.length; idx++) {
          const caption = (isFirstBatch && idx === 0) ? fileName : '';
          await sendOne(bot, chatId, chunk[idx], caption);
          sent++;
        }
      }
      isFirstBatch = false;
      await status(`📤 <b>Mengirim Album... ${sent}/${medias.length}</b>`).catch(()=>{});
      await sleep(CONFIG.SEND_DELAY * 2); // delay sedikit agar tidak limit di Telegram
    }

    // 2. Mengirim file / dokumen (Jika ada)
    for (const d of docs) {
      // Untuk document, sengaja kita tidak timpa captionnya agar user tau ini doc apa
      await sendOne(bot, chatId, d);
      sent++;
      await sleep(CONFIG.SEND_DELAY);
    }
    
    await status(`✅ <b>Selesai!</b> Terkirim ${sent} file.\n<i>(Pesan status ini akan musnah dalam 5 detik..)</i>`);
    
    // Fitur Auto-Clean: Hapus pesan status download setelah 5 detik agar riwayat chat bersih
    setTimeout(() => {
      if (statusMsg) bot.deleteMessage(chatId, statusMsg.message_id).catch(()=>{});
    }, 5000);

  } catch (err) {
    await status(`❌ <b>Error:</b> <code>${err.message}</code>`);
  } finally {
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    await rimraf(unzipDir);
  }
}

// ─── COSPLAYTELE MAPPING HANDLERS ──────────────────────────────────────────────
async function sendPostDetail(bot, chatId, loadMsg, post, cacheIndex) {
  const links = await cosplayteleScraper.scrapePostDetail(post.url);
  let resText = `🔗 <b>Links Ditemukan:</b>\n${post.title}\n\n`;
  let dlButtons = [];
  
  if (links) {
    if (links.gofile) {
      resText += `📁 <b>Gofile:</b> ${links.gofile}\n`;
      dlButtons.push([{ text: '⬇️ Download via Gofile (Auto)', callback_data: `dlgofile_${cacheIndex}` }]);
    }
    if (links.mediafire) {
      resText += `🔥 <b>MediaFire:</b> ${links.mediafire}\n`;
      dlButtons.push([{ text: '⬇️ Download via MediaFire (Auto)', callback_data: `dlmediafire_${cacheIndex}` }]);
    }
    if (links.sorafolder) resText += `📁 <b>Sorafolder:</b> ${links.sorafolder}\n`;
    if (links.terabox) resText += `📥 <b>TeraBox:</b> ${links.terabox}\n`;
  } else {
    resText += 'Tidak ada link yang dikenali.';
  }
  
  const stateInfo = browseCache.get(chatId);
  if (stateInfo && stateInfo.isGacha) {
    dlButtons.push([{ text: '🎲 Cari Acak Lagi (Reroll)', callback_data: 'menu_gacha' }]);
    dlButtons.push([{ text: '🔙 Menu Utama', callback_data: 'menu_awal' }]);
  } else {
    dlButtons.push([{ text: '🔙 Kembali ke Daftar', callback_data: 'back_browse' }]);
  }
  
  const replyMarkupObj = dlButtons.length > 0 ? { inline_keyboard: dlButtons } : undefined;

  try {
    if (post.thumb) {
      await bot.deleteMessage(chatId, loadMsg.message_id).catch(()=>{});
      await bot.sendPhoto(chatId, post.thumb, {
        caption: resText, parse_mode: 'HTML', reply_markup: replyMarkupObj
      });
    } else {
      bot.editMessageText(resText, { 
        chat_id: chatId, message_id: loadMsg.message_id, parse_mode: 'HTML', reply_markup: replyMarkupObj
      });
    }
  } catch (err) {
    log.warn(`Gagal mengirim preview: ${err.message}`);
    bot.editMessageText(resText, { chat_id: chatId, message_id: loadMsg.message_id, parse_mode: 'HTML', reply_markup: replyMarkupObj }).catch(()=>{});
  }
}

async function doCosplayteleGacha(bot, chatId) {
  const gMsg = await bot.sendMessage(chatId, '🎲 <b>Mengguncang Mesin Gacha...</b>\n<i>Mencari random album rahasia dari dimensi lain...</i>', { parse_mode: 'HTML' });
  await autoCleanOldMenu(bot, chatId, gMsg.message_id);

  try {
    const randPage = Math.floor(Math.random() * 50) + 1; // Asumsi ada >50 page
    const posts = await cosplayteleScraper.scrapeListing(randPage, 'home');
    
    if (!posts || posts.length === 0) {
       return bot.editMessageText('❌ Mesin Gacha sedang macet, coba lagi nanti.', { chat_id: chatId, message_id: gMsg.message_id });
    }
    
    const randomPost = posts[Math.floor(Math.random() * posts.length)];
    // Sengaja overwrite cache index 0 agar tombol Download Gofile nyambung ke index ini
    browseCache.set(chatId, { posts: [randomPost], page: randPage, category: 'home', query: null, isGacha: true });
    
    await bot.editMessageText(`🎲 <b>Berhasil! Anda mendapat item SSR!</b>\n\n🔍 Memeriksa link untuk:\n<b>${randomPost.title}</b>`, { 
        chat_id: chatId, message_id: gMsg.message_id, parse_mode: 'HTML' 
    });
    
    await sendPostDetail(bot, chatId, gMsg, randomPost, 0);
  } catch (e) {
    log.error('Gacha gagal: ' + e.message);
    bot.editMessageText(`❌ Error Gacha: ${e.message}`, { chat_id: chatId, message_id: gMsg.message_id }).catch(()=>{});
  }
}

async function doKemonoGacha(bot, chatId, creatorUrl) {
  const gMsg = await bot.sendMessage(chatId, '🍁 <b>Patreon Gacha...</b>\n<i>Menelusuri database Patreon dari vault...</i>', { parse_mode: 'HTML' });

  try {
      const selectedPost = await kemonoScraper.getRandomKemonoPost(creatorUrl);
      const mediaUrls = await kemonoScraper.getKemonoPostMedia(selectedPost.href);
      const rawUrls = [...mediaUrls.inlineImgs, ...mediaUrls.links]
          .filter(u => u.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif|mp4|mov|webm)$/)); // Support images & videos
      const allUrls = [...new Set(rawUrls)]; // Remove duplicate urls
      
      if (allUrls.length === 0) {
          return bot.editMessageText(`😔 <b>${selectedPost.title}</b>\n\nPost ini tidak berisi gambar yang didukung (mungkin isinya zip/teks saja). Coba gacha lagi!`, { 
              chat_id: chatId, message_id: gMsg.message_id, parse_mode: 'HTML',
              reply_markup: { inline_keyboard: [[ { text: '🎲 Reroll', callback_data: 'menu_kemono_reroll' }, { text: '🔙 Menu', callback_data: 'menu_awal' } ]] }
          });
      }

      await bot.editMessageText(`🍁 <b>${selectedPost.title}</b>\n\n<i>⏳ Target Cloudflare terkunci. Mengekstrak ${allUrls.length} media secara luring ke server lokal...</i>`, {
          chat_id: chatId, message_id: gMsg.message_id, parse_mode: 'HTML'
      }).catch(()=>{});

      // Bikin direktori luring
      const jobDir = path.join(CONFIG.TEMP_DIR, 'kemono_' + Date.now());
      await fsp.mkdir(jobDir, { recursive: true });

      let downloadedFiles = [];
      for (let i = 0; i < allUrls.length; i++) {
          const u = allUrls[i];
          try {
              const cleanUrl = u.split('?')[0]; 
              let ext = path.extname(cleanUrl) || '.jpg';
              if (!ext.match(/\.(jpg|jpeg|png|webp|gif|mp4|mov|webm)$/i)) ext = '.jpg'; // Fallback
              const dest = path.join(jobDir, `media_${i}${ext}`);
              
              // Mengunduh diam-diam
              await downloadStream(u, dest, null, null);
              downloadedFiles.push(dest);
          } catch(e) {
              log.warn(`[Kemono DL] Gagal download ${u}`);
          }
      }

      if (downloadedFiles.length === 0) {
          await rimraf(jobDir);
          return bot.editMessageText(`❌ Gagal mendownload isi media (Akses ditolak CDN/Kosong)`, { chat_id: chatId, message_id: gMsg.message_id });
      }

      await bot.editMessageText(`🍁 <b>${selectedPost.title}</b>\n\n<i>✓ Berhasil mendownload ${downloadedFiles.length} media. Memfilter ukuran raksasa...</i>`, { chat_id: chatId, message_id: gMsg.message_id, parse_mode: 'HTML' }).catch(()=>{});

      // Filter kompresor untuk memangkas ukuran raksasa melebihi 10MB
      await sanitizeMediasForTelegram(downloadedFiles, (txt) => {
         bot.editMessageText(txt, { chat_id: chatId, message_id: gMsg.message_id, parse_mode: 'HTML' }).catch(()=>{});
      });

      // Hapus pesan progres
      bot.deleteMessage(chatId, gMsg.message_id).catch(()=>{});
      
      const chunks = chunkMediaByLimits(downloadedFiles);
      for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const mediaGroup = chunk.map((localFile, idx) => ({
              type: localFile.match(/\.(mp4|mov|webm)$/i) ? 'video' : 'photo',
              media: fs.createReadStream(localFile),
              caption: i === 0 && idx === 0 ? `🍁 <b>${selectedPost.title}</b>` : undefined,
              parse_mode: 'HTML'
          }));
          
          try {
              await bot.sendMediaGroup(chatId, mediaGroup);
          } catch(e) {
              log.error(`[Patreon Batch Send Error] ${e.message}`);
          }
          await sleep(CONFIG.SEND_DELAY); 
      }
      
      const navMsg = await bot.sendMessage(chatId, `🍁 <b>${selectedPost.title}</b>\n\n<i>✓ Operasi Klandestin selesai. ${downloadedFiles.length} File berhasil diekstrak!</i>`, {
         parse_mode: 'HTML',
         reply_markup: { inline_keyboard: [[ { text: '🎲 Reroll Gacha', callback_data: 'menu_kemono_reroll' }, { text: '🔙 Menu Utama', callback_data: 'menu_awal' } ]] }
      });
      autoCleanOldMenu(bot, chatId, navMsg.message_id);
      
      // Bersihkan jejak
      await rimraf(jobDir);
      
  } catch (e) {
      log.error('Patreon Gacha gagal: ' + e.message);
      bot.editMessageText(`❌ Error Patreon: ${e.message}`, { chat_id: chatId, message_id: gMsg.message_id }).catch(()=>{});
  }
}

// ─── COSPLAYTELE BROWSE HANDLERS ─────────────────────────────────────────────
async function doCosplayteleBrowse(bot, chatId, category = 'home', page = 1, query = null) {
  log.info(`[User ${chatId}] Request Cosplaytele (Cat: ${category}, Page: ${page}, Query: ${query || 'none'})`);
  const loadMsg = await bot.sendMessage(chatId, `🔍 <b>Memuat Cosplaytele...</b>`, { parse_mode: 'HTML' });
  await autoCleanOldMenu(bot, chatId, loadMsg.message_id);

  try {
    const posts = await cosplayteleScraper.scrapeListing(page, category, query);
    if (!posts.length) return bot.editMessageText('⚠️ Tidak ada post ditemukan.', { chat_id: chatId, message_id: loadMsg.message_id });

    const shown = posts.slice(0, CONFIG.POSTS_PER_PAGE);
    browseCache.set(chatId, { posts: shown, page, category, query });

    let text = `✨ <b>Cosplaytele</b> ${query ? `(Query: ${query})` : ''} · Halaman ${page}\n\n`;
    shown.forEach((p, i) => text += `${i+1}. ${p.title}\n`);

    const buttons = [];
    for (let i = 0; i < shown.length; i += 2) {
      const row = [{ text: `${i+1}. 📖 Detail`, callback_data: `cpt_${i}` }];
      if (i+1 < shown.length) row.push({ text: `${i+2}. 📖 Detail`, callback_data: `cpt_${i+1}` });
      buttons.push(row);
    }

    const navRow = [];
    if (page > 1) navRow.push({ text: '◀ Prev', callback_data: `cpage_${page-1}` });
    navRow.push({ text: 'Next ▶', callback_data: `cpage_${page+1}` });
    buttons.push(navRow);

    await bot.editMessageText(text, {
      chat_id: chatId, message_id: loadMsg.message_id, parse_mode: 'HTML',
      reply_markup: { inline_keyboard: buttons }
    });
  } catch (err) {
    bot.editMessageText(`❌ Gagal: ${err.message}`, { chat_id: chatId, message_id: loadMsg.message_id }).catch(()=>{});
  }
}

// ─── INIT BOT ────────────────────────────────────────────────────────────────
async function sendMainMenu(bot, chatId) {
  const sentMsg = await bot.sendMessage(chatId, `👋 <b>Cosplay & 4KHD Bot</b>\n\nPilih mode operasi:`, {
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [{ text: '🔍 Cari Karakter / Album Cosplay', callback_data: 'menu_search' }],
        [{ text: '📚 Browse Cosplay', callback_data: 'menu_browse' }, { text: '🎲 Gacha Cosplay', callback_data: 'menu_gacha' }],
        [{ text: '🍁 Patreon Gacha', callback_data: 'menu_kemono_reroll' }],
        [{ text: '📊 Statistik & Kesehatan Bot', callback_data: 'menu_stats' }],
        [{ text: '📥 Manual Terabox DL', callback_data: 'menu_terabox' }]
      ]
    }
  });
  autoCleanOldMenu(bot, chatId, sentMsg.message_id);
}

function startBot() {
  const bot = new TelegramBot(CONFIG.BOT_TOKEN, { polling: true });
  log.ok('Bot Telegram aktif ✅');

  // Set Telegram Menu Commands
  bot.setMyCommands([
    { command: '/start', description: 'Buka Menu Utama' },
    { command: '/browse', description: 'Jelajahi Postingan Cosplay Terbaru' },
    { command: '/gacha', description: '🎲 Gacha Cosplay Random (Surprise Me)' },
    { command: '/maple', description: '🍁 Gacha Patreon' },
    { command: '/search', description: 'Cari Karakter / Album Cosplay' },
    { command: '/stats', description: '📊 Lihat Laporan Statistik Server' },
    { command: '/clear', description: '🧹 Bersihkan Seluruh Layar (Wipe History)' }
  ]).catch(() => log.warn('Gagal set command menu.'));

  // Menus
  bot.onText(/\/start/, (msg) => {
    bot.deleteMessage(msg.chat.id, msg.message_id).catch(()=>{}); // Auto-clean chat dari sisi user
    log.info(`[User ${msg.chat.id}] Execute /start`);
    sendMainMenu(bot, msg.chat.id);
  });

  bot.onText(/\/browse/, (msg) => {
    bot.deleteMessage(msg.chat.id, msg.message_id).catch(()=>{}); // Auto-clean
    log.info(`[User ${msg.chat.id}] Execute /browse`);
    doCosplayteleBrowse(bot, msg.chat.id, 'home', 1);
  });

  bot.onText(/\/gacha(?!\d)/, (msg) => {
    bot.deleteMessage(msg.chat.id, msg.message_id).catch(()=>{}); // Auto-clean
    log.info(`[User ${msg.chat.id}] Execute /gacha`);
    doCosplayteleGacha(bot, msg.chat.id);
  });

  bot.onText(/\/maple/, (msg) => {
    bot.deleteMessage(msg.chat.id, msg.message_id).catch(()=>{}); // Auto-clean
    const urls = [
       'https://kemono.cr/patreon/user/3295915',
       'https://kemono.cr/patreon/user/49965584'
    ];
    const pickedUrl = urls[Math.floor(Math.random() * urls.length)];
    log.info(`[User ${msg.chat.id}] Execute /maple Kemono Gacha (${pickedUrl})`);
    doKemonoGacha(bot, msg.chat.id, pickedUrl);
  });

  bot.onText(/^\/search(?:\s+(.+))?$/, async (msg, match) => {
    bot.deleteMessage(msg.chat.id, msg.message_id).catch(()=>{}); // Auto-clean
    const query = match[1];
    if (query) {
       log.info(`[User ${msg.chat.id}] Execute /search ${query}`);
       doCosplayteleBrowse(bot, msg.chat.id, 'home', 1, query);
    } else {
       log.info(`[User ${msg.chat.id}] Execute /search (No Query)`);
       userStates.set(msg.chat.id, { step: 'AWAITING_SEARCH_QUERY' });
       const sentMsg = await bot.sendMessage(msg.chat.id, '🔍 <b>Pencarian Judul / Karakter</b>\n\nSilakan ketik nama karakter, nama cosplayer, atau judul apa saja di chat, lalu kirimkan:', { parse_mode: 'HTML' });
       autoCleanOldMenu(bot, msg.chat.id, sentMsg.message_id);
    }
  });

  bot.onText(/\/clear/, async (msg) => {
    log.info(`[User ${msg.chat.id}] Execute /clear (WIPING ALL)`);
    const sentMsg = await bot.sendMessage(msg.chat.id, '🧹 <i>Tornado Pembersih Aktif! Menghapus seratus pesan terakhir...</i>', { parse_mode: 'HTML' });
    
    // Looping mundur menghapus hingga 80 pesan terakhir dengan delay
    // Mencegah EFATAL: AggregateError akibat API/Socket exhaustion
    for (let i = msg.message_id; i > Math.max(0, msg.message_id - 80); i--) {
      bot.deleteMessage(msg.chat.id, i).catch(()=>{});
      await sleep(35); // Delay 35ms untuk memberi nafas pada pool koneksi axios
    }
    
    // Hapus chat sapu bersihnya juga setelah beberapa detik
    setTimeout(() => {
        bot.deleteMessage(msg.chat.id, sentMsg.message_id).catch(()=>{});
    }, 4000);
  });


  bot.onText(/^\/stats(?:\s|$)/, async (msg) => {
    bot.deleteMessage(msg.chat.id, msg.message_id).catch(()=>{});
    log.info(`[User ${msg.chat.id}] Execute /stats`);
    
    const uptimeSec = Math.floor((Date.now() - botStats.startTime) / 1000);
    const hrs = Math.floor(uptimeSec / 3600);
    const mins = Math.floor((uptimeSec % 3600) / 60);
    
    const ramMB = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
    const totalMemMB = (os.totalmem() / 1024 / 1024).toFixed(0);
    const freeMemMB = (os.freemem() / 1024 / 1024).toFixed(0);
    
    // Format memory network size
    let dlFormatted = 0;
    if (botStats.downloadedBytes > 1024*1024*1024) dlFormatted = (botStats.downloadedBytes / (1024*1024*1024)).toFixed(2) + ' GB';
    else dlFormatted = (botStats.downloadedBytes / (1024*1024)).toFixed(2) + ' MB';
    
    const txt = `📊 <b>Statistik Server Bot Canggih</b>\n` +
                `━━━━━━━━━━━━━━━━━━\n` +
                `⏳ <b>Uptime:</b> ${hrs} Jam ${mins} Menit\n` +
                `💾 <b>RAM Node.js:</b> ${ramMB} MB\n` +
                `🖥️ <b>RAM VPS Global:</b> Sisa ${freeMemMB} MB / ${totalMemMB} MB\n\n` +
                `📈 <b>Aktivitas Kinerja:</b>\n` +
                `🌐 Trafik Terkuras: <b>${dlFormatted}</b>\n` +
                `✅ Total Dieksekusi: <b>${botStats.totalJobs}</b> Album\n` +
                `📸 Media Terkirim: <b>${botStats.extractedFiles}</b> File\n` +
                `━━━━━━━━━━━━━━━━━━`;
                
    const sentMsg = await bot.sendMessage(msg.chat.id, txt, { parse_mode: 'HTML' });
    autoCleanOldMenu(bot, msg.chat.id, sentMsg.message_id);
  });

  // Handling user messages for Terabox manual and Passwords
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;
    const chatId = msg.chat.id;
    const text = msg.text.trim();
    log.info(`[User ${chatId}] Mengirim pesan text: ${text.substring(0, 50)}...`);

    const state = userStates.get(chatId);

    // If awaiting password
    if (state && state.step === 'AWAITING_PASSWORD') {
      const pw = (text.toUpperCase() === 'SKIP') ? null : text;
      userStates.delete(chatId);
      bot.sendMessage(chatId, `🔐 Password set to: ${pw ? pw : '(None)'}. Memulai download...`);
      processDownload(bot, chatId, state.url, pw).catch(e => log.error('process: ' + e.message));
      return;
    }

    // If awaiting search query
    if (state && state.step === 'AWAITING_SEARCH_QUERY') {
      userStates.delete(chatId);
      log.info(`[User ${chatId}] Pencarian Interaktif: ${text}`);
      doCosplayteleBrowse(bot, chatId, 'home', 1, text);
      return;
    }

    // Direct link paste
    if (text.includes('terabox.com') || text.includes('1024terabox.com')) {
      userStates.set(chatId, { step: 'AWAITING_SOURCE', url: text });
      bot.sendMessage(chatId, '🔗 <b>TeraBox Link Terdeteksi!</b>\n\nApakah link ini dari 4KHD.com?', {
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Ya, dari 4KHD (Auto Password)', callback_data: 'src_4khd' }],
            [{ text: '❌ Bukan (Input Manual)', callback_data: 'src_other' }]
          ]
        }
      });
      return;
    }

    if (text.includes('gofile.io')) {
      bot.sendMessage(chatId, '🔗 <b>Gofile Link Terdeteksi!</b> Memulai download otomatis...');
      processDownload(bot, chatId, text, null, true).catch(e => log.error('process: ' + e.message));
      return;
    }
  });

  // Callbacks
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;
    log.info(`[User ${chatId}] Hitungan Callback: ${action}`);
    bot.answerCallbackQuery(query.id).catch(()=>{});

    let sid = null;
    const status = async (txt) => {
      try {
        if (!txt) { 
            if (sid) bot.deleteMessage(chatId, sid).catch(()=>{}); 
            return; 
        }
        if (!sid) {
          const m = await bot.sendMessage(chatId, txt, { parse_mode: 'HTML' });
          sid = m.message_id;
        } else {
          await bot.editMessageText(txt, { chat_id: chatId, message_id: sid, parse_mode: 'HTML' }).catch(()=>{});
        }
      } catch (e) {}
    };

    if (action.startsWith('dls_gofile_')) {
      const fileId = action.replace('dls_gofile_', '');
      const state = userStates.get(chatId);
      if (!state || state.step !== 'SELECT_GOFILE_FILE') return bot.sendMessage(chatId, 'Sesi kadaluarsa. Coba klik download ulang dari menu.');
      
      const gofileUrl = state.url + '#file=' + fileId;
      userStates.delete(chatId);
      bot.sendMessage(chatId, '🚀 Memulai download file spesifik dari Gofile...');
      processDownload(bot, chatId, gofileUrl, null, true).catch(e => log.error('process: ' + e.message));
      return;
    }

    // Menus
    if (action === 'menu_cosplaytele' || action === 'menu_browse') {
      bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
      return doCosplayteleBrowse(bot, chatId);
    }
    if (action === 'menu_gacha') {
      bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
      return doCosplayteleGacha(bot, chatId);
    }
    if (action === 'menu_awal') {
      bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
      return sendMainMenu(bot, chatId);
    }
    if (action === 'menu_kemono_reroll') {
      bot.deleteMessage(chatId, query.message.message_id).catch(()=>{});
      const urls = ['https://kemono.cr/patreon/user/3295915', 'https://kemono.cr/patreon/user/49965584'];
      const pickedUrl = urls[Math.floor(Math.random() * urls.length)];
      return doKemonoGacha(bot, chatId, pickedUrl);
    }
    if (action === 'menu_stats') {
      const uptimeSec = Math.floor((Date.now() - botStats.startTime) / 1000);
      const hrs = Math.floor(uptimeSec / 3600);
      const mins = Math.floor((uptimeSec % 3600) / 60);
      const ramMB = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
      const totalMemMB = (os.totalmem() / 1024 / 1024).toFixed(0);
      const freeMemMB = (os.freemem() / 1024 / 1024).toFixed(0);
      let dlFormatted = botStats.downloadedBytes > 1024*1024*1024 ? (botStats.downloadedBytes / (1024*1024*1024)).toFixed(2) + ' GB' : (botStats.downloadedBytes / (1024*1024)).toFixed(2) + ' MB';
      
      const txt = `📊 <b>Statistik Server Bot Canggih</b>\n━━━━━━━━━━━━━━━━━━\n⏳ <b>Uptime:</b> ${hrs} Jam ${mins} Menit\n💾 <b>RAM Node.js:</b> ${ramMB} MB\n🖥️ <b>RAM VPS Global:</b> Sisa ${freeMemMB} MB / ${totalMemMB} MB\n\n📈 <b>Aktivitas Kinerja:</b>\n🌐 Trafik Terkuras: <b>${dlFormatted}</b>\n✅ Total Dieksekusi: <b>${botStats.totalJobs}</b> Album\n📸 Media Terkirim: <b>${botStats.extractedFiles}</b> File\n━━━━━━━━━━━━━━━━━━`;
      await bot.sendMessage(chatId, txt, { parse_mode: 'HTML' });
      return;
    }

    if (action === 'menu_terabox') {
      const msg = await bot.sendMessage(chatId, 'Silakan COPY paste link TeraBox.com langsung ke bot ini.');
      autoCleanOldMenu(bot, chatId, msg.message_id);
      return;
    }
    if (action === 'menu_search') {
      userStates.set(chatId, { step: 'AWAITING_SEARCH_QUERY' });
      const msg = await bot.sendMessage(chatId, '🔍 <b>Pencarian Judul / Karakter</b>\n\nSilakan ketik nama karakter, nama cosplayer, atau judul apa saja di kolom chat, lalu kirimkan:', { parse_mode: 'HTML' });
      autoCleanOldMenu(bot, chatId, msg.message_id);
      return;
    }

    // Pagination Cosplaytele
    if (action.startsWith('cpage_')) {
      const page = parseInt(action.split('_')[1], 10);
      const cache = browseCache.get(chatId);
      if (cache) doCosplayteleBrowse(bot, chatId, cache.category, page, cache.query);
      return;
    }

    // Terabox Source selection
    if (action === 'src_4khd' || action === 'src_other') {
      const state = userStates.get(chatId);
      if (!state || state.step !== 'AWAITING_SOURCE') return bot.sendMessage(chatId, 'Sesi kadaluarsa, kirim ulang link.');
      
      if (action === 'src_4khd') {
        userStates.delete(chatId);
        bot.sendMessage(chatId, '✅ Menggunakan password default 4KHD. Memulai download...');
        processDownload(bot, chatId, state.url, '4KHD').catch(()=>{});
      } else {
        userStates.set(chatId, { step: 'AWAITING_PASSWORD', url: state.url });
        bot.sendMessage(chatId, '🔑 Silakan ketik <b>Password Arsip</b> dan kirim.\n<i>(Ketik SKIP jika tidak ada password)</i>', { parse_mode: 'HTML' });
      }
      return;
    }

    // Detail Cosplaytele
    if (action.startsWith('cpt_')) {
      const idx = parseInt(action.split('_')[1], 10);
      const cache = browseCache.get(chatId);
      if (!cache || !cache.posts[idx]) return bot.sendMessage(chatId, 'Data kedaluwarsa.');
      
      const post = cache.posts[idx];
      log.info(`[User ${chatId}] Membuka detail post: ${post.title}`);
      const dMsg = await bot.sendMessage(chatId, `🔍 Memeriksa link untuk:\n<b>${post.title}</b>`, { parse_mode: 'HTML' });
      
      await sendPostDetail(bot, chatId, dMsg, post, idx);
    }
    
    // Kembali ke Browse List (Tombol Back)
    if (action === 'back_browse') {
      const cache = browseCache.get(chatId);
      bot.deleteMessage(chatId, query.message.message_id).catch(()=>{}); // Hapus foto preview
      
      if (cache) {
        if (cache.isGacha) {
          const sentMsg = await bot.sendMessage(chatId, `👋 <b>Cosplay & 4KHD Bot</b>\n\nPilih mode operasi:`, {
            parse_mode: 'HTML',
            reply_markup: {
              inline_keyboard: [
                [{ text: '🔍 Browse Cosplaytele', callback_data: 'menu_cosplaytele' }],
                [{ text: '🎲 Gacha Cosplay (Acak!)', callback_data: 'menu_gacha' }],
                [{ text: '🔎 Cari / Search Judul', callback_data: 'menu_search' }],
                [{ text: '📥 Manual Terabox DL', callback_data: 'menu_terabox' }]
              ]
            }
          });
          return autoCleanOldMenu(bot, chatId, sentMsg.message_id);
        }
        return doCosplayteleBrowse(bot, chatId, cache.category, cache.page, cache.query);
      }
      return bot.sendMessage(chatId, 'Sesi kadaluarsa, ketik /browse kembali.');
    }

    // Auto Gofile Download dari menu
    if (action.startsWith('dlgofile_')) {
      const idx = parseInt(action.split('_')[1], 10);
      const cache = browseCache.get(chatId);
      if (!cache || !cache.posts[idx]) return;
      const post = cache.posts[idx];
      const links = await cosplayteleScraper.scrapePostDetail(post.url);
      if (links && links.gofile) {
         processDownload(bot, chatId, links.gofile, null, true).catch(e => log.error('process: ' + e.message));
      } else {
         bot.sendMessage(chatId, '⚠️ Link gofile tidak ditemukan untuk post ini.');
      }
    }
    
    // Auto MediaFire Download dari menu
    if (action.startsWith('dlmediafire_')) {
      const idx = parseInt(action.split('_')[1], 10);
      const cache = browseCache.get(chatId);
      if (!cache || !cache.posts[idx]) return;
      const post = cache.posts[idx];
      const links = await cosplayteleScraper.scrapePostDetail(post.url);
      
      if (links && links.mediafire) {
         bot.sendMessage(chatId, '🔥 <b>Bypass MediaFire:</b> Mencari direct download link rahasia...', { parse_mode: 'HTML' }).then(async m => {
             const directMFUrl = await mediafireApi.getDirectLink(links.mediafire);
             if (directMFUrl) {
                 bot.deleteMessage(chatId, m.message_id).catch(()=>{});
                 // Mulai pengunduhan langsung, `isGofile` kita set `false` karena ia mendownload langsung file murni zip/rar
                 processDownload(bot, chatId, directMFUrl, null, false).catch(e => log.error('process: ' + e.message));
             } else {
                 bot.editMessageText('⚠️ <b>Gagal!</b> Elemen download MediaFire tidak ditemukan karena proteksi.', { chat_id: chatId, message_id: m.message_id, parse_mode: 'HTML' });
             }
         });
      } else {
         bot.sendMessage(chatId, '⚠️ Link mediafire tidak lagi tersedia untuk post ini.');
      }
    }
  });

  bot.on('polling_error', (e) => log.error('Polling: ' + e.message));
}

process.on('uncaughtException', (err) => log.error(`Uncaught: ${err.message}`));
process.on('unhandledRejection', (err) => log.error(`Unhandled: ${err}`));

startBot();
