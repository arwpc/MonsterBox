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
-- A node whose sink happens to sit at `idle` (stream still open) rather than
-- `suspended` never shows the fault, which is what made this look like flaky
-- hardware on some nodes and not others.
--
-- WirePlumber here is 0.4.13, which reads Lua from main.lua.d — a 0.5-style
-- SPA-JSON file in wireplumber.conf.d is silently ignored.
-- SINK ONLY. Do not add the alsa_input node here.
--
-- The fix is about keeping a PLAYBACK reference alive for the AEC pipeline, and
-- only the output node needs pinning. A first version matched the input too and
-- broke a node whose mic had been fine: PipeWire then held the capture
-- subdevice open permanently (`arecord -l` showed Subdevices: 0/1) and
-- retire_capture_urb errors climbed while every capture returned zero bytes.
-- Removing the input match restored him. Keep the source free to suspend.
alsa_monitor.rules = alsa_monitor.rules or {}

table.insert(alsa_monitor.rules, {
  matches = {
    { { "node.name", "matches", "alsa_output.usb-Seeed_Studio_reSpeaker_XVF3800*" } },
  },
  apply_properties = {
    ["session.suspend-timeout-seconds"] = 0,
  },
})
