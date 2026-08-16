/**
 * Night Memory — the PHI scrubber.
 *
 * This is a privacy guarantee about real children in a real neighbourhood, so it
 * lives in its own module with its own adversarial test (scrub-test.mjs) rather
 * than inline in the harvest script.
 *
 * THE RULE: the Yard Registry may contain FIRST NAMES ONLY. No surnames, no
 * addresses, no phone numbers, no emails, no handles, no links, no ages, no
 * school names, no dates, no digits of any kind.
 *
 * Posture: the previous version was a deny-list — it removed the specific shapes
 * someone thought of. That leaks by construction (it kept "Emily Rodriguez"
 * intact because "Emily" was a canon name, and it never saw O'Brien, McDonald,
 * hyphenated surnames, all-caps, or a lowercase transcript). This version is an
 * allow-list for proper nouns: ANY run of two or more consecutive capitalized
 * tokens collapses to its first token unless EVERY token in the run is castle
 * canon. A surname you have never heard of is therefore removed because it is a
 * second name token, not because it matched a pattern.
 *
 * Over-scrubbing is the accepted failure mode. Losing a lore phrase costs a
 * little colour; leaking a child's surname costs something that cannot be
 * undone.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

// Character names load dynamically from the registry (character-independent);
// the static tail is non-character canon vocabulary (places, titles, lore).
const characterNames = JSON.parse(
  readFileSync(join(HERE, '../../data/characters.json'), 'utf8')
).flatMap(c => String(c.name).split(/\s+/));

export const CANON = new Set([...characterNames,
  'Warner', 'Castle', 'Thomas', 'Vlad', 'Michelle', 'Aaron', 'Heather', 'Emily', 'Isaac',
  'Calvin', 'Ben', 'Iowa', 'Rubin', 'Sir', 'Count', 'Lady', 'Lord', 'Master', 'Queen',
  'Princess', 'Herr', 'Knock', 'Coralville', 'Romanian', 'Romania', 'Transylvania',
  'Halloween', 'Turks', 'Gilbert', 'Sullivan', 'Nosferatu', 'Ellen']);

/**
 * Multi-word proper nouns that may survive INTACT. This is deliberately a list
 * of whole phrases, not "any two canon tokens": the canon vocabulary contains
 * ordinary first names (Emily, Ben, Isaac, Aaron) and ordinary surnames (Warner,
 * Rubin, Knock), so a token-wise rule publishes a real "Ben Rubin" or
 * "Emily Castle" the first time one walks up the drive. Observed for real: a
 * live transcript summary carried "Aaron Warner" straight through the earlier
 * token-wise rule. Multi-word CHARACTER names come from data/characters.json so
 * this stays character-independent.
 */
const CANON_PHRASES = new Set([
  ...JSON.parse(readFileSync(join(HERE, '../../data/characters.json'), 'utf8'))
    .map(c => String(c.name).trim().toLowerCase())
    .filter(n => n.includes(' ')),
  'warner castle', 'master warner', 'count orlok', 'lady mina', 'herr knock',
  'vlad tepes', 'vlad țepeș', 'night protocol', 'street duty', 'rock war',
  'yard registry', 'hunt mode', 'kid mode'
]);

// Numbers that are castle canon rather than data about a person. Masked before
// the number rules run and restored at the end.
const CANON_NUMBERS = ['1462'];

/**
 * Capitalized words that routinely begin an English sentence or clause. They are
 * not treated as name tokens, so "The Warner family" is not read as the name
 * run "The Warner". Missing one costs a little colour, never privacy.
 */
const STOP = new Set(['A', 'An', 'The', 'And', 'But', 'Or', 'So', 'If', 'When', 'While', 'After',
  'Before', 'Then', 'There', 'Their', 'They', 'This', 'That', 'These', 'Those', 'He', 'She', 'It',
  'His', 'Her', 'Him', 'We', 'Us', 'Our', 'You', 'Your', 'I', 'In', 'On', 'At', 'To', 'For', 'With',
  'From', 'Of', 'As', 'By', 'No', 'Not', 'Yes', 'One', 'Two', 'Three', 'Both', 'Each', 'All',
  'Some', 'Many', 'Most', 'Another', 'Several', 'Also', 'However', 'During', 'Because', 'Later',
  'Finally', 'Again', 'Once', 'Never', 'Always', 'Just', 'Only', 'Even', 'Still', 'Asked', 'Said',
  'Told', 'Was', 'Were', 'Is', 'Are', 'Had', 'Has', 'Have', 'Did', 'Does', 'Do', 'Will', 'Would',
  'Could', 'Should', 'May', 'Might', 'Can', 'Guest', 'Guests', 'Visitor', 'Visitors', 'Child',
  'Children', 'Kid', 'Kids', 'Boy', 'Girl', 'Man', 'Woman', 'Mom', 'Dad', 'Mother', 'Father',
  'Sister', 'Brother', 'Family', 'Group', 'Teen', 'Teenager', 'Parents']);

