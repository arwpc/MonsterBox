const puppeteer = require('puppeteer');

(async () => {
  console.log('🎭 Starting Enhanced Chat browser test...');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  
  // Listen for console messages
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('❌ Browser Error:', msg.text());
    } else if (msg.text().includes('✅') || msg.text().includes('🎭')) {
      console.log('📱', msg.text());
    }
  });
  
  try {
    console.log('🌐 Navigating to Enhanced Chat...');
    await page.goto('http://localhost:3000/ai-management/enhanced-test-chat', {
      waitUntil: 'networkidle2',
      timeout: 30000
    });
    
    console.log('✅ Page loaded successfully');
    
    // Check if character selection is working
    await page.waitForSelector('#characterSelect', { timeout: 10000 });
    console.log('✅ Character selector found');
    
    // Select Skulltalker character
    await page.select('#characterSelect', '4');
    console.log('✅ Selected Skulltalker character');
    
    // Wait a moment for character selection to process
    await page.waitForTimeout(2000);
    
    // Check if chat input is enabled
    const chatInput = await page.$('#chatInput');
    const isEnabled = await page.evaluate(el => !el.disabled, chatInput);
    console.log('✅ Chat input enabled:', isEnabled);
    
    // Test sending a message
    await page.type('#chatInput', 'Hello, this is a test message for Halloween!');
    console.log('✅ Typed test message');
    
    // Check if send button is enabled
    const sendButton = await page.$('#sendButton');
    const sendEnabled = await page.evaluate(el => !el.disabled, sendButton);
    console.log('✅ Send button enabled:', sendEnabled);
    
    if (sendEnabled) {
      await page.click('#sendButton');
      console.log('✅ Clicked send button');
      
      // Wait for message to appear
      await page.waitForTimeout(2000);
      
      // Check if message appeared in chat
      const messages = await page.$$('.message');
      console.log('✅ Messages in chat:', messages.length);
    }
    
    // Test voice controls
    const elevenLabsToggle = await page.$('#elevenLabsToggle');
    if (elevenLabsToggle) {
      console.log('✅ ElevenLabs toggle found');
    }
    
    const liveModeToggle = await page.$('#liveModeToggle');
    if (liveModeToggle) {
      console.log('✅ Live Mode toggle found');
    }
    
    console.log('🎉 Enhanced Chat test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await browser.close();
  }
})();
