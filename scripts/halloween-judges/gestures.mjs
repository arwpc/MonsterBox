/**
 * Detector for the one failure mode the gesture feature can inflict on the guests:
 * a character SPEAKING a gesture instead of calling the `gesture` client tool.
 *
 * The character prompts are dense with [audio tags], so a model handed a gesture id
 * will happily emit "[nod_commend]" as if it were another tag — text that TTS may read
 * aloud. Any non-zero leak rate is a shipping blocker, so analyze.mjs reports it on
 * every run.
 *
 * The ids below are the union of every character's vocabulary from
 * docs/development/GESTURE-ENGINE-SPEC.md §7. Which character owns which id does not
 * matter here — a gesture id in ANY character's spoken text is a leak, and keeping this
 * a flat set means the detector needs no per-character knowledge. The per-character
 * mapping lives where it belongs: config/elevenlabs/gesture/body-sections/.
 */
export const GESTURE_IDS = [
  // head/arm/light figures
  'turn_away_dismissive', 'menacing_lean', 'slow_scan_down', 'hand_glow',
  'courtly_bow', 'beckon_reach', 'kiss_bow', 'recoil',
  // coffin figure
  'lid_crack', 'lid_close_soft', 'listen_turn', 'dream_gift', 'trance',
  'rose_for_thomas', 'choose_morning',
  // continuous-head sentry
  'survey_road', 'head_snap_alert', 'look_away_disdain', 'magic_box_reveal',
  'nod_commend',
  // vine/wiper figure
  'lurch_at', 'vine_writhe', 'carnival_sway', 'count_the_souls',
  // roofline figure
  'roof_rumble', 'lean_over', 'victory_shake'
];

const LEAK_PATTERNS = [
  // any gesture id spoken, whether bracketed, parenthesised or bare
  new RegExp(`(?:${GESTURE_IDS.join('|')})`, 'gi'),
  // the tool name itself leaking as text
  /\bgesture\s*[([:]/gi,
  /\[\s*gesture\b/gi,
  /\bgesture_id\b/gi
];

/** Returns the leaked substrings found in one agent utterance. */
export function findGestureLeaks(message) {
  if (!message) return [];
  const hits = [];
  for (const re of LEAK_PATTERNS) {
    re.lastIndex = 0;
    for (const m of message.matchAll(re)) hits.push(m[0]);
  }
  return hits;
}

/**
 * Scans result rows for spoken-gesture leakage.
 * Returns { byAgent: {agent: {conversations, leakingConversations, instances, samples}}, total }
 */
export function scanGestureLeaks(rows) {
  const byAgent = {};
  let total = 0;
  for (const row of rows) {
    if (row.error) continue;
    const a = (byAgent[row.agent] ||= {
      conversations: 0, leakingConversations: 0, instances: 0, samples: []
    });
    a.conversations++;
    let leaked = false;
    for (const turn of row.transcript || []) {
      if (turn.role !== 'agent') continue;
      const hits = findGestureLeaks(turn.message);
      if (!hits.length) continue;
      leaked = true;
      a.instances += hits.length;
      total += hits.length;
      if (a.samples.length < 3) {
        a.samples.push((turn.message || '').replace(/\s+/g, ' ').slice(0, 160));
      }
    }
    if (leaked) a.leakingConversations++;
  }
  return { byAgent, total };
}
