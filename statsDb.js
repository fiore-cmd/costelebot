const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'stats.json');

// Memory Cache
let statsData = {};

/**
 * Muat data dari JSON
 */
function loadDB() {
    if (fs.existsSync(DB_FILE)) {
        try {
            const raw = fs.readFileSync(DB_FILE, 'utf8');
            statsData = JSON.parse(raw);
        } catch (e) {
            console.error(`[StatsDB] Gagal memuat database stats: ${e.message}`);
            statsData = {};
        }
    } else {
        statsData = {};
        saveDB();
    }
}

/**
 * Simpan data ke JSON
 */
function saveDB() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(statsData, null, 2), 'utf8');
    } catch (e) {
        console.error(`[StatsDB] Gagal menyumpan database stats: ${e.message}`);
    }
}

function getInitUser(chatId) {
    if (!statsData[chatId]) {
        statsData[chatId] = {
            gachaCasts: 0,
            downloadBytes: 0,
            favoriteCount: 0,
            joinDate: Date.now()
        };
    }
    return statsData[chatId];
}

/**
 * Catat tambahan tarikan gacha
 */
function addGacha(chatId) {
    getInitUser(chatId).gachaCasts += 1;
    saveDB();
}

/**
 * Catat muatan file yang berhasil diunduh (terhitung sebelum Telegram botirim)
 */
function addDownloadSize(chatId, bytes) {
    getInitUser(chatId).downloadBytes += bytes;
    saveDB();
}

/**
 * Mengambil rekap kartu profil
 */
function getUserStats(chatId) {
    return getInitUser(chatId);
}

// Inisialisasi awal saat ditarik
loadDB();

module.exports = {
    addGacha,
    addDownloadSize,
    getUserStats
};
