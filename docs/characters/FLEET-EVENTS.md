# Warner Castle fleet events — the three shows (scripts for scenes 8, 9, 10 of every character)

Written 2026-10-09 (castle-tuning mission, phase 3a). Three orchestrated events, each a conductor scene hosted on
Orlok (ids 101, 102, 103) that calls every character's event part with `fleet-scene`, casts video to the Goblins,
and runs one shared music bed on every node. One of them runs every half hour in show hours
(`scripts/fleet-events/run-next.mjs`, cron `*/30 17-22 * * *`), and every event ends by returning the whole yard
to lurking: music off, hold released, Goblins back on their reels.

**Who implements what.** The scene author of character N implements that character's part of each event as
that character's scene **8** (ceremony), **9** (the Count's orders) and **10** (the song), *exactly* as written
here: the lines verbatim, the movement as described, the pacing (`wait`) so the part lasts about as long as the
budget says. The conductor only knows "call scene 8 on that node and wait", so a part that is much longer or
shorter than its budget stretches or crushes the show. Every part starts with a 100 ms `wait` and ends in the
character's `Home` pose. Lines are ≤ 25 words and use the bible's voice (`docs/characters/STORY-BIBLE.md`).

**Shared facts.** The castle story: Count Orlok is lord of Warner Castle; Lady Mina rests in the depths (the
coffin); Sir Dragomir is the knight on the hill who guards her and mistakes cars for carriages; Pumpkinhead is
the wicked plant in the patch, furious that Renfield sells his baby pumpkins; Groundbreaker is the big, dumb,
kind-of-dangerous friend breaking out of the ground, protector of guests, especially Calvin, Ben, Bennett,
Holden and Harrison; Renfield is the mad solicitor at the road, signing up clients for the master in 1800s
legal language, pen never still. Orlok mixes Romanian words in (da, nu, bun venit, noapte bună, copii, prieteni,
doamna mea, tăcere, ascultați, foc, lună, suflet). Mina has no Romanian accent and sings the Romanian lullaby.
Pumpkinhead speaks of himself in the third person with "snap", "stalks", "cracks". Groundbreaker barks.

**What the rigs can do (write movement to this, nothing else).**

| Character | Movement available to a scene | Notes |
|---|---|---|
| Orlok (3) | head swivel (servo 15), jaw (servo 10, follows speech), right arm actuator (part 1), Hand of Azura lamp (light 8: `duration` > 0 = on that long then off, `0` = latch on, `state:'off'` to clear) | parts 2–5 are broken and must not appear |
| Mina (2) | jaw (servo 1, PCA ch 15, follows speech), neck (servo 2, ch 7), eye (servo 3, ch 11), coffin door actuator (part 4, Cytron MDD10A DIR GPIO17 / PWM GPIO18), Burning Rose lamp (light 5, GPIO16), eye laser (light 10, PCA ch 3, on/off) | wiring traced and every part proven on her node 2026-10-10 (the 10-09 "lamp only" finding is history: her faults were lifted) |
| Sir Dragomir (4) | head (servo 1, **only 372–406°**, no presets), jaw (servo 2, follows speech), magic box (servo 3) | |
| PumpkinHead (1) | body-shake wiper motor (part 1, **speed ≤ 40**), eye rings react to speech by themselves | no jaw; config-locked, pushed by the lead |
| Groundbreaker (5) | voice only (his motor is physically dead), eye-catching casts on the Goblins instead | |
| Renfield (6) | pen servo (part 7, GPIO servo, blocks for its `duration`), shake motor (part 1), eye rings react to speech | pen moves fast and often in every piece |

**Goblins** (play-once casts; each returns to its reel when the clip ends): Goblin 1 = the clear, noticeable
screen; Goblin 2 = the big picture window (bold silhouettes); Goblin 3 = the small vertical roof window. Clip
names are the files on the Goblins' own disks (`backups/goblins-gold-2026-09-25/.../videos.manifest.tsv`); the
conductor uses `goblin-video {goblinName, videoId, waitMs}`. Goblins 1 and 4 are off the network tonight; a cast
to an absent Goblin is skipped with a warning.

