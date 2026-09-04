/**
 * Body-role interpretation — the layer between how a guest talks and how a
 * character is wired.
 *
 * The order matcher scores a spoken phrase against a part's NAME. That only
 * works when the guest happens to say the operator's word for the hardware, and
 * across this fleet the operator's word is never the same twice: the thing on
 * the end of the neck is "Head on a Swivel" on one character, "Neck" on another
 * and "Head Servo" on a third. A guest says none of those. A guest says
 * "look at me", "wave", "open your mouth", "take a bow".
 *
 * So this module does not know any character. It reads whatever parts a
 * character actually has, sorts each one into a canonical BODY ROLE, and maps
 * spoken intent onto a role. Add a new animatronic with parts named in a way
 * nobody here anticipated and it still resolves, because the classification is
 * derived from that character's own parts.json at match time.
 *
 * Two deliberate rules:
 *   - Non-motion types are classified by TYPE, never by name. A character on
 *     this fleet has a webcam named after an eye and a lamp named after a hand;
 *     neither is anatomy, and "raise your hand" must never fire a lamp.
 *   - A role is a *candidate set*, not a part. Ambiguity is reported, not
 *     guessed, which is the same contract the rest of the matcher keeps.
 *
 * Pure: no filesystem, no network, no hardware.
 */

/** Types that can physically move on command. Everything else is fixtures. */
export const MOTION_TYPES = new Set([
  'servo', 'continuous_servo', 'linear_actuator', 'motor', 'stepper'
]);

/** Types whose role is decided by what they ARE, never by what they are called. */
const TYPE_ROLES = {
  light: 'light',
  led: 'light',
  speaker: 'speaker',
  microphone: 'microphone',
  webcam: 'camera',
  camera: 'camera',
  motion_sensor: 'sensor',
  sensor: 'sensor'
};

/**
 * Keyword patterns for motion parts, most specific first. A part is sorted into
 * the first role whose keywords appear in its name (then its description).
 */
// [role, PRIMARY keywords, SECONDARY keywords]. Secondary words name a
// sub-joint of the same limb — an elbow is part of an arm, but "wave" means the
// arm, not the elbow. Both sort into the role; primary wins when choosing.
const ROLE_KEYWORDS = [
  ['jaw', ['jaw', 'mouth', 'mandible', 'chomp'], ['lip', 'chin']],
  ['eye', ['eye', 'eyelid', 'iris', 'blink'], ['brow']],
  ['head', ['head', 'neck', 'skull', 'swivel', 'cranium'], ['face']],
  ['arm', ['arm', 'hand', 'claw', 'paw', 'limb'], ['elbow', 'forearm', 'shoulder', 'wrist', 'finger']],
  ['torso', ['waist', 'bow', 'torso', 'spine', 'lean', 'bend'], ['hip', 'chest', 'back']],
  ['door', ['door', 'lid', 'coffin', 'hatch', 'casket'], ['gate', 'panel', 'drawer']],
  ['wing', ['wing'], []],
  ['tail', ['tail'], []],
  ['leg', ['leg', 'foot'], ['knee', 'ankle']]
];

// When a generic "do something" has to choose, smaller and safer motion first.
// A head turn reads as alive; an unnamed motor might be anything.
const GENERIC_ROLE_PREFERENCE = ['head', 'jaw', 'arm', 'eye', 'wing', 'tail', 'torso', 'body', 'door', 'leg'];

const SIDE_KEYWORDS = [['right', 'right'], ['left', 'left']];

