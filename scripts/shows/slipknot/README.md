# Slipknot: Virus of Life (Groundbreaker's show)

Groundbreaker says he loves Slipknot (they are from Iowa), plays "Virus of Life" loud with
deep bass, and the whole fleet performs to it: every animatronic sings wordless notes in D
minor or whispers in time and moves on the beat, and Goblins 1-3 run beat-cut mask videos.
Then he apologizes and everyone complains, one by one; Orlok ends it: "Never again, Groundbreaker."

The band's audio and artwork are NOT in git. They live on the console node (Alpha) in
`~/monsterbox-console/shows/slipknot/` (audio, video, scenes, voices, work) and
`~/monsterbox-console/goblin-reels/sources/slipknot/` (the operator's images and the
ElevenLabs backdrops).

## How it stays in sync

- **One audio part per animatronic**, each exactly as long as the song, with its vocals placed
  on the song's *tracked* beats (`track_beats.py`: a fixed tempo grid drifted about 2 s by the
  end of this song). All parts start together, so nothing can drift after the first beat.
  Spoken hits are placed by their attack, not their first sample.
- **Movement on the scene clock**: every move is a `wait { untilMs }` (time since the scene
  started) followed by a concurrent step, so hundreds of moves cannot accumulate step overhead.
- **Video**: each Goblin video is rendered frame by frame on the tracked beats, with a 3 s black
  pre-roll. The conductor casts the videos, waits, then starts the song and every part.

## Pipeline (run in a work dir holding the song)

| Step | Script | Output |
|---|---|---|
| tempo, key, section loudness | `analyze.py SONG analysis.json` | 128 BPM grid, D minor |
| beat tracking | `track_beats.py SONG analysis.json beats.json` | then `beats-corrected.json` (-10 ms) |
| voices (ElevenLabs, once) | `render_tts.py REPO KEYFILE` | `raw/` |
| per-node parts + bass-boosted song | `build_parts.py SONG analysis.json out [CID=leadMs ...]` | `out/*.mp3` |
| Goblin videos | `render_video.py g1\|g2\|g3 OUT.mp4` | three 1280x720 reels |
| scenes | `gen_scenes.py scenes [CID=lagMs ...]` | `part-<cid>.json`, `conductor-5.json` |
| deploy (fleet on) | `deploy_show.py SHOW_DIR [--dry-run]` | audio, scenes, Goblin video, prerendered lines |

## Rehearsal knobs

- A node whose voice sounds late: rebuild its part with `build_parts.py ... CID=ms` (moves the
  whole part earlier), and its moves with `gen_scenes.py ... CID=ms`.
- Video early or late against the song: `PREROLL_WAIT` in `gen_scenes.py` (default 1500 ms).
