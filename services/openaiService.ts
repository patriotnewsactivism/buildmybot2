import { buildApiUrl } from './apiConfig';

export const generateBotResponse = async (
  systemPrompt: string,
  history: { role: 'user' | 'model'; text: string }[],
  lastMessage: string,
  modelName = 'gpt-5o-mini',
  context?: string,
): Promise<string> => {
  const messages = [...history, { role: 'user' as const, text: lastMessage }];

  try {
    const response = await fetch(buildApiUrl('/chat'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        messages,
        systemPrompt,
        model: modelName,
        context,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('Chat API Error:', err);

      if (response.status === 402) {
        return 'Your OpenAI API key has exceeded its usage quota. Please add credits to your OpenAI account at platform.openai.com/account/billing to continue using AI features.';
      }
      if (response.status === 401) {
        return 'Invalid OpenAI API key. Please check your API key configuration.';
      }
      if (response.status === 429) {
        return 'Too many requests. Please wait a moment and try again.';
      }
      return err.error || 'Failed to get response from AI.';
    }

    const data = await response.json();
    return data.response || '';
  } catch (error: any) {
    console.error('OpenAI Service Error:', error);
    return "I'm having trouble connecting to my AI brain right now. Please check your internet connection.";
  }
};

export const generateBotResponseWithKnowledge = async (
  botId: string,
  history: { role: 'user' | 'model'; text: string }[],
  lastMessage: string,
  modelName?: string,
): Promise<string> => {
  const messages = [...history, { role: 'user' as const, text: lastMessage }];

  try {
    const response = await fetch(buildApiUrl(`/chat/bot/${botId}`), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        model: modelName,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('Bot Chat API Error:', err);

      if (response.status === 404) {
        return 'Bot not found. Please check the bot ID.';
      }
      if (response.status === 402) {
        return 'AI service quota exceeded. Please try again later.';
      }
      if (response.status === 401) {
        return 'AI service configuration error.';
      }
      if (response.status === 429) {
        return 'Too many requests. Please wait a moment and try again.';
      }
      return err.error || 'Failed to get response from AI.';
    }

    const data = await response.json();
    return data.response || '';
  } catch (error: any) {
    console.error('Bot Chat Service Error:', error);
    return "I'm having trouble connecting right now. Please try again.";
  }
};

export const generateBotResponseDemo = async (
  systemPrompt: string,
  history: { role: 'user' | 'model'; text: string }[],
  lastMessage: string,
  modelName = 'gpt-5o-mini',
  context?: string,
): Promise<string> => {
  const messages = [...history, { role: 'user' as const, text: lastMessage }];

  try {
    const response = await fetch(buildApiUrl('/chat/demo'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        systemPrompt,
        model: modelName,
        context,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('Chat API Error:', err);

      if (response.status === 429) {
        return 'Too many requests. Please wait a moment and try again.';
      }
      return err.error || 'Failed to get response from AI.';
    }

    const data = await response.json();
    return data.response || '';
  } catch (error: any) {
    console.error('OpenAI Service Error:', error);
    return "I'm having trouble connecting to my AI brain right now. Please check your internet connection.";
  }
};

export const scrapeWebsiteContent = async (url: string): Promise<string> => {
  if (!url) return '';

  try {
    let targetUrl = url;
    if (!targetUrl.startsWith('http')) {
      targetUrl = `https://${targetUrl}`;
    }

    const proxyUrl = 'https://corsproxy.io/?';
    const jinaUrl = `https://r.jina.ai/${targetUrl}`;

    const scrapeResponse = await fetch(proxyUrl + encodeURIComponent(jinaUrl));

    if (!scrapeResponse.ok)
      throw new Error(
        'Failed to scrape website. The URL might be blocked or invalid.',
      );

    const rawText = await scrapeResponse.text();
    const truncatedText = rawText.substring(0, 15000);

    const response = await fetch(buildApiUrl('/chat/demo'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            text: `Analyze this content and extract key business details:\n1. Business Name & Description\n2. Key Services/Products\n3. Contact Info (Email, Phone, Address)\n4. Pricing/Hours (if available)\n\nCONTENT:\n${truncatedText}`,
          },
        ],
        systemPrompt:
          'You are a precise Data Extractor. Extract business facts.',
        model: 'gpt-5o-mini',
      }),
    });

    if (!response.ok) throw new Error('Failed to summarize content.');
    const data = await response.json();
    return data.response || rawText.substring(0, 1000);
  } catch (error: any) {
    console.error('Scrape Error:', error);
    throw new Error(`Failed to scrape website. ${error.message || ''}`);
  }
};

export const generateMarketingContent = async (
  type: string,
  topic: string,
  tone: string,
): Promise<string> => {
  try {
    const response = await fetch(buildApiUrl('/chat/demo'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            text: `Write a ${type} about ${topic}. Return ONLY the content, no filler. Keep it engaging and high-converting.`,
          },
        ],
        systemPrompt: `You are an expert Copywriter. Tone: ${tone}.`,
        model: 'gpt-5o-mini',
      }),
    });
    const data = await response.json();
    return data.response || '';
  } catch (e) {
    return 'Failed to generate content.';
  }
};

export const generateWebsiteStructure = async (
  businessName: string,
  description: string,
): Promise<string> => {
  try {
    const response = await fetch(buildApiUrl('/chat/demo'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages: [
          {
            role: 'user',
            text: `Generate landing page structure for "${businessName}". Description: ${description}`,
          },
        ],
        systemPrompt:
          'You are a Website Builder AI. Output JSON only with keys: headline, subheadline, features (array of strings), ctaText.',
        model: 'gpt-5o-mini',
      }),
    });
    const data = await response.json();
    return data.response || '{}';
  } catch (e) {
    console.error(e);
    throw e;
  }
};

export const simulateWebScrape = scrapeWebsiteContent;
