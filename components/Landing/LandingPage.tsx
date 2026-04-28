import {
  ArrowRight,
  Bell,
  Bot,
  Briefcase,
  Car,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Crown,
  DollarSign,
  Dumbbell,
  FileText,
  Flame,
  Gavel,
  Globe,
  GraduationCap,
  Home,
  Instagram,
  Landmark,
  Layout,
  LayoutDashboard,
  Link as LinkIcon,
  Loader,
  Mail,
  Megaphone,
  Menu,
  MessageSquare,
  Mic,
  Phone,
  PhoneCall,
  Play,
  Plus,
  RefreshCcw,
  Search,
  Send,
  Shield,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Star,
  Stethoscope,
  Target,
  TrendingUp,
  Upload,
  Users,
  Utensils,
  Wrench,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import {
  EXPERT_SETUP_SERVICES,
  PLANS,
  TEMPLATE_MARKETPLACE_PRICING,
  VOICE_AGENT_PRICING,
} from '../../constants';
import {
  generateBotResponseDemo,
  generateMarketingContent,
  generateWebsiteStructure,
  scrapeWebsiteContent,
} from '../../services/openaiService';
import { buildApiUrl } from '../../services/apiConfig';
import { PlanType } from '../../types';
import { SEO, SEOConfig } from '../SEO/SEO';

interface LandingProps {
  onLogin: () => void;
  onNavigateToPartner?: () => void;
  onAdminLogin?: () => void;
}

type ChatMessage = { role: 'user' | 'model'; text: string };

const HUMAN_NAMES = ['Sarah', 'Michael', 'Jessica', 'David', 'Emma', 'James'];
const AVATAR_COLORS = ['#1e3a8a', '#be123c', '#047857', '#d97706', '#7c3aed'];

export const LandingPage: React.FC<LandingProps> = ({
  onLogin,
  onNavigateToPartner,
  onAdminLogin,
}) => {
  const [isHoverOpen, setIsHoverOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: 'model',
      text: "Hi there! 👋 How can I help you today? I'm here to answer any questions about our AI chatbot and voice agent solutions.",
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [demoIdentity, setDemoIdentity] = useState({
    name: 'Bot',
    color: '#1e3a8a',
  });
  const [isVoiceActive, setIsVoiceActive] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const [monthlyLeads, setMonthlyLeads] = useState(100);
  const [avgDealValue, setAvgDealValue] = useState(5000);
  const [currentConversion, setCurrentConversion] = useState(10);

  const clampNumber = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

  const handleMonthlyLeadsChange = (value: string) => {
    const next = Number.parseInt(value, 10);
    setMonthlyLeads(Number.isNaN(next) ? 1 : clampNumber(next, 1, 1000));
  };

  const handleAvgDealValueChange = (value: string) => {
    const next = Number.parseInt(value, 10);
    setAvgDealValue(Number.isNaN(next) ? 100 : clampNumber(next, 100, 50000));
  };

  const handleCurrentConversionChange = (value: string) => {
    const next = Number.parseInt(value, 10);
    setCurrentConversion(Number.isNaN(next) ? 1 : clampNumber(next, 1, 50));
  };

  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const [demoUrl, setDemoUrl] = useState('');
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoResult, setDemoResult] = useState('');
  const [marketingTopic, setMarketingTopic] = useState('');
  const [marketingLoading, setMarketingLoading] = useState(false);
  const [marketingResult, setMarketingResult] = useState('');

  useEffect(() => {
    const randomName =
      HUMAN_NAMES[Math.floor(Math.random() * HUMAN_NAMES.length)];
    const randomColor =
      AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    setDemoIdentity({ name: randomName, color: randomColor });
  }, []);

  useEffect(() => {
    if (!chatScrollRef.current) {
      return;
    }
    const shouldScroll = chatHistory.length > 0 || isTyping;
    if (shouldScroll) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory.length, isTyping]);

  const handleSend = async (
    input: string,
    history: ChatMessage[],
    setHistory: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
    setTyping: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    if (!input.trim()) return;
    const userMsg = { role: 'user' as const, text: input };
    setHistory((prev) => [...prev, userMsg]);
    setTyping(true);
    try {
      const response = await generateBotResponseDemo(
        'You are a helpful business assistant for BuildMyBot, an AI chatbot and voice agent platform. Be friendly, helpful, and concise.',
        history,
        input,
      );
      setHistory((prev) => [...prev, { role: 'model', text: response }]);
    } catch (e) {
      setHistory((prev) => [
        ...prev,
        {
          role: 'model',
          text: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment.",
        },
      ]);
    } finally {
      setTyping(false);
    }
  };

  const handleVoicePreview = async () => {
    if (isVoiceActive) return;
    setIsVoiceActive(true);

    try {
      const response = await fetch(buildApiUrl('/voice/preview'), {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Voice preview unavailable');
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setIsVoiceActive(false);
        URL.revokeObjectURL(audioUrl);
      };
      audio.onerror = () => {
        setIsVoiceActive(false);
        URL.revokeObjectURL(audioUrl);
      };
      await audio.play();
    } catch (err) {
      console.error(err);
      alert('Voice preview is temporarily unavailable.');
      setIsVoiceActive(false);
    }
  };

  const handleDemoScrape = async () => {
    if (!demoUrl.trim()) return;
    setDemoLoading(true);
    setDemoResult('');
    try {
      const result = await scrapeWebsiteContent(demoUrl);
      setDemoResult(result);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to scrape website';
      setDemoResult(`Error: ${message}`);
    } finally {
      setDemoLoading(false);
    }
  };

  const handleMarketingGenerate = async () => {
    if (!marketingTopic.trim()) return;
    setMarketingLoading(true);
    setMarketingResult('');
    try {
      const result = await generateMarketingContent(
        'viral social media post',
        marketingTopic,
        'engaging and persuasive',
      );
      setMarketingResult(result);
    } catch (e) {
      setMarketingResult('Failed to generate content.');
    } finally {
      setMarketingLoading(false);
    }
  };

  const projectedConversion = Math.min(currentConversion * 3, 50);
  const currentRevenue =
    monthlyLeads * (currentConversion / 100) * avgDealValue;
  const projectedRevenue =
    monthlyLeads * (projectedConversion / 100) * avgDealValue;
  const revenueIncrease = projectedRevenue - currentRevenue;

  const setupSteps = [
    {
      icon: Globe,
      title: 'Enter Your Website',
      description:
        'Paste your URL and watch AI learn your entire business in seconds',
    },
    {
      icon: Bot,
      title: 'Customize Your Bot',
      description:
        'Set your brand colors, personality, and lead capture preferences',
    },
    {
      icon: FileText,
      title: 'Copy One Line of Code',
      description:
        'Add a simple script tag to any website - WordPress, Wix, or custom',
    },
    {
      icon: TrendingUp,
      title: 'Watch Leads Roll In',
      description:
        'Your AI starts converting visitors into qualified leads immediately',
    },
  ];

  const industries = [
    { icon: Wrench, name: 'Home Services', desc: 'HVAC, Plumbing, Roofing' },
    {
      icon: Home,
      name: 'Real Estate',
      desc: 'Agents, Brokers, Property Managers',
    },
    { icon: Car, name: 'Automotive', desc: 'Dealerships, Repair Shops' },
    {
      icon: Stethoscope,
      name: 'Healthcare',
      desc: 'Clinics, Dentists, Specialists',
    },
    { icon: Gavel, name: 'Law Firms', desc: 'Personal Injury, Family Law' },
    { icon: Shield, name: 'Bail Bonds', desc: '24/7 Bail Services' },
    {
      icon: Landmark,
      name: 'Politicians',
      desc: 'Campaigns, Constituent Services',
    },
    {
      icon: Utensils,
      name: 'Hospitality',
      desc: 'Hotels, Restaurants, Events',
    },
    { icon: Instagram, name: 'Influencers', desc: 'Creators, Personal Brands' },
    { icon: Dumbbell, name: 'Fitness', desc: 'Gyms, Personal Trainers' },
    {
      icon: GraduationCap,
      name: 'Education',
      desc: 'Tutoring, Online Courses',
    },
    {
      icon: ShoppingBag,
      name: 'E-commerce',
      desc: 'Online Stores, DTC Brands',
    },
  ];

  const faqs = [
    {
      q: 'How realistic does the voice agent actually sound?',
      a: "This is our biggest differentiator. We use Cartesia's cutting-edge neural voice synthesis — the same caliber of technology used in Hollywood productions. In real-world calls, the vast majority of callers cannot tell they're speaking with AI. It has natural inflection, appropriate pauses, and emotional warmth. It's not the robotic voice you've heard from other services.",
    },
    {
      q: 'How quickly can I get started?',
      a: "Most businesses have their voice agent and chatbot live in under 5 minutes. Paste your website URL, the AI learns your business instantly, then configure your voice agent's personality and phone number. No technical expertise required.",
    },
    {
      q: 'What can the voice agent actually do on a call?',
      a: "It answers incoming calls with a natural greeting, asks qualification questions you define, captures caller information, books appointments directly into your calendar, provides information about your services, handles objections with trained responses, and transfers to your team when a caller needs a real person. It's a full AI receptionist.",
    },
    {
      q: "What happens if the AI can't answer a question?",
      a: "The AI gracefully hands off to a human — it can transfer the call to your team in real-time, or capture the lead's details and send you an instant notification. No opportunity is ever lost.",
    },
    {
      q: 'Can I integrate with my existing CRM and tools?',
      a: 'Yes! We integrate with popular CRMs like Salesforce, HubSpot, and Zoho, plus calendar tools like Calendly and Google Calendar. API access is available on Professional plans and above.',
    },
    {
      q: 'How is this different from other AI phone services?',
      a: "Most AI phone solutions use basic text-to-speech that sounds obviously robotic. BuildMyBot uses Cartesia's state-of-the-art voice synthesis with sub-second latency, natural breathing patterns, and human-like inflection. Combined with advanced AI understanding, our voice agents have real conversations — not scripted responses. The quality difference is immediately obvious when you hear it.",
    },
    {
      q: 'Is my data secure?',
      a: 'Absolutely. We use enterprise-grade encryption and never train our models on your data. Your business information and call recordings stay yours.',
    },
    {
      q: 'What if I need to cancel?',
      a: 'Cancel anytime with no questions asked. We offer a 14-day money-back guarantee on all paid plans. Your data can be exported or deleted upon request.',
    },
  ];

  const VoicePreview = () => (
    <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white p-6 sm:p-10 rounded-3xl border border-blue-500/20 shadow-2xl relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-r from-blue-600/5 to-purple-600/5" />
      <div className="relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center shadow-lg shadow-blue-500/30">
                <Phone size={28} className={isVoiceActive ? 'animate-pulse' : ''} />
              </div>
              <div>
                <h3 className="text-2xl font-extrabold">Hear It For Yourself</h3>
                <p className="text-blue-400 text-sm font-semibold">
                  Real AI voice — not a recording
                </p>
              </div>
            </div>
            <div className="bg-white/5 rounded-2xl p-5 mb-6 border border-white/10">
              <div className="flex items-start gap-3 mb-3">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <Phone size={14} />
                </div>
                <div>
                  <p className="text-xs text-blue-400 font-semibold mb-1">AI VOICE AGENT — SARAH</p>
                  <p className="text-slate-200 leading-relaxed italic">
                    "Hello! This is Sarah from Riverside Dental. I see you're calling about scheduling an appointment.
                    I'd love to help you find a time that works. Are you looking for a general checkup or something specific?"
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <Users size={14} />
                </div>
                <div>
                  <p className="text-xs text-slate-400 font-semibold mb-1">CALLER</p>
                  <p className="text-slate-300 leading-relaxed italic">
                    "Yeah, I need a cleaning. Do you have anything this Thursday?"
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-4">
              <button
                type="button"
                onClick={handleVoicePreview}
                className="flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 rounded-xl font-bold text-lg transition-all transform hover:scale-105 shadow-xl shadow-blue-600/30"
              >
                {isVoiceActive ? (
                  <Loader className="animate-spin" size={22} />
                ) : (
                  <Play size={22} />
                )}
                {isVoiceActive ? 'Playing...' : 'Play Voice Demo'}
              </button>
            </div>
          </div>
          <div className="space-y-4">
            <div className="text-center mb-4">
              <p className="text-slate-400 text-sm font-semibold uppercase tracking-wider">Why businesses choose our voice</p>
            </div>
            {[
              { label: 'Voice Realism', value: '99%', desc: 'Callers can\'t tell it\'s AI' },
              { label: 'Response Speed', value: '<1s', desc: 'Natural conversation flow' },
              { label: 'Call Handling', value: '24/7', desc: 'Never miss another call' },
              { label: 'Lead Capture', value: '100%', desc: 'Every caller\'s info collected' },
            ].map((stat) => (
              <div key={stat.label} className="flex items-center gap-4 bg-white/5 rounded-xl p-4 border border-white/5 hover:bg-white/10 transition-colors">
                <div className="text-2xl font-extrabold text-blue-400 w-16 text-right">{stat.value}</div>
                <div>
                  <p className="font-bold text-sm">{stat.label}</p>
                  <p className="text-slate-400 text-xs">{stat.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const FixedEmbedChat = () => {
    const [embedHistory, setEmbedHistory] = useState<ChatMessage[]>([
      {
        role: 'model',
        text: "Hello! 👋 I'm your AI assistant. How can I help you today?",
      },
    ]);
    const [embedInput, setEmbedInput] = useState('');
    const [embedTyping, setEmbedTyping] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!scrollRef.current) {
        return;
      }
      const shouldScroll = embedHistory.length > 0 || embedTyping;
      if (shouldScroll) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, [embedHistory.length, embedTyping]);

    return (
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col h-[400px] sm:h-[500px] lg:h-[600px] w-full max-w-md mx-auto">
        <div className="bg-slate-900 p-4 text-white flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center font-bold">
            FE
          </div>
          <div>
            <h4 className="font-bold">Fixed Embed Chatbot</h4>
            <p className="text-xs text-slate-400">Always visible on page</p>
          </div>
        </div>
        <div
          className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50"
          ref={scrollRef}
        >
          {embedHistory.map((msg) => (
            <div
              key={`${msg.role}-${msg.text}`}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] px-4 py-2 rounded-xl text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200'}`}
              >
                {msg.text}
              </div>
            </div>
          ))}
          {embedTyping && (
            <div className="text-slate-400 text-xs italic">Typing...</div>
          )}
        </div>
        <div className="p-4 border-t flex gap-2">
          <input
            value={embedInput}
            onChange={(e) => setEmbedInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleSend(
                  embedInput,
                  embedHistory,
                  setEmbedHistory,
                  setEmbedTyping,
                );
                setEmbedInput('');
              }
            }}
            className="flex-1 bg-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-600 text-slate-900 placeholder:text-slate-600 border border-slate-200"
            placeholder="Test fixed embed..."
          />
          <button
            type="button"
            onClick={() => {
              handleSend(
                embedInput,
                embedHistory,
                setEmbedHistory,
                setEmbedTyping,
              );
              setEmbedInput('');
            }}
            className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition"
          >
            <Send size={18} />
          </button>
        </div>
      </div>
    );
  };

  const faqStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.a,
      },
    })),
  };

  return (
    <>
      <SEO
        title={SEOConfig.home.title}
        description={SEOConfig.home.description}
        keywords={SEOConfig.home.keywords}
        structuredData={faqStructuredData}
      />
      <div className="min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden">
        {/* Floating Hover Widget */}
        <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-4">
          {isHoverOpen && (
            <div className="w-[calc(100vw-3rem)] sm:w-80 h-[400px] sm:h-[500px] max-w-sm bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5">
              <div className="bg-blue-900 p-4 text-white flex justify-between items-center">
                <span className="font-bold">Hover Widget Bot</span>
                <button type="button" onClick={() => setIsHoverOpen(false)}>
                  <X size={20} />
                </button>
              </div>
              <div
                className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50"
                ref={chatScrollRef}
              >
                {chatHistory.map((msg) => (
                  <div
                    key={`${msg.role}-${msg.text}`}
                    className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] px-4 py-2 rounded-xl text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200'}`}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
                {isTyping && (
                  <div className="text-slate-400 text-xs italic">Typing...</div>
                )}
              </div>
              <div className="p-4 border-t flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      handleSend(
                        chatInput,
                        chatHistory,
                        setChatHistory,
                        setIsTyping,
                      );
                      setChatInput('');
                    }
                  }}
                  className="flex-1 bg-white rounded-lg px-4 py-2 text-sm text-slate-900 placeholder:text-slate-600 border border-slate-200"
                  placeholder="Ask me anything..."
                />
                <button
                  type="button"
                  onClick={() => {
                    handleSend(
                      chatInput,
                      chatHistory,
                      setChatHistory,
                      setIsTyping,
                    );
                    setChatInput('');
                  }}
                  className="text-blue-900"
                >
                  <Send size={20} />
                </button>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsHoverOpen(!isHoverOpen)}
            className="w-14 h-14 bg-blue-900 text-white rounded-full shadow-xl flex items-center justify-center hover:scale-110 transition-transform"
          >
            {isHoverOpen ? <X size={24} /> : <MessageSquare size={24} />}
          </button>
        </div>

        {/* Navbar */}
        <nav className="border-b border-slate-200/60 bg-white/95 backdrop-blur-lg sticky top-0 z-40 shadow-sm">
          <div className="mx-auto flex h-14 sm:h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2">
              <Bot className="w-6 h-6 text-blue-700" />
              <span className="font-bold text-lg text-slate-900">
                BuildMyBot
              </span>
            </div>
            <div className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
              <a
                href="#voice"
                className="hover:text-blue-700 transition-colors font-bold text-blue-700"
              >
                Voice Agent
              </a>
              <a
                href="/features"
                className="hover:text-blue-700 transition-colors"
              >
                Features
              </a>
              <a
                href="/pricing"
                className="hover:text-blue-700 transition-colors"
              >
                Pricing
              </a>
              <a href="/faq" className="hover:text-blue-700 transition-colors">
                FAQ
              </a>
              <a
                href="/partner-program"
                onClick={() => onNavigateToPartner?.()}
                className="hover:text-blue-700 transition-colors text-emerald-600 font-semibold"
              >
                Partners
              </a>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onLogin}
                className="bg-blue-700 text-white px-4 sm:px-5 py-2 rounded-xl font-semibold text-sm sm:text-base hover:bg-blue-800 transition-all shadow-lg shadow-blue-700/25 hover:shadow-xl hover:shadow-blue-700/30"
              >
                Get Started
              </button>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 text-slate-600 hover:text-slate-900"
                aria-label="Toggle menu"
              >
                {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </nav>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 top-16 bg-white z-30 animate-in slide-in-from-top-2">
            <div className="flex flex-col p-6 space-y-4">
              <a
                href="#voice"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-lg font-bold text-blue-700 hover:text-blue-800 py-3 border-b border-slate-100"
              >
                🎙️ Voice Agent
              </a>
              <a
                href="/features"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-lg font-medium text-slate-700 hover:text-blue-700 py-3 border-b border-slate-100"
              >
                Features
              </a>
              <a
                href="/pricing"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-lg font-medium text-slate-700 hover:text-blue-700 py-3 border-b border-slate-100"
              >
                Pricing
              </a>
              <a
                href="/faq"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-lg font-medium text-slate-700 hover:text-blue-700 py-3 border-b border-slate-100"
              >
                FAQ
              </a>
              <a
                href="/partner-program"
                onClick={() => {
                  onNavigateToPartner?.();
                  setIsMobileMenuOpen(false);
                }}
                className="text-lg font-medium text-emerald-600 hover:text-emerald-700 py-3 border-b border-slate-100 text-left"
              >
                Partners
              </a>
              <button
                type="button"
                onClick={() => {
                  onLogin();
                  setIsMobileMenuOpen(false);
                }}
                className="w-full bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold hover:bg-blue-800 transition-all mt-4"
              >
                Get Started
              </button>
            </div>
          </div>
        )}

        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 md:py-20 space-y-12 sm:space-y-16 md:space-y-24">
          {/* 1. Hero Section — Chatbot Platform Lead */}
          <section className="text-center space-y-8 pt-6">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold border border-blue-100 shadow-sm">
              <Sparkles size={16} className="text-blue-500" /> Intelligent AI — Deployed In Minutes, Not Months
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-[1.1] tracking-tight px-2">
              The Easiest Way to Deploy
              <br className="hidden sm:block" />{' '}
              <span className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-transparent">AI That Works For You</span>
            </h1>
            <p className="text-lg sm:text-xl font-semibold text-blue-700 mt-2">
              Intelligent AI Chatbots &amp; Voice Agents for Businesses, Firms &amp; Platforms
            </p>
            <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
              Build and deploy smart AI chatbots that learn your business instantly — plus
              a lifelike AI voice receptionist that answers calls and sounds indistinguishable
              from a real person. Affordable, easy to set up, and ready out of the box.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
              <button
                type="button"
                onClick={onLogin}
                className="w-full sm:w-auto bg-blue-700 text-white px-8 py-3 rounded-xl font-bold text-base sm:text-lg hover:bg-blue-800 transition-all shadow-xl shadow-blue-700/30 hover:shadow-2xl hover:shadow-blue-700/40 hover:-translate-y-0.5 flex items-center justify-center gap-3"
              >
                Start Building Free <ArrowRight size={20} />
              </button>
              <a
                href="#voice"
                className="w-full sm:w-auto bg-white text-slate-700 border-2 border-slate-200 px-8 py-3 rounded-xl font-bold text-base sm:text-lg hover:border-blue-300 hover:text-blue-700 transition-all flex items-center justify-center gap-3 shadow-sm"
              >
                <Phone size={20} /> Hear Our Voice Agent
              </a>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 pt-6 text-sm text-slate-500">
              <span className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-500" /> No credit card required
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-500" /> 5-minute setup
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-500" /> Lifelike AI voice included
              </span>
            </div>
          </section>

          {/* Intro Video Section */}
          <section className="text-center space-y-6 sm:space-y-8">
            <div>
              <p className="text-blue-600 font-semibold text-sm uppercase tracking-wider mb-3">
                See How It Works
              </p>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Watch Our Quick Intro
              </h2>
              <p className="text-slate-600 text-lg max-w-2xl mx-auto">
                Learn how BuildMyBot can transform your business in just 2
                minutes
              </p>
            </div>
            <div className="max-w-4xl mx-auto">
              <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl border border-slate-200">
                <iframe
                  src="https://www.youtube.com/embed/H8bIoQiDSNk?rel=0"
                  title="BuildMyBot Introduction"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="absolute inset-0 w-full h-full"
                />
              </div>
            </div>
          </section>

          {/* Voice Agent Showcase — Featured Highlight */}
          <section id="voice" className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 rounded-2xl sm:rounded-3xl p-6 sm:p-10 md:p-16 text-white shadow-2xl overflow-hidden">
            <div className="absolute inset-0 opacity-5">
              <div className="absolute top-10 left-10 w-72 h-72 bg-blue-400 rounded-full blur-3xl" />
              <div className="absolute bottom-10 right-10 w-96 h-96 bg-indigo-500 rounded-full blur-3xl" />
            </div>
            <div className="relative z-10">
              <div className="text-center mb-10 sm:mb-14">
                <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-400/30 text-blue-300 px-4 py-2 rounded-full text-sm font-bold mb-6">
                  <Mic size={16} /> ⭐ Featured: AI Voice Receptionist
                </div>
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-4 leading-tight">
                  Plus a Lifelike AI Voice Agent
                  <br className="hidden sm:block" />{' '}
                  <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">95% Ready Out of the Box</span>
                </h2>
                <p className="text-slate-300 text-lg max-w-3xl mx-auto leading-relaxed">
                  Every BuildMyBot account includes access to our AI voice receptionist — powered by the most
                  advanced neural voice synthesis available. Your callers hear a warm, natural human conversation.
                  It answers calls, qualifies leads, books appointments, and transfers when needed. No scripts. No robots.
                </p>
              </div>

              <VoicePreview />

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mt-10 sm:mt-14">
                <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 text-center hover:bg-white/10 transition-colors">
                  <Mic className="mx-auto mb-4 text-blue-400" size={32} />
                  <h4 className="font-bold text-lg mb-2">Natural Inflection</h4>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Real pauses, emphasis, and emotion — not monotone text-to-speech
                  </p>
                </div>
                <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 text-center hover:bg-white/10 transition-colors">
                  <Zap className="mx-auto mb-4 text-amber-400" size={32} />
                  <h4 className="font-bold text-lg mb-2">Sub-Second Response</h4>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    No awkward delays — responds as fast as a real person in conversation
                  </p>
                </div>
                <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 text-center hover:bg-white/10 transition-colors">
                  <Phone className="mx-auto mb-4 text-emerald-400" size={32} />
                  <h4 className="font-bold text-lg mb-2">24/7 Live Calls</h4>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Answers every call instantly — 3am Sunday or noon Monday, no difference
                  </p>
                </div>
                <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 border border-white/10 text-center hover:bg-white/10 transition-colors">
                  <Target className="mx-auto mb-4 text-purple-400" size={32} />
                  <h4 className="font-bold text-lg mb-2">Smart Qualification</h4>
                  <p className="text-slate-400 text-sm leading-relaxed">
                    Asks the right questions, captures info, and books appointments automatically
                  </p>
                </div>
              </div>

              <div className="mt-10 sm:mt-14 bg-white/5 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-white/10">
                <h3 className="text-xl sm:text-2xl font-bold mb-6 text-center">What Your Voice Agent Can Do</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { icon: PhoneCall, text: 'Answer inbound calls and greet callers by context' },
                    { icon: Users, text: 'Qualify leads with custom intake questions' },
                    { icon: Clock, text: 'Book appointments directly into your calendar' },
                    { icon: RefreshCcw, text: 'Transfer calls to your team when needed' },
                    { icon: Bell, text: 'Send instant notifications for hot leads' },
                    { icon: Shield, text: 'Handle objections with trained responses' },
                  ].map((item) => (
                    <div key={item.text} className="flex items-start gap-3 bg-white/5 rounded-xl p-4 border border-white/5">
                      <item.icon size={20} className="text-blue-400 shrink-0 mt-0.5" />
                      <span className="text-sm text-slate-200">{item.text}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="text-center mt-10">
                <button
                  type="button"
                  onClick={onLogin}
                  className="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/30 hover:shadow-2xl hover:-translate-y-0.5 flex items-center gap-3 mx-auto"
                >
                  Get Started — Voice Agent Included <ArrowRight size={20} />
                </button>
              </div>
            </div>
          </section>

          {/* 2. Dashboard Mockup */}
          <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 rounded-2xl sm:rounded-3xl p-5 sm:p-8 md:p-12 text-white shadow-2xl">
            <div className="text-center mb-8 sm:mb-12">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-3">
                Your Command Center
              </h2>
              <p className="text-slate-400 text-lg">
                Real-time insights at your fingertips
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 text-center border border-white/10 hover:bg-white/10 transition-colors">
                <MessageSquare
                  className="mx-auto mb-4 text-blue-400"
                  size={36}
                />
                <div className="text-3xl sm:text-4xl font-bold">1,240</div>
                <div className="text-slate-400 text-sm mt-1">Active Chats</div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 text-center border border-white/10 hover:bg-white/10 transition-colors">
                <Flame className="mx-auto mb-4 text-orange-400" size={36} />
                <div className="text-3xl sm:text-4xl font-bold">328</div>
                <div className="text-slate-400 text-sm mt-1">Hot Leads</div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 text-center border border-white/10 hover:bg-white/10 transition-colors">
                <Clock className="mx-auto mb-4 text-emerald-400" size={36} />
                <div className="text-3xl sm:text-4xl font-bold">0.8s</div>
                <div className="text-slate-400 text-sm mt-1">Response Time</div>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-2xl p-6 text-center border border-white/10 hover:bg-white/10 transition-colors">
                <DollarSign className="mx-auto mb-4 text-green-400" size={36} />
                <div className="text-3xl sm:text-4xl font-bold">$4,200</div>
                <div className="text-slate-400 text-sm mt-1">Revenue Today</div>
              </div>
            </div>
          </section>

          {/* 4. Setup Steps */}
          <section id="features" className="space-y-8 sm:space-y-12">
            <div className="text-center">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
                Go Live in 5 Minutes
              </h2>
              <p className="text-slate-600 text-lg">
                No coding required. No technical expertise needed.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-6 sm:gap-8">
              {setupSteps.map((step, i) => (
                <div key={step.title} className="text-center">
                  <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4 relative">
                    <step.icon className="text-blue-900" size={28} />
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-blue-900 text-white rounded-full flex items-center justify-center text-sm font-bold">
                      {i + 1}
                    </div>
                  </div>
                  <h3 className="font-bold text-lg mb-2">{step.title}</h3>
                  <p className="text-slate-600 text-sm">{step.description}</p>
                </div>
              ))}
            </div>
          </section>

          {/* 5. ROI Calculator */}
          <section className="bg-white rounded-2xl sm:rounded-3xl shadow-xl p-5 sm:p-8 md:p-10 border border-slate-200">
            <div className="text-center mb-6 sm:mb-10">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
                Calculate Your ROI
              </h2>
              <p className="text-slate-600 text-lg">
                See how much more revenue you could generate
              </p>
            </div>
            <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
              <div className="space-y-8 max-w-xl">
                <div>
                  <label
                    htmlFor="roi-monthly-leads"
                    className="block text-sm font-medium text-slate-700 mb-2"
                  >
                    Monthly Website Leads
                  </label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <input
                      id="roi-monthly-leads"
                      type="number"
                      inputMode="numeric"
                      min="1"
                      max="1000"
                      step="1"
                      value={monthlyLeads}
                      onChange={(e) => handleMonthlyLeadsChange(e.target.value)}
                      className="w-full sm:w-40 border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-xs text-slate-400">
                      Min 1, max 1,000 leads
                    </span>
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="roi-avg-deal"
                    className="block text-sm font-medium text-slate-700 mb-2"
                  >
                    Average Deal Value
                  </label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="relative w-full sm:w-44">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
                        $
                      </span>
                      <input
                        id="roi-avg-deal"
                        type="number"
                        inputMode="numeric"
                        min="100"
                        max="50000"
                        step="100"
                        value={avgDealValue}
                        onChange={(e) =>
                          handleAvgDealValueChange(e.target.value)
                        }
                        className="w-full border border-slate-200 rounded-lg pl-7 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <span className="text-xs text-slate-400">
                      Min $100, max $50,000
                    </span>
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="roi-current-conversion"
                    className="block text-sm font-medium text-slate-700 mb-2"
                  >
                    Current Conversion Rate
                  </label>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="relative w-full sm:w-32">
                      <input
                        id="roi-current-conversion"
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max="50"
                        step="1"
                        value={currentConversion}
                        onChange={(e) =>
                          handleCurrentConversionChange(e.target.value)
                        }
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                        %
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      Min 1%, max 50%
                    </span>
                  </div>
                </div>
              </div>
              <div className="bg-gradient-to-br from-blue-900 to-blue-800 rounded-2xl p-8 text-white">
                <h3 className="text-xl font-bold mb-6">
                  Your Projected Results
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-4 border-b border-blue-700">
                    <span className="text-blue-200">
                      Current Monthly Revenue
                    </span>
                    <span className="text-2xl font-bold">
                      ${currentRevenue.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-4 border-b border-blue-700">
                    <span className="text-blue-200">
                      Projected w/ BuildMyBot
                    </span>
                    <span className="text-2xl font-bold text-emerald-400">
                      ${projectedRevenue.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-2">
                    <span className="text-xl font-medium">
                      Additional Revenue
                    </span>
                    <span className="text-3xl font-extrabold text-emerald-400">
                      +${revenueIncrease.toLocaleString()}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onLogin}
                  className="w-full mt-6 bg-white text-blue-900 py-3 rounded-xl font-bold hover:bg-blue-50 transition"
                >
                  Start Capturing More Revenue
                </button>
              </div>
            </div>
          </section>

          {/* 6. Problem/Solution Comparison */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            <div className="bg-red-50 border-2 border-red-200 rounded-2xl p-8 overflow-hidden">
              <div className="flex items-center gap-3 mb-6">
                <XCircle className="text-red-500" size={32} />
                <h3 className="text-2xl font-bold text-red-900">
                  WITHOUT BuildMyBot
                </h3>
              </div>
              <ul className="space-y-4">
                {[
                  'Missed calls go straight to voicemail — and never call back',
                  'After-hours callers hang up and call your competitor',
                  'Hiring receptionists costs $3,000+/month with turnover',
                  'Leads wait hours or days for a response',
                  'Staff overwhelmed with repetitive questions',
                  'No idea how many leads you\'re losing every week',
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-red-800 leading-relaxed"
                  >
                    <XCircle size={20} className="shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-8 overflow-hidden">
              <div className="flex items-center gap-3 mb-6">
                <CheckCircle className="text-emerald-500" size={32} />
                <h3 className="text-2xl font-bold text-emerald-900">
                  WITH BuildMyBot
                </h3>
              </div>
              <ul className="space-y-4">
                {[
                  'AI voice agent answers every call — sounds 100% human',
                  'AI chatbot engages every website visitor instantly',
                  'Every lead qualified and captured automatically',
                  'Appointments booked directly into your calendar',
                  'Fraction of the cost of a human receptionist',
                  'Never lose a lead to competition again',
                ].map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-3 text-emerald-800 leading-relaxed"
                  >
                    <CheckCircle size={20} className="shrink-0 mt-0.5" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          {/* 7. Chatbot + Voice — Two Ways to Connect (replaced old voice-only section) */}
          <section className="space-y-8 sm:space-y-12">
            <div className="text-center">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
                Two Powerful AI Channels
              </h2>
              <p className="text-slate-600 text-lg max-w-2xl mx-auto">
                Text and voice working together — your AI chatbot handles website visitors
                while your voice agent answers every phone call.
              </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
              <div className="bg-white rounded-2xl p-8 border-2 border-slate-200 shadow-lg">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <MessageSquare size={20} className="text-blue-700" />
                  </div>
                  <h3 className="text-xl font-bold">AI Chatbot</h3>
                </div>
                <p className="text-slate-600 mb-4">Embed on any website in seconds. Captures leads, answers questions, and books meetings — while you focus on closing deals.</p>
                <ul className="space-y-2">
                  {['Drag-and-drop builder — no code', 'Learns from your website automatically', 'Custom personality and branding', 'Lead capture and CRM integration'].map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-slate-700">
                      <CheckCircle size={16} className="text-emerald-500 shrink-0" /> {item}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-gradient-to-br from-slate-900 to-blue-900 rounded-2xl p-8 text-white border-2 border-blue-700 shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <Phone size={100} />
                </div>
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center animate-pulse">
                      <PhoneCall size={20} className="text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-bold">AI Voice Agent</h3>
                      <span className="text-xs text-blue-300 font-semibold uppercase tracking-wider">⭐ Flagship Feature</span>
                    </div>
                  </div>
                  <p className="text-blue-100 mb-4">Handles real phone calls with voices so natural your callers won't know it's AI. Books appointments, qualifies leads, transfers calls — all on autopilot.</p>
                  <ul className="space-y-2">
                    {['Ultra-realistic human voice synthesis', 'Answers calls 24/7 — never on hold', 'Books appointments and qualifies leads', 'Transfers to your team when needed'].map((item) => (
                      <li key={item} className="flex items-center gap-2 text-sm text-blue-100">
                        <CheckCircle size={16} className="text-emerald-400 shrink-0" /> {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </section>

          {/* 8. Industries Section */}
          <section className="space-y-8 sm:space-y-12">
            <div className="text-center">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
                Built for Every Industry
              </h2>
              <p className="text-slate-600 text-lg">
                Pre-trained templates for your specific business needs
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {industries.map((ind) => (
                <div
                  key={ind.name}
                  className="bg-white p-4 sm:p-6 rounded-xl border border-slate-200 hover:border-blue-500 hover:shadow-lg transition-all text-center group cursor-pointer overflow-hidden"
                >
                  <ind.icon
                    className="mx-auto mb-3 text-slate-400 group-hover:text-blue-900 transition"
                    size={32}
                  />
                  <h4 className="font-bold text-sm sm:text-base mb-1">
                    {ind.name}
                  </h4>
                  <p className="text-slate-500 text-xs leading-relaxed">
                    {ind.desc}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Partner/Reseller Teaser 1 */}
          <section className="relative bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 rounded-2xl sm:rounded-3xl p-6 sm:p-10 md:p-16 text-white overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />
            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
              <div>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-sm font-bold mb-6">
                  <Briefcase size={16} /> Sales Agent + Partner Program
                </div>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold mb-4 sm:mb-6 leading-tight">
                  Start Your Own AI Agency.
                  <br />
                  <span className="text-emerald-400">
                    Keep Up to 50% Revenue.
                  </span>
                </h2>
                <p className="text-slate-300 text-lg mb-8 leading-relaxed">
                  Start as a sales agent or unlock partner access immediately.
                  Partners can white-label under their own branding and domain
                  or keep operating as BuildMyBot.App while we handle the
                  infrastructure.
                </p>
                <ul className="space-y-3 mb-8">
                  <li className="flex items-center gap-3 text-slate-200">
                    <CheckCircle size={20} className="text-emerald-400" /> Sales
                    agents earn 20%-50% recurring commissions as they grow
                  </li>
                  <li className="flex items-center gap-3 text-slate-200">
                    <CheckCircle size={20} className="text-emerald-400" />{' '}
                    Partner access is $499/mo for immediate 50% on new accounts
                  </li>
                  <li className="flex items-center gap-3 text-slate-200">
                    <CheckCircle size={20} className="text-emerald-400" /> Your
                    Partner status at 251+ active accounts or with the $499/mo
                    plan
                  </li>
                  <li className="flex items-center gap-3 text-slate-200">
                    <CheckCircle size={20} className="text-emerald-400" />{' '}
                    Optional white-label branding or stay BuildMyBot.App
                  </li>
                </ul>
                <p className="text-xs text-emerald-200/80">
                  50% partner split applies to new accounts created after
                  enrollment. Existing accounts keep their current rate.
                </p>
                <a
                  href="/partner-program"
                  className="bg-emerald-500 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/30 flex items-center gap-3"
                >
                  Learn About Partnership <ArrowRight size={20} />
                </a>
              </div>
              <div className="bg-white/5 backdrop-blur-sm rounded-xl sm:rounded-2xl p-4 sm:p-8 border border-white/10">
                <div className="text-center mb-4 sm:mb-6">
                  <p className="text-slate-400 text-sm mb-2">
                    Example: 50 Clients at $99/mo
                  </p>
                  <div className="text-3xl sm:text-4xl md:text-5xl font-extrabold text-emerald-400 mb-1">
                    $2,475
                  </div>
                  <p className="text-slate-300">Your Monthly Income</p>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3 text-center">
                  <div className="bg-white/5 rounded-lg p-2 sm:p-3">
                    <div className="text-base sm:text-lg font-bold text-white">
                      20%
                    </div>
                    <div className="text-[10px] sm:text-xs text-slate-400">
                      Bronze
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2 sm:p-3">
                    <div className="text-base sm:text-lg font-bold text-white">
                      30%
                    </div>
                    <div className="text-[10px] sm:text-xs text-slate-400">
                      Silver
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2 sm:p-3">
                    <div className="text-base sm:text-lg font-bold text-white">
                      40%
                    </div>
                    <div className="text-[10px] sm:text-xs text-slate-400">
                      Gold
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-2 sm:p-3">
                    <div className="text-base sm:text-lg font-bold text-white">
                      50%
                    </div>
                    <div className="text-[10px] sm:text-xs text-slate-400">
                      Platinum
                    </div>
                  </div>
                  <div className="bg-amber-500/20 rounded-lg p-2 sm:p-3 border border-amber-500/30 col-span-2 sm:col-span-1">
                    <div className="text-base sm:text-lg font-bold text-amber-400">
                      50%
                    </div>
                    <div className="text-[10px] sm:text-xs text-amber-300">
                      Partner Access
                    </div>
                    <div className="text-[8px] sm:text-[10px] text-amber-400/70">
                      $499/mo new accounts
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 9. Live Demo Section */}
          <section id="demo" className="space-y-8 sm:space-y-12">
            <div className="text-center">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
                Try It Yourself
              </h2>
              <p className="text-slate-600 text-lg">
                Experience the power of AI in real-time
              </p>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
              <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg border border-slate-200 p-5 sm:p-8 overflow-hidden">
                <div className="flex items-center gap-3 mb-4 sm:mb-6">
                  <Globe className="text-blue-900 shrink-0" size={24} />
                  <h3 className="text-lg sm:text-xl font-bold">
                    Website URL Trainer
                  </h3>
                </div>
                <p className="text-slate-600 mb-4 sm:mb-6 text-sm sm:text-base">
                  Enter any website URL and watch our AI instantly learn about
                  the business.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                  <input
                    type="text"
                    value={demoUrl}
                    onChange={(e) => setDemoUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="flex-1 border border-slate-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base text-slate-900 placeholder:text-slate-600 bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleDemoScrape}
                    disabled={demoLoading}
                    className="bg-blue-900 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-950 transition disabled:opacity-50 shrink-0"
                  >
                    {demoLoading ? (
                      <Loader className="animate-spin" size={20} />
                    ) : (
                      <Search size={20} />
                    )}
                  </button>
                </div>
                {demoResult && (
                  <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 max-h-48 overflow-y-auto">
                    {demoResult}
                  </div>
                )}
              </div>

              <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg border border-slate-200 p-5 sm:p-8 overflow-hidden">
                <div className="flex items-center gap-3 mb-4 sm:mb-6">
                  <Megaphone className="text-blue-900 shrink-0" size={24} />
                  <h3 className="text-lg sm:text-xl font-bold">
                    Viral Post Creator
                  </h3>
                </div>
                <p className="text-slate-600 mb-4 sm:mb-6 text-sm sm:text-base">
                  Generate engaging social media content instantly with AI.
                </p>
                <div className="flex flex-col sm:flex-row gap-2 mb-4">
                  <input
                    type="text"
                    value={marketingTopic}
                    onChange={(e) => setMarketingTopic(e.target.value)}
                    placeholder="Enter your topic or product..."
                    className="flex-1 border border-slate-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base text-slate-900 placeholder:text-slate-600 bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleMarketingGenerate}
                    disabled={marketingLoading}
                    className="bg-blue-900 text-white px-6 py-3 rounded-lg font-bold hover:bg-blue-950 transition disabled:opacity-50 shrink-0"
                  >
                    {marketingLoading ? (
                      <Loader className="animate-spin" size={20} />
                    ) : (
                      <Sparkles size={20} />
                    )}
                  </button>
                </div>
                {marketingResult && (
                  <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 max-h-48 overflow-y-auto">
                    {marketingResult}
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Both Chat Types Preview */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-20 items-center">
            <div className="space-y-6">
              <h2 className="text-3xl font-bold">Two Ways to Connect</h2>
              <p className="text-slate-600 text-lg">
                Choose between a discreet floating hover widget or a powerful
                fixed embed that stays as part of your page's content.
              </p>
              <ul className="space-y-4">
                <li className="flex items-center gap-3 text-slate-700">
                  <CheckCircle className="text-emerald-500" size={20} />{' '}
                  Customizable hover widgets for lead gen
                </li>
                <li className="flex items-center gap-3 text-slate-700">
                  <CheckCircle className="text-emerald-500" size={20} /> Fixed
                  embeds for deep knowledge base search
                </li>
                <li className="flex items-center gap-3 text-slate-700">
                  <CheckCircle className="text-emerald-500" size={20} /> Shared
                  knowledge across all interfaces
                </li>
              </ul>
            </div>
            <FixedEmbedChat />
          </section>

          {/* 10. Pricing Section */}
          <section id="pricing" className="space-y-8 sm:space-y-12">
            <div className="text-center">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
                Simple, Transparent Pricing
              </h2>
              <p className="text-slate-600 text-lg">
                Start free, upgrade as you grow. No hidden fees.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 sm:gap-6">
              {Object.entries(PLANS).map(([key, plan]) => {
                const isPopular = key === 'PROFESSIONAL';
                return (
                  <div
                    key={key}
                    className={`relative rounded-2xl p-6 border-2 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_24px_55px_rgba(15,23,42,0.18)] ${isPopular ? 'border-blue-900 ring-2 ring-blue-900/20' : 'border-slate-200 ring-1 ring-slate-200/60'}`}
                  >
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-900 text-white text-xs font-bold px-3 py-1 rounded-full">
                        MOST POPULAR
                      </div>
                    )}
                    <h3 className="font-bold text-lg mb-1">{plan.name}</h3>
                    <div className="mb-4">
                      <div
                        className={`inline-flex items-baseline gap-2 rounded-xl border-2 px-4 py-3 ${isPopular ? 'border-blue-900 bg-blue-50 text-blue-900 shadow-[0_12px_25px_rgba(15,23,42,0.18)]' : 'border-slate-200 bg-slate-50 text-slate-900 shadow-sm'}`}
                      >
                        <span className="text-4xl font-extrabold tracking-tight">
                          ${plan.price}
                        </span>
                        {plan.price > 0 && (
                          <span
                            className={`text-sm font-semibold ${isPopular ? 'text-blue-900/70' : 'text-slate-600'}`}
                          >
                            /mo
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-sm text-slate-600 mb-4">
                      {plan.bots >= 9999 ? 'Unlimited' : plan.bots} bot
                      {plan.bots !== 1 ? 's' : ''} -{' '}
                      {plan.conversations.toLocaleString()} convos
                    </div>
                    <ul className="space-y-2 mb-6">
                      {plan.features.slice(0, 4).map((f) => (
                        <li
                          key={f}
                          className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                        >
                          <CheckCircle
                            size={16}
                            className="text-emerald-500 shrink-0 mt-0.5"
                          />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={onLogin}
                      className={`w-full py-2 rounded-lg font-bold transition ${isPopular ? 'bg-blue-900 text-white hover:bg-blue-950' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                    >
                      {plan.price === 0 ? 'Start Free' : 'Get Started'}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              <div className="bg-white rounded-2xl border-2 border-slate-200 p-6 shadow-[0_15px_30px_rgba(15,23,42,0.12)] transition hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(15,23,42,0.16)]">
                <h3 className="font-bold text-slate-900 mb-3">
                  Voice Agent Pricing
                </h3>
                <ul className="space-y-2 text-sm text-slate-600">
                  {VOICE_AGENT_PRICING.map((tier) => (
                    <li
                      key={tier.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm"
                    >
                      <span>{tier.name}</span>
                      <span className="font-semibold text-slate-900">
                        ${tier.price}/mo -{' '}
                        {tier.minutesIncluded.toLocaleString()} min
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded-2xl border-2 border-slate-200 p-6 shadow-[0_15px_30px_rgba(15,23,42,0.12)] transition hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(15,23,42,0.16)]">
                <h3 className="font-bold text-slate-900 mb-3">
                  Expert Setup Services
                </h3>
                <ul className="space-y-3 text-sm text-slate-600">
                  {EXPERT_SETUP_SERVICES.map((service) => (
                    <li
                      key={service.id}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-slate-800">
                          {service.name}
                        </span>
                        <span className="font-semibold text-slate-900">
                          ${service.price}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 mt-1">
                        {service.deliveryDays} days -{' '}
                        {service.highlights.join(' - ')}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="bg-white rounded-2xl border-2 border-slate-200 p-6 shadow-[0_15px_30px_rgba(15,23,42,0.12)] transition hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(15,23,42,0.16)]">
                <h3 className="font-bold text-slate-900 mb-3">
                  Template Marketplace
                </h3>
                <ul className="space-y-2 text-sm text-slate-600">
                  {TEMPLATE_MARKETPLACE_PRICING.map((tier) => (
                    <li
                      key={tier.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 shadow-sm"
                    >
                      <span>{tier.name}</span>
                      <span className="font-semibold text-slate-900">
                        {tier.price === 0 ? 'Free' : `$${tier.price}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="text-xs text-slate-500 text-center">
              Voice plans are billed monthly. Setup services and template packs
              are one-time purchases.
            </p>
          </section>

          {/* 11. FAQ Section */}
          <section id="faq" className="space-y-8 sm:space-y-12">
            <div className="text-center">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
                Frequently Asked Questions
              </h2>
              <p className="text-slate-600 text-lg">
                Everything you need to know about BuildMyBot
              </p>
            </div>
            <div className="max-w-3xl mx-auto space-y-3 sm:space-y-4">
              {faqs.map((faq, i) => (
                <div
                  key={faq.q}
                  className="bg-white rounded-xl border border-slate-200 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between p-4 sm:p-6 text-left hover:bg-slate-50 transition gap-4"
                  >
                    <span className="font-bold text-base sm:text-lg text-slate-900">
                      {faq.q}
                    </span>
                    {openFaq === i ? (
                      <ChevronUp
                        size={20}
                        className="shrink-0 text-slate-700"
                      />
                    ) : (
                      <ChevronDown
                        size={20}
                        className="shrink-0 text-slate-700"
                      />
                    )}
                  </button>
                  {openFaq === i && (
                    <div className="px-4 sm:px-6 pb-4 sm:pb-6 text-slate-600 leading-relaxed break-words text-sm sm:text-base">
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* 12. Final CTA */}
          <section className="bg-gradient-to-br from-blue-900 to-blue-800 rounded-2xl sm:rounded-3xl p-6 sm:p-10 md:p-16 text-white text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 left-1/4 w-64 h-64 bg-blue-400 rounded-full blur-3xl" />
              <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-indigo-400 rounded-full blur-3xl" />
            </div>
            <div className="relative z-10">
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold mb-4 sm:mb-6">
                Deploy Intelligent AI For Your Business
                <br className="hidden sm:block" /> In Minutes — Not Months
              </h2>
              <p className="text-xl text-blue-200 mb-8 max-w-3xl mx-auto">
                AI chatbots that learn your business instantly, plus a lifelike voice receptionist
                that sounds indistinguishable from a real person. Easy, affordable, and ready today.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <button
                  type="button"
                  onClick={onLogin}
                  className="w-full sm:w-auto bg-white text-blue-900 px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-50 transition flex items-center justify-center gap-2 shadow-xl"
                >
                  Start Building Free <ArrowRight size={20} />
                </button>
                <a
                  href="#voice"
                  className="w-full sm:w-auto border-2 border-white text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-white/10 transition flex items-center justify-center gap-2"
                >
                  <Phone size={20} /> Hear The Voice Agent
                </a>
              </div>
              <div className="mt-8 flex flex-wrap justify-center gap-6 text-blue-200 text-sm">
                <span className="flex items-center gap-2">
                  <CheckCircle size={16} /> No credit card required
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle size={16} /> Ultra-realistic voice quality
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle size={16} /> Live in 5 minutes
                </span>
              </div>
            </div>
          </section>
        </main>

        <footer className="bg-slate-900 text-slate-400 py-12 sm:py-20 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 sm:gap-12">
            <div>
              <div className="flex items-center gap-2 text-white font-bold text-xl mb-4">
                <Bot size={24} /> BuildMyBot
              </div>
              <p className="text-sm">
                Intelligent AI chatbots and lifelike voice agents for businesses,
                firms, and platforms. Deploy in minutes.
              </p>
            </div>
            <div>
              <h4 className="text-white font-bold mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="/features" className="hover:text-white transition">
                    Features
                  </a>
                </li>
                <li>
                  <a href="/pricing" className="hover:text-white transition">
                    Pricing
                  </a>
                </li>
                <li>
                  <a href="/demo" className="hover:text-white transition">
                    Demo
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="/about" className="hover:text-white transition">
                    About
                  </a>
                </li>
                <li>
                  <a href="/blog" className="hover:text-white transition">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="/careers" className="hover:text-white transition">
                    Careers
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-bold mb-4">Support</h4>
              <ul className="space-y-2 text-sm">
                <li>
                  <a href="/faq" className="hover:text-white transition">
                    FAQ
                  </a>
                </li>
                <li>
                  <a href="/contact" className="hover:text-white transition">
                    Contact
                  </a>
                </li>
                <li>
                  <a href="/privacy" className="hover:text-white transition">
                    Privacy Policy
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-slate-800 text-center text-sm">
            © 2026 BuildMyBot AI. All rights reserved.
          </div>
        </footer>
      </div>
    </>
  );
};