/** A capitalized token, including O'Brien, McDonald, Miller-Jones and ALLCAPS. */
const NAME_TOKEN = "[\\p{Lu}][\\p{L}\\u2019'.\\-]*";
const NAME_RUN = new RegExp(`(?:${NAME_TOKEN})(?:\\s+(?:${NAME_TOKEN}))+`, 'gu');

/** Words that may legitimately follow a first name after "his name was ...". */
const FOLLOW_STOP = new Set(['and', 'but', 'or', 'so', 'then', 'who', 'which', 'that', 'the', 'a',
  'an', 'from', 'with', 'for', 'to', 'at', 'in', 'on', 'of', 'he', 'she', 'they', 'it', 'his',
  'her', 'their', 'we', 'you', 'i', 'is', 'was', 'were', 'are', 'said', 'told', 'asked', 'wanted',
  'came', 'went', 'ran', 'and']);

const STREET_ANY = 'street|st|avenue|ave|road|rd|drive|dr|lane|ln|court|ct|boulevard|blvd|way|circle|cir|terrace|ter|place|pl|highway|hwy|parkway|pkwy|trail|trl';
// Without a house number to anchor it, only the unambiguous suffixes qualify —
// "Way" and "Place" and "Trail" are ordinary English words.
const STREET_BARE = 'Street|Avenue|Boulevard|Lane|Road|Drive|Court|Circle|Terrace|Parkway|Highway|St|Ave|Rd|Ln|Blvd|Ct|Cir';

/**
 * Collapse proper-noun runs to a single first name. A run survives whole only if
 * every one of its tokens is castle canon ("Sir Dragomir", "Warner Castle").
 */
function collapseNameRuns(text) {
  return text.replace(NAME_RUN, run => {
    const tokens = run.split(/\s+/);
    const out = [];
    let group = [];
    const flush = () => {
      if (!group.length) return;
      const phrase = group.join(' ').replace(/[.,]+$/, '').toLowerCase();
      if (group.length === 1 || CANON_PHRASES.has(phrase)) out.push(...group);
      else out.push(group[0]);
      group = [];
    };
    for (const t of tokens) {
      if (STOP.has(t)) { flush(); out.push(t); } else group.push(t);
    }
    flush();
    return out.join(' ');
  });
}

/**
 * Remove everything after a first name in an explicit naming phrase. This is the
 * only handle on an all-lowercase transcript, where capitalization tells us
 * nothing ("his name was tyler brooks").
 */
function collapseLowercaseNames(text) {
  return text.replace(
    /\b(name (?:is|was)|named|called|goes by)\s+([\p{L}][\p{L}’'.\-]*)\s+([\p{L}][\p{L}’'.\-]*)/giu,
    (m, marker, first, second) => (FOLLOW_STOP.has(second.toLowerCase()) ? m : `${marker} ${first}`)
  );
}

/**
 * Strip every identifier from a free-text summary, leaving first names only.
 */
