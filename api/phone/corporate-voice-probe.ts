import WebSocket from 'ws';
import {
  GEMINI_MODEL,
  promptInitialGreeting,
  setupGeminiSession,
} from '../voice/telnyx-live.js';
import { CORPORATE } from './corporate-config.js';
// No phone calls or messages. One bounded Gemini audio response verifies the
// deployed credentials, setup contract and actual audio generation.
export async function probeCorporateVoice(): Promise<boolean> {
  if (!process.env.GEMINI_API_KEY) return false;
  return new Promise((resolve) => {
    const socket = new WebSocket(
      `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(process.env.GEMINI_API_KEY || '')}`,
    );
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (socket.readyState === WebSocket.OPEN) socket.close();
      else socket.terminate();
      console.info(
        '[corporate-phone] Gemini audio probe',
        JSON.stringify({ model: GEMINI_MODEL, audioReceived: ok }),
      );
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), 20000);
    socket.on('open', () =>
      setupGeminiSession(socket, {
        botId: CORPORATE.botId,
        logId: '',
        callControlId: '',
        callerNumber: '',
        calledNumber: CORPORATE.number,
        botName: 'BuildMyBot',
        systemPrompt:
          'This is a connection test. Say hello briefly. Do not call any tools.',
        userId: CORPORATE.ownerId,
        organizationId: null,
        phoneConfig: { introMessage: 'Hello from BuildMyBot.' },
      }),
    );
    socket.on('message', (data) => {
      try {
        const value = JSON.parse(data.toString());
        if (value.error) {
          console.error(
            '[corporate-phone] Gemini probe error',
            String(value.error.message || 'Provider error'),
          );
          finish(false);
        }
        if (value.setupComplete) promptInitialGreeting(socket);
        if (
          value.serverContent?.modelTurn?.parts?.some(
            (p: { inlineData?: { data?: string } }) => p.inlineData?.data,
          )
        )
          finish(true);
      } catch {
        finish(false);
      }
    });
    socket.on('error', () => finish(false));
    socket.on('close', () => finish(false));
  });
}
