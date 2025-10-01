/**
 * Main Navigation Tests for MonsterBox
 *
 * Tests home page, navigation menu, page routing, and basic page loading
 */

const { expect } = require('chai');
const request = require('supertest');
const app = require('../app');

describe('Main Navigation', () => {
  let agent;

  beforeEach(() => {
    agent = request.agent(app);
  });

  it('Home page loads correctly', async () => {
    console.log('Testing home page load');

    const response = await agent.get('/');

    // Check response status
    expect(response.status).to.equal(200);

    // Check page contains expected content
    expect(response.text).to.match(/MonsterBox/i);
    expect(response.text).to.match(/MONSTERBOX|MonsterBox/i);

    // Check for navigation elements
    expect(response.text).to.include('button-group');

    // Check for main content area
    expect(response.text).to.match(/main|main-content|container/);

    console.log('Home page test completed');
  });

  it('Navigation menu contains all expected links', async () => {
    console.log('Testing navigation menu links');

    const response = await agent.get('/');
    expect(response.status).to.equal(200);

    const expectedLinks = [
      { text: 'Characters', href: '/characters' },
      { text: 'Hardware Parts', href: '/parts' },
      { text: 'AI Management', href: '/ai-management' },
      { text: 'Sounds', href: '/sounds' },
      { text: 'Scenes', href: '/scenes' },
      { text: 'Configuration', href: '/ai-config' }
    ];

    for (const link of expectedLinks) {
      console.log(`Checking navigation link: ${link.text}`);

      // Check if link exists in HTML
      expect(response.text).to.include(link.href);
      expect(response.text).to.match(new RegExp(link.text, 'i'));
    }

    console.log('Navigation menu test completed');
  });

  it('Navigation links work correctly', async () => {
    console.log('Testing navigation link functionality');

    const navigationTests = [
      {
        expectedUrl: '/characters',
        expectedContent: 'Character'
      },
      {
        expectedUrl: '/sounds',
        expectedContent: 'Sound'
      },
      {
        expectedUrl: '/parts',
        expectedContent: 'Hardware'
      },
      {
        expectedUrl: '/ai-management',
        expectedContent: 'AI Management'
      },
      {
        expectedUrl: '/scenes',
        expectedContent: 'Scene'
      }
    ];

    for (const navTest of navigationTests) {
      console.log(`Testing navigation to: ${navTest.expectedUrl}`);

      const response = await agent.get(navTest.expectedUrl);

      // Check that the page loads successfully
      expect(response.status).to.equal(200);

      // Check for expected content
      expect(response.text).to.match(new RegExp(navTest.expectedContent, 'i'));
    }

    console.log('Navigation functionality test completed');
  });

  it('Pages load without server errors', async () => {
    console.log('Testing for server errors');

    // Navigate through main pages and check for errors
    const pagesToTest = ['/', '/characters', '/sounds', '/ai-management', '/parts', '/scenes'];

    for (const pageUrl of pagesToTest) {
      console.log(`Checking server response for: ${pageUrl}`);

      const response = await agent.get(pageUrl);

      // Check that pages load successfully (200 or redirect)
      expect(response.status).to.be.oneOf([200, 301, 302]);

      // Check that response contains HTML content
      expect(response.text).to.include('<html');
      expect(response.text).to.include('</html>');
    }

    console.log('Server error test completed');
  });

  it('Responsive navigation elements exist', async () => {
    console.log('Testing responsive navigation elements');

    const response = await agent.get('/');
    expect(response.status).to.equal(200);

    // Check for responsive navigation elements in HTML
    const responsiveElements = [
      'navbar-toggle',
      'menu-toggle',
      'hamburger',
      'data-toggle="collapse"',
      'nav',
      'navbar'
    ];

    let foundElements = 0;
    for (const element of responsiveElements) {
      if (response.text.includes(element)) {
        console.log(`✓ Found responsive element: ${element}`);
        foundElements++;
      }
    }

    // At least some responsive elements should be present
    expect(foundElements).to.be.greaterThan(0);

    console.log('Responsive navigation test completed');
  });

  it('Search functionality elements exist if present', async () => {
    console.log('Testing search functionality elements');

    const response = await agent.get('/');
    expect(response.status).to.equal(200);

    // Check if search elements exist in HTML
    const searchElements = [
      'type="search"',
      'search-input',
      'search-button',
      'placeholder="search"',
      'placeholder="Search"'
    ];

    let foundSearchElements = 0;
    for (const element of searchElements) {
      if (response.text.includes(element)) {
        console.log(`✓ Found search element: ${element}`);
        foundSearchElements++;
      }
    }

    if (foundSearchElements > 0) {
      console.log(`Found ${foundSearchElements} search elements`);
    } else {
      console.log('No search functionality found - this is acceptable');
    }

    console.log('Search functionality test completed');
  });

  it('Footer elements exist if present', async () => {
    console.log('Testing footer elements');

    const response = await agent.get('/');
    expect(response.status).to.equal(200);

    // Check if footer exists in HTML
    const footerElements = [
      '<footer',
      'class="footer"',
      'id="footer"'
    ];

    let foundFooter = false;
    for (const element of footerElements) {
      if (response.text.includes(element)) {
        console.log(`✓ Found footer element: ${element}`);
        foundFooter = true;
        break;
      }
    }

    if (foundFooter) {
      console.log('Footer found in HTML');
      // Check for common footer links
      const footerLinkPatterns = [
        'href="/',
        'href="#',
        '<a '
      ];

      let foundLinks = 0;
      for (const pattern of footerLinkPatterns) {
        if (response.text.includes(pattern)) {
          foundLinks++;
        }
      }

      console.log(`Found ${foundLinks} potential footer link patterns`);
    } else {
      console.log('No footer found - this is acceptable');
    }

    console.log('Footer test completed');
  });

  it('Page accessibility basics', async () => {
    console.log('Testing basic accessibility');

    const response = await agent.get('/');
    expect(response.status).to.equal(200);

    // Check for main landmarks in HTML
    const landmarks = [
      { pattern: /<main|role="main"/, name: 'main content' },
      { pattern: /<nav|role="navigation"/, name: 'navigation' },
      { pattern: /<header|role="banner"/, name: 'header' }
    ];

    for (const landmark of landmarks) {
      if (landmark.pattern.test(response.text)) {
        console.log(`✓ ${landmark.name} landmark found`);
      } else {
        console.log(`⚠ ${landmark.name} landmark not found`);
      }
    }

    // Check for page title
    const titleMatch = response.text.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) {
      const title = titleMatch[1].trim();
      expect(title.length).to.be.greaterThan(0);
      console.log(`✓ Page title: "${title}"`);
    }

    // Check for heading hierarchy
    const h1Matches = response.text.match(/<h1[^>]*>/gi);
    const h1Count = h1Matches ? h1Matches.length : 0;
    expect(h1Count).to.be.greaterThanOrEqual(1);
    console.log(`✓ Found ${h1Count} h1 heading(s)`);

    console.log('Accessibility test completed');
  });
});
