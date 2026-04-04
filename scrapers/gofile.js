const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const path = require('path');

chromium.use(StealthPlugin());

const PROFILE_DIR = path.resolve('./browser_profile_gofile');

async function resolveGofile(gofileUrl) {
  let ctx;
  try {
    ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    });

    const page = await ctx.newPage();
    const files = [];

    page.on('response', async res => {
      const u = res.url();
      if (u.includes('/contents/') && u.includes('api.gofile')) {
        try {
          const json = await res.json();
          if (json.status === 'ok' && json.data && json.data.children) {
            for (const childId in json.data.children) {
               const fileInfo = json.data.children[childId];
               if (fileInfo && fileInfo.link) {
                  files.push({
                     id: childId,
                     name: fileInfo.name || 'archive.zip',
                     link: fileInfo.link
                  });
               }
            }
          }
        } catch(e) {}
      }
    });

    // Handle initial specific URL match before navigating
    // because page.url() later won't have hash usually.
    // However the browser handles navigation, we just extract.
    await page.goto(gofileUrl.split('#')[0], { waitUntil: 'networkidle', timeout: 30000 }).catch(()=>{});
    await page.waitForTimeout(5000); // Give time for gofile XHR to finish

    // Get cookies
    const cookies = await ctx.cookies();
    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');

    return { 
      files: files,
      cookie: cookieStr 
    };

  } catch (err) {
    console.error(`Gofile resolve error: ${err.message}`);
    return null;
  } finally {
    if (ctx) await ctx.close();
  }
}

module.exports = {
  resolveGofile
};
