# Nosferatu: a tribute in three acts

A seven-minute fleet show in tribute to Nosferatu (2024). The dialogue is original, written in
the spirit of the film and Stoker's novel; no lines, footage or score are taken from the film.
Voices, music, sound effects and pictures were generated with ElevenLabs (each character speaks
in its own voice from `data/character-<id>/ai-config/tts-config.json`). PG: no gore.

| Who | Role |
|---|---|
| Sir Dragomir (4) | herald: announces each act, closes the show; scans the yard, opens his magic box on each "Act the ..." |
| Renfield (6) | the clerk and the frantic narrator; scribbles every word, shakes on his manic lines |
| Orlok (3) | the Count: the dinner, the contract, the monologue, the Turks, Mina; right arm, head, Hand of Azura |
| Mina (2) | keeps the Count until dawn; her door draws shut and reopens as she rises, the rose lights in Act III |
| PumpkinHead (1) | the evil weed that keeps growing (Act II) |
| Groundbreaker (5) | the conductor: the score, wolves, storm, bells, the cock crowing; casts the Goblin reels |
| Goblins 1-3 | picture reels cued to the lines; Goblin 3 is the 9:16 strip and pans across each picture |

The yard props are written in: the skeleton pumping poisoned green water (Act II), Mina's friend
who tore at the Count's empty grave (Act II), the two Turks in the stone circle (Act III, shown
as empty armour on poles).

Generated assets are NOT in git. They live on the console node (Alpha) in
`~/monsterbox-console/shows/nosferatu/` (`script.json`, `voices/`, `music/`, `sfx/`, `images/`,
`audio/`, `video/`, `scenes/`, `timeline.json`).

## Pipeline (run with the scratchpad venv: numpy, pillow)

| Step | Script | Output |
|---|---|---|
| voices (ElevenLabs, once per line) | `render_lines.py REPO SHOW KEYFILE` | `voices/<line>.mp3`, `durations.json` |
| timeline, part tracks, score | `build_show.py SHOW` | `timeline.json`, `audio/*.mp3`, `work/preview-mix.mp3` |
| Goblin reels | `render_video.py SHOW g1\|g2\|g3 OUT.mp4` (`--stills t1,t2,...` for a contact sheet) | three 1280x720 reels, 3 s black pre-roll |
| scenes | `gen_scenes.py SHOW [CID=lagMs ...]` | `scenes/part-<cid>.json`, `scenes/conductor-5.json` |
| deploy (fleet on) | `deploy_show.py SHOW [--dry-run]` | audio, scenes and Goblin video on every node |

How it stays together: every animatronic plays ONE track as long as the show with its lines at
their timeline positions, all started by the conductor at once; moves are `wait { untilMs }`
on the scene clock. Each act's music is time-stretched so its swell lands on a chosen line
(`MUSIC` in `build_show.py`): the build peaks into Orlok's monologue, the storm ends as the ship
runs aground, the romantic swell breaks on "The sun is coming!".

All speech is pre-recorded, so the show spends no live TTS (ElevenLabs cost policy).

## Rehearsal knobs

- A node's voice late: `gen_scenes.py SHOW CID=ms` moves that node's moves later to match, or
  shift its track with a lead in `build_show.py`.
- Reels early or late against the score: `PREROLL_WAIT` in `gen_scenes.py` (default 1500 ms).
- Music too loud under the lines: the duck depth (`0.65`) and the score gain (`gain_db`) in
  `build_show.py`; node speaker volume first.
