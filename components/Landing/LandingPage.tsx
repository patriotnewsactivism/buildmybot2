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
import { PLANS } from '../../constants';
import {
  generateBotResponseDemo,
  generateMarketingContent,
  generateWebsiteStructure,
  scrapeWebsiteContent,
} from '../../services/openaiService';
import { PlanType } from '../../types';

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

    const cartesiaKey = import.meta.env.VITE_CARTESIA_API_KEY;

    if (!cartesiaKey) {
      alert(
        'Cartesia API Key is missing. Please configure it in your environment variables.',
      );
      setIsVoiceActive(false);
      return;
    }

    try {
      const response = await fetch('https://api.cartesia.ai/tts/bytes', {
        method: 'POST',
        headers: {
          'Cartesia-Version': '2024-06-10',
          'X-API-Key': cartesiaKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model_id: 'sonic-2',
          transcript:
            'Hello! This is Sarah, your AI assistant. I noticed you were looking for information about our services. How can I help you today?',
          voice: {
            mode: 'id',
            id: 'f786b574-daa5-4673-aa0c-cbe3e8534c02',
          },
          output_format: {
            container: 'mp3',
            encoding: 'mp3',
            sample_rate: 44100,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Voice generation failed: ${errorText}`);
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
      alert('Voice preview failed. Please check the Cartesia API key.');
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
      q: 'How quickly can I get started?',
      a: "Most businesses are up and running in under 5 minutes. Just paste your website URL, customize your bot's personality, and copy one line of code to your site. No technical expertise required.",
    },
    {
      q: 'Will the AI sound robotic to my customers?',
      a: "Not at all. Our AI uses advanced language models and optional voice synthesis (powered by Cartesia) that sounds indistinguishable from a real human. Customers often can't tell they're talking to an AI.",
    },
    {
      q: "What happens if the AI can't answer a question?",
      a: "The AI is trained to gracefully hand off to a human when needed. It will capture the lead's information and notify you immediately, so no opportunity is ever lost.",
    },
    {
      q: 'Can I integrate with my existing CRM and tools?',
      a: 'Yes! We integrate with popular CRMs like Salesforce, HubSpot, and Zoho, plus calendar tools like Calendly and Google Calendar. API access is available on Professional plans and above.',
    },
    {
      q: 'Is my data secure?',
      a: 'Absolutely. We use enterprise-grade encryption, SOC 2 compliance, and never train our models on your data. Your business information stays yours.',
    },
    {
      q: 'What if I need to cancel?',
      a: 'Cancel anytime with no questions asked. We offer a 14-day money-back guarantee on all paid plans. Your data can be exported or deleted upon request.',
    },
  ];

  const VoicePreview = () => (
    <div className="bg-slate-900 text-white p-8 rounded-3xl border border-slate-800 shadow-2xl relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-20 group-hover:opacity-40 transition-opacity">
        <Mic size={120} />
      </div>
      <div className="relative z-10">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 bg-blue-600 rounded-full flex items-center justify-center animate-pulse">
            <Phone size={24} />
          </div>
          <div>
            <h3 className="text-xl font-bold">Cartesia Voice Agent</h3>
            <p className="text-blue-400 text-sm font-medium">
              Ultra-Realistic Preview
            </p>
          </div>
        </div>
        <p className="text-slate-300 mb-8 leading-relaxed max-w-lg text-lg italic">
          "Hello! This is Sarah, your AI assistant. I noticed you were looking
          for information about our services. How can I help you today?"
        </p>
        <div className="flex flex-wrap gap-4">
          <button
            type="button"
            onClick={handleVoicePreview}
            className="flex items-center gap-3 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold transition-all transform hover:scale-105"
          >
            {isVoiceActive ? (
              <Loader className="animate-spin" size={20} />
            ) : (
              <Play size={20} />
            )}
            {isVoiceActive ? 'Voice Active...' : 'Hear Real Preview'}
          </button>
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <CheckCircle size={16} className="text-emerald-500" />
            Powered by Cartesia Turbo
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
            className="flex-1 bg-slate-100 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-600"
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

  return (
    <div className="min-h-screen bg-slate-50 overflow-x-hidden">
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
                className="flex-1 bg-slate-100 rounded-lg px-4 py-2 text-sm"
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
      <nav className="h-16 sm:h-20 border-b border-slate-200/60 bg-white/95 backdrop-blur-lg px-4 sm:px-6 lg:px-12 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-2 sm:gap-3">
          <img
            src="/logo.jpg"
            alt="BuildMyBot"
            className="h-10 sm:h-12 w-auto rounded-lg"
          />
          <span className="font-bold text-lg sm:text-xl text-slate-900 hidden sm:block">
            BuildMyBot
          </span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-slate-600">
          <a href="/features" className="hover:text-blue-700 transition-colors">
            Features
          </a>
          <a href="/pricing" className="hover:text-blue-700 transition-colors">
            Pricing
          </a>
          <a href="/faq" className="hover:text-blue-700 transition-colors">
            FAQ
          </a>
          <button
            type="button"
            onClick={onNavigateToPartner}
            className="hover:text-blue-700 transition-colors text-emerald-600 font-semibold"
          >
            Partners
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onLogin}
            className="bg-blue-700 text-white px-4 sm:px-6 py-2 sm:py-2.5 rounded-xl font-semibold text-sm sm:text-base hover:bg-blue-800 transition-all shadow-lg shadow-blue-700/25 hover:shadow-xl hover:shadow-blue-700/30"
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
      </nav>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-16 bg-white z-30 animate-in slide-in-from-top-2">
          <div className="flex flex-col p-6 space-y-4">
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
            <button
              type="button"
              onClick={() => {
                onNavigateToPartner?.();
                setIsMobileMenuOpen(false);
              }}
              className="text-lg font-medium text-emerald-600 hover:text-emerald-700 py-3 border-b border-slate-100 text-left"
            >
              Partners
            </button>
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 py-12 sm:py-16 md:py-24 space-y-16 sm:space-y-24 md:space-y-40">
        {/* 1. Hero Section */}
        <section className="text-center space-y-10 pt-8">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-50 to-indigo-50 text-blue-700 px-5 py-2.5 rounded-full text-sm font-semibold border border-blue-100 shadow-sm">
            <Sparkles size={16} className="text-blue-500" /> AI That Never
            Sleeps, Never Misses a Lead
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-extrabold text-slate-900 leading-[1.1] tracking-tight px-2">
            Stop Losing Leads to
            <br className="hidden sm:block" /> Slow Response
          </h1>
          <p className="text-xl sm:text-2xl font-semibold text-blue-700 -mt-4">
            Close 3x More Deals on Autopilot
          </p>
          <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Your AI sales agent works 24/7, responds in seconds, and never takes
            a day off. Convert website visitors into paying customers while you
            sleep.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
            <button
              type="button"
              onClick={onLogin}
              className="w-full sm:w-auto bg-blue-700 text-white px-10 py-4 rounded-2xl font-bold text-lg hover:bg-blue-800 transition-all shadow-xl shadow-blue-700/30 hover:shadow-2xl hover:shadow-blue-700/40 hover:-translate-y-0.5 flex items-center justify-center gap-3"
            >
              Start Free <ArrowRight size={20} />
            </button>
            <a
              href="/demo"
              className="w-full sm:w-auto bg-white text-slate-700 border-2 border-slate-200 px-10 py-4 rounded-2xl font-bold text-lg hover:border-blue-300 hover:text-blue-700 transition-all flex items-center justify-center gap-3 shadow-sm"
            >
              <Play size={20} /> See It In Action
            </a>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 pt-6 text-sm text-slate-500">
            <span className="flex items-center gap-2">
              <CheckCircle size={16} className="text-emerald-500" /> No credit
              card required
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle size={16} className="text-emerald-500" /> 5-minute
              setup
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle size={16} className="text-emerald-500" /> Cancel
              anytime
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
              Learn how BuildMyBot can transform your business in just 2 minutes
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

        {/* 2. Dashboard Mockup */}
        <section className="bg-gradient-to-br from-slate-900 via-slate-800 to-blue-900 rounded-2xl sm:rounded-3xl p-6 sm:p-10 md:p-16 text-white shadow-2xl">
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
              <MessageSquare className="mx-auto mb-4 text-blue-400" size={36} />
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
        <section className="bg-white rounded-2xl sm:rounded-3xl shadow-xl p-5 sm:p-8 md:p-12 border border-slate-200">
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
                  Monthly Website Leads:{' '}
                  <span className="text-blue-900 font-bold">
                    {monthlyLeads}
                  </span>
                </label>
                <input
                  id="roi-monthly-leads"
                  type="range"
                  min="1"
                  max="1000"
                  value={monthlyLeads}
                  onChange={(e) => setMonthlyLeads(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-900"
                />
              </div>
              <div>
                <label
                  htmlFor="roi-avg-deal"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  Average Deal Value:{' '}
                  <span className="text-blue-900 font-bold">
                    ${avgDealValue.toLocaleString()}
                  </span>
                </label>
                <input
                  id="roi-avg-deal"
                  type="range"
                  min="100"
                  max="50000"
                  step="100"
                  value={avgDealValue}
                  onChange={(e) => setAvgDealValue(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-900"
                />
              </div>
              <div>
                <label
                  htmlFor="roi-current-conversion"
                  className="block text-sm font-medium text-slate-700 mb-2"
                >
                  Current Conversion Rate:{' '}
                  <span className="text-blue-900 font-bold">
                    {currentConversion}%
                  </span>
                </label>
                <input
                  id="roi-current-conversion"
                  type="range"
                  min="1"
                  max="50"
                  value={currentConversion}
                  onChange={(e) => setCurrentConversion(Number(e.target.value))}
                  className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-900"
                />
              </div>
            </div>
            <div className="bg-gradient-to-br from-blue-900 to-blue-800 rounded-2xl p-8 text-white">
              <h3 className="text-xl font-bold mb-6">Your Projected Results</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center pb-4 border-b border-blue-700">
                  <span className="text-blue-200">Current Monthly Revenue</span>
                  <span className="text-2xl font-bold">
                    ${currentRevenue.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between items-center pb-4 border-b border-blue-700">
                  <span className="text-blue-200">Projected w/ BuildMyBot</span>
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
                'Leads wait hours or days for a response',
                'Missed calls during evenings and weekends',
                'Staff overwhelmed with repetitive questions',
                'Leads go cold before follow-up',
                'No visibility into conversation quality',
                'Competitors steal your hot leads',
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
                'Instant responses 24/7/365',
                'Every lead qualified automatically',
                'Human-like conversations that convert',
                'Automatic follow-up sequences',
                'Full analytics and lead scoring',
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

        {/* 7. Voice AI Preview */}
        <section id="voice" className="space-y-8 sm:space-y-12">
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
              AI Phone Receptionist
            </h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto">
              When your chat leads want to talk, your AI is ready.
              Ultra-realistic voice technology handles calls, books
              appointments, and never puts anyone on hold.
            </p>
          </div>
          <VoicePreview />
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
            <div className="bg-slate-100 p-6 rounded-xl text-center overflow-hidden">
              <Phone className="mx-auto mb-3 text-blue-900" size={28} />
              <h4 className="font-bold mb-1">24/7 Availability</h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                Never miss another call, even at 3am
              </p>
            </div>
            <div className="bg-slate-100 p-6 rounded-xl text-center overflow-hidden">
              <Mic className="mx-auto mb-3 text-blue-900" size={28} />
              <h4 className="font-bold mb-1">Human-Like Voice</h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                Callers won't know it's AI
              </p>
            </div>
            <div className="bg-slate-100 p-6 rounded-xl text-center overflow-hidden">
              <Target className="mx-auto mb-3 text-blue-900" size={28} />
              <h4 className="font-bold mb-1">Lead Qualification</h4>
              <p className="text-slate-600 text-sm leading-relaxed">
                Ask intake questions, book appointments
              </p>
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
                <Briefcase size={16} /> Partner/Reseller Program
              </div>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold mb-4 sm:mb-6 leading-tight">
                Start Your Own AI Agency.
                <br />
                <span className="text-emerald-400">
                  Keep Up to 50% Revenue.
                </span>
              </h2>
              <p className="text-slate-300 text-lg mb-8 leading-relaxed">
                White-label our technology under your brand. Sell AI chatbots to
                local businesses while we handle all the infrastructure. Zero
                coding required.
              </p>
              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle size={20} className="text-emerald-400" /> Earn
                  20%-50% recurring commissions (grow your way up)
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle size={20} className="text-emerald-400" /> Or pay
                  $499 once for instant 50% Whitelabel access
                </li>
                <li className="flex items-center gap-3 text-slate-200">
                  <CheckCircle size={20} className="text-emerald-400" /> Your
                  brand, your pricing, your clients
                </li>
              </ul>
              <button
                type="button"
                onClick={onNavigateToPartner}
                className="bg-emerald-500 text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-emerald-600 transition-all shadow-xl shadow-emerald-500/30 flex items-center gap-3"
              >
                Learn About Partnership <ArrowRight size={20} />
              </button>
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
                    Whitelabel
                  </div>
                  <div className="text-[8px] sm:text-[10px] text-amber-400/70">
                    $499 instant
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
                Enter any website URL and watch our AI instantly learn about the
                business.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <input
                  type="text"
                  value={demoUrl}
                  onChange={(e) => setDemoUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="flex-1 border border-slate-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
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
                  className="flex-1 border border-slate-300 rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
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
                  className={`relative bg-white rounded-2xl p-6 border-2 ${isPopular ? 'border-blue-900 shadow-xl' : 'border-slate-200'}`}
                >
                  {isPopular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-900 text-white text-xs font-bold px-3 py-1 rounded-full">
                      MOST POPULAR
                    </div>
                  )}
                  <h3 className="font-bold text-lg mb-1">{plan.name}</h3>
                  <div className="flex items-baseline gap-1 mb-4">
                    <span className="text-3xl font-extrabold">
                      ${plan.price}
                    </span>
                    {plan.price > 0 && (
                      <span className="text-slate-500">/mo</span>
                    )}
                  </div>
                  <div className="text-sm text-slate-600 mb-4">
                    {plan.bots >= 9999 ? 'Unlimited' : plan.bots} bot
                    {plan.bots !== 1 ? 's' : ''} ·{' '}
                    {plan.conversations.toLocaleString()} convos
                  </div>
                  <ul className="space-y-2 mb-6">
                    {plan.features.slice(0, 4).map((f) => (
                      <li
                        key={f}
                        className="flex items-start gap-2 text-sm text-slate-600"
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
                  <span className="font-bold text-base sm:text-lg">
                    {faq.q}
                  </span>
                  {openFaq === i ? (
                    <ChevronUp size={20} className="shrink-0" />
                  ) : (
                    <ChevronDown size={20} className="shrink-0" />
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
        <section className="bg-gradient-to-br from-blue-900 to-blue-800 rounded-2xl sm:rounded-3xl p-6 sm:p-10 md:p-16 text-white text-center">
          <h2 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-extrabold mb-4 sm:mb-6">
            Ready to Stop Losing Leads?
          </h2>
          <p className="text-xl text-blue-200 mb-8 max-w-2xl mx-auto">
            Start using BuildMyBot today to capture, qualify, and convert leads
            24/7. Start free today — no credit card required.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <button
              type="button"
              onClick={onLogin}
              className="w-full sm:w-auto bg-white text-blue-900 px-8 py-4 rounded-xl font-bold text-lg hover:bg-blue-50 transition flex items-center justify-center gap-2"
            >
              Start Free Now <ArrowRight size={20} />
            </button>
            <a
              href="/demo"
              className="w-full sm:w-auto border-2 border-white text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-white/10 transition flex items-center justify-center gap-2"
            >
              <Play size={20} /> Watch Demo
            </a>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-6 text-blue-200 text-sm">
            <span className="flex items-center gap-2">
              <CheckCircle size={16} /> No credit card required
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle size={16} /> 5-minute setup
            </span>
            <span className="flex items-center gap-2">
              <CheckCircle size={16} /> Cancel anytime
            </span>
          </div>
        </section>
      </main>

      <footer className="bg-slate-900 text-slate-400 py-12 sm:py-20 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 sm:gap-12">
          <div>
            <div className="flex items-center gap-2 text-white font-bold text-xl mb-4">
              <Bot size={24} /> BuildMyBot
            </div>
            <p className="text-sm">
              The AI workforce that never sleeps. Convert more leads, close more
              deals, grow your business.
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
  );
};
