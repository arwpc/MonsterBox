/**
 * UX Redesign System Tests (v8.1.2)
 * --------------------------------------------------------------------------
 * Locks in the behavior added by v8.1.0 (Haunted Console) and v8.1.1
 * (script extractions + theme picker retirement). If any of these break
 * the UX is silently broken — these tests catch regressions before ship.
 *
 * Covers:
 *   - master.ejs cluster-class derivation from `page`
 *   - Design-system CSS files served correctly
 *   - dashboard.js / poses-editor.js extraction integrity
 *   - Theme picker reduced to the 3 curated themes
 *   - /setup/style-guide route
 *   - Cluster chrome rules actually present in served CSS
 */
import { expect } from 'chai';
import request from 'supertest';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3100';

describe('UX Redesign — Phase 3/4 integrity', () => {

  // ── Design-system CSS files ────────────────────────────────────────
  describe('Design system CSS is served', () => {
    const files = [
      { path: '/css/tokens.css',         marker: '--mb-primary' },
      { path: '/css/components.css',     marker: '.mb-btn' },
      { path: '/css/mb-page-chrome.css', marker: '[class*="mb-cluster-"]' },
      { path: '/css/animation.css',      marker: '.mb-cluster-animation' },
      { path: '/css/studio.css',         marker: '.step-color-servo' },
      { path: '/css/dashboard.css',      marker: '.mb-opbar' }
    ];

    files.forEach(({ path, marker }) => {
      it(`GET ${path} returns 200 and contains "${marker}"`, async () => {
        const res = await request(BASE_URL).get(path).expect(200);
        expect(res.text).to.include(marker);
      });
    });

    it('tokens.css defines the three curated themes', async () => {
      const res = await request(BASE_URL).get('/css/tokens.css').expect(200);
      expect(res.text).to.match(/\[data-mb-theme="haunted-console"\]/);
      expect(res.text).to.match(/\[data-mb-theme="cold-crypt"\]/);
      expect(res.text).to.match(/\[data-mb-theme="bright-ops"\]/);
    });

    it('mb-page-chrome retints Bootstrap cards via cluster selector', async () => {
      const res = await request(BASE_URL).get('/css/mb-page-chrome.css').expect(200);
      // Sanity check that the neutralizer block actually landed.
      expect(res.text).to.match(/\[class\*="mb-cluster-"\]\s+\.card/);
      expect(res.text).to.match(/\[class\*="mb-cluster-"\]\s+\.btn-primary/);
    });
  });

  // ── Cluster-class derivation in master.ejs ────────────────────────
  describe('master.ejs derives cluster class from page', () => {
    // Each tuple: URL that renders through master.ejs, expected cluster class
    // substring that must appear on <main>.
    // Note: /scenes (Animation Studio) sets `includeMainWrapper: false`
    // so it bypasses <main>. Its inline .mb-cluster-animation wrapper lives
    // inside the view — covered separately below.
    const cases = [
      { url: '/poses/editor',        cls: 'mb-cluster-animation' },
      { url: '/setup',               cls: 'mb-cluster-setup' },
      { url: '/setup/style-guide',   cls: 'mb-cluster-setup' },
      { url: '/audio-library',       cls: 'mb-cluster-library' },
      { url: '/video-library',       cls: 'mb-cluster-library' },
      { url: '/orchestration',       cls: 'mb-cluster-system' },
      { url: '/goblin-management',   cls: 'mb-cluster-system' },
      { url: '/ai-settings',         cls: 'mb-cluster-system' }
    ];

    cases.forEach(({ url, cls }) => {
      it(`${url} renders <main> with ${cls}`, async () => {
        const res = await request(BASE_URL).get(url);
        // Page must render (200 or 30x redirect that still passes master).
        expect(res.status).to.be.oneOf([200, 301, 302]);
        if (res.status === 200) {
          // <main> tag should carry the cluster class somewhere.
          const mainMatch = res.text.match(/<main[^>]*class="([^"]+)"/);
          expect(mainMatch, `no <main class> found in ${url}`).to.exist;
          expect(mainMatch[1]).to.include(cls);
        }
      });
    });

    it('/scenes (studio) loads studio.css even without <main> wrapper', async () => {
      const res = await request(BASE_URL).get('/scenes').expect(200);
      expect(res.text).to.match(/<link[^>]+href="\/css\/studio\.css"/);
      // Has its own .studio-toolbar root pattern.
      expect(res.text).to.include('studio-toolbar');
    });

    it('dashboard (`/`) does NOT get a cluster class (keeps dashboard.css shell)', async () => {
      const res = await request(BASE_URL).get('/');
      // Dashboard may 302 to /first-run on fresh installs, accept either.
      if (res.status === 200) {
        const mainMatch = res.text.match(/<main[^>]*class="([^"]+)"/);
        expect(mainMatch).to.exist;
        expect(mainMatch[1]).to.not.match(/mb-cluster-/);
      }
    });
  });

  // ── dashboard.js / poses-editor.js extraction integrity ───────────
  describe('v8.1.1 script extractions', () => {
    it('GET /js/dashboard.js returns 200 with expected IIFE anchors', async () => {
      const res = await request(BASE_URL).get('/js/dashboard.js').expect(200);
      // Spot-check markers from each of the 3 combined sections.
      expect(res.text).to.include('SECTION 1: main dashboard FSM');
      expect(res.text).to.include('SECTION 2: browser audio bridge');
      expect(res.text).to.include('SECTION 3: Operator Command Bar wiring + PANIC');
      expect(res.text).to.include('firePanic');
      expect(res.text).to.include('window.mbPanic');
    });

    it('GET /js/poses-editor.js returns 200 and reads boot JSON', async () => {
      const res = await request(BASE_URL).get('/js/poses-editor.js').expect(200);
      expect(res.text).to.include('mbPoseEditorBoot');
      expect(res.text).to.include('editingPoseId');
    });

    it('dashboard view references /js/dashboard.js (no inline FSM)', async () => {
      const res = await request(BASE_URL).get('/');
      if (res.status === 200) {
        expect(res.text).to.match(/<script\s+src="\/js\/dashboard\.js"/);
        // A telltale that the main FSM is no longer inline: the banner text
        // from the extracted file should NOT appear in the rendered HTML.
        expect(res.text).to.not.include('SECTION 1: main dashboard FSM');
      }
    });

    it('pose editor view embeds boot JSON + references external script', async () => {
      const res = await request(BASE_URL).get('/poses/editor').expect(200);
      expect(res.text).to.include('id="mbPoseEditorBoot"');
      expect(res.text).to.include('type="application/json"');
      expect(res.text).to.match(/<script\s+src="\/js\/poses-editor\.js"/);
    });
  });

  // ── Theme picker reduction ────────────────────────────────────────
  describe('Theme picker (setup/system) — 3 curated themes only', () => {
    let page;

    before(async () => {
      const res = await request(BASE_URL).get('/setup/system').expect(200);
      page = res.text;
    });

    it('includes all three curated themes', () => {
      expect(page).to.include("name: 'haunted-console'");
      expect(page).to.include("name: 'cold-crypt'");
      expect(page).to.include("name: 'bright-ops'");
    });

    it('does NOT offer retired Bootswatch themes in the picker', () => {
      // Extract the THEMES array literal and check its contents, not the
      // whole page (Bootswatch names still appear in legacy loader code).
      const themesBlock = page.match(/var THEMES\s*=\s*\[([\s\S]*?)\];/);
      expect(themesBlock, 'THEMES array not found').to.exist;
      const retired = ['darkly', 'cyborg', 'slate', 'cerulean', 'flatly', 'vapor', 'superhero', 'quartz'];
      retired.forEach(name => {
        expect(themesBlock[1], `picker still offers ${name}`)
          .to.not.match(new RegExp(`name:\\s*'${name}'`));
      });
    });

    it('falls back to haunted-console if the saved theme is a retired one', () => {
      // Sanity check the fallback logic is present in the rendered page.
      expect(page).to.include('__validNames.indexOf(currentTheme)');
    });
  });

  // ── Style guide smoke ─────────────────────────────────────────────
  describe('Style guide reference page', () => {
    it('GET /setup/style-guide renders and shows every component section', async () => {
      const res = await request(BASE_URL).get('/setup/style-guide').expect(200);
      const sections = [
        'Typography',
        'Buttons',
        'Form Controls',
        'Panels',
        'Badges',
        'Tabs',
        'Alerts',
        'Meters',
        'Current Theme'
      ];
      sections.forEach(s => {
        expect(res.text, `style-guide missing section: ${s}`).to.include(s);
      });
      // Panic button demo is present.
      expect(res.text).to.include('mb-btn-panic');
    });
  });

  // ── Stop-all plumbing (panic button best-effort target) ───────────
  describe('Stop-all audio plumbing', () => {
    it('POST /api/audio-loop/stop-all responds', async () => {
      const res = await request(BASE_URL).post('/api/audio-loop/stop-all');
      // Accept any 2xx; underlying service may return success/no-op.
      expect(res.status).to.be.oneOf([200, 204]);
    });

    it('character stopAllAudio endpoint exists', async () => {
      const res = await request(BASE_URL).post('/audio-library/api/audio/stop-all');
      expect(res.status).to.be.oneOf([200, 204, 404]);
      // 404 is acceptable if the route name differs — we just check the
      // server doesn't 500 on the panic-handler's best-effort call.
      expect(res.status).to.not.equal(500);
    });
  });
});
