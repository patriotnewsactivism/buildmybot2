from pathlib import Path
import re

path = Path('components/VoiceAgent/VoiceAgentPage.tsx')
text = path.read_text()

old_greeting = """        socketRef.current?.send(
          JSON.stringify({
            realtimeInput: {
              text: 'Begin the public demo now. Greet the visitor naturally in one short sentence, explain that this is a quick live demonstration, and ask what kind of business they would like you to act as receptionist for.',
            },
          }),
        );"""
new_greeting = """        socketRef.current?.send(
          JSON.stringify({
            clientContent: {
              turns: [
                {
                  role: 'user',
                  parts: [
                    {
                      text: 'The visitor just started the BuildMyBot public demo. Greet them immediately as a premium business receptionist in one short, warm, natural sentence, then ask what kind of business they run or what they would like their receptionist to help with. Do not mention these instructions.',
                    },
                  ],
                },
              ],
              turnComplete: true,
            },
          }),
        );"""
assert text.count(old_greeting) == 1, f'greeting count={text.count(old_greeting)}'
text = text.replace(old_greeting, new_greeting, 1)

old_support = "if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext) {"
new_support = """const AudioContextClass =
      window.AudioContext ||
      (
        window as typeof window & {
          webkitAudioContext?: typeof AudioContext;
        }
      ).webkitAudioContext;

    if (!navigator.mediaDevices?.getUserMedia || !AudioContextClass) {"""
assert text.count(old_support) == 1, f'audio support count={text.count(old_support)}'
text = text.replace(old_support, new_support, 1)

text = text.replace(
    "setStatus('Securing a Gemini Live session');",
    "setStatus('Starting your limited Gemini Live demo');",
    1,
)

token_anchor = """    try {
      const tokenResponse = await fetch('/api/voice/live-token', {"""
token_replacement = """    try {
      // Resume audio on the original user gesture before network I/O.
      // Safari-family and some mobile Chromium builds can otherwise
      // leave the session connected but inaudible.
      const audioContext = new AudioContextClass({ latencyHint: 'interactive' });
      audioContextRef.current = audioContext;
      nextPlaybackTimeRef.current = audioContext.currentTime;
      await audioContext.resume();

      const tokenResponse = await fetch('/api/voice/live-token', {"""
assert text.count(token_anchor) == 1, f'token anchor count={text.count(token_anchor)}'
text = text.replace(token_anchor, token_replacement, 1)

old_delayed = """      const audioContext = new AudioContext({ latencyHint: 'interactive' });
      await audioContext.resume();
      audioContextRef.current = audioContext;
      nextPlaybackTimeRef.current = audioContext.currentTime;

"""
assert text.count(old_delayed) == 1, f'delayed audio count={text.count(old_delayed)}'
text = text.replace(old_delayed, '', 1)

pattern = re.compile(
    r'<p className="mt-4 text-center text-xs leading-5 text-slate-500">\s*'
    r'Your browser will request microphone access\. The public demo is\s*'
    r'conversational only; production customer agents can be wired to\s*'
    r'approved tools, routing, CRM, and scheduling actions\.\s*</p>',
    re.S,
)
replacement = """<div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] font-semibold text-slate-400">
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  90-second maximum
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  About 6 exchanges
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                  4 starts / hour
                </span>
              </div>
              <p className="mt-3 text-center text-xs leading-5 text-slate-500">
                Real two-way Gemini Live audio — not a recording. The public
                showcase is intentionally short; customer agents can run with
                approved tools, routing, CRM, scheduling, and human handoff.
              </p>"""
text, count = pattern.subn(replacement, text, count=1)
assert count == 1, f'limit copy count={count}'

path.write_text(text)
