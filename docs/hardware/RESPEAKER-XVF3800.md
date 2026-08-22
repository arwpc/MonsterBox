# ReSpeaker XVF3800 USB 4-Mic Array — install and operate

Seeed ReSpeaker XVF3800 (USB `2886:001a`), first fitted to **Orlok** on
2026-08-18. An XMOS XVF3800 DSP does beamforming, de-reverberation, acoustic
echo cancellation and direction-of-arrival **on the device**, so the Pi receives
one already-cleaned mono stream instead of four raw capsules. 360° pickup, rated
to 5 m. It is a **combined speaker and microphone** — one USB device, both
directions — which is what makes its echo cancellation work: the DSP knows what
the character is saying and subtracts it from what the microphone hears.

It replaces the USB dongle + lavalier pairing. **The old parts remain fully
supported** — `mic_generic_usb` and `default_speaker` are untouched, and every
character still on them keeps working exactly as before.

## What it looks like to the Pi

```
lsusb        → 2886:001a Seeed Technology reSpeaker XVF3800 4-Mic Array
aplay -l     → card N: Array [reSpeaker XVF3800 4-Mic Array]   (playback)
arecord -l   → card N: Array [reSpeaker XVF3800 4-Mic Array]   (capture)
lsusb -t     → 3 × Class=Audio + 1 × Vendor Specific (control iface, no driver)
```

PipeWire names it (the long serial differs per unit — read it, never copy):

```
alsa_output.usb-Seeed_Studio_reSpeaker_XVF3800_4-Mic_Array_<SERIAL>-00.analog-stereo
alsa_input.usb-Seeed_Studio_reSpeaker_XVF3800_4-Mic_Array_<SERIAL>-00.analog-stereo
```

Native rate is **16 kHz s16le** — voice-optimised, not hi-fi. Correct profile is
`output:analog-stereo+input:analog-stereo`.

## Install procedure (per node)

Everything below is **node-local**. Nothing here is fleet-wide, and nothing
touches another animatronic's audio.

1. **Plug in and confirm enumeration** — `lsusb | grep 2886:001a`.
2. **Read the real device names** on that node:
   `pactl list short sinks` and `pactl list short sources | grep -i seeed`.
   The serial is per-unit; never paste another node's name.
3. **Make it the default sink.** It arrives at low volume and is *not* default,
   while the mic side usually *is*:
   ```bash
   export XDG_RUNTIME_DIR=/run/user/1000
   wpctl set-default <sink-id>
   wpctl set-volume @DEFAULT_AUDIO_SINK@ <node sinkVolume from config/animatronics.json>
   ```
   Canonical volume is applied at every service start against
   `@DEFAULT_AUDIO_SINK@` (`server.js`), so once the default is right the level
   heals itself on every boot.
4. **Point the character's parts at it** in `data/character-<N>/parts.json`:
   - speaker part → `config.audioDeviceId` = the sink name, `modelId` =
     `speaker_respeaker_xvf3800`
   - microphone part → `config.deviceId` = the source name, `modelId` =
     `mic_respeaker_xvf3800`
   The STT listener reads its capture device straight from the microphone part's
   `deviceId`, so this is also what puts conversations on the array.
5. **Check for a stale default.** If the node previously used a dongle, its
   removed device may still be recorded as the configured default (visible at
   the foot of `wpctl status`). A dangling preference is harmless but confusing.
6. **Prove it**, don't assume: play through the character and confirm the API
   reports the ReSpeaker as `device`, not the old dongle.

## Traps found the hard way

- **`arecord -D plughw:N,0` returns "Device or resource busy."** PipeWire holds
  the card exclusively. Capture through PipeWire, not raw ALSA.
- **`parec` and `pw-record` both returned zero frames** on a device that was
  unmuted, default, and on the right profile — while MonsterBox's own STT
  listener captured happily from the same source. Trust the app's capture path
  (`services/serverSTTListener.js`, which falls back python → ffmpeg → arecord →
  parec) over a hand-rolled `parec` when judging whether the mic works.
  ⚠️ **Half of this is now known to be wrong** — the listener was *also* being
  starved and was silently falling back. See **Capture traps** below.
- **`timeout N parec … --file-format=wav` writes a 44-byte header and no
  samples** — it is killed before it flushes. Capture raw PCM, or let the app do
  it.
- **Backgrounding a capture over SSH with `nohup … &` dies when the session
  exits.** Run it synchronously, or the file will be empty.

## Capture traps — the zero-frames failure

Found on Orlok 2026-08-18 while chasing "the far-field mic hears nothing." The
array is **not** deaf. The streaming recorders open it and then deliver nothing.

