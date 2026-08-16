/**
 * Gesture vocabularies configured on the ElevenLabs side (GESTURE-ENGINE-SPEC §7),
 * plus a detector for the one failure mode this feature can inflict on the guests:
 * the character SPEAKING a gesture instead of calling the `gesture` client tool.
 *
 * These prompts are dense with [audio tags], so a model asked for a gesture id will
 * happily emit "[nod_commend]" as if it were another tag — which TTS may read aloud.
 * Any non-zero leak rate is a shipping blocker, so analyze.mjs reports it every run.
 */
export const GESTURE_VOCABULARY = {
  orlok: ['turn_away_dismissive', 'menacing_lean', 'slow_scan_down', 'hand_glow',
    'courtly_bow', 'beckon_reach', 'kiss_bow', 'recoil'],
  mina: ['lid_crack', 'lid_close_soft', 'listen_turn', 'dream_gift', 'trance',
    'rose_for_thomas', 'choose_morning'],
  dragomir: ['survey_road', 'head_snap_alert', 'look_away_disdain', 'magic_box_reveal',
    'nod_commend'],
  pumpkinhead: ['lurch_at', 'vine_writhe', 'carnival_sway', 'count_the_souls'],
  groundbreaker: ['roof_rumble', 'lean_over', 'victory_shake'],
  // Renfield has no body yet (no node, no parts) and so no vocabulary and no tool.
  renfield: []
};

const ALL_IDS = [...new Set(Object.values(GESTURE_VOCABULARY).flat())];

const LEAK_PATTERNS = [
  // any gesture id spoken, in brackets, parens, or bare
  new RegExp(`(?:${ALL_IDS.join('|')})`, 'gi'),
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