export function scrub(text) {
  if (!text) return '';
  let s = String(text);

  // Canon numbers are lore, not data about a person — park them out of reach.
  CANON_NUMBERS.forEach((n, i) => { s = s.split(n).join(` canonnum${String.fromCharCode(97 + i)} `); });

  s = s
    // contact details
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[contact]')                                  // email
    .replace(/\b[\w'’-]+(?:\s+dot\s+[\w'’-]+)*\s+at\s+[\w'’-]+\s+dot\s+(?:com|net|org|edu|gov|io|co)\b/gi, '[contact]') // spoken email
    .replace(/(^|[\s(])@[\w.]+/g, '$1[handle]')                                        // social handle
    .replace(/\b(?:https?:\/\/)?(?:[\w-]+\.)+(?:com|net|org|edu|gov|io|co|us)\b(?:\/[^\s,;]*)?/gi, '[link]')
    .replace(/\b\d{1,4}[/.\-]\d{1,2}[/.\-]\d{2,4}\b/g, '[date]')                       // dates
    .replace(/\+?\d[\d\s().-]{6,}\d/g, '[contact]')                                    // phone-like runs

    // where they live
    .replace(new RegExp(`\\b\\d{1,6}\\s+(?:[\\w'’.-]+\\s+){0,3}(?:${STREET_ANY})\\b\\.?`, 'gi'), '[address]')
    .replace(new RegExp(`\\b(?:[\\p{Lu}][\\w'’-]*\\s+){1,3}(?:${STREET_BARE})\\b\\.?`, 'gu'), '[address]')
    .replace(/\b(?:apt|apartment|unit|suite|ste)\.?\s*#?\s*[\w-]+/gi, '[address]')

    // where they go to school
    .replace(/\b(?:[\p{Lu}][\w'’-]*\s+){1,3}(?:Elementary|Middle|High|Junior|School|Academy|Preschool|Kindergarten|College|University)(?:\s+School)?\b/gu, '[school]')
    .replace(/\b[\w'’-]+\s+(?:elementary|middle school|high school|preschool|kindergarten)\b/gi, '[school]')

    // how old they are
    .replace(/\b(?:aged?|age)\s+\d{1,2}\b/gi, '[age]')
    .replace(/\b\d{1,2}\s*(?:years?|yrs?)[\s-]*old\b/gi, '[age]')
    .replace(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)[\s-]+years?[\s-]+old\b/gi, '[age]')
    .replace(/\b(?:aged?|age)\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/gi, '[age]')
    .replace(/,\s*\d{1,2}\s*,/g, ', ');                                                // "Ava, 7, was ..."

  s = collapseLowercaseNames(s);
  s = collapseNameRuns(s);

  // Nothing numeric survives. Whatever a digit was doing here, it identified
  // someone or something about them.
  s = s.replace(/\d+/g, '');

  CANON_NUMBERS.forEach((n, i) => { s = s.split(`canonnum${String.fromCharCode(97 + i)}`).join(n); });

  return s
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,;:])\s*(?=[,;:.])/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Last line of defence. A registry line that still looks like it carries an
 * identifier is dropped whole rather than published — the castle can forget one
 * visit far more cheaply than it can un-publish a phone number.
 */
export function isClean(line) {
  return !/\d|@|\bhttps?:\/\//.test(String(line).replace(/1462/g, ''));
}

/** Obvious non-names that follow "I'm ..." / "it's ..." in real speech. */
const NOT_A_NAME = new Set(['the', 'not', 'just', 'here', 'gonna', 'really', 'sure', 'okay', 'good',
  'fine', 'scared', 'sorry', 'back', 'ready', 'trying', 'going', 'coming', 'looking', 'talking',
  'about', 'from', 'with', 'nobody', 'noone', 'someone', 'nothing', 'cold', 'hot', 'tired', 'lost',
  'done', 'first', 'last', 'only', 'still', 'sir', 'maam', 'dude', 'guys', 'kidding', 'joking',
  'halloween', 'trick', 'treat', 'candy', 'dark', 'late', 'today', 'tonight', 'tomorrow', 'monday',
  'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'nice', 'great', 'right',
  'wrong', 'weird', 'creepy', 'funny', 'happy', 'afraid', 'brave', 'hungry', 'thirsty', 'that',
  'this', 'these', 'those', 'them', 'they', 'their', 'what', 'when', 'where', 'why', 'how',
  // relationship words — "this is my brother" must not enrol "My" as a guest
  'my', 'our', 'his', 'her', 'your', 'brother', 'sister', 'mom', 'mum', 'dad', 'mother', 'father',
  'friend', 'friends', 'cousin', 'son', 'daughter', 'baby', 'grandma', 'grandpa', 'auntie', 'aunt',
  'uncle', 'neighbour', 'neighbor', 'everyone', 'everybody', 'all', 'both', 'she', 'him', 'himself',
  'herself', 'myself', 'yourself', 'one', 'two', 'three', 'again', 'also', 'too', 'very', 'super']);

/**
 * Pull FIRST names guests actually gave: "my name is X", "i'm X", "call me X".
 * Single tokens only, by construction — a surname can never come out of here.
 */
export function extractNames(userText) {
  const names = new Set();
  const re = /\b(?:my name is|my name's|i am|i'm|call me|it's|this is)\s+([\p{L}][\p{L}’'-]{1,15})\b/giu;
  let m;
  while ((m = re.exec(String(userText || ''))) !== null) {
    const raw = m[1];
    if (NOT_A_NAME.has(raw.toLowerCase())) continue;
    if (!/^[\p{L}][\p{L}’'-]{1,15}$/u.test(raw)) continue;
    names.add(raw[0].toUpperCase() + raw.slice(1).toLowerCase());
    if (names.size >= 8) break;
  }
  return [...names];
}
