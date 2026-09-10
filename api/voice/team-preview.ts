import WebSocket from 'ws';
import {
  GEMINI_LIVE_MODEL,
  type VoiceTeamAgent,
} from '../../shared/voice-team.js';

/** Same live model and voice as phone calls; no substitute TTS provider. */
export function generateTeamPreview(agent: VoiceTeamAgent): Promise<Buffer> {
  const key = process.env.GEMINI_API_KEY;
  if (!key)
    return Promise.reject(
      new Error('Voice previews are temporarily unavailable.'),
    );
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(
      `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(key)}`,
    );
    const chunks: Buffer[] = [];
    let bytes = 0;
    let done = false;
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (socket.readyState === WebSocket.CONNECTING) socket.terminate();
      else socket.close();
      if (error || !bytes) {
        reject(error || new Error('Voice preview returned no audio.'));
        return;
      }
      const pcm = Buffer.concat(chunks);
      const header = Buffer.alloc(44);
      header.write('RIFF', 0);
      header.writeUInt32LE(36 + pcm.length, 4);
      header.write('WAVEfmt ', 8);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20);
      header.writeUInt16LE(1, 22);
      header.writeUInt32LE(24000, 24);
      header.writeUInt32LE(48000, 28);
      header.writeUInt16LE(2, 32);
      header.writeUInt16LE(16, 34);
      header.write('data', 36);
      header.writeUInt32LE(pcm.length, 40);
      resolve(Buffer.concat([header, pcm]));
    };
    const timer = setTimeout(
      () => finish(new Error('Voice preview timed out. Please try again.')),
      15000,
    );
    socket.on('open', () =>
      socket.send(
        JSON.stringify({
          setup: {
            model: GEMINI_LIVE_MODEL,
            generationConfig: {
              responseModalities: ['AUDIO'],
              thinkingConfig: { thinkingLevel: 'minimal' },
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: { voiceName: agent.voice.voiceId },
                },
              },
            },
            systemInstruction: {
              parts: [
                {
                  text: `You are ${agent.name}, an AI ${agent.department}. ${agent.persona}\nSpeaking style: ${agent.speakingStyle}\nSpeak only the provided opening once, with no additional commentary.`,
                },
              ],
            },
          },
        }),
      ),
    );
    socket.on('message', (raw) => {
      if (done) return;
      try {
        const message = JSON.parse(raw.toString());
        if (message.error) {
          finish(new Error('Voice preview is temporarily unavailable.'));
          return;
        }
        if (message.setupComplete)
          socket.send(
            JSON.stringify({
              realtimeInput: {
                text: `Say this opening: ${agent.firstMessage}`,
              },
            }),
          );
        for (const part of message.serverContent?.modelTurn?.parts || []) {
          if (part.inlineData?.data) {
            const chunk = Buffer.from(part.inlineData.data, 'base64');
            bytes += chunk.length;
            if (bytes > 1_000_000) {
              finish(new Error('Voice preview exceeded its audio limit.'));
              return;
            }
            chunks.push(chunk);
          }
        }
        if (message.serverContent?.turnComplete) finish();
      } catch {
        finish(new Error('Invalid voice preview response.'));
      }
    });
    socket.on('error', () =>
      finish(new Error('Voice preview connection failed.')),
    );
    socket.on('close', () =>
      finish(new Error('Voice preview ended before completion.')),
    );
  });
}
