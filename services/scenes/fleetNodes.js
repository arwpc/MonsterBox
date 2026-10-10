/**
 * Pure node-resolution helpers for the cross-node scene steps (fleetSteps.js).
 * Kept free of service imports so the offline validator can use them without
 * starting the orchestration/goblin services (and their timers).
 */
import os from 'os';

export const FLEET_STEP_TYPES = Object.freeze(['fleet-scene', 'fleet-say', 'fleet-audio', 'fleet-stop-audio', 'fleet-mode']);

/** Lower-cased alphanumerics only: "Sir Dragomir" and "sirdragomir" meet here. */
export function looseKey(value) {
  return String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Resolve a step's `node` field against the registry.
 * Accepts 'all', an animatronic id, a character id, a name, a hostname, or a
 * unique loose fragment of a name ("dragomir"). Ambiguity is an error, never a
 * guess: a line must not come out of the wrong monster.
 * @returns {{nodes: object[]} | {error: string}}
 */
export function resolveFleetNodes(target, registry, { allowAll = true } = {}) {
  const list = Array.isArray(registry) ? registry.filter(n => n && n.id != null) : [];
  if (target == null || String(target).trim() === '') return { error: 'node is required' };
  const raw = String(target).trim();
  if (raw.toLowerCase() === 'all') {
    if (!allowAll) return { error: "node 'all' is not allowed for this step" };
    return { nodes: list.slice() };
  }
  if (/^\d+$/.test(raw)) {
    const byId = list.filter(n => String(n.id) === raw);
    if (byId.length === 1) return { nodes: byId };
    const byChar = list.filter(n => String(n.characterId) === raw);
    if (byChar.length === 1) return { nodes: byChar };
    return { error: `no animatronic with id ${raw}` };
  }
  const lower = raw.toLowerCase();
  const pick = (matches) => {
    if (matches.length === 1) return { nodes: matches };
    if (matches.length > 1) return { error: `"${raw}" matches ${matches.map(n => n.name).join(', ')} — use the id` };
    return null;
  };
  const key = looseKey(raw);
  return pick(list.filter(n => String(n.name || '').toLowerCase() === lower))
    || pick(list.filter(n => String(n.hostname || '').toLowerCase() === lower))
    || (key ? pick(list.filter(n => looseKey(n.name) === key || looseKey(n.hostname) === key)) : null)
    || (key.length >= 4 ? pick(list.filter(n => looseKey(n.name).includes(key))) : null)
    || { error: `no animatronic named "${raw}"` };
}

/**
 * Is this registry entry the node we are running on? Hostname first (each node
 * advertises its own); when no entry carries this host's name (a dev box), the
 * node playing the scene is taken to be the scene's character.
 */
export function isSelfNode(node, registry, { hostname = os.hostname(), characterId = null } = {}) {
  const host = String(hostname || '').toLowerCase();
  const list = Array.isArray(registry) ? registry : [];
  const anyHostMatch = list.some(n => String(n.hostname || '').toLowerCase() === host);
  if (anyHostMatch) return String(node.hostname || '').toLowerCase() === host;
  return characterId != null && String(node.characterId) === String(characterId);
}

