import { and, desc, eq, isNull } from 'drizzle-orm';
import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { WebSocket } from 'ws';
import { bots, conversations, users } from '../../shared/schema';
import { db } from '../db';
import { env } from '../env';

interface VoiceAgentSession {
  userId: string;
  botId?: string;
  voiceId: string;
  introMessage: string;
  streamSid?: string;
  systemPrompt?: string;
  conversationId: string;
}

export class VoiceAgentService {
  async handleConnection(ws: WebSocket) {
    let session: VoiceAgentSession | null = null;
    let openaiWs: WebSocket | null = null;
    let cartesiaWs: WebSocket | null = null;

    console.log('VoiceAgentService: New connection');

    ws.on('message', async (message) => {
      try {
        const msg = JSON.parse(message.toString());

        switch (msg.event) {
          case 'start': {
            const userId = msg.start.customParameters?.userId;

            // Fetch bot configuration
            const bot = await this.getBotForUser(userId);

            session = {
              userId,
              botId: bot?.id,
              voiceId:
                msg.start.customParameters?.voiceId ||
                'a0e99841-438c-4a64-b679-ae501e7d6091',
              introMessage:
                msg.start.customParameters?.introMessage || 'Hello!',
              streamSid: msg.start.streamSid,
              systemPrompt:
                bot?.systemPrompt || 'You are a helpful AI assistant.',
              conversationId: uuidv4(),
            };

            console.log(
              `Voice session started. User: ${session.userId}, Bot: ${session.botId}, Stream: ${session.streamSid}`,
            );

            // Initialize OpenAI Realtime Connection
            openaiWs = this.initOpenAI(ws, session, (text) => {
              if (cartesiaWs && cartesiaWs.readyState === WebSocket.OPEN) {
                this.sendToCartesia(cartesiaWs, text, session?.voiceId);
              }
            });

            // Initialize Cartesia Connection
            cartesiaWs = this.initCartesia(ws, session);

            // Initialize conversation in DB
            await this.createConversation(session);

            // Send initial greeting
            if (session.introMessage) {
              // Wait a bit for connections to stabilize
              setTimeout(() => {
                if (cartesiaWs && cartesiaWs.readyState === WebSocket.OPEN) {
                  this.sendToCartesia(
                    cartesiaWs,
                    session?.introMessage,
                    session?.voiceId,
                  );
                }
              }, 500);
            }
            break;
          }

          case 'media':
            if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
              openaiWs.send(
                JSON.stringify({
                  type: 'input_audio_buffer.append',
                  audio: msg.media.payload,
                }),
              );
            }
            break;

          case 'stop':
            console.log('Voice session stopped');
            this.cleanup(openaiWs, cartesiaWs);
            break;
        }
      } catch (err) {
        console.error('Error handling Twilio message:', err);
      }
    });

    ws.on('close', () => {
      console.log('Twilio connection closed');
      this.cleanup(openaiWs, cartesiaWs);
    });
  }

  private async getBotForUser(userId: string) {
    if (!userId) return null;
    const [bot] = await db
      .select()
      .from(bots)
      .where(and(eq(bots.userId, userId), isNull(bots.deletedAt)))
      .orderBy(desc(bots.createdAt))
      .limit(1);
    return bot;
  }

  private async createConversation(session: VoiceAgentSession) {
    try {
      await db.insert(conversations).values({
        id: session.conversationId,
        botId: session.botId,
        userId: session.userId,
        messages: [{ role: 'assistant', content: session.introMessage }],
        timestamp: new Date(),
      });
    } catch (err) {
      console.error('Error creating conversation:', err);
    }
  }

  private async appendToConversation(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
  ) {
    try {
      const [conv] = await db
        .select()
        .from(conversations)
        .where(eq(conversations.id, conversationId));
      if (conv) {
        const messages = [...(conv.messages as any[]), { role, content }];
        await db
          .update(conversations)
          .set({ messages })
          .where(eq(conversations.id, conversationId));
      }
    } catch (err) {
      console.error('Error updating conversation:', err);
    }
  }

  private cleanup(openaiWs: WebSocket | null, cartesiaWs: WebSocket | null) {
    if (openaiWs && openaiWs.readyState === WebSocket.OPEN) openaiWs.close();
    if (cartesiaWs && cartesiaWs.readyState === WebSocket.OPEN)
      cartesiaWs.close();
  }

  private initOpenAI(
    twilioWs: WebSocket,
    session: VoiceAgentSession,
    onTextDelta: (text: string) => void,
  ): WebSocket {
    const url =
      'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01';
    const ws = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });

    ws.on('open', () => {
      console.log('Connected to OpenAI Realtime API');

      ws.send(
        JSON.stringify({
          type: 'session.update',
          session: {
            modalities: ['text'],
            instructions: `${session.systemPrompt}\n\nKeep responses very brief and conversational. This is a phone call. Avoid complex formatting.`,
            input_audio_format: 'g711_ulaw',
            input_audio_transcription: { model: 'whisper-1' },
            turn_detection: {
              type: 'server_vad',
              threshold: 0.5,
              prefix_padding_ms: 300,
              silence_duration_ms: 500,
            },
          },
        }),
      );
    });

    ws.on('message', (data) => {
      const response = JSON.parse(data.toString());

      if (response.type === 'response.text.delta') {
        onTextDelta(response.delta);
      }

      if (
        response.type ===
        'conversation.item.input_audio_transcription.completed'
      ) {
        // Log user message
        this.appendToConversation(
          session.conversationId,
          'user',
          response.transcript,
        );
      }

      if (response.type === 'response.text.done') {
        // Log assistant message
        this.appendToConversation(
          session.conversationId,
          'assistant',
          response.text,
        );
      }

      if (response.type === 'error') {
        console.error('OpenAI Realtime Error:', response.error);
      }
    });

    ws.on('error', (err) => console.error('OpenAI WebSocket Error:', err));

    return ws;
  }

  private initCartesia(
    twilioWs: WebSocket,
    session: VoiceAgentSession,
  ): WebSocket {
    const url = `wss://api.cartesia.ai/tts/websocket?api_key=${env.CARTESIA_API_KEY}&cartesia_version=2024-06-10`;
    const ws = new WebSocket(url);

    ws.on('open', () => {
      console.log('Connected to Cartesia WebSocket');
    });

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.type === 'chunk' && response.data) {
          twilioWs.send(
            JSON.stringify({
              event: 'media',
              streamSid: session.streamSid,
              media: {
                payload: response.data,
              },
            }),
          );
        }
      } catch (err) {
        console.error('Error parsing Cartesia message:', err);
      }
    });

    ws.on('error', (err) => console.error('Cartesia WebSocket Error:', err));

    return ws;
  }

  private sendToCartesia(ws: WebSocket, text: string, voiceId: string) {
    ws.send(
      JSON.stringify({
        model_id: 'sonic-2',
        transcript: text,
        voice: {
          mode: 'id',
          id: voiceId,
        },
        output_format: {
          container: 'raw',
          encoding: 'pcm_mulaw',
          sample_rate: 8000,
        },
        continue: true,
      }),
    );
  }
}

export const voiceAgentService = new VoiceAgentService();
