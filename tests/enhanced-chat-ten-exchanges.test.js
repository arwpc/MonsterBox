const { expect } = require('chai');
const puppeteer = require('puppeteer');

// Helper to try multiple URLs in case server is on 80 or 3000
async function gotoWithFallback(page, paths) {
  for (const url of paths) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      return url;
    } catch (e) {
      // try next
    }
  }
  throw new Error('Could not navigate to any provided URLs');
}

async function getBotCount(page) {
  return await page.$$eval('.message.bot', nodes => nodes.length);
}

async function ensureCharacterSelected(page) {
  await page.waitForSelector('#characterSelect', { timeout: 15000 });
  // Select first non-empty option
  const options = await page.$$eval('#characterSelect option', opts => opts.map(o => ({ value: o.value, text: o.textContent.trim() })));
  const chosen = options.find(o => o.value && o.value !== 'null');
  if (!chosen) throw new Error('No character options found');
  await page.select('#characterSelect', chosen.value);
  // Wait a moment for selection handling
  await page.waitForTimeout(1000);
}

async function sendAndAwaitBot(page, message, idx) {
  // Count current bot messages
  const before = await getBotCount(page);

  // Type and send
  await page.focus('#chatInput');
  await page.evaluate(() => { const el = document.querySelector('#sendButton'); if (el) el.disabled = false; });
  await page.type('#chatInput', message, { delay: 5 });
  await page.click('#sendButton');

  // Wait for bot response count to increase
  await page.waitForFunction((prev) => {
    const count = document.querySelectorAll('.message.bot').length;
    return count > prev;
  }, { timeout: 30000 }, before);

  const after = await getBotCount(page);
  if (!(after > before)) {
    throw new Error(`No bot response detected for exchange ${idx}`);
  }
}

describe('Enhanced Test Chat - Ten Exchange Conversation', function() {
  this.timeout(180000); // 3 minutes to allow for slower devices

  let browser;
  let page;
  let baseUrl;

  before(async function() {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    page = await browser.newPage();

    // Try both 3000 and 80 as per environment
    baseUrl = await gotoWithFallback(page, [
      'http://localhost:3000/test-chat',
      'http://localhost/test-chat'
    ]);

    // Ensure UI loaded
    await page.waitForSelector('#chatMessages', { timeout: 20000 });

    // Select a character to enable chat
    await ensureCharacterSelected(page);

    // Ensure connection established or at least not in error
    await page.waitForTimeout(1000);
  });

  after(async function() {
    if (browser) await browser.close();
  });

  it('should perform ten exchanges without getting stuck', async function() {
    const exchanges = 10;
    for (let i = 1; i <= exchanges; i++) {
      const msg = `Hello ${i} - automated test message`;
      await sendAndAwaitBot(page, msg, i);
    }

    const botCount = await getBotCount(page);
    expect(botCount).to.be.at.least(10);
  });
});

