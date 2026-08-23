/**
 * Order Matcher — deterministic transcript → intent resolution for Follow Orders.
 *
 * PURE by contract: no I/O, no imports, no state. Everything it needs arrives in
 * the ctx object (built by followOrdersSuperPowerService.buildMatchContext), so
 * the whole grammar unit-tests in milliseconds with hand-built fixtures.
 *
 * Matching is local and rule-based rather than LLM-driven on purpose: handing an
 * LLM a vocabulary of action ids was measured to leak the ids into speech
 * (config/elevenlabs/gesture/README.md). A transcript matcher cannot fail that way.
 */

// Leading fillers stripped before matching. Multi-word entries first so the
// longest form wins ("could you please" before "please").
const LEADING_FILLERS = [
  'i want you to', 'i order you to', 'i command you to', 'could you please',
  'would you please', 'can you please', 'will you please',
  'could you', 'would you', 'can you', 'will you',
  'hey', 'ok', 'okay', 'please', 'now', 'uh', 'um', 'hmm', 'go ahead and'
];

const TRAILING_FILLERS = ['please', 'now', 'thanks', 'thank you', 'for me', 'right now'];

// Tokens that never identify an object.
const STOPWORD_TOKENS = new Set([
  'the', 'a', 'an', 'your', 'my', 'that', 'this', 'his', 'her', 'its', 'their',
  'to', 'up', 'down', 'out', 'in', 'on', 'off', 'and', 'of'
]);

// Verb table. Order matters within each list: multi-word phrases are tested
// before single words so "turn on" never half-matches as "turn".
const VERB_LEXICON = {
  stop: ['stop everything', 'stand down', 'stop it', 'stop', 'freeze', 'halt', 'enough'],
  open: ['put up', 'push out', 'raise', 'lift', 'open', 'extend'],
  close: ['put down', 'pull in', 'pull back', 'lower', 'drop', 'close', 'shut', 'retract'],
  on: ['turn on', 'light up', 'illuminate', 'ignite', 'switch on'],
  off: ['turn off', 'switch off', 'extinguish', 'douse'],
  toggle: ['toggle'],
  quiet: ['be quiet', 'quiet down', 'silence', 'shut up', 'hush'],
  play: ['play']
};

// Which verbs make sense for which part types. A mismatch is refused with a
// reason instead of guessing ("turn on the elbow" moves nothing).
const VERB_TYPE_COMPAT = {
  open: new Set(['servo', 'continuous_servo', 'linear_actuator', 'motor', 'stepper']),
  close: new Set(['servo', 'continuous_servo', 'linear_actuator', 'motor', 'stepper']),
  on: new Set(['light', 'led']),
  off: new Set(['light', 'led']),
  toggle: new Set(['light', 'led']),
  quiet: new Set(['speaker']),
  play: new Set(['speaker'])
};

const AMBIGUITY_MARGIN = 0.25;

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Lowercase, strip punctuation, collapse whitespace, trim fillers. */
export function normalizeTranscript(text) {
  let t = String(text || '')
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  let changed = true;
  while (changed && t) {
    changed = false;
    for (const filler of LEADING_FILLERS) {
      if (t === filler || t.startsWith(filler + ' ')) {
        t = t.slice(filler.length).trim();
        changed = true;
      }
    }
  }
  changed = true;
  while (changed && t) {
    changed = false;
    for (const filler of TRAILING_FILLERS) {
      if (t === filler || t.endsWith(' ' + filler)) {
        t = t.slice(0, t.length - filler.length).trim();
        changed = true;
      }
    }
  }
  return t;
}

/**
 * Detect and strip the character's name (or an alias) anywhere in the phrase.
 * Scribe drops commas, and guests say both "Orlok, raise your arm" and
 * "raise your arm, Orlok" — position must not matter.
 */
export function stripAddress(normText, names) {
  let addressed = false;
  let remainder = normText;
  for (const rawName of names || []) {
    const name = normalizeTranscript(rawName);
    if (!name) continue;
    const re = new RegExp(`(^|\\s)${escapeRegExp(name)}(\\s|$)`);
    if (re.test(remainder)) {
      addressed = true;
      remainder = remainder.replace(re, ' ').replace(/\s+/g, ' ').trim();
    }
  }
  return { addressed, remainder };
}

function tokenize(text, { dropStopwords = true } = {}) {
  return text.split(' ').filter(tok => tok && (!dropStopwords || !STOPWORD_TOKENS.has(tok)));
}

