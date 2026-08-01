---
name: change-voice
description: Change microphone capture, OpenAI Realtime sessions, transcription, speech output, transcripts, or voice privacy. Use for any voice-first interface or audio pipeline work.
---

# Change Voice

1. Keep the OpenAI API key server-side and issue only short-lived Realtime client secrets to browsers.
2. Preserve a keyboard/text path for every voice action.
3. Ask for microphone permission only after an explicit user gesture.
4. Show listening, processing, speaking, muted, interrupted, and error states.
5. Do not retain raw audio by default. Record consent and retention when storage is enabled.
6. Treat the transcript as editable input before consequential actions.
7. Route paid or external actions through approvals even when requested by voice.
8. Test denied permission, empty audio, interrupted speech, slow networks, and missing credentials.
