-- Keep the ReSpeaker XVF3800 sink open — it is what makes the MIC work.
--
-- The XVF3800 is an echo-cancelling speakerphone: its capture pipeline only
-- emits frames while a PLAYBACK stream is open on the device. Measured on
-- PumpkinHead 2026-09-06, the same command seconds apart:
--
--   capture with the sink suspended        -> 0 bytes
--   capture with a playback stream running -> 309,760 bytes (full 16kHz rate)
--
-- So when WirePlumber suspends the idle sink, the microphone goes dead. That is
-- the entire "intermittent mic": it appeared to work at random because it only
-- worked while something happened to be playing audio, and it survived VBUS
-- power-cycles, a wiped PipeWire state dir, camera removal and full reboots
-- because none of those touch suspend behaviour.
--
-- Orlok's identical array never showed the fault because his sink sits at
-- `idle` (stream still open) rather than `suspended`.
--
-- WirePlumber here is 0.4.13, which reads Lua from main.lua.d — a 0.5-style
-- SPA-JSON file in wireplumber.conf.d is silently ignored.
alsa_monitor.rules = alsa_monitor.rules or {}

table.insert(alsa_monitor.rules, {
  matches = {
    { { "node.name", "matches", "alsa_output.usb-Seeed_Studio_reSpeaker_XVF3800*" } },
    { { "node.name", "matches", "alsa_input.usb-Seeed_Studio_reSpeaker_XVF3800*" } },
  },
  apply_properties = {
    ["session.suspend-timeout-seconds"] = 0,
  },
})
