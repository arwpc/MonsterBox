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
- **`timeout N parec … --file-format=wav` writes a 44-byte header and no
  samples** — it is killed before it flushes. Capture raw PCM, or let the app do
  it.
- **Backgrounding a capture over SSH with `nohup … &` dies when the session
  exits.** Run it synchronously, or the file will be empty.

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
