#!/usr/bin/env node
// Start Goblins playing an extensive set of videos via MonsterBox HTTP API
// Usage: HOST=coffin node scripts/start-goblin-videos.js
// Defaults: HOST=coffin, LIMIT=10, LOOP=true

import http from 'http';

const HOST = process.env.HOST || 'coffin';
const PORT = Number(process.env.PORT || 3000);
const LIMIT = Number(process.env.LIMIT || 10);
const LOOP = String(process.env.LOOP || 'true') === 'true';

function j(method, path, body){
  return new Promise((resolve, reject) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({ host: HOST, port: PORT, method, path, headers: { 'Content-Type': 'application/json', 'Content-Length': data ? data.length : 0 }}, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        try { resolve({ status: res.statusCode, json: JSON.parse(text) }); }
        catch { resolve({ status: res.statusCode, text }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function getGoblins(){
  const r = await j('GET', '/goblin-management/api/goblins');
  if (r.status !== 200 || !r.json?.success) throw new Error('Failed to fetch goblins');
  return r.json.goblins.map(g => g.id);
}

async function getLibrary(){
  const r = await j('GET', '/video-library/api/library');
  if (r.status !== 200 || !r.json?.success) throw new Error('Failed to fetch video library');
  return r.json.videos || r.json.items || [];
}

async function deployAndPlay(video, goblinId){
  // Deploy video data to goblin (ensures it exists on device)
  let r = await j('POST', `/video-library/api/video/${encodeURIComponent(video.id)}/deploy`, { goblinId });
  if (r.status !== 200 || !r.json?.success) {
    console.warn(`Deploy failed for ${video.title || video.fileName} on ${goblinId}:`, r.text || r.json);
  }
  // Play on goblin
  r = await j('POST', `/video-library/api/video/${encodeURIComponent(video.id)}/play-on-goblin`, { goblinId, loop: LOOP });
  if (r.status !== 200 || !r.json?.success) {
    console.warn(`Play failed for ${video.title || video.fileName} on ${goblinId}:`, r.text || r.json);
  }
}

(async () => {
  try {
    console.log(`Connecting to MonsterBox at http://${HOST}:${PORT}`);
    const goblins = await getGoblins();
    console.log(`Found goblins: ${goblins.join(', ')}`);
    const videos = await getLibrary();
    const pick = videos.slice(0, LIMIT);
    console.log(`Deploying and starting ${pick.length} videos on each goblin (loop=${LOOP})...`);
    for (const v of pick) {
      for (const g of goblins) {
        await deployAndPlay(v, g);
      }
    }
    console.log('Done. Goblins should be playing videos.');
  } catch (e) {
    console.error('Error:', e.message);
    process.exitCode = 1;
  }
})();