function words(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

/** Does any keyword appear as a whole word in the haystack? */
function hasKeyword(tokens, keywords) {
  const set = new Set(tokens);
  return keywords.some(k => set.has(k));
}

/**
 * Sort every part of ONE character into canonical roles.
 *
 * @param {Array} parts - that character's parts (as stored in parts.json)
 * @returns {Array<{part:object, role:string, side:string|null, movable:boolean}>}
 */
export function inferPartRoles(parts) {
  const out = [];
  for (const part of parts || []) {
    if (part.enabled === false) continue;
    const type = String(part.type || '').toLowerCase();

    const typeRole = TYPE_ROLES[type];
    if (typeRole) {
      out.push({ part, role: typeRole, side: null, movable: false });
      continue;
    }
    if (!MOTION_TYPES.has(type)) continue;

    const nameToks = words(part.name);
    const descToks = words(part.description);
    let role = null;
    let primary = false;
    for (const [candidate, primaryKw, secondaryKw] of ROLE_KEYWORDS) {
      if (hasKeyword(nameToks, primaryKw)) { role = candidate; primary = true; break; }
      if (hasKeyword(nameToks, secondaryKw)) { role = candidate; primary = false; break; }
    }
    if (!role) {
      for (const [candidate, primaryKw, secondaryKw] of ROLE_KEYWORDS) {
        if (hasKeyword(descToks, primaryKw) || hasKeyword(descToks, secondaryKw)) { role = candidate; break; }
      }
    }
    // A motion part nobody named after an anatomy word is still a thing that
    // moves — a wiper motor, a shake motor. "Do something" should reach it.
    if (!role) role = 'body';

    let side = null;
    for (const [kw, value] of SIDE_KEYWORDS) {
      if (nameToks.includes(kw)) { side = value; break; }
    }
    out.push({ part, role, side, primary, movable: true });
  }
  return out;
}

/**
 * Spoken intent → a body role and what to do with it.
 *
 * `phrases` are matched as whole-word substrings of the normalized transcript,
 * longest first, so "close your mouth" wins over "mouth". `expand` feeds the
 * pose rung: a character that HAS a hand-authored "Wave" pose should perform it
 * rather than jerking one actuator, which is why the interpreter offers pose
 * tokens before it offers a part.
 */
export const BODY_INTENTS = [
  { phrases: ['open your mouth', 'open your jaw', 'open the jaw'], role: 'jaw', verb: 'open', expand: ['jaw', 'mouth', 'open'] },
  { phrases: ['close your mouth', 'shut your mouth', 'close your jaw'], role: 'jaw', verb: 'close', expand: ['jaw', 'mouth', 'close'] },
  { phrases: ['chomp', 'bite', 'snap at me', 'gnash'], role: 'jaw', verb: 'open', expand: ['jaw', 'mouth', 'bite'] },

  { phrases: ['look at me', 'look at us', 'look over here', 'look here', 'look this way', 'face me', 'face us', 'turn your head', 'turn around', 'look away'], role: 'head', verb: 'open', expand: ['head', 'neck', 'turn', 'look'] },
  { phrases: ['nod', 'shake your head', 'move your head', 'tilt your head'], role: 'head', verb: 'open', expand: ['head', 'neck', 'nod'] },

  { phrases: ['wave at me', 'wave at us', 'wave hello', 'wave hi', 'wave', 'say hi', 'say hello', 'greet us', 'greet me'], role: 'arm', verb: 'open', expand: ['wave', 'arm', 'hand', 'raise', 'greet'] },
  { phrases: ['raise your arm', 'raise your hand', 'lift your arm', 'lift your hand', 'put your arm up', 'put your hand up', 'reach for me', 'reach out'], role: 'arm', verb: 'open', expand: ['arm', 'hand', 'raise', 'lift'] },
  { phrases: ['lower your arm', 'lower your hand', 'put your arm down', 'put your hand down', 'drop your arm'], role: 'arm', verb: 'close', expand: ['arm', 'hand', 'lower', 'down'] },

  { phrases: ['take a bow', 'bow to me', 'bow to us', 'bow', 'bend over', 'lean forward', 'lean in', 'lean toward me'], role: 'torso', verb: 'open', expand: ['bow', 'waist', 'lean', 'forward'] },
  { phrases: ['stand up', 'straighten up', 'sit up', 'lean back', 'stand back up'], role: 'torso', verb: 'close', expand: ['stand', 'waist', 'upright', 'back'] },

  { phrases: ['blink', 'wink at me', 'wink'], role: 'eye', verb: 'open', expand: ['eye', 'blink', 'wink'] },

  { phrases: ['light up', 'glow', 'shine', 'turn on your light', 'show me the light'], role: 'light', verb: 'on', expand: ['light', 'glow', 'lamp'] },
  { phrases: ['go dark', 'lights out', 'turn off your light'], role: 'light', verb: 'off', expand: ['light', 'dark', 'off'] },

  { phrases: ['open the door', 'open the lid', 'open the coffin', 'come out', 'open up'], role: 'door', verb: 'open', expand: ['door', 'lid', 'coffin', 'open'] },
  { phrases: ['close the door', 'close the lid', 'close the coffin', 'go back in', 'shut the lid'], role: 'door', verb: 'close', expand: ['door', 'lid', 'coffin', 'close'] },

  { phrases: ['flap your wings', 'flap'], role: 'wing', verb: 'open', expand: ['wing', 'flap'] },

  // Deliberately last: the catch-all a kid actually says. Any moving part will
  // do, so this resolves against role 'body' and then anything movable.
  { phrases: ['do something', 'move for me', 'move around', 'dance', 'shake', 'wiggle', 'move'], role: 'body', verb: 'open', expand: ['move', 'shake', 'dance'], anyMovable: true }
];

// Longest phrase first so a specific intent is never shadowed by a generic one
// that happens to be a substring of it ("move your head" vs "move").
const SORTED_INTENTS = BODY_INTENTS
  .flatMap(intent => intent.phrases.map(phrase => ({ ...intent, phrase })))
  .sort((a, b) => b.phrase.length - a.phrase.length);

/** Sides a guest can name explicitly, independent of how the part is named. */
function spokenSide(text) {
  if (/\bright\b/.test(text)) return 'right';
  if (/\bleft\b/.test(text)) return 'left';
  return null;
}

/**
 * Read a spoken phrase as a body intent.
 * @returns {{role:string, verb:string, side:string|null, phrase:string, expand:string[], anyMovable:boolean}|null}
 */
export function interpretBodyIntent(text) {
  const padded = ` ${String(text || '')} `;
  for (const intent of SORTED_INTENTS) {
    if (padded.includes(` ${intent.phrase} `)) {
      return {
        role: intent.role,
        verb: intent.verb,
        side: spokenSide(padded),
        phrase: intent.phrase,
        expand: intent.expand || [],
        anyMovable: intent.anyMovable === true
      };
    }
  }
  return null;
}

/**
 * Choose the parts that satisfy an interpreted intent.
 *
 * @param {object} intent - from interpretBodyIntent
 * @param {Array} parts - the character's parts
 * @param {Set|Array} [brokenPartIds] - parts the operator has declared broken;
 *        skipped when a healthy alternative exists, so "wave" reaches the arm
 *        that still works instead of the one that does not.
 * @returns {{candidates:Array, role:string}}
 */
export function partsForIntent(intent, parts, brokenPartIds = []) {
  const broken = new Set([...brokenPartIds].map(String));
  const roles = inferPartRoles(parts);

  let pool = roles.filter(r => r.role === intent.role);
  // A light is a fixture, not a motion part, but "light up" is a real order.
  if (intent.role !== 'light') pool = pool.filter(r => r.movable);

  if (!pool.length && intent.anyMovable) pool = roles.filter(r => r.movable);

  if (intent.side) {
    const sided = pool.filter(r => r.side === intent.side);
    if (sided.length) pool = sided;
  }

  // Never choose hardware the operator has declared broken while something that
  // works fills the same role — "wave" should reach the arm that still moves.
  const healthy = pool.filter(r => !broken.has(String(r.part.partId ?? r.part.id)));
  if (healthy.length) pool = healthy;

  // A generic order has to land somewhere useful; narrow it to one role by
  // preference before reporting ambiguity across unrelated body parts.
  if (intent.anyMovable && pool.length > 1) {
    const byRole = GENERIC_ROLE_PREFERENCE.find(r => pool.some(c => c.role === r));
    if (byRole) pool = pool.filter(c => c.role === byRole);
  }

  // The limb itself outranks its own joints: an arm, not that arm's elbow.
  const primaries = pool.filter(r => r.primary);
  if (primaries.length && primaries.length < pool.length) pool = primaries;

  // Still tied and the guest named no side: a right-handed wave is the
  // convention, and picking one beats refusing a child.
  if (pool.length > 1 && !intent.side) {
    const right = pool.filter(r => r.side === 'right');
    if (right.length === 1) pool = right;
  }

  return { candidates: pool, role: intent.role };
}

export default { MOTION_TYPES, inferPartRoles, interpretBodyIntent, partsForIntent, BODY_INTENTS };