**Music.** Each event has its own instrumental bed, generated for the show and stored in the audio library (the
library deploys to every node, so the id is the same everywhere): `fleet-event-castle-vigil` (ceremony),
`fleet-event-counts-march` (orders), `fleet-event-castle-waltz` (song). Fallbacks already in every library if a
bed is missing: `12 - Ghostly Music` (192 s), `08 - Midnight In The Cemetery` (277 s),
`haunting-music-box-melody` (80 s, loop). Beds play at **35 %** under speech via `fleet-audio all` and must
never drive a jaw (`jawSync:false` on the play path).

---

## Event 1 — The Lighting of the Castle (conductor scene 101, ≈ 3 min 40 s)

**Story.** Dusk is gone. The lord of the castle calls his household to name the night. The knight calls the
watch from the hill, the solicitor reads the covenant at the road, the pumpkin counts the souls in his patch,
the giant breaks ground, the lady's voice rises from below, and the Count names the night. All six speak the
castle's name together and the yard is lit.

**Bed.** `fleet-event-castle-vigil` — slow gothic organ and low choir drone, a swell near 2:30. Starts at 0:00 on
every node, stops at the end.

### Timeline (conductor steps; "→" = `fleet-scene` on that node, waited unless stated)

| t | Node / Goblin | What happens |
|---|---|---|
| 0:00 | all | `fleet-mode hold all`; `fleet-audio all` castle-vigil 35 % (concurrent) |
| 0:03 | Goblin 2 | cast `Moon.mp4` (30.8 s) — the moon rises in the big window |
| 0:04 | Orlok (host) | Hand of Azura on for 2 s; head turns slowly toward the hill (servo 15, 2.5 s); line **O1** |
| 0:15 | → Sir Dragomir 8 | calls the watch (≈ 28 s) |
| 0:43 | Goblin 1 | cast `Pha Wraith Riseofthewraiths Win H.mp4` (53 s) |
| 0:44 | → Renfield 8 | reads the covenant (≈ 30 s) |
| 1:14 | Goblin 3 | cast `Firepumpkin.mp4` (30 s) — fire in the roof window |
| 1:15 | → PumpkinHead 8 | counts the souls in the patch (≈ 28 s) |
| 1:43 | Goblin 2 | cast `Skellycrawler.mp4` (20 s) |
| 1:44 | → Groundbreaker 8 | breaks ground (≈ 26 s) |
| 2:10 | Goblin 1 | cast `Floatinglady.mp4` (12 s) |
| 2:11 | → Mina 8 | her voice rises from below (≈ 30 s; skipped while she is off) |
| 2:41 | Goblin 2 | cast `Greenskull.mp4` (31 s) |
| 2:42 | → Orlok 8 | names the night (≈ 28 s) |
| 3:10 | Goblin 3 | cast `Skullfire.mp4` (6 s) |
| 3:11 | all | `fleet-say all` (concurrent, one text for every node): **CHANT** |
| 3:18 | Orlok (host) | line **O2**; Hand of Azura off; head home |
| 3:30 | all | `fleet-stop-audio all`; `fleet-mode release all` |

**Host lines (spoken by the conductor itself on Orlok).**
- **O1** `[deep voice] Tăcere. The sun is dead, and the castle is awake. Sir Dragomir... call the watch.`
- **CHANT** (every node, same text) `[shouts] Warner Castle! The night is ours!`
- **O2** `[chuckles] Da. The night is named. Now go, copii. Meet them all. The road is Renfield's. Mind the pumpkins.`

### Parts (each character's scene 8)

**Sir Dragomir 8 — "The Watch Is Called"** (≈ 28 s). Head sweeps left to right inside the window (372° → 406°,
2 s), magic box opens, jaw follows speech. Lines: (1) `Hear me, hill and road! The watch of Warner Castle is
called. Who stands for the night?` Head centres at 389°. (2) `I stand. Old steel for the lady below. You in
the carriages... keep rolling. Nothing to see but me.` Magic box closes. Home.

