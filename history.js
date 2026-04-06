const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, 'history.json');
const MAX_HISTORY = 500;

let historyCache = null;

function loadHistory() {
  if (historyCache) return;
  if (!fs.existsSync(HISTORY_FILE)) {
    historyCache = {};
    return;
  }
  try {
    const raw = fs.readFileSync(HISTORY_FILE, 'utf-8');
    historyCache = JSON.parse(raw);
  } catch (e) {
    console.error('Gagal membaca history.json:', e.message);
    historyCache = {}; // Jika corrupt, reset di memory.
  }
}

function saveHistory() {
  if (!historyCache) return;
  try {
    // Stringify tanpa pretty print agar ukuran file super ringan.
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(historyCache));
  } catch (e) {
    console.error('Gagal menyimpan history.json:', e.message);
  }
}

/**
 * Mengecek apakah pengguna sudah pernah melihat tautan ini (berdasarkan kategori)
 * @param {number|string} userId ID Telegram Pengguna
 * @param {string} category 'cosplay' | 'r34' | 'kemono'
 * @param {string} link URL Post asli
 */
function hasSeen(userId, category, link) {
  loadHistory();
  if (!historyCache[userId]) return false;
  if (!historyCache[userId][category]) return false;
  return historyCache[userId][category].includes(link);
}

/**
 * Mendaftarkan tautan untuk memori tontonan user agar tidak keluar lagi di Gacha selanjutnya.
 */
function markSeen(userId, category, link) {
  loadHistory();
  if (!historyCache[userId]) historyCache[userId] = {};
  if (!historyCache[userId][category]) historyCache[userId][category] = [];
  
  if (!historyCache[userId][category].includes(link)) {
    historyCache[userId][category].push(link);
    // Batasi maksimum memory (buang ingatan paling lama di index 0)
    if (historyCache[userId][category].length > MAX_HISTORY) {
        historyCache[userId][category].shift();
    }
    saveHistory();
  }
}

module.exports = { hasSeen, markSeen };
