import {
  ArrowRight,
  BarChart3,
  Bot,
  Brain,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Crown,
  Globe,
  Layout,
  Loader,
  Mail,
  MessageSquare,
  Mic,
  Phone,
  Play,
  RefreshCcw,
  Send,
  Shield,
  Sparkles,
  Star,
  Target,
  TrendingUp,
  Upload,
  Users,
  X,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { SEO, SEOConfig } from '../../SEO/SEO';
import { PageLayout } from './PageLayout';

const coreFeatures = [
  {
    icon: Bot,
    title: 'AI Chatbot Builder',
    subtitle: 'No Code Required',
    description:
      'Create powerful AI chatbots with our intuitive drag-and-drop builder. No coding skills needed—just describe what you want and watch your bot come to life.',
    highlights: [
      'Visual drag-and-drop interface',
      'Multiple AI personas & personalities',
      'Custom conversation flows',
      'One-click deployment',
    ],
    gradient: 'from-blue-500 to-indigo-600',
    bgGlow: 'bg-blue-500/20',
  },
  {
    icon: Users,
    title: 'Lead Capture & CRM',
    subtitle: 'Never Miss a Lead',
    description:
      'Automatically capture, score, and nurture leads 24/7. Our intelligent CRM tracks every conversation and prioritizes your hottest prospects.',
    highlights: [
      'Automatic lead scoring',
      'Conversion tracking',
      'Smart follow-ups',
      'Pipeline management',
    ],
    gradient: 'from-emerald-500 to-teal-600',
    bgGlow: 'bg-emerald-500/20',
  },
  {
    icon: Brain,
    title: 'Knowledge Base',
    subtitle: 'Train on Your Content',
    description:
      'Upload documents, paste URLs, or connect data sources. Your bot learns everything about your business and answers questions with perfect accuracy.',
    highlights: [
      'PDF & document upload',
      'Website content scraping',
      'FAQ imports',
      'Real-time training',
    ],
    gradient: 'from-purple-500 to-violet-600',
    bgGlow: 'bg-purple-500/20',
  },
  {
    icon: Phone,
    title: 'Voice Agent',
    subtitle: 'Powered by Cartesia',
    description:
      "Ultra-realistic AI voice agents that handle phone calls, qualify leads, and book appointments. Customers can't tell they're talking to AI.",
    highlights: [
      'Cartesia voice synthesis',
      'Inbound & outbound calls',
      'Call transcription',
      'Smart call routing',
    ],
    gradient: 'from-orange-500 to-red-500',
    bgGlow: 'bg-orange-500/20',
  },
  {
    icon: Mail,
    title: 'Marketing Tools',
    subtitle: 'Automate Outreach',
    description:
      'Create email sequences, SMS campaigns, and automated follow-ups that nurture leads through your funnel—all powered by AI.',
    highlights: [
      'Email sequences',
      'SMS campaigns',
      'Drip automation',
      'A/B testing',
    ],
    gradient: 'from-pink-500 to-rose-600',
    bgGlow: 'bg-pink-500/20',
  },
  {
    icon: Layout,
    title: 'Website Builder',
    subtitle: 'Landing Pages & Forms',
    description:
      'Build beautiful landing pages and forms that convert. Embed your chatbot anywhere and capture leads with high-converting templates.',
    highlights: [
      'Drag-and-drop pages',
      'Form builder',
      'Template library',
      'Mobile responsive',
    ],
    gradient: 'from-cyan-500 to-blue-500',
    bgGlow: 'bg-cyan-500/20',
  },
  {
    icon: BarChart3,
    title: 'Chat Logs & Analytics',
    subtitle: 'Deep Conversation Insights',
    description:
      'Understand every conversation with sentiment analysis, topic detection, and actionable insights that help you improve conversions.',
    highlights: [
      'Sentiment analysis',
      'Conversation search',
      'Export & reporting',
      'Real-time monitoring',
    ],
    gradient: 'from-amber-500 to-orange-500',
    bgGlow: 'bg-amber-500/20',
  },
  {
    icon: Crown,
    title: 'White-Label & Partner',
    subtitle: 'Build Your Brand',
    description:
      'Resell BuildMyBot under your own brand. Full white-label customization, custom domains, and generous partner commissions.',
    highlights: [
      'Custom branding',
      'Your own domain',
      'Partner dashboard',
      'Revenue sharing',
    ],
    gradient: 'from-slate-600 to-slate-800',
    bgGlow: 'bg-slate-500/20',
  },
];

const comparisonData = [
  {
    feature: 'AI Chatbot Builder',
    buildmybot: true,
    intercom: true,
    drift: true,
    zendesk: false,
  },
  {
    feature: 'No-Code Setup',
    buildmybot: true,
    intercom: false,
    drift: false,
    zendesk: false,
  },
  {
    feature: 'Voice Agent (AI Phone)',
    buildmybot: true,
    intercom: false,
    drift: false,
    zendesk: false,
  },
  {
    feature: 'Lead Scoring',
    buildmybot: true,
    intercom: true,
    drift: true,
    zendesk: false,
  },
  {
    feature: 'Knowledge Base Training',
    buildmybot: true,
    intercom: true,
    drift: false,
    zendesk: true,
  },
  {
    feature: 'Marketing Automation',
    buildmybot: true,
    intercom: true,
    drift: true,
    zendesk: false,
  },
  {
    feature: 'Website Builder',
    buildmybot: true,
    intercom: false,
    drift: false,
    zendesk: false,
  },
  {
    feature: 'White-Label Option',
    buildmybot: true,
    intercom: false,
    drift: false,
    zendesk: false,
  },
  {
    feature: 'Sentiment Analysis',
    buildmybot: true,
    intercom: false,
    drift: false,
    zendesk: true,
  },
  {
    feature: 'Free Tier Available',
    buildmybot: true,
    intercom: false,
    drift: false,
    zendesk: false,
  },
  {
    feature: 'Starting Price',
    buildmybot: '$0/mo',
    intercom: '$74/mo',
    drift: '$2,500/mo',
    zendesk: '$49/mo',
  },
];

const integrations = [
  { name: 'OpenAI', logo: '🤖' },
  { name: 'Stripe', logo: '💳' },
  { name: 'Slack', logo: '💬' },
  { name: 'Zapier', logo: '⚡' },
  { name: 'HubSpot', logo: '🔶' },
  { name: 'Salesforce', logo: '☁️' },
  { name: 'Google Calendar', logo: '📅' },
  { name: 'Calendly', logo: '📆' },
  { name: 'Mailchimp', logo: '📧' },
  { name: 'Twilio', logo: '📞' },
  { name: 'WordPress', logo: '🌐' },
  { name: 'Shopify', logo: '🛒' },
];

const faqs = [
  {
    q: 'How does the AI chatbot learn about my business?',
    a: 'Simply paste your website URL or upload documents like PDFs, FAQs, and product manuals. Our AI scans and learns your content in seconds, enabling it to answer customer questions accurately. You can also manually add specific Q&As to fine-tune responses.',
  },
  {
    q: 'Can the chatbot hand off to a human agent?',
    a: 'Yes! Our smart escalation system detects when a customer needs human assistance. The bot captures all context and seamlessly transfers the conversation to your team via email, Slack, or your preferred channel.',
  },
  {
    q: 'How realistic is the Voice Agent?',
    a: "Our Voice Agent uses Cartesia's cutting-edge voice synthesis—the same technology used in Hollywood productions. In blind tests, most callers cannot distinguish our AI from a real human receptionist.",
  },
  {
    q: 'What integrations are available?',
    a: 'We integrate with 50+ popular tools including Stripe, OpenAI, Slack, HubSpot, Salesforce, Google Calendar, Calendly, Zapier, and more. API access is available on Professional plans and above for custom integrations.',
  },
  {
    q: 'Is my data secure?',
    a: 'Absolutely. We use enterprise-grade encryption (AES-256), maintain SOC 2 Type II compliance, and never train our models on your proprietary data. GDPR and CCPA compliant with optional data residency.',
  },
  {
    q: 'Can I white-label BuildMyBot for my agency?',
    a: 'Yes! Our Partner Program lets you resell BuildMyBot under your own brand. You get a custom domain, your branding throughout, and up to 50% revenue share. Perfect for agencies and consultants.',
  },
];

const createDemoMessageId = () =>
  `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const FeaturesPage: React.FC = () => {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState(0);
  const [demoMessages, setDemoMessages] = useState<
    { id: string; role: 'user' | 'bot'; text: string }[]
  >(() => [
    {
      id: createDemoMessageId(),
      role: 'bot',
      text: "Hi! 👋 I'm the BuildMyBot demo assistant. Ask me anything about our features!",
    },
  ]);
  const [demoInput, setDemoInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
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

  useEffect(() => {
    if (!chatRef.current) {
      return;
    }
    const shouldScroll = demoMessages.length > 0 || isTyping;
    if (shouldScroll) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [demoMessages.length, isTyping]);

  const handleDemoSend = () => {
    if (!demoInput.trim()) return;
    const userMsg = demoInput;
    setDemoMessages((prev) => [
      ...prev,
      { id: createDemoMessageId(), role: 'user', text: userMsg },
    ]);
    setDemoInput('');
    setIsTyping(true);

    setTimeout(() => {
      const responses = [
        'Great question! BuildMyBot can help with that. Our AI learns from your website and documents to provide accurate, instant responses 24/7.',
        "That's one of our most popular features! Thousands of businesses use it to capture more leads and convert visitors into customers.",
        'Absolutely! Our platform is designed to be intuitive—no coding required. Most businesses are up and running in under 5 minutes.',
        "Our Voice Agent powered by Cartesia sounds incredibly human. Customers often can't tell they're speaking with AI!",
      ];
      const randomResponse =
        responses[Math.floor(Math.random() * responses.length)];
      setDemoMessages((prev) => [
        ...prev,
        { id: createDemoMessageId(), role: 'bot', text: randomResponse },
      ]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <PageLayout>
      <SEO
        title={SEOConfig.features.title}
        description={SEOConfig.features.description}
        keywords={SEOConfig.features.keywords}
        structuredData={faqStructuredData}
      />
      <div className="relative overflow-hidden">
        <section className="relative py-24 lg:py-32 overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900" />

          <div className="absolute top-20 left-10 w-72 h-72 bg-blue-500/30 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-20 right-10 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse delay-1000" />
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-500/10 rounded-full blur-3xl" />

          <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12">
            <div className="text-center space-y-8">
              <div className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2 text-blue-200 text-sm">
                <Sparkles size={16} className="text-yellow-400" />
                <span>Powerful AI Features for Every Business</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold text-white leading-tight">
                Everything You Need to Build
                <span className="block mt-2 bg-gradient-to-r from-blue-400 via-cyan-300 to-teal-400 bg-clip-text text-transparent">
                  AI-Powered Conversations
                </span>
              </h1>

              <p className="text-xl text-blue-100/80 max-w-3xl mx-auto leading-relaxed">
                From chatbots to voice agents, lead capture to marketing
                automation—BuildMyBot gives you everything to convert visitors
                into customers, 24/7.
              </p>

              <div className="flex flex-wrap justify-center gap-4 pt-4">
                <a
                  href="/"
                  className="group inline-flex items-center gap-2 bg-white text-blue-900 px-8 py-4 rounded-xl font-bold hover:bg-blue-50 transition-all shadow-2xl shadow-blue-500/25 hover:shadow-blue-500/40 hover:scale-105"
                >
                  Start Building Free
                  <ArrowRight
                    size={18}
                    className="group-hover:translate-x-1 transition-transform"
                  />
                </a>
                <a
                  href="/demo"
                  className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm text-white border border-white/20 px-8 py-4 rounded-xl font-bold hover:bg-white/20 transition-all"
                >
                  <Play size={18} />
                  Watch Demo
                </a>
              </div>

              <div className="flex flex-wrap justify-center gap-8 pt-8 text-blue-200/80">
                <div className="flex items-center gap-2">
                  <Check size={18} className="text-emerald-400" />
                  <span>No credit card required</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check size={18} className="text-emerald-400" />
                  <span>5-minute setup</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check size={18} className="text-emerald-400" />
                  <span>Cancel anytime</span>
                </div>
              </div>
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-slate-50 to-transparent" />
        </section>

        <section className="py-24 bg-slate-50">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Powerful Features, One Platform
              </h2>
              <p className="text-xl text-slate-600 max-w-2xl mx-auto">
                Everything you need to automate conversations, capture leads,
                and grow your business—without the complexity.
              </p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {coreFeatures.map((feature) => (
                <div
                  key={feature.title}
                  className="group relative bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:shadow-xl transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                >
                  <div
                    className={`absolute inset-0 ${feature.bgGlow} opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-xl`}
                  />

                  <div className="relative z-10">
                    <div
                      className={`w-14 h-14 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center text-white mb-4 shadow-lg group-hover:scale-110 transition-transform duration-300`}
                    >
                      <feature.icon size={28} />
                    </div>

                    <h3 className="font-bold text-lg text-slate-900 mb-1">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-blue-600 font-medium mb-3">
                      {feature.subtitle}
                    </p>
                    <p className="text-slate-600 text-sm mb-4 leading-relaxed">
                      {feature.description}
                    </p>

                    <ul className="space-y-2">
                      {feature.highlights.map((highlight) => (
                        <li
                          key={highlight}
                          className="flex items-center gap-2 text-sm text-slate-700"
                        >
                          <Check
                            size={14}
                            className="text-emerald-500 shrink-0"
                          />
                          {highlight}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="demo"
          className="py-24 bg-gradient-to-b from-slate-50 to-white"
        >
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                See It In Action
              </h2>
              <p className="text-xl text-slate-600 max-w-2xl mx-auto">
                Try our live demo and experience how BuildMyBot handles real
                conversations.
              </p>
            </div>

            <div className="max-w-lg mx-auto">
              <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 backdrop-blur rounded-full flex items-center justify-center">
                    <Bot size={24} className="text-white" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white">BuildMyBot Demo</h4>
                    <p className="text-blue-100 text-xs">
                      Powered by AI • Always Online
                    </p>
                  </div>
                  <div className="ml-auto flex items-center gap-2">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-xs text-blue-100">Live</span>
                  </div>
                </div>

                <div
                  ref={chatRef}
                  className="h-80 overflow-y-auto p-4 space-y-4 bg-slate-50"
                >
                  {demoMessages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
                          msg.role === 'user'
                            ? 'bg-blue-600 text-white rounded-br-md'
                            : 'bg-white border border-slate-200 text-slate-800 rounded-bl-md shadow-sm'
                        }`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {isTyping && (
                    <div className="flex justify-start">
                      <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-bl-md shadow-sm">
                        <div className="flex gap-1">
                          <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                          <div
                            className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                            style={{ animationDelay: '0.1s' }}
                          />
                          <div
                            className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                            style={{ animationDelay: '0.2s' }}
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-slate-200 bg-white">
                  <div className="flex gap-2">
                    <input
                      value={demoInput}
                      onChange={(e) => setDemoInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleDemoSend()}
                      className="flex-1 bg-slate-100 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Ask about our features..."
                    />
                    <button
                      type="button"
                      onClick={handleDemoSend}
                      className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition-colors"
                    >
                      <Send size={18} />
                    </button>
                  </div>
                  <div className="flex gap-2 mt-3">
                    {[
                      'How does AI training work?',
                      'Tell me about Voice Agent',
                      'Pricing info',
                    ].map((q) => (
                      <button
                        type="button"
                        key={q}
                        onClick={() => {
                          setDemoInput(q);
                        }}
                        className="text-xs bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-full transition-colors"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 bg-slate-900 text-white">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold mb-4">
                How We Compare
              </h2>
              <p className="text-xl text-slate-400 max-w-2xl mx-auto">
                See why businesses choose BuildMyBot over traditional solutions.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[700px]">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left py-4 px-4 text-slate-400 font-medium">
                      Feature
                    </th>
                    <th className="py-4 px-4">
                      <div className="flex flex-col items-center">
                        <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center mb-2">
                          <Bot size={24} />
                        </div>
                        <span className="font-bold text-blue-400">
                          BuildMyBot
                        </span>
                      </div>
                    </th>
                    <th className="py-4 px-4 text-slate-400">Intercom</th>
                    <th className="py-4 px-4 text-slate-400">Drift</th>
                    <th className="py-4 px-4 text-slate-400">Zendesk</th>
                  </tr>
                </thead>
                <tbody>
                  {comparisonData.map((row) => (
                    <tr
                      key={row.feature}
                      className="border-b border-slate-800 hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="py-4 px-4 text-slate-300">
                        {row.feature}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {typeof row.buildmybot === 'boolean' ? (
                          row.buildmybot ? (
                            <Check
                              size={20}
                              className="text-emerald-400 mx-auto"
                            />
                          ) : (
                            <X size={20} className="text-slate-600 mx-auto" />
                          )
                        ) : (
                          <span className="text-emerald-400 font-bold">
                            {row.buildmybot}
                          </span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {typeof row.intercom === 'boolean' ? (
                          row.intercom ? (
                            <Check
                              size={20}
                              className="text-slate-400 mx-auto"
                            />
                          ) : (
                            <X size={20} className="text-slate-600 mx-auto" />
                          )
                        ) : (
                          <span className="text-slate-400">{row.intercom}</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {typeof row.drift === 'boolean' ? (
                          row.drift ? (
                            <Check
                              size={20}
                              className="text-slate-400 mx-auto"
                            />
                          ) : (
                            <X size={20} className="text-slate-600 mx-auto" />
                          )
                        ) : (
                          <span className="text-slate-400">{row.drift}</span>
                        )}
                      </td>
                      <td className="py-4 px-4 text-center">
                        {typeof row.zendesk === 'boolean' ? (
                          row.zendesk ? (
                            <Check
                              size={20}
                              className="text-slate-400 mx-auto"
                            />
                          ) : (
                            <X size={20} className="text-slate-600 mx-auto" />
                          )
                        ) : (
                          <span className="text-slate-400">{row.zendesk}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-6 lg:px-12">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Seamless Integrations
              </h2>
              <p className="text-xl text-slate-600 max-w-2xl mx-auto">
                Connect BuildMyBot with your favorite tools and supercharge your
                workflow.
              </p>
            </div>

            <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
              {integrations.map((integration) => (
                <div
                  key={integration.name}
                  className="group bg-slate-50 hover:bg-white border border-slate-200 hover:border-blue-300 rounded-2xl p-6 text-center transition-all duration-300 hover:shadow-lg hover:-translate-y-1"
                >
                  <div className="text-4xl mb-3 group-hover:scale-110 transition-transform duration-300">
                    {integration.logo}
                  </div>
                  <p className="text-sm font-medium text-slate-700">
                    {integration.name}
                  </p>
                </div>
              ))}
            </div>

            <div className="text-center mt-12">
              <p className="text-slate-500 mb-4">
                ...and 50+ more integrations available
              </p>
              <a
                href="/"
                className="inline-flex items-center gap-2 text-blue-600 font-medium hover:text-blue-800 transition-colors"
              >
                View all integrations
                <ArrowRight size={16} />
              </a>
            </div>
          </div>
        </section>

        <section className="py-24 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 relative overflow-hidden">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-400/20 rounded-full blur-3xl" />

          <div className="relative z-10 max-w-4xl mx-auto px-6 lg:px-12 text-center">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-4 py-2 text-white/90 text-sm mb-8">
              <Zap size={16} />
              Ready to transform your business?
            </div>

            <h2 className="text-3xl md:text-5xl font-extrabold text-white mb-6">
              Start Building Your Bot Today
            </h2>

            <p className="text-xl text-blue-100 mb-10 max-w-2xl mx-auto">
              Join thousands of businesses using BuildMyBot to automate
              conversations, capture more leads, and grow revenue—all while you
              sleep.
            </p>

            <div className="flex flex-wrap justify-center gap-4">
              <a
                href="/"
                className="group inline-flex items-center gap-2 bg-white text-blue-700 px-8 py-4 rounded-xl font-bold hover:bg-blue-50 transition-all shadow-2xl hover:shadow-white/25 hover:scale-105"
              >
                Get Started Free
                <ArrowRight
                  size={18}
                  className="group-hover:translate-x-1 transition-transform"
                />
              </a>
              <a
                href="/contact"
                className="inline-flex items-center gap-2 bg-white/10 backdrop-blur text-white border border-white/30 px-8 py-4 rounded-xl font-bold hover:bg-white/20 transition-all"
              >
                Talk to Sales
              </a>
            </div>

            <div className="flex flex-wrap justify-center gap-8 mt-12 text-blue-100">
              <div className="flex items-center gap-2">
                <Shield size={18} />
                <span>SOC 2 Compliant</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock size={18} />
                <span>24/7 Support</span>
              </div>
              <div className="flex items-center gap-2">
                <Star size={18} />
                <span>4.9/5 Rating</span>
              </div>
            </div>
          </div>
        </section>

        <section className="py-24 bg-slate-50">
          <div className="max-w-4xl mx-auto px-6 lg:px-12">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Frequently Asked Questions
              </h2>
              <p className="text-xl text-slate-600">
                Everything you need to know about BuildMyBot features.
              </p>
            </div>

            <div className="space-y-4">
              {faqs.map((faq, i) => (
                <div
                  key={faq.q}
                  className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(openFaq === i ? null : i)}
                    className="w-full flex items-center justify-between p-6 text-left"
                  >
                    <h3 className="font-bold text-slate-900 pr-4">{faq.q}</h3>
                    <div
                      className={`shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`}
                    >
                      <ChevronDown size={18} />
                    </div>
                  </button>
                  <div
                    className={`overflow-hidden transition-all duration-300 ${openFaq === i ? 'max-h-96' : 'max-h-0'}`}
                  >
                    <p className="px-6 pb-6 text-slate-600 leading-relaxed">
                      {faq.a}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </PageLayout>
  );
};