**Renfield 8 — "The Covenant"** (≈ 30 s). Pen scribbles fast (three 400 ms strokes between 40° and 140°)
before the first word and keeps going under every line; shake motor pulses 0.6 s at 60 % the first time
"Orlok" is spoken. Lines: (1) `Whereas! The night is hereby convened. Witnesseth: the party of the first part,
Count Orlok, holds this ground in perpetuity.` (2) `Let it be written. Let it be... [frantic] written! Sign
here, sidewalk. Sign here!` Pen three more strokes. Home.

**PumpkinHead 8 — "Counting the Patch"** (≈ 28 s). One motor pulse (0.5 s, speed 35) on each count. Lines:
(1) `Pumpkinhead counts his patch. Snap. One soul. Crack. Two. The stalks are counting too.` (pulse, pulse)
(2) `[laughs] Three more than yesterday. Two fewer than Pumpkinhead planted. Renfield... the stalks know who
took them.` (pulse) Home.

**Groundbreaker 8 — "Breaking Ground"** (≈ 26 s). Voice only; pace with waits. Lines: (1) `[grunts] Ground's
loose tonight! Groundbreaker's coming UP! Hey Pumpkinhead! Hey knight! Hey Count! Groundbreaker's HERE!`
(2) `Anybody named Calvin out there? Or Ben? Bennett? Holden? Harrison? Groundbreaker's got you. Big friend.
Mostly safe.` Home.

**Mina 8 — "The Voice Below"** (≈ 30 s). Coffin door opens slowly (actuator extend, 3 s, speed 40) while the
Burning Rose lamp comes on; neck turns up (servo 2), eye drifts (servo 3); jaw follows speech. Lines: (1)
`[whispers] I hear you all. Even down here, I hear everything.` (2) `[sings] Nani, nani, puiul meu... doarme-n
leagăn, ușurel...` (3) `[whispers] Keep the dark company, my knight. I am listening.` Laser blinks twice; coffin
closes (retract 3 s); rose off. Home.

**Orlok 8 — "Naming the Night"** (≈ 28 s). Hand of Azura latched on; head to centre; right arm extends (3 s,
speed 50) on the first line. Lines: (1) `Bun venit, copii. Bun venit, prieteni. Everything you hear tonight
belongs to this house... and to me.` (2) `[deep voice] This night is named: Noaptea Castelului Warner. The
Night of Warner Castle. Say it with me.` Arm retracts (3 s). Home (lamp stays on; the conductor turns it off).

---

## Event 2 — The Count's Orders (conductor scene 102, ≈ 4 min 15 s)

**Story.** Orlok musters his household and gives five orders. The knight refuses the one about Pumpkinhead.
Renfield writes every word down. Pumpkinhead complains that Renfield is selling his babies. Groundbreaker
misunderstands "quietly" and does something enormous. Mina answers softly from below and, with one song, puts
the whole house back in order. Orlok is delighted with all of it.

**Bed.** `fleet-event-counts-march` — slow martial gothic march, harpsichord, timpani, low strings. 0:00 to end.

### Timeline

| t | Node / Goblin | What happens |
|---|---|---|
| 0:00 | all | `fleet-mode hold all`; `fleet-audio all` counts-march 35 % (concurrent) |
| 0:03 | → Orlok 9 | the muster (≈ 20 s): lamp, head sweep, **M1**, **M2** |
| 0:24 | Orlok (host) | **ORDER 1** (to Dragomir); head toward the hill; lamp 1 s |
| 0:32 | Goblin 2 | cast `Pha Wraith Unholyhovering Win H.mp4` (45 s) |
| 0:33 | → Sir Dragomir 9 | refuses (≈ 26 s) |
| 1:00 | Orlok (host) | **ORDER 2** (to Renfield); head toward the road |
| 1:08 | Goblin 1 | cast `Pha Spinster Mixtureofmadness Win H.mp4` (80 s) |
| 1:09 | → Renfield 9 | writes everything down (≈ 32 s) |
| 1:42 | Orlok (host) | **ORDER 3** (to Pumpkinhead); lamp 1 s |
| 1:50 | Goblin 2 + Goblin 3 | cast `Firepumpkin.mp4` (30 s) on both |
| 1:51 | → PumpkinHead 9 | complains (≈ 28 s) |
| 2:20 | Orlok (host) | **ORDER 4** (to Groundbreaker) |
| 2:28 | Goblin 2 | cast `Bigskull.mp4` (30 s); Goblin 1 cast `Batattack.mp4` (10 s) |
| 2:29 | → Groundbreaker 9 | misunderstands, does something big (≈ 30 s) |
| 3:00 | Orlok (host) | **ORDER 5** (to Mina); lamp latched on; head centre |
| 3:08 | Goblin 1 | cast `Floatinglady.mp4` (12 s); Goblin 3 cast `Moon.mp4` (31 s) |
| 3:09 | → Mina 9 | sings the house to order (≈ 34 s; skipped while off) |
| 3:44 | Orlok (host) | **CLOSE 1**, **CLOSE 2**; lamp pulses three times (on 0.4 s, wait 0.4 s ×3); arm extends and retracts; head home |
| 4:10 | all | `fleet-stop-audio all`; `fleet-mode release all` |

