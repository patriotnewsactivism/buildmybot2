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
  ANNUAL_PLAN_PRICING,
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
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  // Demo state (kept for future use)
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
      title: 'Paste Your Website URL',
      description:
        'Our AI reads your entire site and learns your business, services, and FAQs in seconds.',
    },
    {
      icon: Bot,
      title: 'Customize & Brand',
      description:
        'Set your colors, personality, voice tone, and lead capture rules. No code needed.',
    },
    {
      icon: TrendingUp,
      title: 'Go Live & Capture Leads',
      description:
        'Embed on your website with one line of code. Turn on voice. Start converting visitors instantly.',
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
      q: 'How much does BuildMyBot cost?',
      a: 'Plans start at $29/month for Starter (750 conversations). Professional is $99/month with 5 bots and 5,000 conversations. Save 17% with annual billing — that\'s 2 months free. There\'s also a free tier with 60 conversations so you can try it risk-free.',
    },
    {
      q: 'How realistic does the voice agent actually sound?',
      a: "This is our biggest differentiator. We use Cartesia's cutting-edge neural voice synthesis — the same caliber of technology used in Hollywood productions. In real-world calls, the vast majority of callers cannot tell they're speaking with AI. It has natural inflection, appropriate pauses, and emotional warmth. It's not the robotic voice you've heard from other services.",
    },
    {
      q: 'How quickly can I get started?',
      a: "Most businesses have their chatbot live in under 5 minutes. Paste your website URL, the AI learns your business instantly, customize your brand colors and personality, and you're live. Voice agents take just a few extra minutes to configure. No technical expertise required.",
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
      q: 'How is this different from other AI chatbot/phone services?',
      a: "Most AI solutions use basic text-to-speech that sounds obviously robotic. BuildMyBot uses Cartesia's state-of-the-art voice synthesis with sub-second latency, natural breathing patterns, and human-like inflection. Combined with advanced AI understanding, our voice agents have real conversations — not scripted responses. Plus you get both chatbot AND voice agent in one platform.",
    },
    {
      q: 'Is there a free trial?',
      a: 'Yes! Our free tier gives you 1 bot with 60 conversations per month — no credit card required. Upgrade anytime. Paid plans come with a 14-day money-back guarantee.',
    },
  ];

  // Plans to highlight on the landing page (3 core tiers)
  const highlightedPlans = [
    { key: PlanType.STARTER, plan: PLANS[PlanType.STARTER] },
    { key: PlanType.PROFESSIONAL, plan: PLANS[PlanType.PROFESSIONAL] },
    { key: PlanType.EXECUTIVE, plan: PLANS[PlanType.EXECUTIVE] },
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
        text: "Hello! 👋 I'm your AI assistant. Ask me anything about BuildMyBot — pricing, features, how it works. Try it!",
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
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col h-[400px] sm:h-[500px] w-full max-w-md mx-auto">
        <div className="bg-slate-900 p-4 text-white flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center font-bold">
            <Bot size={20} />
          </div>
          <div>
            <h4 className="font-bold">BuildMyBot Demo</h4>
            <p className="text-xs text-emerald-400 flex items-center gap-1">
              <span className="w-2 h-2 bg-emerald-400 rounded-full inline-block animate-pulse" /> Live — Try it now
            </p>
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
            placeholder="Type a message..."
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
                <span className="font-bold">Chat with BuildMyBot</span>
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
              <a href="#how-it-works" className="hover:text-blue-700 transition-colors">
                How It Works
              </a>
              <a
                href="#voice"
                className="hover:text-blue-700 transition-colors font-bold text-blue-700"
              >
                Voice Agent
              </a>
              <a
                href="#pricing"
                className="hover:text-blue-700 transition-colors"
              >
                Pricing
              </a>
              <a href="#faq" className="hover:text-blue-700 transition-colors">
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
                Start Free
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
                href="#how-it-works"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-lg font-medium text-slate-700 hover:text-blue-700 py-3 border-b border-slate-100"
              >
                How It Works
              </a>
              <a
                href="#voice"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-lg font-bold text-blue-700 hover:text-blue-800 py-3 border-b border-slate-100"
              >
                🎙️ Voice Agent
              </a>
              <a
                href="#pricing"
                onClick={() => setIsMobileMenuOpen(false)}
                className="text-lg font-medium text-slate-700 hover:text-blue-700 py-3 border-b border-slate-100"
              >
                Pricing
              </a>
              <a
                href="#faq"
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
                Start Free
              </button>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════ MAIN CONTENT ═══════════════════════════════ */}
        <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 md:py-20 space-y-12 sm:space-y-16 md:space-y-24">

          {/* ──── 1. HERO — Pain-driven, specific outcome ──── */}
          <section className="text-center space-y-8 pt-6">
            <div className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-50 to-orange-50 text-amber-700 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold border border-amber-200 shadow-sm">
              <Zap size={16} className="text-amber-500" /> 🚀 Launch Special — Lock In These Prices Forever
            </div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold text-slate-900 leading-[1.1] tracking-tight px-2">
              Your Next Employee Works 24/7,
              <br className="hidden sm:block" />{' '}
              Never Calls In Sick,{' '}
              <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-blue-700 to-indigo-600 bg-clip-text text-transparent">And Costs Less Than $1/Day</span>
            </h1>
            <p className="text-base sm:text-lg md:text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
              An AI chatbot and voice receptionist that sounds <strong>indistinguishable from a real person</strong>.
              It answers every call, engages every website visitor, captures every lead, and books
              appointments — automatically, while you sleep.
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
              <button
                type="button"
                onClick={onLogin}
                className="w-full sm:w-auto bg-blue-700 text-white px-8 py-4 rounded-xl font-bold text-base sm:text-lg hover:bg-blue-800 transition-all shadow-xl shadow-blue-700/30 hover:shadow-2xl hover:shadow-blue-700/40 hover:-translate-y-0.5 flex items-center justify-center gap-3"
              >
                Start Capturing Leads — Free <ArrowRight size={20} />
              </button>
              <a
                href="#voice"
                className="w-full sm:w-auto bg-white text-slate-700 border-2 border-slate-200 px-8 py-4 rounded-xl font-bold text-base sm:text-lg hover:border-blue-300 hover:text-blue-700 transition-all flex items-center justify-center gap-3 shadow-sm"
              >
                <Phone size={20} /> Hear The AI Voice
              </a>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 pt-4 text-sm text-slate-500">
              <span className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-500" /> No credit card required
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-500" /> Live in 5 minutes
              </span>
              <span className="flex items-center gap-2">
                <CheckCircle size={16} className="text-emerald-500" /> Cancel anytime
              </span>
            </div>
          </section>

          {/* ──── 2. SOCIAL PROOF / TRUST BAR ──── */}
          <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 text-center">
              <div>
                <div className="text-2xl sm:text-3xl font-extrabold text-blue-700">99%</div>
                <p className="text-sm text-slate-500 mt-1">Voice Realism Score</p>
                <p className="text-xs text-slate-400">Callers can't tell it's AI</p>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-extrabold text-blue-700">&lt;1s</div>
                <p className="text-sm text-slate-500 mt-1">Response Time</p>
                <p className="text-xs text-slate-400">Faster than any human</p>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-extrabold text-blue-700">12+</div>
                <p className="text-sm text-slate-500 mt-1">Industry Templates</p>
                <p className="text-xs text-slate-400">Pre-trained for your niche</p>
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-extrabold text-blue-700">5 min</div>
                <p className="text-sm text-slate-500 mt-1">Setup Time</p>
                <p className="text-xs text-slate-400">No code. No developers.</p>
              </div>
            </div>
            <div className="mt-6 pt-6 border-t border-slate-100 flex flex-wrap justify-center gap-4 sm:gap-8 text-xs text-slate-400">
              <span className="flex items-center gap-2">
                <Sparkles size={14} className="text-blue-500" /> Powered by GPT-4o
              </span>
              <span className="flex items-center gap-2">
                <Mic size={14} className="text-purple-500" /> Cartesia Neural Voice
              </span>
              <span className="flex items-center gap-2">
                <Shield size={14} className="text-emerald-500" /> Enterprise-grade Security
              </span>
              <span className="flex items-center gap-2">
                <Globe size={14} className="text-amber-500" /> Works on Any Website
              </span>
            </div>
          </section>

          {/* ──── 3. HOW IT WORKS — 3 steps ──── */}
          <section id="how-it-works" className="space-y-8 sm:space-y-12">
            <div className="text-center">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
                Go Live in 5 Minutes. Seriously.
              </h2>
              <p className="text-slate-600 text-lg">
                No coding. No developers. No waiting.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8">
              {setupSteps.map((step, i) => (
                <div key={step.title} className="text-center bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-sm hover:shadow-lg transition-shadow">
                  <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4 relative">
                    <step.icon className="text-blue-900" size={28} />
                    <div className="absolute -top-2 -right-2 w-8 h-8 bg-blue-900 text-white rounded-full flex items-center justify-center text-sm font-bold">
                      {i + 1}
                    </div>
                  </div>
                  <h3 className="font-bold text-lg mb-2">{step.title}</h3>
                  <p className="text-slate-600 text-sm leading-relaxed">{step.description}</p>
                </div>
              ))}
            </div>
            <div className="text-center">
              <button
                type="button"
                onClick={onLogin}
                className="bg-blue-700 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-800 transition-all shadow-lg inline-flex items-center gap-2"
              >
                Try It Free — 5 Minute Setup <ArrowRight size={18} />
              </button>
            </div>
          </section>

          {/* ──── 4. VOICE AGENT SHOWCASE — Condensed ──── */}
          <section id="voice" className="relative bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 rounded-2xl sm:rounded-3xl p-6 sm:p-10 md:p-16 text-white shadow-2xl overflow-hidden">
            <div className="absolute inset-0 opacity-5">
              <div className="absolute top-10 left-10 w-72 h-72 bg-blue-400 rounded-full blur-3xl" />
              <div className="absolute bottom-10 right-10 w-96 h-96 bg-indigo-500 rounded-full blur-3xl" />
            </div>
            <div className="relative z-10">
              <div className="text-center mb-10 sm:mb-14">
                <div className="inline-flex items-center gap-2 bg-blue-500/20 border border-blue-400/30 text-blue-300 px-4 py-2 rounded-full text-sm font-bold mb-6">
                  <Mic size={16} /> ⭐ Flagship Feature: AI Voice Receptionist
                </div>
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-4 leading-tight">
                  A Voice Agent So Real,
                  <br className="hidden sm:block" />{' '}
                  <span className="bg-gradient-to-r from-blue-400 to-cyan-300 bg-clip-text text-transparent">Your Callers Won't Know It's AI</span>
                </h2>
                <p className="text-slate-300 text-lg max-w-3xl mx-auto leading-relaxed">
                  Powered by next-generation neural voice synthesis — the same technology used in Hollywood.
                  Answers calls, qualifies leads, books appointments, and transfers when needed. No scripts. No robots.
                </p>
              </div>

              <VoicePreview />

              <div className="text-center mt-10">
                <button
                  type="button"
                  onClick={onLogin}
                  className="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-700 transition-all shadow-xl shadow-blue-600/30 hover:shadow-2xl hover:-translate-y-0.5 flex items-center gap-3 mx-auto"
                >
                  Get Your AI Receptionist <ArrowRight size={20} />
                </button>
              </div>
            </div>
          </section>

          {/* ──── 5. INTERACTIVE DEMO — Try the chatbot ──── */}
          <section id="demo" className="space-y-8 sm:space-y-12">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
              <div className="space-y-6">
                <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold border border-blue-100">
                  <MessageSquare size={14} /> Live Demo
                </div>
                <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold">
                  See It In Action.<br />Right Now.
                </h2>
                <p className="text-slate-600 text-lg leading-relaxed">
                  This is a live BuildMyBot chatbot. Go ahead — ask it anything. This is exactly what your
                  customers will experience on your website.
                </p>
                <ul className="space-y-3">
                  <li className="flex items-center gap-3 text-slate-700">
                    <CheckCircle className="text-emerald-500 shrink-0" size={20} /> Instant responses powered by GPT-4o
                  </li>
                  <li className="flex items-center gap-3 text-slate-700">
                    <CheckCircle className="text-emerald-500 shrink-0" size={20} /> Learns your business from your website
                  </li>
                  <li className="flex items-center gap-3 text-slate-700">
                    <CheckCircle className="text-emerald-500 shrink-0" size={20} /> Captures leads and books appointments
                  </li>
                  <li className="flex items-center gap-3 text-slate-700">
                    <CheckCircle className="text-emerald-500 shrink-0" size={20} /> Custom branding, personality, and tone
                  </li>
                </ul>
                <button
                  type="button"
                  onClick={onLogin}
                  className="bg-blue-700 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-800 transition-all shadow-lg inline-flex items-center gap-2"
                >
                  Build Yours Free <ArrowRight size={18} />
                </button>
              </div>
              <FixedEmbedChat />
            </div>
          </section>

          {/* ──── 6. WITHOUT vs WITH — Comparison ──── */}
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

          {/* ──── 7. ROI CALCULATOR ──── */}
          <section className="bg-white rounded-2xl sm:rounded-3xl shadow-xl p-5 sm:p-8 md:p-10 border border-slate-200">
            <div className="text-center mb-6 sm:mb-10">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
                Calculate Your ROI
              </h2>
              <p className="text-slate-600 text-lg">
                See how much revenue you're leaving on the table
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
              <div className="flex-1 bg-gradient-to-br from-blue-900 to-blue-800 rounded-2xl p-8 text-white">
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
                  Start Capturing This Revenue
                </button>
              </div>
            </div>
          </section>

          {/* ──── 8. PRICING — 3 highlighted tiers + annual toggle ──── */}
          <section id="pricing" className="space-y-8 sm:space-y-12">
            <div className="text-center">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
                Simple Pricing. No Surprises.
              </h2>
              <p className="text-slate-600 text-lg mb-6">
                Start free. Upgrade when you're ready. Cancel anytime.
              </p>

              {/* Annual/Monthly Toggle */}
              <div className="inline-flex items-center gap-3 bg-slate-100 rounded-xl p-1">
                <button
                  type="button"
                  onClick={() => setBillingCycle('monthly')}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${
                    billingCycle === 'monthly'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Monthly
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle('annual')}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition flex items-center gap-2 ${
                    billingCycle === 'annual'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  Annual
                  <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">
                    Save 17%
                  </span>
                </button>
              </div>
            </div>

            {/* Free tier callout */}
            <div className="text-center">
              <p className="text-sm text-slate-500">
                Want to try first?{' '}
                <button type="button" onClick={onLogin} className="text-blue-700 font-semibold hover:underline">
                  Start free with 60 conversations/month →
                </button>
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
              {highlightedPlans.map(({ key, plan }) => {
                const isPopular = key === PlanType.PROFESSIONAL;
                const annualInfo = ANNUAL_PLAN_PRICING[key as keyof typeof ANNUAL_PLAN_PRICING];
                const showAnnual = billingCycle === 'annual' && annualInfo && plan.price > 0;
                const displayPrice = showAnnual
                  ? Math.round(annualInfo.annual / 12)
                  : plan.price;

                return (
                  <div
                    key={key}
                    className={`relative rounded-2xl p-6 sm:p-8 border-2 bg-white shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl ${
                      isPopular
                        ? 'border-blue-700 ring-2 ring-blue-700/20 scale-[1.02]'
                        : 'border-slate-200'
                    }`}
                  >
                    {isPopular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-700 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                        ⭐ MOST POPULAR
                      </div>
                    )}
                    <h3 className="font-bold text-xl mb-1">{plan.name}</h3>
                    <div className="mb-2">
                      <div className="flex items-baseline gap-1">
                        <span className={`text-4xl sm:text-5xl font-extrabold tracking-tight ${isPopular ? 'text-blue-700' : 'text-slate-900'}`}>
                          ${displayPrice}
                        </span>
                        <span className="text-slate-500 text-sm font-semibold">/mo</span>
                      </div>
                      {showAnnual && (
                        <p className="text-emerald-600 text-xs font-semibold mt-1">
                          ${annualInfo.annual}/yr — save ${(plan.price * 12) - annualInfo.annual}/yr
                        </p>
                      )}
                      {!showAnnual && billingCycle === 'monthly' && annualInfo && (
                        <p className="text-slate-400 text-xs mt-1">
                          or ${Math.round(annualInfo.annual / 12)}/mo billed annually
                        </p>
                      )}
                    </div>
                    <div className="text-sm text-slate-600 mb-4 pb-4 border-b border-slate-100">
                      {plan.bots >= 9999 ? 'Unlimited' : plan.bots} bot{plan.bots !== 1 ? 's' : ''} · {plan.conversations.toLocaleString()} convos/mo
                    </div>
                    <ul className="space-y-2 mb-6">
                      {plan.features.slice(0, 6).map((f) => (
                        <li
                          key={f}
                          className="flex items-start gap-2 text-sm text-slate-700"
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
                      className={`w-full py-3 rounded-xl font-bold text-base transition ${
                        isPopular
                          ? 'bg-blue-700 text-white hover:bg-blue-800 shadow-lg shadow-blue-700/25'
                          : 'bg-slate-900 text-white hover:bg-slate-800'
                      }`}
                    >
                      {key === PlanType.STARTER ? 'Start Growing' : key === PlanType.PROFESSIONAL ? 'Start Scaling' : 'Go Enterprise'}
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Enterprise callout */}
            <div className="bg-gradient-to-r from-slate-900 to-blue-900 rounded-2xl p-6 sm:p-8 text-white text-center">
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8">
                <div className="text-left">
                  <h3 className="text-xl font-bold">Need Enterprise? Unlimited bots, 50K+ convos, white-label, SSO</h3>
                  <p className="text-blue-200 text-sm mt-1">Custom pricing for high-volume businesses and agencies.</p>
                </div>
                <a
                  href="/pricing"
                  className="shrink-0 bg-white text-blue-900 px-6 py-3 rounded-xl font-bold hover:bg-blue-50 transition"
                >
                  See All Plans →
                </a>
              </div>
            </div>

            <p className="text-xs text-slate-400 text-center">
              All plans include AI chatbot. Voice agent available on Executive and above, or as a standalone product.
              14-day money-back guarantee on all paid plans.
            </p>
          </section>

          {/* ──── 8b. AI RECEPTIONIST STANDALONE ──── */}
          <section id="receptionist" className="relative bg-gradient-to-br from-emerald-900 via-teal-900 to-cyan-900 rounded-2xl sm:rounded-3xl p-6 sm:p-10 md:p-16 text-white shadow-2xl overflow-hidden">
            <div className="absolute inset-0 opacity-5">
              <div className="absolute top-10 left-10 w-72 h-72 bg-emerald-400 rounded-full blur-3xl" />
              <div className="absolute bottom-10 right-10 w-96 h-96 bg-cyan-500 rounded-full blur-3xl" />
            </div>
            <div className="relative z-10">
              <div className="text-center mb-10 sm:mb-14">
                <div className="inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 px-4 py-2 rounded-full text-sm font-bold mb-6">
                  <Phone size={16} /> 🆕 NEW — Standalone AI Receptionist
                </div>
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-extrabold mb-4 leading-tight">
                  Just Need A Phone Agent?
                  <br className="hidden sm:block" />{' '}
                  <span className="bg-gradient-to-r from-emerald-400 to-cyan-300 bg-clip-text text-transparent">We've Got You.</span>
                </h2>
                <p className="text-slate-300 text-lg max-w-3xl mx-auto leading-relaxed">
                  Don't need a chatbot? No problem. Get a standalone AI receptionist that answers your phones 24/7,
                  qualifies leads, books appointments, and transfers calls — for less than $3/day.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 mb-10">
                {[
                  {
                    name: 'Lite',
                    price: 79,
                    minutes: '150',
                    subtitle: 'Solopreneurs & Side Hustles',
                    features: ['150 minutes/month', 'Ultra-realistic AI voice', 'Basic call routing', 'Call transcripts', 'Email support', '$0.50/min overage'],
                  },
                  {
                    name: 'Pro',
                    price: 174,
                    minutes: '450',
                    subtitle: 'Small Businesses',
                    popular: true,
                    features: ['450 minutes/month', 'All premium voices', 'Advanced call routing', 'Call transfers', 'Scheduling workflows', 'Analytics dashboard', '$0.50/min overage'],
                  },
                  {
                    name: 'Max',
                    price: 279,
                    minutes: '1,000',
                    subtitle: 'Multi-Location Businesses',
                    features: ['1,000 minutes/month', 'CRM integration', 'Priority routing rules', 'API webhooks', 'Advanced analytics', 'Priority support', '$0.50/min overage'],
                  },
                ].map((tier) => (
                  <div
                    key={tier.name}
                    className={`relative rounded-2xl p-6 sm:p-8 transition-all duration-300 hover:-translate-y-1 ${
                      tier.popular
                        ? 'bg-white/15 border-2 border-emerald-400/50 shadow-xl shadow-emerald-500/10 scale-[1.02]'
                        : 'bg-white/10 border border-white/10'
                    }`}
                  >
                    {tier.popular && (
                      <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-xs font-bold px-4 py-1 rounded-full whitespace-nowrap">
                        ⭐ MOST POPULAR
                      </div>
                    )}
                    <h3 className="font-bold text-xl mb-1">AI Receptionist {tier.name}</h3>
                    <p className="text-emerald-300 text-sm mb-3">{tier.subtitle}</p>
                    <div className="flex items-baseline gap-1 mb-1">
                      <span className="text-4xl sm:text-5xl font-extrabold tracking-tight">${tier.price}</span>
                      <span className="text-slate-400 text-sm font-semibold">/mo</span>
                    </div>
                    <p className="text-emerald-300 text-sm mb-4">{tier.minutes} minutes included</p>
                    <ul className="space-y-2 mb-6">
                      {tier.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-slate-200">
                          <CheckCircle size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      onClick={onLogin}
                      className={`w-full py-3 rounded-xl font-bold text-base transition ${
                        tier.popular
                          ? 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg shadow-emerald-500/25'
                          : 'bg-white/20 text-white hover:bg-white/30'
                      }`}
                    >
                      Get Started
                    </button>
                  </div>
                ))}
              </div>

              <div className="text-center text-sm text-slate-400">
                <p>All voice plans include a dedicated phone number, call recording, and real-time transcripts.</p>
                <p className="mt-1">Want chatbots too? <a href="#pricing" className="text-emerald-400 font-semibold hover:underline">Bundle with any chatbot plan →</a></p>
              </div>
            </div>
          </section>

          {/* ──── 9. INDUSTRIES ──── */}
          <section className="space-y-8 sm:space-y-12">
            <div className="text-center">
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
                Built for Your Industry
              </h2>
              <p className="text-slate-600 text-lg">
                Pre-trained templates so your bot sounds like an expert from day one
              </p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
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

          {/* ──── 10. FAQ ──── */}
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

          {/* ──── 10b. BETA TESTERS + PARTNERS CTA ──── */}
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            {/* Beta Testers */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 sm:p-8 border-2 border-blue-200 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-blue-600 text-white text-xs font-bold px-4 py-1 rounded-bl-xl">
                🧪 BETA
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center text-white">
                  <Sparkles size={24} />
                </div>
                <h3 className="text-xl font-extrabold text-slate-900">Become a Beta Tester</h3>
              </div>
              <p className="text-slate-600 mb-4 leading-relaxed">
                Get early access to our AI chatbot and voice receptionist platform. 
                Help shape the product, get priority support, and lock in founder pricing.
              </p>
              <ul className="space-y-2 mb-6">
                {['Early access to all features', 'Direct line to the dev team', 'Founder pricing locked in forever', 'Your feedback shapes the roadmap'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
                    <CheckCircle size={16} className="text-blue-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="mailto:support@buildmybot.app?subject=Beta%20Tester%20Application"
                className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition shadow-lg shadow-blue-600/25"
              >
                <Mail size={18} /> Apply for Beta Access
              </a>
              <p className="text-xs text-slate-500 mt-3">
                Or email <a href="mailto:support@buildmybot.app" className="text-blue-600 font-semibold hover:underline">support@buildmybot.app</a>
              </p>
            </div>

            {/* Partners / Agents / White-Label */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-2xl p-6 sm:p-8 border-2 border-amber-200 relative overflow-hidden">
              <div className="absolute top-0 right-0 bg-amber-600 text-white text-xs font-bold px-4 py-1 rounded-bl-xl">
                💰 PARTNER
              </div>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-amber-600 rounded-xl flex items-center justify-center text-white">
                  <Users size={24} />
                </div>
                <h3 className="text-xl font-extrabold text-slate-900">Become a Partner or Sales Agent</h3>
              </div>
              <p className="text-slate-600 mb-4 leading-relaxed">
                Resell AI chatbots and voice agents under your own brand. 
                White-label the entire platform, earn up to 50% commission, and build a recurring revenue business.
              </p>
              <ul className="space-y-2 mb-6">
                {['White-label under your brand', 'Up to 50% recurring commission', 'Full sales & marketing support', 'Dedicated partner success manager'].map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
                    <CheckCircle size={16} className="text-amber-500 shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href="mailto:president@buildmybot.app?subject=Partner%20%2F%20White-Label%20Inquiry"
                className="inline-flex items-center gap-2 bg-amber-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-amber-700 transition shadow-lg shadow-amber-600/25"
              >
                <Briefcase size={18} /> Apply to Partner Program
              </a>
              <p className="text-xs text-slate-500 mt-3">
                Or email <a href="mailto:president@buildmybot.app" className="text-amber-600 font-semibold hover:underline">president@buildmybot.app</a>
              </p>
            </div>
          </section>

          {/* ──── 11. FINAL CTA ──── */}
          <section className="bg-gradient-to-br from-blue-900 to-blue-800 rounded-2xl sm:rounded-3xl p-6 sm:p-10 md:p-16 text-white text-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-0 left-1/4 w-64 h-64 bg-blue-400 rounded-full blur-3xl" />
              <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-indigo-400 rounded-full blur-3xl" />
            </div>
            <div className="relative z-10">
              <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold mb-4 sm:mb-6">
                Every Minute You Wait,
                <br className="hidden sm:block" /> Your Competitor Gets the Call
              </h2>
              <p className="text-xl text-blue-200 mb-8 max-w-3xl mx-auto">
                An AI chatbot and voice receptionist that sounds human, works 24/7,
                and costs less than your daily coffee. Set up in 5 minutes. Cancel anytime.
              </p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                <button
                  type="button"
                  onClick={onLogin}
                  className="w-full sm:w-auto bg-white text-blue-900 px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-50 transition flex items-center justify-center gap-2 shadow-xl"
                >
                  Start Capturing Leads Now <ArrowRight size={20} />
                </button>
                <a
                  href="#voice"
                  className="w-full sm:w-auto border-2 border-white text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-white/10 transition flex items-center justify-center gap-2"
                >
                  <Phone size={20} /> Hear The AI Voice
                </a>
              </div>
              <div className="mt-8 flex flex-wrap justify-center gap-6 text-blue-200 text-sm">
                <span className="flex items-center gap-2">
                  <CheckCircle size={16} /> No credit card required
                </span>
                <span className="flex items-center gap-2">
                  <CheckCircle size={16} /> 14-day money-back guarantee
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
                  <a href="/partner-program" className="hover:text-white transition">
                    Partner Program
                  </a>
                </li>
                <li>
                  <a href="/blog" className="hover:text-white transition">
                    Blog
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
                  <a href="mailto:support@buildmybot.app" className="hover:text-white transition">
                    support@buildmybot.app
                  </a>
                </li>
                <li>
                  <a href="mailto:sales@buildmybot.app" className="hover:text-white transition">
                    sales@buildmybot.app
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
