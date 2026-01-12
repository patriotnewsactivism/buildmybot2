import {
  ArrowRight,
  Bell,
  Bot,
  Briefcase,
  Car,
  CheckCircle,
  Crown,
  DollarSign,
  Dumbbell,
  Flame,
  Gavel,
  Globe,
  GraduationCap,
  Home,
  Instagram,
  Landmark,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Mic,
  PhoneCall,
  Play,
  ShoppingBag,
  Smartphone,
  Stethoscope,
  Target,
  TrendingUp,
  Users,
  Utensils,
  Wrench,
  X,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { PLANS } from '../../constants';
import { generateBotResponse } from '../../services/openaiService';
import { PlanType } from '../../types';

// Interfaces and consts omitted for brevity but assumed present (HUMAN_NAMES, AVATAR_COLORS)
interface LandingProps {
  onLogin: () => void;
  onNavigateToPartner?: () => void;
  onAdminLogin?: () => void;
}

type ModalContent = 'privacy' | 'terms' | 'about' | 'contact' | 'features';

const HUMAN_NAMES = ['Sarah', 'Michael', 'Jessica', 'David', 'Emma', 'James'];
const AVATAR_COLORS = ['#1e3a8a', '#be123c', '#047857', '#d97706', '#7c3aed'];

export const LandingPage: React.FC<LandingProps> = ({
  onLogin,
  onNavigateToPartner,
  onAdminLogin,
}) => {
  // ... (State hooks and useEffects remain identical)
  const [modalContent, setModalContent] = useState<ModalContent | null>(null);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatHistory, setChatHistory] = useState<
    { role: 'user' | 'model'; text: string }[]
  >([]);
  const [chatInput, setChatInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [demoIdentity, setDemoIdentity] = useState({
    name: 'Bot',
    color: '#1e3a8a',
  });
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const hasGreeted = useRef(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Initialize random identity on mount
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
    const shouldScroll = chatHistory.length > 0 || isTyping || isChatOpen;
    if (shouldScroll) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatHistory.length, isTyping, isChatOpen]);

  // Open Greeting
  useEffect(() => {
    if (isChatOpen && !hasGreeted.current && chatHistory.length === 0) {
      setIsTyping(true);
      hasGreeted.current = true;
      setTimeout(() => {
        setChatHistory([
          {
            role: 'model',
            text: `Hi! I'm ${demoIdentity.name}. I can qualify leads, schedule appointments, and answer questions 24/7. How can I help your business grow today?`,
          },
        ]);
        setIsTyping(false);
      }, 1500);
    }
  }, [isChatOpen, demoIdentity.name, chatHistory.length]);

  const scrollToSection = (
    e: React.MouseEvent<HTMLAnchorElement>,
    id: string,
  ) => {
    e.preventDefault();
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleDemoSend = async () => {
    if (!chatInput.trim()) return;
    if (chatHistory.length > 8) {
      const limitMsg = { role: 'user' as const, text: chatInput };
      setChatHistory((prev) => [...prev, limitMsg]);
      setChatInput('');
      setIsTyping(true);
      setTimeout(() => {
        setChatHistory((prev) => [
          ...prev,
          {
            role: 'model',
            text: "I'd love to keep chatting, but I have a meeting coming up! Why don't you sign up for free to create your own bot? It takes less than a minute.",
          },
        ]);
        setIsTyping(false);
      }, 1500);
      return;
    }
    const userMsg = { role: 'user' as const, text: chatInput };
    setChatHistory((prev) => [...prev, userMsg]);
    setChatInput('');
    setIsTyping(true);
    try {
      const systemPrompt = 'Sales Assistant Prompt';
      const startTime = Date.now();
      const response = await generateBotResponse(
        systemPrompt,
        [...chatHistory, userMsg],
        userMsg.text,
      );
      const elapsed = Date.now() - startTime;
      const remainingDelay = Math.max(0, 2000 - elapsed);
      setTimeout(() => {
        setChatHistory((prev) => [...prev, { role: 'model', text: response }]);
        setIsTyping(false);
      }, remainingDelay);
    } catch (e) {
      setIsTyping(false);
      setChatHistory((prev) => [
        ...prev,
        { role: 'model', text: 'Error connecting.' },
      ]);
    }
  };

  const openModal = (type: ModalContent) => setModalContent(type);
  const closeModal = () => setModalContent(null);
  const InfoModal = () => (modalContent ? <div /> : null); // Abbreviated for brevity in this file

  const industries = [
    {
      title: 'Home Services',
      icon: Wrench,
      color: 'blue',
      desc: 'Plumbers, HVAC, Electricians.',
    },
    // ... other industries omitted for brevity
  ];

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900 overflow-x-hidden">
      {/* ... Previous sections (Hero, Nav, Demo, Industries, Hot Leads) ... */}

      {/* UPDATED Pricing Section */}
      <section id="pricing" className="py-24 px-6 bg-slate-50">
        <div className="max-w-[90rem] mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              Pricing that Scales with You
            </h2>
            <p className="text-lg text-slate-600">
              Start for free. Upgrade as you grow.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
            {Object.entries(PLANS).map(([key, plan]) => {
              const isEnterprise = key === PlanType.ENTERPRISE;
              const isProfessional = key === PlanType.PROFESSIONAL;
              const displayTitle = isEnterprise
                ? 'Enterprise / White-label'
                : plan.name;

              return (
                <div
                  key={key}
                  className={`relative rounded-2xl p-6 flex flex-col transition-all duration-300 h-full shadow-[0_18px_40px_rgba(15,23,42,0.12)] hover:-translate-y-1 hover:shadow-[0_24px_55px_rgba(15,23,42,0.18)] ${
                    isProfessional
                      ? 'bg-white border-2 border-blue-900 ring-2 ring-blue-900/20 scale-105 z-10'
                      : isEnterprise
                        ? 'bg-slate-900 border border-slate-800 text-white ring-1 ring-slate-700/60 shadow-[0_18px_40px_rgba(15,23,42,0.35)]'
                        : 'bg-white border border-slate-200 ring-1 ring-slate-200/60'
                  }`}
                >
                  {/* Badges */}
                  {isProfessional && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-900 text-white px-4 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide shadow-sm">
                      Most Popular
                    </div>
                  )}
                  {isEnterprise && (
                    <div className="mb-4 flex items-center gap-1.5 text-yellow-400 font-bold text-[10px] uppercase tracking-widest">
                      <Crown size={12} fill="currentColor" /> Ultimate Power
                    </div>
                  )}

                  {/* Header */}
                  <div className="mb-6">
                    <h3
                      className={`text-lg font-bold ${isEnterprise ? 'text-white' : 'text-slate-900'}`}
                    >
                      {displayTitle}
                    </h3>
                    <div className="mt-3">
                      <div
                        className={`inline-flex items-baseline gap-2 rounded-xl border-2 px-4 py-3 ${
                          isEnterprise
                            ? 'border-slate-700 bg-slate-800/70 text-white shadow-[0_12px_25px_rgba(15,23,42,0.45)]'
                            : isProfessional
                              ? 'border-blue-900 bg-blue-50 text-blue-900 shadow-[0_12px_25px_rgba(15,23,42,0.18)]'
                              : 'border-slate-200 bg-slate-50 text-slate-900 shadow-sm'
                        }`}
                      >
                        <span className="text-4xl font-extrabold tracking-tight">
                          ${plan.price}
                        </span>
                        <span
                          className={`text-sm font-semibold ${
                            isEnterprise
                              ? 'text-slate-300'
                              : isProfessional
                                ? 'text-blue-900/70'
                                : 'text-slate-600'
                          }`}
                        >
                          /mo
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Top Metrics */}
                  <div className="space-y-3 mb-6">
                    <div
                      className={`flex items-center gap-3 text-sm font-medium ${isEnterprise ? 'text-slate-300' : 'text-slate-700'}`}
                    >
                      <CheckCircle
                        size={18}
                        className={
                          isEnterprise ? 'text-yellow-400' : 'text-emerald-500'
                        }
                      />
                      <span>
                        {plan.bots >= 9999 ? 'Unlimited' : plan.bots} Bot(s)
                      </span>
                    </div>
                    <div
                      className={`flex items-center gap-3 text-sm font-medium ${isEnterprise ? 'text-slate-300' : 'text-slate-700'}`}
                    >
                      <CheckCircle
                        size={18}
                        className={
                          isEnterprise ? 'text-yellow-400' : 'text-emerald-500'
                        }
                      />
                      <span>
                        {plan.conversations.toLocaleString()} Conversations
                      </span>
                    </div>
                    <div
                      className={`flex items-center gap-3 text-sm font-medium ${isEnterprise ? 'text-slate-300' : 'text-slate-700'}`}
                    >
                      <CheckCircle
                        size={18}
                        className={
                          isEnterprise ? 'text-yellow-400' : 'text-emerald-500'
                        }
                      />
                      <span>
                        {isEnterprise
                          ? 'Enterprise Analytics'
                          : 'Advanced Analytics'}
                      </span>
                    </div>
                  </div>

                  {/* Separator */}
                  <div className="mb-4">
                    <p
                      className={`text-[10px] font-bold uppercase tracking-wider mb-3 ${isEnterprise ? 'text-slate-500' : 'text-slate-400'}`}
                    >
                      Everything in this plan
                    </p>
                    <div
                      className={`h-px w-full ${isEnterprise ? 'bg-slate-800' : 'bg-slate-100'}`}
                    />
                  </div>

                  {/* List */}
                  <ul className="space-y-3 mb-8 flex-1">
                    {plan.features.map((feature: string) => (
                      <li
                        key={feature}
                        className={`flex items-start gap-3 rounded-lg border px-3 py-2 text-xs leading-relaxed shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                          isEnterprise
                            ? 'border-slate-800 bg-slate-900/70 text-slate-300'
                            : 'border-slate-200 bg-slate-50 text-slate-600'
                        }`}
                      >
                        <CheckCircle
                          size={14}
                          className={`shrink-0 mt-0.5 ${isEnterprise ? 'text-yellow-500/50' : 'text-emerald-500/50'}`}
                        />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>

                  <button
                    type="button"
                    onClick={onLogin}
                    className={`w-full py-3 rounded-lg font-bold text-sm transition shadow-sm ${
                      isProfessional
                        ? 'bg-blue-900 text-white hover:bg-blue-950 shadow-blue-900/20'
                        : isEnterprise
                          ? 'bg-white text-slate-900 hover:bg-slate-200'
                          : 'bg-white text-slate-900 border border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    {isEnterprise ? 'Get Enterprise' : `Choose ${plan.name}`}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      {/* ... Footer ... */}
    </div>
  );
};