**Host lines (the conductor speaks these on Orlok between the parts).**
- **ORDER 1** `[deep voice] Dragomir. Ride down and put Pumpkinhead in his place. He mocks my gardens and he mocks me.`
- **ORDER 2** `Renfield. Record that the knight refused me. Then draft a contract: Pumpkinhead's patch, mine, in perpetuity.`
- **ORDER 3** `Pumpkinhead. Your patch is mine by contract. Deliver forty pumpkins to the road by midnight. Nu... make it fifty.`
- **ORDER 4** `Groundbreaker. Rise, and guard the road. Quietly. [pause] I said quietly.`
- **ORDER 5** `Mina. Doamna mea. The house is loud and stupid tonight. Sing it to order, as only you can.`
- **CLOSE 1** `[chuckles] The knight sulks. The solicitor scribbles. The pumpkin plots. The giant shouts. The lady sings.`
- **CLOSE 2** `My household. Perfect. Go, prieteni... tell the road what you saw. Noapte bună.`

### Parts (each character's scene 9)

**Orlok 9 — "The Muster"** (≈ 20 s). Lamp latched on, head sweeps far left, far right, centre (3 × 1.2 s),
arm extends 2 s. Lines: **M1** `[deep voice] Ascultați! Listen, all of you. The Count has orders, and the Count
has... patience. Very little.` **M2** `Answer when you are named. Not before. Not after. Da?` Arm retracts.
Home (lamp stays on).

**Sir Dragomir 9 — "A Knight Does Not Duel a Vegetable"** (≈ 26 s). Head turns away from the castle (372°,
1.5 s) on "Nu"; magic box opens and snaps shut on "dirt". Lines: (1) `Nu, my lord. A knight does not duel a
vegetable. I guard the lady. Send Renfield; he enjoys dirt.` (2) `And tell the carriages to stop staring at
me. [sighs] Sir Dragomir stands. Sir Dragomir stays.` Head back to 389°. Home.

**Renfield 9 — "Everything Is Recorded"** (≈ 32 s). Pen never stops: 300 ms strokes under every word; shake
motor 0.8 s at 70 % on "signed". Lines: (1) `Recorded! "The knight refused." Underlined twice. Heretofore and
notwithstanding, the party of the second part is... a pumpkin.` (2) `[frantic] A contract for the patch,
witnesseth, in perpetuity... signed, sealed... delivered! Master, it is DONE. Who else wants one?` Home.

**PumpkinHead 9 — "Not For Sale"** (≈ 28 s). Motor bursts (0.8 s, speed 40) on "Snap" and on "remember".
Lines: (1) `Pumpkinhead's babies are not for sale! Snap. Renfield already sold six. Six! The stalks are
counting, Count.` (2) `Fifty? Pumpkinhead will deliver fifty... cracks. Through your windows. The stalks
remember, Count. The stalks always remember.` Home.

**Groundbreaker 9 — "QUIETLY"** (≈ 30 s). Voice only. Lines: (1) `GUARD THE ROAD! LOUDLY! Got it, boss!
[shouting] EVERYBODY OFF THE ROAD! Groundbreaker's guarding it!` (2) `[pause] ...Was that quiet? Groundbreaker
did quiet. Hey Calvin, hey Harrison, you're safe now. Groundbreaker fixed it.` Home.