/** Find the first verb (by lexicon order) present in the phrase. */
function findVerb(text) {
  const padded = ` ${text} `;
  for (const [verb, phrases] of Object.entries(VERB_LEXICON)) {
    for (const phrase of phrases) {
      const idx = padded.indexOf(` ${phrase} `);
      if (idx >= 0) {
        return {
          verb,
          phrase,
          remainder: (padded.slice(0, idx + 1) + padded.slice(idx + phrase.length + 2)).replace(/\s+/g, ' ').trim()
        };
      }
    }
  }
  return null;
}

/**
 * Overlap score of object tokens against a candidate's token set:
 * matched object tokens / total object tokens. The denominator is the SPOKEN
 * side, so extra words in a long part name don't dilute a exact object hit.
 */
function overlapScore(objectTokens, candidateTokens) {
  if (!objectTokens.length) return 0;
  const set = new Set(candidateTokens);
  const matched = objectTokens.filter(tok => set.has(tok)).length;
  return matched / objectTokens.length;
}

/**
 * Part names carry character flavor ("Right Arm of Orlok"). Drop the
 * character's own name tokens before scoring so the spoken "right arm" lines
 * up with the configured name — but ONLY the character's name: "Hand of
 * Azura" keeps "azura", which is exactly what a guest will say.
 */
function partNameTokens(part, characterNameTokens) {
  const tokens = tokenize(normalizeTranscript(part.name)).filter(tok => !characterNameTokens.has(tok));
  const descTokens = tokenize(normalizeTranscript(part.description || ''));
  return { nameTokens: tokens, allTokens: [...new Set([...tokens, ...descTokens])] };
}

// Generic command framings that carry no object information. Removed from the
// spoken side before scoring poses/gestures so "show your contempt" scores on
// "contempt", not on "show".
const GENERIC_COMMAND_TOKENS = new Set([
  'show', 'do', 'make', 'give', 'perform', 'act', 'express', 'strike', 'me', 'us'
]);

function pickBest(scored) {
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  if (!best || best.score <= 0) return { best: null };
  const rivals = scored.filter(c =>
    c.score > 0 && best.score - c.score < AMBIGUITY_MARGIN && c.key !== best.key
  );
  return { best, rivals };
}

/**
 * Resolve one normalized, address-stripped phrase against the character's
 * vocabulary. Ladder: stop → custom commands → poses → gestures → part+verb.
 */
