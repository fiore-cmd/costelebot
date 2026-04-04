const axios = require('axios');
const fs = require('fs');

let proxyCache = [];
let lastFetch = 0;

async function getProxies() {
    // Refresh proxy list setiap 1 jam untuk mendapatkan proxy segar dari TheSpeedx
    if (proxyCache.length > 0 && (Date.now() - lastFetch) < 3600000) {
        return proxyCache;
    }
    
    try {
        const res = await axios.get('https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt');
        const rawList = res.data.split('\n').map(l => l.trim()).filter(l => Boolean(l));
        proxyCache = rawList;
        lastFetch = Date.now();
        console.log(`[ProxyManager] Berhasil menyedot ${proxyCache.length} IP Proxy dari TheSpeedX!`);
        return proxyCache;
    } catch (e) {
        console.warn('[ProxyManager] Gagal menarik list proxy jarak jauh, fallback list kosong.');
        return [];
    }
}

async function getRandomProxy() {
    const list = await getProxies();
    if (list.length === 0) return null;
    return list[Math.floor(Math.random() * list.length)];
}

module.exports = {
    getProxies,
    getRandomProxy
};
