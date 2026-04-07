const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

async function scrapePinterest(query = 'anime') {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    const encodedQuery = encodeURIComponent(query);
    // Masuk ke pinterest search
    await page.goto(`https://id.pinterest.com/search/pins/?q=${encodedQuery}`, { waitUntil: 'load', timeout: 35000 });
    
    // Tunggu gambarnya render
    await page.waitForSelector('img[src*="i.pinimg.com"]', { timeout: 15000 });
    
    // Scroll sebentar agar lebih banyak gambar terekstrak
    for (let i=0; i<3; i++) {
        await page.evaluate(() => window.scrollBy(0, 1000));
        await page.waitForTimeout(800);
    }

    const pins = await page.evaluate(() => {
      const imgs = Array.from(document.querySelectorAll('img[src*="i.pinimg.com"]'));
      return imgs
        .filter(img => img.src.endsWith('.jpg') || img.src.endsWith('.png') || img.src.endsWith('.webp'))
        .map(img => {
          // Konversikan resolusi apapun (biasanya /236x/, /474x/, /60x60/) ke /originals/ agar dapat ukuran HD
          try {
            const urlObj = new URL(img.src);
            const parts = urlObj.pathname.split('/');
            if (parts.length > 2 && /^\d+x(\d+)?(_RS)?$/.test(parts[1])) {
              parts[1] = 'originals';
            } else if (parts.length > 2 && parts[1] !== 'originals' && parts[1] !== '1200x') {
              parts[1] = 'originals'; // Force to originals anyway
            }
            const cleanUrl = `https://${urlObj.hostname}${parts.join('/')}`;
            
            return {
              imgUrl: cleanUrl,
              title: img.alt && img.alt.length > 2 ? img.alt : "Pinterest Image"
            };
          } catch(e) {
             return null;
          }
        }).filter(Boolean);
    });

    if (!pins || pins.length === 0) throw new Error("Tidak menemukan pin gambar di halaman.");

    // Buang duplikasi object berdasarkan URL
    const uniqueMap = new Map();
    pins.forEach(p => {
      if (!uniqueMap.has(p.imgUrl)) uniqueMap.set(p.imgUrl, p);
    });
    
    return Array.from(uniqueMap.values());

  } catch (error) {
    throw new Error(`Pinterest Scraper Gagal: ${error.message}`);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

module.exports = {
  scrapePinterest
};
