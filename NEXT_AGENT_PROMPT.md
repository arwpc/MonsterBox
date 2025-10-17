# Prompt for Next Agent

ElevenLabs STT transcription quality is extremely poor on Groundbreaker. User says "The quick brown fox jumped over the lazy dog" but gets "Praying over the letter". 

I fixed the critical `language_code` parameter bug (was sending `language`, should be `language_code`) which stopped random foreign languages, but accuracy is still terrible.

Read `STT_TROUBLESHOOTING_REPORT.md` for full details. 

**Your task**: Figure out why audio quality is so poor and fix it. Priority: Verify the USB audio adapter microphone is actually being used (not the webcam), then test the actual audio quality reaching ElevenLabs API. Debug logs aren't showing in journalctl so you'll need to find another way to see what's happening.

