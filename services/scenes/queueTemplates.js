import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import scenesService from './scenesService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The data ROOT — never cfg.dataPath. dataPath is character-scoped
// ("data/character-2"), so joining character-N onto it put this file in a
// nested data/character-2/character-2/ that nothing else reads.
async function getDataDir(){
  return path.resolve(__dirname, '..', '..', 'data');
}

// Where that double join used to put the file. Read-only fallback, so a library
// saved before the fix is still found; the next save lands in the real
// directory and the legacy copy is left exactly where it is.
function legacyPath(characterId, fileName){
  const dir = `character-${characterId}`;
  return path.resolve(__dirname, '..', '..', 'data', dir, dir, fileName);
}

async function getCharacterDir(characterId){
  const dataDir = await getDataDir();
  return path.resolve(dataDir, `character-${characterId}`);
}

async function ensureDir(p){
  try { await fs.mkdir(p, { recursive: true }); } catch(_){}
}

function filePathFor(characterId){
  return path.resolve(path.join(), getDataDir().then(()=>''));
}

async function getTemplatesPath(characterId){
  const cdir = await getCharacterDir(characterId);
  await ensureDir(cdir);
  return path.resolve(cdir, 'scene-queue-templates.json');
}

export async function loadTemplates(characterId){
  const candidates = [await getTemplatesPath(characterId), legacyPath(characterId, 'scene-queue-templates.json')];
  for (const p of candidates) {
    try {
      const data = JSON.parse(await fs.readFile(p, 'utf8'));
      return Array.isArray(data) ? data : [];
    } catch (err) {
      if (err && err.code === 'ENOENT') continue;
      return [];
    }
  }
  return [];
}

export async function saveTemplates(characterId, templates){
  const p = await getTemplatesPath(characterId);
  await fs.writeFile(p, JSON.stringify(templates, null, 2), 'utf8');
}

export async function saveCurrentQueueAsTemplate(characterId, queueItems, name){
  const templates = await loadTemplates(characterId);
  const id = Date.now();
  // Store minimal scene references
  const items = (queueItems || []).map(it => ({ id: it.id, name: it.name }));
  templates.push({ id, name: String(name||('Template ' + id)), items, created: new Date().toISOString() });
  await saveTemplates(characterId, templates);
  return { id, name, items };
}

export async function enqueueTemplate(characterId, templateId, sceneQueue){
  const templates = await loadTemplates(characterId);
  const t = templates.find(x => String(x.id) === String(templateId));
  if (!t) throw new Error('Template not found');
  // Load scenes list to ensure names
  const all = await scenesService.loadScenes();
  for (const item of t.items){
    const s = all.find(x => parseInt(x.id,10) === parseInt(item.id,10));
    if (s) await sceneQueue.enqueue(characterId, s.id);
  }
  return sceneQueue.getStatus(characterId);
}

export default { loadTemplates, saveCurrentQueueAsTemplate, enqueueTemplate };