**Mina 9 — "Sing the House to Order"** (≈ 34 s). Coffin door opens a hand's width (extend 1.5 s, speed 30);
rose lamp on; neck up; eye to the castle; jaw follows the song. Lines: (1) `[whispers] As you wish, my lord.
[sings] Nani, nani, puiul meu... doarme-n leagăn, ușurel... vântul cântă pe la geam...` (2) `[whispers] There.
Now they are quiet. Even the giant. Even you.` Laser on 2 s; coffin closes (retract 1.5 s); rose off. Home.

---

## Event 3 — One Song for Warner Castle (conductor scene 103, ≈ 3 min 50 s)

**Story.** Orlok decides the household will sing one song together. Each resident takes a verse in their own
voice; the chorus is sung by everyone at once; Mina teaches them her lullaby as the bridge, and they try it,
badly; the last chorus is loud. Orlok declares it dreadful and perfect.

**The song — "One Night, One Castle"** (original; simple 3/4 waltz feel, four short lines a verse). The bed
`fleet-event-castle-waltz` is a steady minor-key music-box waltz (≈ 90 bpm, pizzicato strings, soft drum);
singers do not need to match it, it only has to keep moving under them.

**CHORUS** (everyone at once, `fleet-say all`, sent as two concurrent chunks 9 s apart):
- **CH-A** `[sings] One night, one moon, one castle wall, one song to wake the dead, that's all!`
- **CH-B** `[sings] Oooh, Warner Castle, sing it slow... the living come, and the living go.`

**VERSES** (each ≤ 25 words, each a `sayThis` with `[sings]`):
- **V-Orlok** `[sings] Five hundred winters in these bones, I keep a house of cold grey stones. The moon is mine, the dark is mine... bun venit. Dine.`
- **V-Dragomir** `[sings] I am the knight upon the hill, the carriages go rolling still; I guard the lady in the deep, and never, ever sleep.`
- **V-Renfield** `[sings] Whereas, heretofore, and party of the first, I'll write your name, I'll write it worst! A contract for the Count tonight. Sign here! All right!`
- **V-Pumpkinhead** `[sings] Snap go the stalks and crack goes the vine, Pumpkinhead's babies are his, not thine! Renfield sold six... the stalks keep score.`
- **V-Groundbreaker** `[sings] Groundbreaker's coming up through the dirt, big dumb hug and nobody hurt! Calvin, Ben, Bennett, Holden, Harrison... Groundbreaker's got you, every one!`
- **BRIDGE-Mina** `[whispers] Now you. Softly, all of you. [sings] Nani, nani, puiul meu... doarme-n leagăn, ușurel...`
- **BRIDGE-all** (`fleet-say all`, every node tries the lullaby) `[sings] Nani... nani... puiul meu... doarme-n leagăn... ușurel...`
- **BRIDGE-Mina-2** `[whispers] Close enough. [giggles] Again, all of us. Loud this time.`

### Timeline

