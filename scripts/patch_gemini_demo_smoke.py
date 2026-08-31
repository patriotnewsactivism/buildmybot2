from pathlib import Path

path = Path('.github/workflows/deploy-cloud-run.yml')
text = path.read_text()

old = """            socket.addEventListener('message', (event) => {
              let message;
              try {
                message = JSON.parse(String(event.data));
              } catch (error) {
                finish(error);
                return;
              }
              if (message.error?.message) {
                finish(new Error(message.error.message));
              } else if (message.setupComplete) {
                finish();
              }
            });"""

new = """            socket.addEventListener('message', async (event) => {
              try {
                let raw;
                if (typeof event.data === 'string') {
                  raw = event.data;
                } else if (event.data instanceof Blob) {
                  raw = await event.data.text();
                } else if (event.data instanceof ArrayBuffer) {
                  raw = new TextDecoder().decode(event.data);
                } else if (ArrayBuffer.isView(event.data)) {
                  raw = new TextDecoder().decode(event.data);
                } else {
                  raw = String(event.data);
                }

                const message = JSON.parse(raw);
                if (message.error?.message) {
                  finish(new Error(message.error.message));
                  return;
                }

                if (message.setupComplete) {
                  socket.send(JSON.stringify({
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
                  }));
                  return;
                }

                const serverContent = message.serverContent;
                const hasTranscript = Boolean(
                  serverContent?.outputTranscription?.text?.trim(),
                );
                const hasAudio = Boolean(
                  serverContent?.modelTurn?.parts?.some(
                    (part) => Boolean(part?.inlineData?.data),
                  ),
                );
                if (hasTranscript || hasAudio) {
                  finish();
                }
              } catch (error) {
                finish(error);
              }
            });"""

if text.count(old) != 1:
    raise RuntimeError(f'Expected one WebSocket message handler, found {text.count(old)}')
text = text.replace(old, new, 1)

text = text.replace(
    "() => finish(new Error('Timed out waiting for Gemini setupComplete')),\n              15000,",
    "() => finish(new Error('Timed out waiting for Gemini generated demo output')),\n              20000,",
    1,
)

text = text.replace(
    'echo "- Gemini constrained WebSocket: setupComplete" >> "$GITHUB_STEP_SUMMARY"',
    'echo "- Gemini constrained WebSocket: setupComplete + generated demo output" >> "$GITHUB_STEP_SUMMARY"',
    1,
)

path.write_text(text)
