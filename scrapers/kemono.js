const { chromium } = require('playwright');

const log = {
  info:  (m) => console.log(`\x1b[36m[INFO]\x1b[0m  ${m}`),
  ok:    (m) => console.log(`\x1b[32m[OK]\x1b[0m    ${m}`),
  error: (m) => console.log(`\x1b[31m[ERROR]\x1b[0m ${m}`),
};

/**
 * Mendapatkan satu tautan post acak dari kreator kemono
 */
async function getRandomKemonoPost(creatorUrl, chatId) {
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        
        log.info(`[Kemono] Sedang membongkar Cloudflare di ${creatorUrl}...`);
        await page.goto(creatorUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        // Wait for Cloudflare to pass
        await page.waitForSelector('.user-header__name', { timeout: 30000 }).catch(() => null);

        let totalPosts = 50; // fallback
        const paginatorText = await page.evaluate(() => document.querySelector('.paginator small')?.innerText || '');
        const match = paginatorText.match(/of\s+(\d+)/i);
        if (match && match[1]) {
            totalPosts = parseInt(match[1], 10);
        }
        
        log.info(`[Kemono] Terdeteksi ${totalPosts} post dari kreator ini!`);
        
        // Pick a completely random index
        const randomIdx = Math.floor(Math.random() * totalPosts);
        const offset = Math.floor(randomIdx / 50) * 50;
        
        log.info(`[Kemono] Mengambil gacha pada offset ${offset}...`);
        
        let targetPageUrl = creatorUrl;
        if (offset > 0) {
            targetPageUrl += `?o=${offset}`;
            await page.goto(targetPageUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
            await page.waitForSelector('.post-card', { timeout: 15000 }).catch(() => null);
        }
        
        const posts = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('.post-card')).map(el => {
                const header = el.querySelector('.post-card__header');
                const link = el.querySelector('a');
                return {
                    title: header ? header.innerText.trim() : 'Unknown',
                    href: link ? link.href : null
                };
            }).filter(p => p.href);
        });
        
        if (posts.length === 0) throw new Error("Gagal! Tidak ada hasil post yang ditemukan di halaman kreator ini.");
        
        const historyTracker = require('../history');
        const unseenPosts = posts.filter(p => !historyTracker.hasSeen(chatId, 'kemono', p.href));
        
        // Pilih post random dari pool unseen (atau fallback jika semua sudah dilihat)
        const selectedPost = unseenPosts.length > 0
            ? unseenPosts[Math.floor(Math.random() * unseenPosts.length)]
            : posts[Math.floor(Math.random() * posts.length)];
            
        historyTracker.markSeen(chatId, 'kemono', selectedPost.href);
        log.ok(`[Kemono] Mendapatkan Post Targer Gacha: ${selectedPost.title}`);
        return selectedPost;

    } catch (e) {
        log.error(`[Kemono Scrape Error] ${e.message}`);
        throw e;
    } finally {
        if (browser) await browser.close().catch(()=>{});
    }
}

/**
 * Mengekstrak seluruh URL media (gambar/video/dokumen) dari URL Post Kemono
 */
async function getKemonoPostMedia(postUrl) {
    let browser;
    try {
        browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        
        log.info(`[Kemono] Merampok tautan HD Media di ${postUrl}...`);
        await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
        
        await page.waitForSelector('.post__header', { timeout: 30000 }).catch(() => null);
        
        const media = await page.evaluate(() => {
            // Attachment links (biasanya hi-res file/zip/video/mega)
            const links = Array.from(document.querySelectorAll('.post__attachment-link')).map(a => a.href);
            // Inline links (biasanya gambar yang ditempel di body postingan)
            const inlineImgs = Array.from(document.querySelectorAll('.post__body img')).map(img => img.src);
            
            return { links, inlineImgs };
        });
        
        // Remove duplicate urls if any
        const safeArr = (arr) => [...new Set(arr.filter(a => a))];
        
        log.info(`[Kemono] Rampasan: ${media.inlineImgs.length} Inline IMG, ${media.links.length} Attachments!`);
        return {
            links: safeArr(media.links),
            inlineImgs: safeArr(media.inlineImgs)
        };

    } catch (e) {
        log.error(`[Kemono Media Error] ${e.message}`);
        throw e;
    } finally {
        if (browser) await browser.close().catch(()=>{});
    }
}

module.exports = {
    getRandomKemonoPost,
    getKemonoPostMedia
};
