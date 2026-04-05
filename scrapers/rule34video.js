const axios = require('axios');
const cheerio = require('cheerio');

const BASE_URL = 'https://rule34video.com';
const r34Axios = axios.create({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/115.0.0.0 Safari/537.36',
        'Referer': BASE_URL
    },
    timeout: 30000
});

/**
 * Mengambil daftar video dari halaman apapun (beranda, pencarian, dll).
 * Return: Array of { title, link, thumb }
 */
async function parseVideoList(url) {
    try {
        const res = await r34Axios.get(url);
        const $ = cheerio.load(res.data);
        const items = [];

        $('a[href*="/video/"]').each((i, el) => {
            const href = $(el).attr('href');
            const title = $(el).attr('title') || $(el).text().trim().substring(0, 80);
            const img = $(el).find('img');
            const thumb = img.attr('data-original') || img.attr('data-src') || img.attr('src');
            if (href && !href.includes('popup') && title.length > 2) {
                items.push({
                    title,
                    link: href.startsWith('http') ? href : BASE_URL + href,
                    thumb: thumb && thumb.startsWith('http') ? thumb : (thumb ? BASE_URL + thumb : null)
                });
            }
        });

        // Deduplicate by link
        const seen = new Set();
        return items.filter(v => {
            if (seen.has(v.link)) return false;
            seen.add(v.link);
            return true;
        });
    } catch (e) {
        console.error(`[R34Video] Error fetching: ${url} — ${e.message}`);
        return [];
    }
}

/**
 * Menyedot katalog video (pencarian atau update terbaru).
 */
async function scrapeListing(page = 1, query = null) {
    // KVS search uses ?from_videos=N for pagination (N = page number)
    let url = query
        ? `${BASE_URL}/search/${encodeURIComponent(query)}/${page > 1 ? '?from_videos=' + page : ''}`
        : `${BASE_URL}/latest-updates/${page}/`;

    return parseVideoList(url);
}

/**
 * Mendapatkan SEMUA link download `.mp4` dari halaman pemutar video.
 * Return: Array of { label, url } diurutkan dari resolusi tertinggi ke terendah.
 */
async function scrapePostDetail(url) {
    try {
        const res = await r34Axios.get(url);
        const $ = cheerio.load(res.data);

        const downloads = [];
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            if (href && (href.includes('get_file') || href.includes('download=true'))) {
                downloads.push({ label: text || 'MP4', url: href });
            }
        });

        // Urutkan: 1080p pertama, lalu 720p, 480p, 360p
        const order = ['1080', '720', '480', '360'];
        downloads.sort((a, b) => {
            const aIdx = order.findIndex(r => a.label.includes(r));
            const bIdx = order.findIndex(r => b.label.includes(r));
            return (aIdx === -1 ? 99 : aIdx) - (bIdx === -1 ? 99 : bIdx);
        });

        return downloads;
    } catch (e) {
        console.error(`[R34Video] Error fetching detail: ${url} — ${e.message}`);
        return [];
    }
}

module.exports = {
    scrapeListing,
    scrapePostDetail,
    parseVideoList
};