export function matchOrder(transcript, ctx) {
  const cfg = (ctx && ctx.config) || {};
  const norm = normalizeTranscript(transcript);
  if (!norm) return { matched: false, reason: 'empty' };

  const names = [ctx.characterName, ...(cfg.addressAliases || [])].filter(Boolean);
  const { addressed, remainder } = stripAddress(norm, names);
  const text = remainder || norm;

  // 1) STOP — the kill phrase outranks everything, address or no address.
  const stopHit = findVerb(text);
  if (stopHit && stopHit.verb === 'stop' && tokenize(stopHit.remainder).length === 0) {
    return { matched: true, kind: 'stop', confidence: 1, addressed };
  }

  if (cfg.requireAddressByName && !addressed) {
    return { matched: false, reason: 'not_addressed' };
  }

  if (!text) return { matched: false, reason: 'empty' };

  // 2) Custom commands — explicit operator config always outranks fuzzy matching.
  for (const cmd of cfg.commands || []) {
    for (const rawPhrase of cmd.phrases || []) {
      const phrase = normalizeTranscript(rawPhrase);
      if (!phrase) continue;
      const contained = phrase.split(' ').length >= 2 && ` ${text} `.includes(` ${phrase} `);
      if (text === phrase || contained) {
        return { matched: true, kind: 'command', command: cmd, confidence: 1, addressed };
      }
    }
  }

  const minConfidence = typeof cfg.minConfidence === 'number' ? cfg.minConfidence : 0.6;
  const characterNameTokens = new Set(tokenize(normalizeTranscript(ctx.characterName || ''), { dropStopwords: false }));
  // Verb words count for pose/gesture matching (pose names contain them:
  // "Arm Raise Full"), so tokenize the full phrase there — minus generic
  // command framings that carry no object information.
  const phraseTokens = tokenize(text).filter(tok => !GENERIC_COMMAND_TOKENS.has(tok));

  // 3) Poses.
  if (cfg.enablePoseMatching !== false && (ctx.poses || []).length) {
    const scored = ctx.poses.map(pose => {
      const candTokens = [
        ...tokenize(normalizeTranscript(pose.name)),
        ...(pose.tags || []).flatMap(t => tokenize(normalizeTranscript(t)))
      ];
      return { key: `pose:${pose.id}`, pose, score: overlapScore(phraseTokens, candTokens) };
    });
    const { best, rivals } = pickBest(scored);
    if (best && best.score >= minConfidence && !(rivals && rivals.length)) {
      return { matched: true, kind: 'pose', poseId: best.pose.id, poseName: best.pose.name, confidence: best.score, addressed };
    }
  }

  // 4) Gestures — matched against the intent string, then the id.
  if (cfg.enableGestureMatching !== false && (ctx.gestures || []).length) {
    const scored = ctx.gestures.map(g => {
      const candTokens = [
        ...tokenize(normalizeTranscript(g.intent || '')),
        ...tokenize(normalizeTranscript(String(g.id).replace(/_/g, ' '))),
        ...tokenize(normalizeTranscript(g.label || ''))
      ];
      return { key: `gesture:${g.id}`, gesture: g, score: overlapScore(phraseTokens, candTokens) };
    });
    const { best, rivals } = pickBest(scored);
    if (best && best.score >= minConfidence && !(rivals && rivals.length)) {
      return { matched: true, kind: 'gesture', gestureId: best.gesture.id, confidence: best.score, addressed };
    }
  }

  // 5) Part + verb.
  if (cfg.enablePartMatching === false) return { matched: false, reason: 'below_threshold' };

  const verbHit = findVerb(text);
  if (!verbHit) return { matched: false, reason: 'no_verb' };

  // "be quiet" / "silence" with no object silences the speaker(s).
  const objectTokens = tokenize(verbHit.remainder);
  if (!objectTokens.length) {
    if (verbHit.verb === 'quiet') {
      const speaker = (ctx.parts || []).find(p => p.type === 'speaker');
      if (speaker) {
        return { matched: true, kind: 'part', part: speaker, verb: 'quiet', confidence: 1, addressed };
      }
    }
    return { matched: false, reason: 'no_object', detail: `verb "${verbHit.phrase}" had no object` };
  }

  // Alias table first — the operator's explicit vocabulary.
  for (const alias of cfg.partAliases || []) {
    const aliasNorm = normalizeTranscript(alias.alias || '');
    if (!aliasNorm) continue;
    const aliasTokens = tokenize(aliasNorm, { dropStopwords: false });
    if (overlapScore(objectTokens, aliasTokens) >= 0.99 || ` ${verbHit.remainder} `.includes(` ${aliasNorm} `)) {
      const part = (ctx.parts || []).find(p => p.partId === String(alias.partId));
      if (part) {
        return finishPartMatch(part, verbHit.verb, 1, addressed, alias);
      }
    }
  }

  const scored = (ctx.parts || []).map(part => {
    const { allTokens } = partNameTokens(part, characterNameTokens);
    return { key: `part:${part.partId}`, part, score: overlapScore(objectTokens, allTokens) };
  });
  const { best, rivals } = pickBest(scored);
  if (!best || best.score < minConfidence) {
    return { matched: false, reason: 'below_threshold', detail: `no part matched "${verbHit.remainder}"` };
  }
  const distinctRivals = (rivals || []).filter(r => r.part.partId !== best.part.partId);
  if (distinctRivals.length) {
    return {
      matched: false,
      reason: 'ambiguous',
      candidates: [best, ...distinctRivals].map(c => ({ partId: c.part.partId, name: c.part.name, score: c.score }))
    };
  }
  return finishPartMatch(best.part, verbHit.verb, best.score, addressed, null);
}

function finishPartMatch(part, verb, confidence, addressed, alias) {
  const compat = VERB_TYPE_COMPAT[verb];
  if (compat && !compat.has(part.type)) {
    return {
      matched: false,
      reason: 'verb_object_mismatch',
      detail: `"${verb}" does not apply to ${part.type} "${part.name}"`
    };
  }
  const result = { matched: true, kind: 'part', part, verb, confidence, addressed };
  if (alias && alias.invertOpenClose && (verb === 'open' || verb === 'close')) {
    result.verb = verb === 'open' ? 'close' : 'open';
    result.invertedByAlias = true;
  }
  return result;
}

export { VERB_LEXICON, VERB_TYPE_COMPAT };
