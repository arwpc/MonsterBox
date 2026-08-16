# Microphone & AEC Refactor Reference

**Recorded:** 2026-08-16
**Status:** Hardware ordered (6 units), refactor not yet started
**Purpose:** Capture the hardware decision, the measured current state, and the
concrete refactor targets, so the STT/audio rework can be done against a written
spec instead of rediscovered.

This document is a *reference for a future refactor*. No code was changed when it
was written.

---

## 1. Decision

Replace the per-node capture chain with a **Seeed reSpeaker XVF3800 USB 4-Mic
Array** (XMOS XVF3800), one per animatronic node.

| | |
|---|---|
| Product | reSpeaker XVF3800 USB 4-Mic Array, with case |
| Amazon ASIN | `B0GVJ5YQ58` (cased) / `B0FKGFXQQ5` (bare) |
| Seeed SKU | 101991441, product page p-6490 (cased) / p-6488 (bare) |
| Price | ~$61–99 |
| Interface | USB-C, **USB Audio Class 2.0, driverless** |
| Power | 5 V USB bus power (pin header alternative exists) |
| Board | 99 mm dia. bare; ~108 × 108 × 18 mm cased |
| In the box | Board + case + USB-A→USB-C cable |
| Weather rating | **None.** Weatherproofing is by installation. |

### Why this device

The deciding finding from the research sweep: **a genuinely IP-rated,
concealable, USB-class-compliant microphone does not exist as a retail product.**
Every credible IP65/66/67 microphone found is analog — mic-level plug-in-power or
line-level 12–24 VDC — and requires a separate interface and often a second power
domain.

More importantly, **every professional microphone evaluated is omnidirectional**,
including two that claim otherwise:

- ETS ML1-BPM — "Uni-Directional" in the product name is false. It is a
  boundary/PZM device; ETS's own sibling part (ML1-APE) is labelled
  omnidirectional and likened to an AKG PZM11.
- AXIS TU1001-VE — datasheet reads verbatim `Directionality: Hemispherical`.

Since no purchasable capsule provides geometric rejection of a co-located
loudspeaker, the self-hearing problem must be solved by **DSP or gating**, not by
the capsule. The XVF3800 was the only buyable device combining: UAC-compliant and
documented on Raspberry Pi, hardware AEC, beamforming with direction-of-arrival,
AGC, noise suppression, and de-reverberation — with the DSP running on the XMOS
chip rather than the Pi's CPU.

---

## 2. Required device topology

```
Pi 4B ──USB-A→USB-C──► XVF3800 ──3.5 mm AUX out──► existing powered 2.1 speakers
                       (capture AND playback on ONE USB device)
```

Three constraints follow, and all three are load-bearing:

1. **Playback must route through the array.** The AEC can only subtract audio it
   knows it is playing. If TTS continues out the existing C-Media dongle while
   capture runs on the array, the echo canceller has no reference signal and does
   nothing at all. This is the single most likely way to install the right
   hardware and get zero benefit.
2. **One USB device means one clock domain.** PipeWire `module-echo-cancel` is
   documented as unreliable when capture and playback sit on separate USB
   devices — clock drift defeats the adaptive filter. Consolidating onto the
   array removes that failure mode. (Note: the current config already happens to
   share one device — playback is pinned to the C-Media dongle and capture
   resolves to it — so this property must be *preserved*, not newly created.)
3. **Retire the C-Media dongle from the playback path.** It also frees a USB port,
   which matters — see §6.

Use the **3.5 mm AUX jack**, not the JST PH 2.0 connector. The JST output is for
driving a bare 5 W driver; the speakers here are already powered. Driving 5 W from
the board while bus-powered would also exceed a comfortable share of the Pi 4B's
~1.2 A total USB budget.

---

## 3. Measured current state (refactor targets)

All references verified against the tree at the time of writing.

### 3.1 Destructive band-pass filter

`services/elevenLabsWebSocketService.js:1511`

```js
const filterChain = 'highpass=f=' + highpass + ',lowpass=f=' + lowpass + ',afftdn=nf=' + denoise;
```

