#!/usr/bin/env node
/**
 * Adversarial test for the Yard Registry PHI scrubber.
 *
 * The registry is built from real conversations with real children in a real
 * neighbourhood. The privacy claim is "first names only", so this suite tries to
 * break that claim rather than to confirm it: full names in every shape a
 * transcript actually produces (canon first name + real surname, O'Brien,
 * McDonald, hyphenated, three-part, ALLCAPS, all-lowercase, title + surname),
 * plus addresses, phone numbers, emails, spoken emails, handles, links, dates,
 * ages tied to names, and school names.
 *
 * Every case declares what MUST NOT survive, and the canon cases declare what
 * MUST survive so the scrubber cannot pass by deleting everything.
 *
 *   node scripts/night-memory/scrub-test.mjs          # run
 *   node scripts/night-memory/scrub-test.mjs -v       # show every output
 */
import { scrub, extractNames, isClean } from './scrub.mjs';

const VERBOSE = process.argv.includes('-v') || process.argv.includes('--verbose');

const cases = [
  // ---- names, every shape a transcript really produces
  { n: 'plain full name', in: 'The guest, Emily Rodriguez, asked Orlok for a fortune.', no: ['Rodriguez'], yes: ['Emily', 'Orlok'] },
  { n: 'canon first name + real surname', in: 'Ben Carter came back a second time with his sister.', no: ['Carter'], yes: ['Ben'] },
  { n: 'non-canon full name', in: 'Sophia Nakamura told Mina about her dream.', no: ['Nakamura'], yes: ['Sophia', 'Mina'] },
  { n: 'hyphenated surname', in: 'Sarah Miller-Jones laughed at PumpkinHead.', no: ['Miller', 'Jones'], yes: ['Sarah'] },
  { n: 'apostrophe surname', in: "Liam O'Brien dared Groundbreaker to shout louder.", no: ['Brien'], yes: ['Liam'] },
  { n: 'Mc surname', in: 'Jake McDonald asked about the box of gold.', no: ['McDonald'], yes: ['Jake'] },
  { n: 'three part name', in: 'Maria De Luca visited with her mother.', no: ['Luca'], yes: ['Maria'] },
  { n: 'all caps name', in: 'JOHN SMITH shouted at the roof giant.', no: ['SMITH'], yes: [] },
  { n: 'all lowercase name', in: 'the kid said his name was tyler brooks and ran off.', no: ['brooks'], yes: ['tyler'] },
  { n: 'title + surname', in: 'Mrs Henderson thanked Sir Dragomir for the story.', no: ['Henderson'], yes: ['Dragomir'] },
  { n: 'doctor title', in: 'Dr Patel asked whether the actuator was safe.', no: ['Patel'], yes: [] },
  { n: 'named marker lowercase', in: 'a girl named ava chen wanted the lullaby.', no: ['chen'], yes: ['ava'] },

  // ---- contact details
  { n: 'email', in: 'He offered his email, tyler.brooks92@gmail.com, for the photos.', no: ['brooks92', 'gmail'], yes: [] },
  { n: 'spoken email', in: 'She said to write to sophia dot nakamura at yahoo dot com.', no: ['nakamura', 'yahoo'], yes: [] },
  { n: 'phone with dashes', in: 'Her mom left a number, 319-555-0142, in case of trouble.', no: ['319', '555', '0142'], yes: [] },
  { n: 'phone with spaces', in: 'Call 1 319 555 0142 if the mask breaks.', no: ['319', '555', '0142'], yes: [] },
  { n: 'phone with parens', in: 'The dad gave (319) 555-0142 as a contact.', no: ['319', '555', '0142'], yes: [] },
  { n: 'social handle', in: 'He wanted to tag @tylerbrooks92 in a video of the yard.', no: ['tylerbrooks92'], yes: [] },
  { n: 'url', in: 'She said her mom posts at facebook.com/sarahmillerjones every night.', no: ['facebook', 'sarahmillerjones'], yes: [] },

  // ---- where they live
  { n: 'street address', in: 'They live at 412 Oak Street just past the church.', no: ['412', 'Oak'], yes: [] },
  { n: 'street address lowercase', in: 'the boy said he lives at 412 oak street around the corner.', no: ['412', 'oak'], yes: [] },
  { n: 'multiword street', in: 'Their house is 1428 Elm Tree Road on the hill.', no: ['1428', 'Elm'], yes: [] },
  { n: 'street without number', in: 'The family walked over from Sycamore Lane tonight.', no: ['Sycamore'], yes: [] },
  { n: 'apartment', in: 'They mentioned Apt 3B in the brick building.', no: ['3B'], yes: [] },
  { n: 'zip code', in: 'He said their zip is 52241 and asked about the castle.', no: ['52241'], yes: [] },
  { n: 'house descriptor + address', in: 'They are the house with 3 skeletons at 88 Maple Drive.', no: ['88', 'Maple'], yes: [] },

  // ---- ages
  { n: 'age in commas', in: 'Ava, 7, was frightened but delighted by the fortune.', no: ['7'], yes: ['Ava'] },
  { n: 'age in words', in: 'Noah is seven years old and asked for a scarier voice.', no: ['seven years old'], yes: ['Noah'] },
  { n: 'aged N', in: 'The girl, aged 9, wanted to hear the lullaby again.', no: ['9'], yes: [] },
  { n: 'birthday date', in: 'Her birthday is 04/17/2019 she proudly announced.', no: ['2019', '04', '17'], yes: [] },

  // ---- school
  { n: 'elementary school', in: 'She goes to Kirkwood Elementary and told her class about Mina.', no: ['Kirkwood'], yes: ['Mina'] },
  { n: 'high school', in: 'The teenager attends West High School near the park.', no: ['West'], yes: [] },
  { n: 'teacher + school', in: 'His teacher Miss Alvarez at Horn Elementary heard the story.', no: ['Alvarez', 'Horn'], yes: [] },

  // ---- the whole hand at once
  { n: 'combined worst case', in: 'Emily Rodriguez, 7, of 412 Oak Street, reachable at 319-555-0142 or emily.r@example.com, attends Kirkwood Elementary.', no: ['Rodriguez', '412', 'Oak', '319', '555', '0142', 'Kirkwood', '7'], yes: ['Emily'] },

  // ---- the scrubber must not simply delete everything
  { n: 'canon pair survives', in: 'The guest asked Sir Dragomir about Warner Castle and Vlad.', no: [], yes: ['Sir', 'Dragomir', 'Warner', 'Castle', 'Vlad'] },
  // Two canon TOKENS are not a canon phrase: canon includes ordinary first names
  // and ordinary surnames, so a token-wise rule leaks real people's full names.
  { n: 'two canon tokens are not a canon phrase', in: 'Ben Rubin came up the drive with Emily Castle.', no: ['Rubin'], yes: ['Ben', 'Emily'] },
  { n: 'owner full name collapses', in: 'The user, Aaron Warner, asked about the capital of France.', no: ['Warner'], yes: ['Aaron'] },
  { n: 'in-character title survives', in: 'The agent repeatedly addressed the user as Master Warner.', no: [], yes: ['Master Warner'] },
  { n: 'canon single names survive', in: 'Mina sang for Emily while Orlok watched from the coffin.', no: [], yes: ['Mina', 'Emily', 'Orlok'] },
  { n: 'canon year survives', in: 'He told the story of the rock war in 1462 against the Turks.', no: [], yes: ['1462', 'Turks'] },
  { n: 'ordinary summary survives', in: 'A returning guest asked PumpkinHead about the soul quota and left laughing.', no: [], yes: ['PumpkinHead', 'soul quota', 'laughing'] }
];

