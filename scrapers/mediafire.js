const axios = require('axios');
const cheerio = require('cheerio');

/**
 * Mendapatkan tautan unduhan langsung dari tautan halaman MediaFire
 * @param {string} url Tautan MediaFire (misal: https://www.mediafire.com/file/xxxxx)
 * @returns {Promise<string|null>} Tautan direct-download, atau null jika gagal
 */
async function getDirectLink(url) {
  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
      },
      timeout: 10000
    });

    const $ = cheerio.load(res.data);
    
    let directLink = $('#downloadButton').attr('href');
    
    // Kadang MediaFire menyembunyikan link di atribut rahasia (enkripsi base64) demi proteksi
    const scrambled = $('#downloadButton').attr('data-scrambled-url');
    if (scrambled) {
        try { directLink = Buffer.from(scrambled, 'base64').toString('utf-8'); } catch(e){}
    }
    
    if (!directLink) {
        // Fallback jika ID kadang hilang atau berubah class `download_link`
        directLink = $('.download_link a').attr('href');
    }

    if (directLink && directLink.startsWith('http')) {
      return directLink;
    }
    
    throw new Error('Elemen tombol Direct Link MediaFire tidak ditemukan di layar tujuan.');
  } catch (err) {
    console.error(`MediaFire scrape error: ${err.message}`);
    return null;
  }
}

module.exports = { getDirectLink };