Defaults at `services/elevenLabsWebSocketService.js:1504-1506` and
`services/aiConfigStore.js:56-58` are 180 Hz / 4200 Hz / −22 dB.

One character's `stt-config.json` had been driven to a "Noisy Environment"
preset of **320 Hz / 3600 Hz / −38 dB**. The 3600 Hz lowpass removes the
4–8 kHz sibilant energy that ASR uses to distinguish `/s/`, `/f/`, `/th/`, `/sh/`;
the 320 Hz highpass removes adult male fundamentals (85–180 Hz). These settings
were compensating for a bad capture chain and should be relaxed once the array is
in place — the XVF3800 performs noise suppression and de-reverberation upstream,
in hardware.

**Refactor intent:** with the array installed, the software band-pass should be
widened substantially or bypassed, and the aggressive presets retired. Validate
empirically rather than assuming a specific value.

### 3.2 Two VADs in series

- Local RMS gate: `services/serverSTTListener.js:110-124`, threshold 0.38–0.40
- Server-side VAD: `services/elevenLabsRealtimeSTTService.js:104-108`, sending
  `commit_strategy=vad`, `vad_threshold`, `vad_silence_threshold_secs`

The local RMS gate runs *before* audio reaches ElevenLabs and can discard a quiet
child's speech that the server-side VAD would have accepted. With the array's
60 dB AGC normalising levels upstream, a fixed local RMS threshold becomes both
redundant and actively harmful.

**Refactor intent:** consider removing the local gate entirely and relying on the
server-side VAD, or re-deriving its threshold post-AGC.

### 3.3 No acoustic echo cancellation, no mic gating

A search for `echo-cancel|echo_cancel|aec|AEC|loopback|duplex|isPlaying` across
`services/pipewireService.js`, `services/serverSTTListener.js` and
`services/audioLoopService.js` returns **nothing**. With `scribe_v2_realtime`
streaming continuously, each character currently transcribes its own TTS output.

**Refactor intent:** the array provides hardware AEC, but see §5 — it is not
guaranteed and ships partly disabled. **Half-duplex gating (mute capture while TTS
plays) should be implemented first**, as the reliable fallback, with hardware AEC
layered on once proven.

### 3.4 Per-character device bindings

- `data/character-{id}/parts.json` — `type: "microphone"`, `config.deviceId`
- `data/character-{id}/ai-config/stt-config.json` — `microphonePartId`,
  `microphoneDeviceId`

Current values are a mix of `default`, `pulse`, a C-Media dongle ALSA source, and
one node bound to a USB webcam's built-in mic. Several stale duplicate "Auto Mic"
parts exist on at least one character and should be cleaned up during the
refactor.

Because the mic is resolved per character via `microphonePartId`, **mixing capture
chains across the fleet is supported** — a node that cannot host the array can use
a different chain without special-casing.

---

## 4. ElevenLabs pipeline facts

Verified against current ElevenLabs documentation.

- Live path: `scribe_v2_realtime` over
  `wss://api.elevenlabs.io/v1/speech-to-text/realtime`
  (`services/elevenLabsRealtimeSTTService.js:25,39`)
- Audio format `pcm_16000` (`:26`). Supported: pcm_8000/16000/22050/24000/44100/
  48000, ulaw_8000. **Mono only.** 16 kHz is the documented sweet spot.
- Chunks of 0.1–1.0 s recommended.
- ElevenLabs' guidance asks for *clean input at appropriate gain without
  clipping* — it does **not** ask for pre-filtered audio. This is the documentary
  basis for relaxing §3.1.
- Agents (convai) per-character `agent_id` lives in `config/animatronics.json`.

**Implication:** a wider-bandwidth microphone buys nothing on bandwidth, because
the transport is 16 kHz mono regardless. What matters is **SNR, directivity, and
gain staging** — which is what the array addresses.

---

## 5. Device risks to design around

These are open, unresolved issues in the vendor's own tracker, verified directly.
Treat them as design constraints, not rumours.

