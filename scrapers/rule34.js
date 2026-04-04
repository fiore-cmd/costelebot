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
     // Batas aman Guest Mode tanpa login biasanya di sekitar kedalaman 500-1000 halaman
     const randomPageOffset = Math.floor(Math.random() * 1000) * 42; 
     const listUrl = `https://rule34.xxx/index.php?page=post&s=list&pid=${randomPageOffset}`;
     
     const r34Headers = {
         'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
         'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
         'Accept-Language': 'en-US,en;q=0.5',
         'Cookie': 'resize-original=1;'
     };

     let resList;
     try {
         resList = await axios.get(listUrl, { headers: r34Headers });
     } catch (err) {
         // Jika tetap mendapat 403 karena kedalaman limit, fallback ke halaman depan!
         console.warn('R34 offset ' + randomPageOffset + ' ditolak (403/Limit), fallback ke halaman awal.');
         resList = await axios.get('https://rule34.xxx/index.php?page=post&s=list&pid=0', { headers: r34Headers });
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
     const resDetail = await axios.get(randomPostUrl, { headers: r34Headers });
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
     const streamRes = await axios.get(finalMedia, { responseType: 'stream', headers: r34Headers });
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