| t | Node / Goblin | What happens |
|---|---|---|
| 0:00 | all | `fleet-mode hold all`; `fleet-audio all` castle-waltz 35 % (concurrent) |
| 0:03 | Goblin 2 | cast `Pha Siren Sirenssway Win H.mp4` (68 s); Goblin 3 cast `Moon.mp4` (31 s) |
| 0:04 | → Orlok 10 | count-in and verse (≈ 24 s): **S1** then **V-Orlok** |
| 0:28 | → Sir Dragomir 10 | verse (≈ 18 s) |
| 0:46 | → Renfield 10 | verse (≈ 18 s) |
| 1:04 | all | **CH-A** (concurrent), wait 9 s, **CH-B** (concurrent), wait 10 s |
| 1:23 | Goblin 1 | cast `Pha Spinster Teafortwo Win H.mp4` (65 s) |
| 1:24 | → PumpkinHead 10 | verse (≈ 18 s) |
| 1:42 | → Groundbreaker 10 | verse (≈ 18 s) |
| 2:00 | Goblin 2 | cast `Pha Siren Seaofsirens Win H.mp4` (58 s) |
| 2:01 | → Mina 10 | bridge (≈ 30 s): coffin opens on her first note; **BRIDGE-Mina**; then the conductor sends **BRIDGE-all**; then **BRIDGE-Mina-2** (if Mina is off, the conductor still sends BRIDGE-all after Orlok's **S2**) |
| 2:35 | Goblin 1 | cast `Pha Poltergeist Elecrticslide Win H.mp4` (54 s); Goblin 3 cast `Skullfire.mp4` (6 s) |
| 2:36 | all | **CH-A** (concurrent), wait 9 s, **CH-B** (concurrent), wait 10 s — the loud chorus |
| 2:56 | Orlok (host) | **S3**; lamp off; head home |
| 3:10 | all | `fleet-stop-audio all`; `fleet-mode release all` |

**Host lines.**
- **S1** (inside Orlok 10) `[deep voice] One song. One castle. Everyone. Even you, Groundbreaker. Mina counts us in... one, two, three.`
- **S2** (host, only if Mina's node is absent) `[deep voice] The lady is resting. I will teach you her song myself. Softly. [sings] Nani, nani, puiul meu...`
- **S3** `[chuckles] Groaznic. Dreadful. Perfect. That is my household. Noapte bună, Warner Castle. Go home... slowly.`

### Parts (each character's scene 10) — movement keeps time with the verse

**Orlok 10 — "Count-In and Verse"** (≈ 24 s). **S1**, then **V-Orlok**; head sways left-right-left on the beat
(servo 15, four 1.2 s moves) under the verse; lamp blinks on each line end (0.3 s); arm extends 2 s on "Dine".
Home (lamp stays on).

**Sir Dragomir 10 — "The Knight's Verse"** (≈ 18 s). Head sways gently 380° ↔ 398° (four 1.2 s moves) while
singing; magic box opens on "deep", closes on "sleep". **V-Dragomir**. Home.

**Renfield 10 — "The Solicitor's Verse"** (≈ 18 s). Pen taps time: a 250 ms stroke every 650 ms for the whole
verse; shake motor 0.5 s at 60 % on "Count". **V-Renfield**. Home.

**PumpkinHead 10 — "The Patch's Verse"** (≈ 18 s). Motor pulse 0.4 s at speed 35 on "Snap", on "crack" and
on "six". **V-Pumpkinhead**. Home.

**Groundbreaker 10 — "The Giant's Verse"** (≈ 18 s). Voice only, big and off-key. **V-Groundbreaker**. Home.

**Mina 10 — "The Bridge"** (≈ 30 s). Coffin door opens (extend 3 s, speed 40) with the rose lamp on; neck sways
slowly (servo 2, two 3 s moves); eye to the yard; jaw follows the song. **BRIDGE-Mina**; `wait` 9 s (the
conductor sends the others' attempt here); **BRIDGE-Mina-2**; laser on 2 s; coffin closes (retract 3 s); rose
off. Home.

---

## Conductor skeleton (every event) and the return to lurking

```
fleet-mode  {mode:'hold', node:'all'}
fleet-audio {node:'all', audioId:'<bed id>', volume:35, jawSync:false, concurrent:true}
... beats: goblin-video {goblinName, videoId, waitMs:0}, fleet-scene {node, scene, wait:true},
           sayThis (host lines on Orlok), light/servo/linear-actuator (Orlok's own beats),
           fleet-say {node:'all', text, concurrent:true} + wait ...
fleet-stop-audio {node:'all'}
fleet-mode  {mode:'release', node:'all'}
```

- `fleet-scene` to a node that is offline, or busy with a guest conversation, is skipped with a warning and the
  show continues; every host line still makes sense without the skipped part.
- Goblin casts are play-once (`returnToQueue`), so each Goblin resumes its reel by itself; the runner also sends
  `resume` to every online Goblin after the event as belt-and-braces.
- `fleet-mode release` restores idle loops, head tracking and Orlok's background music; the runner releases on
  any failure too (`scripts/fleet-events/run-next.mjs`).
- Pre-warm every line: the per-character `sayThis` lines through `scripts/prerender-scene-tts.mjs <charId>`,
  and the host/`fleet-say` lines through the runner's `--warm` pass, so no event waits on live TTS.