| Risk | Detail |
|---|---|
| **Capture dies ~5 s in** | [Issue #26](https://github.com/respeaker/reSpeaker_XVF3800_USB_4MIC_ARRAY/issues/26) — `arecord: pcm_read:2221: read error: Input/output error`, repeating `retire_capture_urb`. Reported on Raspberry Pi 4, kernel `6.12.75+rpt-rpi-v8` aarch64, native USB 2.0 port, **with three other USB devices attached**. Open, no maintainer response. Suspected isochronous bandwidth contention — a USB webcam on the same bus is the prime suspect. |
| **Reboot needs a human** | [Issue #20](https://github.com/respeaker/reSpeaker_XVF3800_USB_4MIC_ARRAY/issues/20) — after a soft reboot the device enumerates but captures only hum, `AEC_SPENERGY_VALUES` all zero. Only a **physical USB replug** recovers it; software unbind/rebind and PulseAudio reconfiguration both fail. Open. Critical for unattended props — plan a power-cycle strategy (switched USB power / `uhubctl`) rather than assuming a reboot restores audio. |
| **AEC ships inert** | Factory firmware has shipped with `AEC_FAR_EXTGAIN = 0.0`, which makes the AEC assume the speaker is playing silence and never adapt. Must be raised explicitly. |
| **AEC reference path undocumented** | The `host_control` README states the far-end reference is *"Far end (reference) data received over I2S"*. **No USB reference path is documented anywhere.** Whether routing playback through the array's USB playback endpoint feeds the AEC reference is **unverified** — it is the central assumption of this design and must be proven on hardware before being relied on. |
| **Residual echo at volume** | One integrator reported capping playback at 35/100 to control residual echo. A haunt needs the opposite. |
| **16 kHz cap** | Every USB firmware variant runs at 16 kHz; only the I2S/Home Assistant build does 48 kHz. Routing all show audio through the array caps music and SFX at 16 kHz too. This is a real cost to weigh per character. |

Relevant tuning parameters: `AEC_FAR_EXTGAIN`, `PP_DTSENSITIVE` (double-talk
sensitivity), `AUDIO_MGR_SYS_DELAY`, `AUDIO_MGR_REF_GAIN`. Host tooling ships a
prebuilt `rpi_64bit` binary (`xvf_host`) plus `xvf_host.py`.

---

## 6. USB bus constraints

USB audio is **isochronous** — it reserves bandwidth rather than retrying. USB
webcams are isochronous and bandwidth-hungry. Two isochronous devices on one
USB 2.0 bus is a well-known cause of "opens cleanly, dies seconds later," which
matches issue #26 exactly.

Guidance:

- Plug the array **directly into the Pi**, not through a hub. Both open issues
  implicate bus contention and hub state.
- Keep the array and the USB webcam on **different port pairs**.
- If a hub is unavoidable, use a **powered** one and re-run the acceptance test
  through it.
- The array is USB 2.0 class (UAC 2.0 = High Speed, 480 Mbps), so it will not
  generate SuperSpeed 2.4 GHz interference even in a USB 3.0 port. Prioritise
  bandwidth separation from the webcam over port colour.
- Retiring the C-Media dongle frees a port and reduces contention.

---

## 7. Acoustic constraints (XMOS design guidelines)

- Microphone **acoustic overload point: 120 dB SPL**. XMOS recommends 6–10 dB
  headroom with loudspeakers at their loudest → keep SPL at the array below
  ~110–114 dB. With 3-inch satellites this is not a binding constraint.
- **The AEC is linear.** It can only subtract a linear transform of the reference.
  Amplifier clipping, dynamic loudness, compression and limiting produce
  distortion that is *not in the reference* and cannot be cancelled. Run speakers
  with headroom and **disable enhancement/loudness/surround DSP** on the 2.1
  system. Fixed EQ is linear and survivable.
- **Mechanical coupling is the other named non-linearity.** A subwoofer mounted
  below transmits energy through the frame; a vibrating board makes the acoustic
  coupling *vary*, which defeats an adaptive filter. Soft-mount the array,
  decoupled from the speaker's structure. Add mass before isolating — a very
  light board on stiff foam resonates in the sub's band and amplifies rather than
  attenuates.
- **The AEC calibrates the speaker→mic path at startup and adapts.** If the array
  is mounted on a servo-driven head while the speaker sits in the body, the path
  length changes as the head moves and the filter must re-converge — degrading
  cancellation exactly during animation. Prefer mounting the array **static
  relative to the speaker**.
- Maximise distance and use the prop's body as an acoustic shadow between speaker
  and mic. Free SNR that stacks with the DSP.

---

## 8. Acceptance test

Run on **one** unit before converting the fleet.

```bash
arecord -l                                                   # find card N
arecord -D plughw:N,0 -c 2 -r 16000 -f S16_LE -d 60 test.wav # 60s, not 5s
```

1. Clean 60-second capture? (Issue #26 fails at ~5 s.)
2. Repeat with the USB webcam unplugged, then re-attached — isolates the
   isochronous bandwidth theory.
3. Soft reboot, then capture again **without touching cables** — issue #20 test.
4. Only then test AEC: raise `AEC_FAR_EXTGAIN`, play a line through the array to
   the speakers, measure cancellation.
5. End-to-end: a child speaking normally at 8 ft, soundtrack at show volume,
   while the character is mid-line. If `scribe_v2` transcribes that, the chain
   works.

---

## 9. Rejected alternatives

Recorded so they are not re-litigated. All were adversarially verified.

| Product | Why rejected |
|---|---|
| AXIS T8351 Mk II ($119, IP65) | Vendor positions it for "rooms with low ambient noise" — hospitals, schools. Omni. |
| AXIS TU1001-VE ($183, IP66/IK10) | Datasheet: `Directionality: Hemispherical`. 409 g white brick. |
| AXIS TU1002-VE | 980 g; needs 2–10 V plug-in power; white. |
| Ellipse SM1-W ($89) | 500 Hz hardware highpass — worse than the software filter being escaped. Non-defeatable limiter. |
| ETS ML1-BPM (IP67) | "Uni-Directional" claim false; boundary/PZM, hemispherical. Quote-only, not purchasable online. |
| Louroe VeriFact series | Omni (including the "D"); cast Bell Box housing; needs phantom power + IF-1 adapter; ~$300+/node. |
| Dahua HAP120-V (IP66/IK10) | Best specs and size, but NDAA §889 / FCC restrictions; thin US availability. |
| Amcrest AM-HAP200 | Vendor states indoor only, no weatherproofing. AGC harmful next to a co-located speaker. |
| Budget Amazon CCTV mics ($10–40) | Published response **300 Hz–5500 Hz** — hard-wires the exact band-pass defect being escaped, in analog, unfixably. No IP rating, temp range, or datasheet. |
| Rode VideoMic GO II / NTG | Genuinely directional, but no IP rating, and an interference tube is a slotted cavity that traps rain and dew. Covering it destroys the directivity. Linux support unverified. |
| Clippy EM272, Countryman B3 | Omni; phantom-power interfaces push the fleet to $850–2,100. |
| Behringer UMC202HD | Documented choppy audio and kernel errors on Linux/Pi. (UCA202 is fine; UMC204HD acceptable.) |
| reSpeaker Lite | Open issue: second mic may not record over USB; no published AOP or sensitivity. |

**Fallback chain** if a node cannot host the array (e.g. a long cable run, or a
form factor the 4-inch disc will not fit): Primo EM272Z1 capsule (14 dB(A)
self-noise) behind a single ePTFE-covered port → Behringer UM2 + Rode VXLR+,
~$150/node. No hardware AEC, so half-duplex gating becomes mandatory there.

---

## 10. Open questions

1. Does routing playback through the array's USB playback endpoint actually feed
   the AEC reference? **Unverified and central to the design.**
2. Does issue #26 reproduce on this fleet's exact hardware and USB layout?
3. What band-pass settings are correct *after* the array's upstream noise
   suppression? Needs empirical tuning, not a guessed value.
4. Should the local RMS VAD be removed outright or re-thresholded post-AGC?
5. Is the 16 kHz playback cap acceptable for show audio on every character, or
   should some nodes keep a separate high-quality playback path and use
   half-duplex gating instead of AEC?
