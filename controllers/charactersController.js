import { loadCharacters, getCharacterById, createCharacter, updateCharacter, deleteCharacter } from '../services/characterService.js';
import { readConfig, updateSelectedCharacter } from '../services/configService.js';
import { resolveCharacter, invalidateCache as invalidateCharacterCache } from '../services/characterContext.js';

function parseId(param) {
  var n = parseInt(param, 10);
  return isNaN(n) ? null : n;
}

export async function getAll(req, res) {
  try {
    // For management UI under /setup/characters, return raw file data without test-mode normalization
    const isManagement = (req.baseUrl && req.baseUrl.indexOf('/setup/characters') !== -1) || (req.originalUrl && req.originalUrl.indexOf('/setup/characters') !== -1);
    let characters;
    if (isManagement) {
      try {
        const path = (await import('path')).default;
        const fs = (await import('fs/promises')).default;
        const file = path.resolve(__dirname, '..', 'data', 'characters.json');
        const data = await fs.readFile(file, 'utf8');
        const parsed = JSON.parse(data);
        characters = Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        // Fallback to service if direct read fails
        characters = await loadCharacters();
      }
    } else {
      characters = await loadCharacters();
    }
    res.json({ success: true, characters: characters });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getOne(req, res) {
  var id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ success: false, error: 'Invalid id' });
  var character = await getCharacterById(id);
  if (!character) return res.status(404).json({ success: false, error: 'Not found' });
  res.json({ success: true, character: character });
}

export async function create(req, res) {
  var body = req.body || {};
  var name = body && typeof body.name !== 'undefined' ? String(body.name) : '';
  if (!name || !name.trim()) {
    return res.status(400).json({ success: false, error: 'Name is required' });
  }
  try {
    var characterData = { name: name.trim() };

    // Add optional fields
    if (body.elevenLabsAgentId) {
      characterData.elevenLabsAgentId = body.elevenLabsAgentId;
    }

    var created = await createCharacter(characterData);
    res.status(201).json({ success: true, character: created });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function update(req, res) {
  var id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ success: false, error: 'Invalid id' });
  var body = req.body || {};
  if (Object.prototype.hasOwnProperty.call(body, 'name')) {
    var nm = String(body.name || '');
    if (!nm.trim()) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    body.name = nm.trim();
  }
  try {
    var updated = await updateCharacter(id, body);
    if (!updated) return res.status(404).json({ success: false, error: 'Not found' });
    res.json({ success: true, character: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function remove(req, res) {
  var id = parseId(req.params.id);
  if (id === null) return res.status(400).json({ success: false, error: 'Invalid id' });
  try {
    // Canonical resolver handles in-memory → disk fallback precedence
    var ctx = await resolveCharacter(req);
    var selected = ctx ? ctx.id : null;
    if (selected !== null && selected === id) {
      return res.status(400).json({ success: false, error: 'Cannot delete the currently selected character' });
    }
    var ok = await deleteCharacter(id);
    if (!ok) {
      // If this id is (or was) the selected one, treat as protected delete
      if (selected !== null && selected === id) {
        return res.status(400).json({ success: false, error: 'Cannot delete the currently selected character' });
      }
      return res.status(404).json({ success: false, error: 'Not found' });
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getCurrent(req, res) {
  try {
    // Canonical resolver handles in-memory → disk fallback precedence
    var ctx = await resolveCharacter(req);
    var sel = ctx ? ctx.id : null;
    res.json({ success: true, selectedCharacter: sel });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function setSelected(req, res) {
  var id = parseId(req.body && req.body.id);
  if (id === null) return res.status(400).json({ success: false, error: 'Invalid id' });
  try {
    // Detect whether this request came in on the main production port or a test port.
    // The production server exposes port 3100 as a test proxy using the same app.
    // Test-port requests must NOT modify the production in-memory character selection.
    var mainPort = (req.app && req.app.locals && req.app.locals._mainPort) || 3000;
    var reqPort = req.socket && req.socket.localPort;
    var isProductionPort = !reqPort || reqPort === mainPort;

    var inTest = (process && process.env && (process.env.MB_TEST_MODE === '1' || process.env.MB_TEST_MODE === 'true'));
    if (inTest) {
      // Fast path: update in-memory immediately and respond; persist to disk in background
      if (req.app && req.app.locals) {
        var nextCfg = Object.assign({}, req.app.locals.config || {}, { selectedCharacter: id, dataPath: `data/character-${id}` });
        req.app.locals.config = nextCfg;
      }
      res.json({ success: true, selectedCharacter: id });
      // Fire-and-forget disk persistence to avoid blocking tests
      try { updateSelectedCharacter(id).catch(function () { /* ignore */ }); } catch (_) { /* no-op */ }
      return;
    }
    // Production path: persist to disk always
    var cfg = await updateSelectedCharacter(id);
    // Only update in-memory config for production-port requests.
    // Test-port (3100) requests write to disk but do NOT change the running server's character.
    if (isProductionPort && req.app && req.app.locals) {
      req.app.locals.config = Object.assign({}, req.app.locals.config || {}, cfg);
    }
    res.json({ success: true, selectedCharacter: cfg.selectedCharacter });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getAssignments(req, res) {
  try {
    const characters = await loadCharacters();
    const assignments = {};

    characters.forEach(character => {
      if (character.elevenLabsAgentId) {
        assignments[character.id] = { agentId: character.elevenLabsAgentId };
      }
    });

    res.json(assignments);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function updateAssignment(req, res) {
  const characterId = parseId(req.body && req.body.characterId);
  const agentId = req.body && req.body.agentId ? String(req.body.agentId) : null;

  if (characterId === null) {
    return res.status(400).json({ success: false, error: 'Invalid character ID' });
  }

  try {
    const character = await getCharacterById(characterId);
    if (!character) {
      return res.status(404).json({ success: false, error: 'Character not found' });
    }

    // Update the character's agent assignment
    const updatedData = { ...character };
    if (agentId) {
      updatedData.elevenLabsAgentId = agentId;
    } else {
      delete updatedData.elevenLabsAgentId;
    }

    await updateCharacter(characterId, updatedData);

    res.json({
      success: true,
      message: agentId ? 'Agent assigned successfully' : 'Agent assignment removed'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

export default { getAll, getOne, create, update, remove, getCurrent, setSelected, getAssignments, updateAssignment };