const nameCases = [
  { n: 'name is', in: 'hi my name is Emily Rodriguez and this is my brother', want: ['Emily'], notWant: ['Rodriguez'] },
  { n: 'call me', in: 'you can call me Tyler', want: ['Tyler'], notWant: [] },
  { n: 'lowercase', in: "i'm bobby", want: ['Bobby'], notWant: [] },
  { n: 'not a name', in: "i'm scared and it's really dark", want: [], notWant: ['Scared', 'Really'] },
  { n: 'surname never extracted', in: 'my name is Sarah Miller-Jones', want: ['Sarah'], notWant: ['Miller', 'Jones', 'Miller-Jones'] },
  { n: 'relationship words are not guests', in: 'my name is Emily Rodriguez and this is my brother', want: ['Emily'], notWant: ['My', 'Rodriguez', 'Brother'] }
];

const has = (hay, needle) => new RegExp(`(^|[^\\p{L}\\d])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\p{L}\\d])`, 'iu').test(hay);

let failures = 0;
console.log('PHI scrubber — adversarial suite\n');

for (const c of cases) {
  const out = scrub(c.in);
  const leaked = c.no.filter(f => has(out, f));
  const lost = c.yes.filter(k => !has(out, k));
  const ok = !leaked.length && !lost.length;
  if (!ok) failures++;
  if (!ok || VERBOSE) {
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${c.n}`);
    console.log(`      in : ${c.in}`);
    console.log(`      out: ${out}`);
    if (leaked.length) console.log(`      LEAKED: ${leaked.join(', ')}`);
    if (lost.length) console.log(`      LOST (over-scrubbed): ${lost.join(', ')}`);
  }
}

for (const c of nameCases) {
  const got = extractNames(c.in);
  const missing = c.want.filter(w => !got.includes(w));
  const extra = c.notWant.filter(w => got.some(g => g.toLowerCase() === w.toLowerCase()));
  const ok = !missing.length && !extra.length;
  if (!ok) failures++;
  if (!ok || VERBOSE) {
    console.log(`${ok ? 'ok  ' : 'FAIL'}  extractNames: ${c.n} -> [${got.join(', ')}]`);
    if (missing.length) console.log(`      MISSING: ${missing.join(', ')}`);
    if (extra.length) console.log(`      EXTRA: ${extra.join(', ')}`);
  }
}

// The final guard must reject anything still carrying an identifier.
const guardCases = [
  { in: '- Guests: Emily. Asked about the castle and left.', clean: true },
  { in: '- Guests: Emily. Reached at 3195550142.', clean: false },
  { in: '- Guests: Emily. Contact emily@example.com.', clean: false },
  { in: '- The rock war of 1462 came up twice.', clean: true }
];
for (const g of guardCases) {
  const ok = isClean(g.in) === g.clean;
  if (!ok) { failures++; console.log(`FAIL  isClean("${g.in}") expected ${g.clean}`); }
  else if (VERBOSE) console.log(`ok    isClean -> ${g.clean}: ${g.in}`);
}

const total = cases.length + nameCases.length + guardCases.length;
console.log(`\n${total - failures}/${total} checks passed`);
if (failures) { console.log('PHI SCRUBBER LEAKS — do not run the harvest.'); process.exit(1); }
console.log('First names only. No surnames, addresses, numbers, contacts, ages or schools survived.');
