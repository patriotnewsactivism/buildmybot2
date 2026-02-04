import { AlertCircle, Bot, Check, Loader, Send, User, X } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../services/apiConfig';
import { dbService } from '../../services/dbService';
import { generateBotResponseWithKnowledge } from '../../services/openaiService';
import type { Bot as BotType, LeadCaptureSettings } from '../../types';

interface FullPageChatProps {
  botId: string;
}

interface LeadFormData {
  name: string;
  email: string;
  phone: string;
}

const DEFAULT_PROMPT_AFTER = 3;

export const FullPageChat: React.FC<FullPageChatProps> = ({ botId }) => {
  const [messages, setMessages] = useState<
    { role: 'user' | 'model'; text: string }[]
  >([]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [bot, setBot] = useState<BotType | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadFormData, setLeadFormData] = useState<LeadFormData>({
    name: '',
    email: '',
    phone: '',
  });
  const [leadCaptured, setLeadCaptured] = useState(false);
  const [leadFormError, setLeadFormError] = useState('');
  const [isSubmittingLead, setIsSubmittingLead] = useState(false);

  const isEmbed = window.location.search.includes('mode=embed');

  useEffect(() => {
    const fetchBot = async () => {
      if (!botId) return;
      try {
        // Try to fetch as authenticated user first (owner preview)
        let foundBot = await dbService.getBotById(botId);

        // If not found or not authorized, try public endpoint
        if (!foundBot) {
          foundBot = await dbService.getPublicBotById(botId);
        }

        if (foundBot) {
          setBot(foundBot);
          setTimeout(() => {
            setMessages([
              { role: 'model', text: 'Hello! How can I help you today?' },
            ]);
          }, 500);
        }
      } catch (e) {
        console.error('Failed to fetch bot', e);
      }
    };
    fetchBot();
  }, [botId]);

  useEffect(() => {
    if (!scrollRef.current) {
      return;
    }
    const shouldScroll = messages.length > 0 || isTyping || showLeadForm;
    if (shouldScroll) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length, isTyping, showLeadForm]);

  useEffect(() => {
    if (!bot || leadCaptured || showLeadForm) return;

    const leadSettings = bot.leadCapture as LeadCaptureSettings | undefined;
    if (!leadSettings?.enabled) return;

    const userMessageCount = messages.filter((m) => m.role === 'user').length;
    const promptAfter = leadSettings.promptAfter ?? DEFAULT_PROMPT_AFTER;

    if (userMessageCount >= promptAfter && userMessageCount > 0) {
      setShowLeadForm(true);
    }
  }, [messages, bot, leadCaptured, showLeadForm]);

  const detectContactInfoInMessage = (text: string): Partial<LeadFormData> => {
    const detected: Partial<LeadFormData> = {};

    const emailMatch = text.match(
      /[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+/,
    );
    if (emailMatch) {
      detected.email = emailMatch[0];
    }

    const phoneMatch = text.match(
      /(\+?1?[-.\s]?)?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}/,
    );
    if (phoneMatch) {
      detected.phone = phoneMatch[0];
    }

    return detected;
  };

  const captureLeadFromConversation = async (
    contactInfo: Partial<LeadFormData>,
  ) => {
    if (!bot || leadCaptured || !contactInfo.email) return;

    try {
      const response = await fetch(`${API_BASE}/leads/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: bot.id,
          name: contactInfo.name || 'Visitor',
          email: contactInfo.email,
          phone: contactInfo.phone || null,
          source: 'chatbot',
          conversationContext: messages
            .slice(-5)
            .map((m) => m.text)
            .join('\n'),
        }),
      });

      if (response.ok) {
        setLeadCaptured(true);
        console.log('Lead captured successfully');
      }
    } catch (error) {
      console.error('Failed to capture lead:', error);
    }
  };

  const handleLeadFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLeadFormError('');

    const leadSettings = bot?.leadCapture as LeadCaptureSettings | undefined;

    if (leadSettings?.emailRequired && !leadFormData.email) {
      setLeadFormError('Email is required');
      return;
    }

    if (leadSettings?.nameRequired && !leadFormData.name) {
      setLeadFormError('Name is required');
      return;
    }

    if (leadSettings?.phoneRequired && !leadFormData.phone) {
      setLeadFormError('Phone is required');
      return;
    }

    if (!leadFormData.email) {
      setLeadFormError('Email is required');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(leadFormData.email)) {
      setLeadFormError('Please enter a valid email address');
      return;
    }

    setIsSubmittingLead(true);

    try {
      const response = await fetch(`${API_BASE}/leads/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          botId: botId,
          name: leadFormData.name || 'Visitor',
          email: leadFormData.email,
          phone: leadFormData.phone || null,
          source: 'chatbot',
          conversationContext: messages
            .slice(-5)
            .map((m) => m.text)
            .join('\n'),
        }),
      });

      if (response.ok) {
        setLeadCaptured(true);
        setShowLeadForm(false);
        setMessages((prev) => [
          ...prev,
          {
            role: 'model',
            text: `Thank you${leadFormData.name ? `, ${leadFormData.name}` : ''}! I've saved your contact information. How can I continue to help you?`,
          },
        ]);
      } else {
        const data = await response.json();
        setLeadFormError(
          data.error ||
            'Failed to save your information. You can dismiss this and continue chatting.',
        );
      }
    } catch (error) {
      setLeadFormError(
        'Failed to save your information. You can dismiss this and continue chatting.',
      );
    } finally {
      setIsSubmittingLead(false);
    }
  };

  const handleSkipLeadForm = () => {
    setShowLeadForm(false);
    setLeadCaptured(true);
  };

  const handleDismissLeadForm = () => {
    setShowLeadForm(false);
    setLeadFormError('');
  };

  const handleSend = async () => {
    if (!input.trim() || !bot || isTyping) return;

    const userMsg = { role: 'user' as const, text: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    if (!leadCaptured) {
      const detected = detectContactInfoInMessage(input);
      if (detected.email) {
        await captureLeadFromConversation({
          ...leadFormData,
          ...detected,
        });
      }
    }

    try {
      const response = await generateBotResponseWithKnowledge(
        botId,
        messages,
        userMsg.text,
        bot.model || 'gpt-5o-mini',
      );

      const delay = bot.responseDelay || 1000;

      setTimeout(() => {
        setMessages((prev) => [...prev, { role: 'model', text: response }]);
        setIsTyping(false);
      }, delay);
    } catch (e) {
      setIsTyping(false);
    }
  };

  if (!bot) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center ${isEmbed ? 'bg-transparent' : 'bg-slate-50'}`}
      >
        <Loader className="animate-spin text-blue-900" size={32} />
      </div>
    );
  }

  const leadSettings = bot.leadCapture as LeadCaptureSettings | undefined;

  const LeadCaptureForm = () => (
    <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-xl border border-blue-100 shadow-sm animate-fade-in relative">
      <button
        type="button"
        onClick={handleDismissLeadForm}
        className="absolute top-2 right-2 p-1 text-slate-400 hover:text-slate-600 transition"
        aria-label="Dismiss form"
      >
        <X size={16} />
      </button>
      <div className="text-center mb-4">
        <h3 className="font-bold text-slate-800 text-sm">
          {leadSettings?.customPrompt || "We'd love to stay in touch!"}
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Share your contact info to continue the conversation
        </p>
      </div>

      <form onSubmit={handleLeadFormSubmit} className="space-y-3">
        <div>
          <input
            type="text"
            placeholder={`Name${leadSettings?.nameRequired ? ' *' : ''}`}
            value={leadFormData.name}
            onChange={(e) =>
              setLeadFormData((prev) => ({ ...prev, name: e.target.value }))
            }
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 text-slate-900 placeholder:text-slate-600 bg-white"
          />
        </div>

        <div>
          <input
            type="email"
            placeholder={`Email${leadSettings?.emailRequired !== false ? ' *' : ''}`}
            value={leadFormData.email}
            onChange={(e) =>
              setLeadFormData((prev) => ({ ...prev, email: e.target.value }))
            }
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 text-slate-900 placeholder:text-slate-600 bg-white"
          />
        </div>

        <div>
          <input
            type="tel"
            placeholder={`Phone${leadSettings?.phoneRequired ? ' *' : ''}`}
            value={leadFormData.phone}
            onChange={(e) =>
              setLeadFormData((prev) => ({ ...prev, phone: e.target.value }))
            }
            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500 text-slate-900 placeholder:text-slate-600 bg-white"
          />
        </div>

        {leadFormError && (
          <div className="flex items-start gap-2 text-red-500 text-xs bg-red-50 p-2 rounded-lg">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
            <span>{leadFormError}</span>
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isSubmittingLead}
            className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isSubmittingLead ? (
              <Loader className="animate-spin" size={14} />
            ) : (
              <Check size={14} />
            )}
            Continue
          </button>
          <button
            type="button"
            onClick={handleSkipLeadForm}
            className="px-4 py-2 text-slate-500 text-sm hover:text-slate-700 transition"
          >
            Skip
          </button>
        </div>
      </form>
    </div>
  );

  if (isEmbed) {
    return (
      <div className="h-full bg-white flex flex-col overflow-hidden">
        <div className="p-4 bg-white border-b border-slate-100 flex items-center gap-3 shadow-sm sticky top-0 z-10">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold shadow-sm"
            style={{ backgroundColor: bot.themeColor }}
          >
            <Bot size={16} />
          </div>
          <div>
            <h1 className="font-bold text-slate-800 text-sm">{bot.name}</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] text-slate-500">Online</span>
            </div>
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50"
          ref={scrollRef}
        >
          {messages.map((msg) => (
            <div
              key={`${msg.role}-${msg.text}`}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-3 py-2 rounded-xl text-xs shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-white text-slate-700 border border-slate-200 rounded-bl-sm'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 px-3 py-2 rounded-xl rounded-bl-sm shadow-sm flex gap-1 items-center">
                <div className="w-1 h-1 bg-slate-400 rounded-full animate-bounce" />
                <div
                  className="w-1 h-1 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: '0.1s' }}
                />
                <div
                  className="w-1 h-1 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: '0.2s' }}
                />
              </div>
            </div>
          )}
          {showLeadForm && !leadCaptured && <LeadCaptureForm />}
        </div>

        <div className="p-3 bg-white border-t border-slate-100">
          <div className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type a message..."
              className="w-full pl-3 pr-10 py-2 rounded-lg border border-slate-200 focus:ring-blue-900 focus:border-blue-900 text-sm text-slate-900 placeholder:text-slate-600 bg-white"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              className="absolute right-1.5 top-1.5 p-1.5 bg-blue-900 text-white rounded-md hover:bg-blue-950 disabled:opacity-50 transition"
            >
              {isTyping ? (
                <Loader className="animate-spin" size={14} />
              ) : (
                <Send size={14} />
              )}
            </button>
          </div>
          <div className="text-center mt-1">
            <span className="text-[9px] text-slate-500 font-medium">
              Powered by BuildMyBot
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col h-[80vh] border border-slate-200">
        <div className="p-4 bg-white border-b border-slate-100 flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold shadow-sm"
            style={{ backgroundColor: bot.themeColor }}
          >
            <Bot size={20} />
          </div>
          <div>
            <h1 className="font-bold text-slate-800">{bot.name}</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs text-slate-500">Online Now</span>
            </div>
          </div>
        </div>

        <div
          className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50"
          ref={scrollRef}
        >
          {messages.map((msg) => (
            <div
              key={`${msg.role}-${msg.text}`}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-4 py-3 rounded-2xl text-sm shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-white text-slate-700 border border-slate-200 rounded-bl-sm'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-bl-sm shadow-sm flex gap-1 items-center">
                <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" />
                <div
                  className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: '0.1s' }}
                />
                <div
                  className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: '0.2s' }}
                />
              </div>
            </div>
          )}
          {showLeadForm && !leadCaptured && <LeadCaptureForm />}
        </div>

        <div className="p-4 bg-white border-t border-slate-100">
          <div className="relative">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              placeholder="Type a message..."
              className="w-full pl-4 pr-12 py-3 rounded-xl border border-slate-200 focus:ring-blue-900 focus:border-blue-900 text-slate-900 placeholder:text-slate-600 bg-white"
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || isTyping}
              className="absolute right-2 top-2 p-2 bg-blue-900 text-white rounded-lg hover:bg-blue-950 disabled:opacity-50 transition"
            >
              {isTyping ? (
                <Loader className="animate-spin" size={18} />
              ) : (
                <Send size={18} />
              )}
            </button>
          </div>
          <div className="text-center mt-2">
            <span className="text-[10px] text-slate-600 font-medium uppercase tracking-wide">
              Powered by BuildMyBot
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
