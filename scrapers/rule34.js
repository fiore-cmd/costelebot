const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Fitur Eksklusif: Rule34 Gacha 
 * Melakukan Bypass HTTP untuk mengais miliaran arsip gambar spesifik Rule34.xxx
 */
async function doR34Gacha(bot, chatId, statusCallback) {
  try {
     await statusCallback('🎲 <b>Rule34 Gacha:</b> Memutar roda Roulette miliaran arsip...');
     
     // Rule34 menggunakan 'pid' sebagai post offset (kelipatan 42)
     // VPS acap kali diblokir oleh Cloudflare 403 jika hanya memakai Axios.
     // Kita turunkan rasio halaman agar tidak terlalu dalam (Max 500 pages = 21000 pid)
     const randomPageOffset = Math.floor(Math.random() * 500) * 42; 
     const listUrl = `https://rule34.xxx/index.php?page=post&s=list&pid=${randomPageOffset}`;
     
     const r34Headers = {
         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
         'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
         'Accept-Language': 'en-US,en;q=0.5',
         'Cookie': 'resize-original=1;'
     };

     let resList;
     let successfulProxyAgent = null;
     
     try {
         resList = await axios.get(listUrl, { headers: r34Headers, timeout: 5000 });
     } catch (err) {
         console.warn('R34 offset ' + randomPageOffset + ' ditolak atau timeout. Memulai Aggressive Proxy Race...');
         const pm = require('./proxyManager');
         const { HttpsProxyAgent } = await import('https-proxy-agent');
         
         await statusCallback(`🛡️ <b>Anti-Bot:</b> Membanjiri jaringan TheSpeedX dengan 100 sambungan Paralel...\n⏳ Mencari 1 Proxy tercepat...`);
         
         try {
             const proxies = await pm.getProxies();
             const testProxies = [];
             for(let i=0; i<100; i++) testProxies.push(proxies[Math.floor(Math.random() * proxies.length)]);
             
             const promises = testProxies.map(async (pxIp) => {
                 const agent = new HttpsProxyAgent('http://' + pxIp);
                 const controller = new AbortController();
                 const timeoutId = setTimeout(() => controller.abort(), 10000); // Max 10 detik
                 
                 const result = await axios.get(listUrl, { headers: r34Headers, httpsAgent: agent, signal: controller.signal });
                 clearTimeout(timeoutId);
                 return { agent, result, pxIp };
             });
             
             const winner = await Promise.any(promises);
             resList = winner.result;
             successfulProxyAgent = winner.agent;
             await statusCallback(`🟢 <b>Proxy Ditemukan! [${winner.pxIp}]</b> Melanjutkan Gacha...`);
         } catch (raceErr) {
             console.warn(`[Proxy Race] Semua 100 Proxy mati terkapar!`);
             return statusCallback('⚠️ Gagal menembus Tembok Cloudflare. 100 IP Proxy Public mati serentak. Silakan klik Reroll lagi untuk mencoba 100 IP baru!');
         }
     }
     
     const $ = cheerio.load(resList.data);
     const posts = [];
     
     $('.image-list .thumb').each((i, el) => {
         const href = $(el).find('a').attr('href');
         if (href) posts.push('https://rule34.xxx/' + href);
     });
     
     if (posts.length === 0) {
         return statusCallback('⚠️ Gagal memanaskan mesin Gacha, Halaman Index Kering/Kosong.');
     }
     
     // 2. Pilih random post dari ke-42 postingan di page tesebut
     const randomPostUrl = posts[Math.floor(Math.random() * posts.length)];
     await statusCallback(`🔍 <b>Rule34 Gacha:</b> ID Diamankan! Membongkar Tautan HD...`);
     
     // 3. Masuk ke halaman detail untuk mencuri link media asli
     let resDetail;
     try {
         const detailController = new AbortController();
         const detailTimeout = setTimeout(() => detailController.abort(), 6000);
         resDetail = await axios.get(randomPostUrl, { 
             headers: r34Headers, 
             httpsAgent: successfulProxyAgent,
             signal: detailController.signal
         });
         clearTimeout(detailTimeout);
     } catch (e) {
         return statusCallback('⚠️ Koneksi terputus saat mengambil detail postingan lewat Proxy.');
     }
     
     const $d = cheerio.load(resDetail.data);
     
     const imgSrc = $d('#image').attr('src');
     const vidSrc = $d('#gelcomVideoPlayer source').attr('src');
     
     const finalMedia = imgSrc || vidSrc;
     if (!finalMedia) {
         return statusCallback('⚠️ File media telah ter-Takedown atau memiliki struktur tidak lazim.');
     }
     
     // 4. Langsung kirim payload secara Direct Stream Telegram
     await statusCallback('📤 <b>Rule34 Gacha SSR:</b> Mentransmisikan File Media...');
     
     const isVideo = finalMedia.includes('.mp4') || finalMedia.includes('.webm');
     
     const replyMarkup = {
         inline_keyboard: [
             [{ text: '🎲 Gacha Layar Lain', callback_data: 'gacha34_reroll' }],
             [{ text: '🔙 Kembali ke Menu', callback_data: 'menu_awal' }]
         ]
     };
     
     // Download sebagai stream untuk dikirim agar tidak ditolak Telegram "failed to get HTTP URL"
     let streamRes;
     try {
         const streamController = new AbortController();
         const streamTimeout = setTimeout(() => streamController.abort(), 12000); // 12 detik max transfer awal stream
         streamRes = await axios.get(finalMedia, { 
             responseType: 'stream', 
             headers: r34Headers,
             httpsAgent: successfulProxyAgent,
             signal: streamController.signal
         });
         clearTimeout(streamTimeout);
     } catch (e) {
         return statusCallback('⚠️ Gagal mendownload media stream dari Proxy (Media Terlalu Besar / Proxy Mati). Silakan Reroll.');
     }
     
     const fileOptions = { filename: isVideo ? 'video.mp4' : 'image.jpg', contentType: isVideo ? 'video/mp4' : 'image/jpeg' };

     if (isVideo) {
         await bot.sendVideo(chatId, streamRes.data, { 
             caption: `🟢 <b>Rule34 Gacha SSR!</b>\n🔗 <a href="${randomPostUrl}">Buka Sumber Web</a>`, 
             parse_mode: 'HTML',
             reply_markup: replyMarkup
         }, fileOptions);
     } else {
         await bot.sendPhoto(chatId, streamRes.data, { 
             caption: `🟢 <b>Rule34 Gacha SSR!</b>\n🔗 <a href="${randomPostUrl}">Buka Sumber Web</a>`, 
             parse_mode: 'HTML',
             reply_markup: replyMarkup
         }, fileOptions);
     }
     
     // Hapus pop-up status loading
     await statusCallback(null);

  } catch (err) {
     statusCallback('⚠️ Error Mesin R34: ' + err.message);
  }
}

module.exports = { doR34Gacha };
