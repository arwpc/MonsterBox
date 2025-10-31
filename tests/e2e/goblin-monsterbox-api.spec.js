/**
 * MonsterBox Goblin API Tests
 * Tests for MonsterBox Goblin management API endpoints
 */

import { expect, test } from '@playwright/test';

// Use Playwright baseURL
const GOBLIN_ID = 'goblin-three';
const TEST_VIDEO = '307 Jb Hd.mp4';

test.describe('MonsterBox Goblin API Routes', () => {

  test('get all goblins', async ({ request }) => {
    const response = await request.get('/goblin-management/api/goblins');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.goblins).toBeDefined();
    expect(Array.isArray(data.goblins)).toBe(true);
    expect(data.goblins.length).toBeGreaterThan(0);

    // Check goblin structure
    const goblin = data.goblins.find(g => g.id === GOBLIN_ID);
    expect(goblin).toBeDefined();
    expect(goblin).toHaveProperty('name');
    expect(goblin).toHaveProperty('endpoint');
    expect(goblin).toHaveProperty('status');
  });

  test('get specific goblin', async ({ request }) => {
    const response = await request.get(`/goblin-management/api/goblin/${GOBLIN_ID}`);
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.goblin).toBeDefined();
    expect(data.goblin.id).toBe(GOBLIN_ID);
  });

  test('scan videos from all goblins', async ({ request }) => {
    const response = await request.post('/goblin-management/api/goblins/scan-all-videos', {
      timeout: 120000 // 2 minutes for scanning all
    });
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.results).toBeDefined();
    expect(data).toHaveProperty('totalGoblins');
    expect(data).toHaveProperty('scannedAt');
  });

  test('get all cached videos', async ({ request }) => {
    const response = await request.get('/goblin-management/api/videos/all');
    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.videos).toBeDefined();
  });

  test.describe('Playlist Management', () => {
    let testPlaylistId;

    test('create playlist', async ({ request }) => {
      const response = await request.post('/goblin-management/api/playlists', {
        data: {
          name: 'Test Playlist',
          description: 'Automated test playlist',
          goblinId: GOBLIN_ID,
          videos: [TEST_VIDEO, '312 Jb Hd.mp4'],
          loopMode: 'queue'
        }
      });
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.playlist).toBeDefined();
      expect(data.playlist.name).toBe('Test Playlist');
      expect(data.playlist.videos.length).toBe(2);
      expect(data.playlist.goblinId).toBe(GOBLIN_ID);

      testPlaylistId = data.playlist.id;
    });

    test('get all playlists', async ({ request }) => {
      const response = await request.get('/goblin-management/api/playlists');
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.playlists).toBeDefined();
      expect(Array.isArray(data.playlists)).toBe(true);
    });

    test('get specific playlist', async ({ request }) => {
      // First create a playlist
      const createResponse = await request.post('/goblin-management/api/playlists', {
        data: {
          name: 'Get Test Playlist',
          goblinId: GOBLIN_ID,
          videos: [TEST_VIDEO],
          loopMode: 'single'
        }
      });
      const createData = await createResponse.json();
      const playlistId = createData.playlist.id;

      // Now get it
      const response = await request.get(`/goblin-management/api/playlists/${playlistId}`);
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.playlist).toBeDefined();
      expect(data.playlist.id).toBe(playlistId);
      expect(data.playlist.name).toBe('Get Test Playlist');
    });

    test('update playlist', async ({ request }) => {
      // Create playlist
      const createResponse = await request.post('/goblin-management/api/playlists', {
        data: {
          name: 'Update Test',
          goblinId: GOBLIN_ID,
          videos: [TEST_VIDEO],
          loopMode: 'queue'
        }
      });
      const createData = await createResponse.json();
      const playlistId = createData.playlist.id;

      // Update it
      const response = await request.put(`/goblin-management/api/playlists/${playlistId}`, {
        data: {
          name: 'Updated Playlist',
          description: 'Updated description',
          loopMode: 'single'
        }
      });
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.playlist.name).toBe('Updated Playlist');
      expect(data.playlist.description).toBe('Updated description');
      expect(data.playlist.loopMode).toBe('single');
    });

    test('delete playlist', async ({ request }) => {
      // Create playlist
      const createResponse = await request.post('/goblin-management/api/playlists', {
        data: {
          name: 'Delete Test',
          goblinId: GOBLIN_ID,
          videos: [TEST_VIDEO],
          loopMode: 'queue'
        }
      });
      const createData = await createResponse.json();
      const playlistId = createData.playlist.id;

      // Delete it
      const response = await request.delete(`/goblin-management/api/playlists/${playlistId}`);
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.success).toBe(true);

      // Verify it's gone
      const getResponse = await request.get(`/goblin-management/api/playlists/${playlistId}`);
      expect(getResponse.status()).toBe(404);
    });

    test('filter playlists by goblin', async ({ request }) => {
      const response = await request.get(`/goblin-management/api/playlists?goblinId=${GOBLIN_ID}`);
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.playlists).toBeDefined();

      // All playlists should be for this goblin or 'all'
      data.playlists.forEach(playlist => {
        expect(['goblin-three', 'all']).toContain(playlist.goblinId);
      });
    });

    test('search playlists', async ({ request }) => {
      // Create a playlist with searchable name
      await request.post('/goblin-management/api/playlists', {
        data: {
          name: 'Searchable Fireball Playlist',
          goblinId: GOBLIN_ID,
          videos: [TEST_VIDEO],
          loopMode: 'queue'
        }
      });

      const response = await request.get('/goblin-management/api/playlists?search=fireball');
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.playlists.length).toBeGreaterThan(0);

      const found = data.playlists.some(p => p.name.toLowerCase().includes('fireball'));
      expect(found).toBe(true);
    });
  });

  test.describe('Playlist Deployment', () => {
    test('deploy playlist returns proper structure', async ({ request }) => {
      // Create playlist
      const createResponse = await request.post('/goblin-management/api/playlists', {
        data: {
          name: 'Deploy Test',
          goblinId: GOBLIN_ID,
          videos: [TEST_VIDEO, '312 Jb Hd.mp4'],
          loopMode: 'queue'
        }
      });
      const createData = await createResponse.json();
      const playlistId = createData.playlist.id;

      // Deploy it (will fail if goblin offline, but we test the structure)
      const response = await request.post(`/goblin-management/api/playlists/${playlistId}/deploy`, {
        data: {
          goblinIds: [GOBLIN_ID],
          startImmediately: true
        }
      });
      expect(response.ok()).toBeTruthy();

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data).toHaveProperty('deployed');
      expect(data).toHaveProperty('failed');
      expect(Array.isArray(data.deployed)).toBe(true);
      expect(Array.isArray(data.failed)).toBe(true);
    });

    test('deploy playlist requires goblinIds', async ({ request }) => {
      const createResponse = await request.post('/goblin-management/api/playlists', {
        data: {
          name: 'Deploy Test 2',
          goblinId: GOBLIN_ID,
          videos: [TEST_VIDEO],
          loopMode: 'queue'
        }
      });
      const createData = await createResponse.json();
      const playlistId = createData.playlist.id;

      const response = await request.post(`/goblin-management/api/playlists/${playlistId}/deploy`, {
        data: {
          startImmediately: true
        }
      });
      expect(response.status()).toBe(400);

      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toContain('goblinIds');
    });
  });
});