**Trap zero, found on Sir Dragomir 2026-08-22: a leftover `/etc/asound.conf` (or
`~/.asoundrc`) pinning `pcm.!default` at raw hardware (`type plug` /
`slave.pcm "hw:N,0"`).** Such a file — typically written for a speaker that no
longer exists — bypasses PipeWire entirely: the node's default source,
`PULSE_SOURCE`, and `wpctl set-default` are all ignored, and a capture opened
through raw `hw:` on this array delivers zero frames, so `stream.read()` blocks
**forever with no error** (it hung the operator's terminal; it hangs the app's
child_process identically — `record_wav` now carries a hard watchdog that kills
itself after duration+15 s and names this trap on stderr). Check for the file
FIRST on any node with hanging or silent capture; move it aside — the
`pipewire-alsa` bridge provides `default` for both directions. `install.sh` now
backs such a file up automatically at provisioning.

**What the symptom looks like.** Conversation and STT are silent — no
transcripts, no error on the page — while the array's own LED ring visibly
points at whoever is speaking across the room, so the hardware is plainly
working. The evidence is in the log, and it is in the *other* log: on the nodes
`console.warn` and `console.error` go **only** to `/var/log/monsterbox.err`,
while `console.log` goes to `/var/log/monsterbox.log`. Grep the `.log` file
alone and you see a healthy-looking capture session start and keep running. The
`.err` file is where the recorder that produced no frames is named and where the
fallback to the legacy path is announced. **Grepping only `.log` hides the
reason.**

**What actually happens.** `parec`, `ffmpeg` and `arecord` each *open* the
XVF3800 USB source without error and then deliver **zero frames** for the life
of the process — a stream that is valid and empty. `startContinuousCapture()`
scores a candidate that produced nothing as failed and falls back to the legacy
per-chunk path, which grabs ~0.3 s fragments one at a time. Those fragments are
too short to be speech, and the Scribe STT model returns an **empty transcript**
for them rather than an error. Every layer therefore reports success and the
character hears nothing. Two faults compound: a fallback nobody was told about,
and a model that answers `""` instead of failing.

**Why PyAudio works and the other three do not.** Not root-caused below the
device — and the honest version is worth keeping. What is *measured* is that
PortAudio/PyAudio reads frames from the same source, on the same node, in the
same minute that `parec`, `ffmpeg` and `arecord` read none. So PyAudio is the
only capture layer that reliably streams from this array, and the rule is
empirical rather than theoretical. It is also the reverse of the usual advice,
where a one-line `parec` is the trustworthy probe and the application is the
suspect part.

**The practical rule for the six arrays still to fit.** When you install the
next one:

1. **Never conclude "the mic works" because a recorder opened the device.**
   Opening succeeds on a device that will never hand you a sample. Judge on
   **frames**: a non-zero byte count *and* a non-zero RMS.
2. **Probe with PyAudio, not with `parec` / `ffmpeg` / `arecord`.** Use the
   capture path the app itself uses (`python_wrappers/microphone_cli.py`) so the
   probe and production agree; a hand-rolled recorder on this array proves
   nothing either way.
3. **Read `/var/log/monsterbox.err`** — not just `/var/log/monsterbox.log` —
   whenever capture looks fine but nothing is transcribed. Why a candidate was
   dropped is only ever in `.err`.
4. **Treat an empty transcript as a capture symptom until proven otherwise.** On
   this array, "the model returned nothing" has meant "the model was handed a
   third of a second of nothing" far more often than it has meant a bad model,
   a bad key, or a bad gate.
5. **A fixed voice gate does not mean capture works.** Orlok needed both: the
   old `vadThreshold` of 0.38 sat *above* real speech (garage silence measured
   RMS 0.033–0.038, Mina's voice across the garage ~0.17, now gated at 0.045),
   and *underneath* that the capture layer was delivering nothing at all. Fixing
   the gate alone changed no transcript. Prove the two separately.

**Status.** The capture fix — a PyAudio `stream_raw` subcommand made the first
candidate in `startContinuousCapture()` — is being proven end to end on Orlok as
this is written. Until a cross-node transcript exists, treat continuous capture
on an XVF3800 node as **unproven**, and read any silence through the five rules
above rather than through the hardware.

## Why it matters per feature

- **STT / conversation** — the reason it was bought. Beamforming plus
  de-reverberation is what makes far-field speech transcribable in a garage or a
  yard; AEC is what lets a character listen *while* it is talking.
- **Parrot mode** — same input path, same benefit.
- **Jaw animation — unchanged.** Worth knowing: the jaw is driven by
  `driveJawFromAudioBuffer()` from the **outgoing TTS PCM**, not from the
  microphone, so no microphone upgrade can improve jaw sync. What the array can
  change for the jaw is playback: it runs at 16 kHz, so TTS is resampled to it.
- **Direction-of-arrival** is computed on-device and is currently unused by
  MonsterBox. It is the obvious future input for head tracking — turn toward the
  speaker without a camera.

## Fleet safety

Adding this device to one node cannot disturb another. The model catalog entries
are additive; part wiring is per-character; PipeWire defaults and volumes are
per-node. Characters still on `mic_generic_usb` / `default_speaker` are
unaffected — verified on Mina and Sir Dragomir immediately after Orlok's swap.
