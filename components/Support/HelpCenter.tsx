import React, { useState } from 'react';
import { 
  Search, 
  BookOpen, 
  Bot, 
  Zap, 
  Shield, 
  MessageSquare, 
  Phone, 
  Settings, 
  CreditCard,
  ChevronRight,
  ArrowLeft,
  PlayCircle
} from 'lucide-react';
import { PageLayout } from '../Landing/pages/PageLayout';
import { SEO } from '../SEO/SEO';

const HELP_CATEGORIES = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    icon: <Zap className="text-amber-500" />,
    description: 'Learn the basics of BuildMyBot and create your first AI agent in minutes.',
    articles: [
      { id: 'create-bot', title: 'Creating and Configuring Chatbots', duration: '5 min' },
      { id: 'embed-widget', title: 'Embedding the Chat Widget on Your Site', duration: '3 min' },
      { id: 'persona-setup', title: 'Choosing the Right AI Persona', duration: '4 min' }
    ]
  },
  {
    id: 'knowledge-base',
    title: 'Knowledge Base',
    icon: <BookOpen className="text-blue-500" />,
    description: 'How to train your AI on PDFs, URLs, and custom documents.',
    articles: [
      { id: 'upload-docs', title: 'Uploading and Managing Documents', duration: '6 min' },
      { id: 'web-scraping', title: 'Using the Web Scraper for Training', duration: '4 min' },
      { id: 'knowledge-refresh', title: 'Keeping Your Knowledge Base Up to Date', duration: '3 min' }
    ]
  },
  {
    id: 'voice-agents',
    title: 'Voice Agents',
    icon: <Phone className="text-purple-500" />,
    description: 'Setup ultra-realistic voice agents for phone automation.',
    articles: [
      { id: 'voice-config', title: 'Configuring Your Voice Agent', duration: '7 min' },
      { id: 'phone-numbers', title: 'Provisioning Local Phone Numbers', duration: '3 min' },
      { id: 'call-routing', title: 'Setting Up Call Transfers', duration: '5 min' }
    ]
  },
  {
    id: 'billing',
    title: 'Billing & Usage',
    icon: <CreditCard className="text-emerald-500" />,
    description: 'Manage your subscription, plan limits, and usage metrics.',
    articles: [
      { id: 'plans-overview', title: 'Understanding Our Pricing Plans', duration: '5 min' },
      { id: 'metered-billing', title: 'How Voice Minute Metering Works', duration: '4 min' },
      { id: 'white-label-billing', title: 'Partner & White-Label Fees', duration: '3 min' }
    ]
  }
];

export const HelpCenter: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArticle, setSelectedArticle] = useState<string | null>(null);

  const renderArticle = (id: string) => {
    switch (id) {
      case 'create-bot':
        return (
          <div className="prose prose-slate max-w-none">
            <h1>Creating and Configuring Chatbots</h1>
            <p className="lead">Follow this guide to build a high-converting AI chatbot for your business.</p>
            
            <h3>Step 1: Choose Your Template</h3>
            <p>From the "My Bots" dashboard, click <strong>"New Bot"</strong>. You can start from a blank canvas or choose an industry-specific template like Real Estate, E-commerce, or Customer Support.</p>
            
            <h3>Step 2: Configure the System Prompt</h3>
            <p>The system prompt is the "brain" of your bot. It defines how the AI should behave. For example:</p>
            <div className="bg-slate-100 p-4 rounded-lg font-mono text-sm border-l-4 border-blue-600 mb-4">
              "You are a professional receptionist for a Dental Clinic. Your goal is to answer patient questions about services and book appointments via Calendly."
            </div>
            
            <h3>Step 3: Training Your Bot</h3>
            <p>Go to the <strong>Knowledge</strong> tab. Here you can upload PDFs, text files, or paste URLs. BuildMyBot will scrape the content and use it as the source of truth for the AI's answers.</p>
            
            <h3>Step 4: Test & Deploy</h3>
            <p>Use the built-in simulator to chat with your bot. Once satisfied, click <strong>"Embed Code"</strong> to copy the snippet to your website header.</p>
          </div>
        );
      default:
        return (
          <div className="text-center py-20">
            <h2 className="text-2xl font-bold text-slate-400">Article Coming Soon</h2>
            <p className="text-slate-500 mt-2">We are working hard to complete this documentation.</p>
            <button 
              onClick={() => setSelectedArticle(null)}
              className="mt-6 text-blue-600 font-bold flex items-center gap-2 mx-auto"
            >
              <ArrowLeft size={18} /> Back to Help Center
            </button>
          </div>
        );
    }
  };

  return (
    <PageLayout>
      <SEO 
        title="Help Center | BuildMyBot Documentation" 
        description="Learn how to build, deploy, and scale your AI workforce with our comprehensive guides." 
      />
      
      <div className="bg-slate-900 py-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-6">How can we help?</h1>
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={24} />
            <input 
              type="text"
              placeholder="Search for articles (e.g., 'embed chatbot')"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-14 pr-6 py-4 rounded-2xl bg-white/10 border border-white/20 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-lg"
            />
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16">
        {selectedArticle ? (
          <div>
            <button 
              onClick={() => setSelectedArticle(null)}
              className="mb-8 text-slate-600 hover:text-blue-600 font-medium flex items-center gap-2 transition-colors"
            >
              <ArrowLeft size={18} /> Back to Help Center
            </button>
            <div className="bg-white rounded-3xl border border-slate-200 p-8 md:p-12 shadow-sm">
              {renderArticle(selectedArticle)}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {HELP_CATEGORIES.map((cat) => (
              <div key={cat.id} className="bg-white rounded-3xl border border-slate-200 p-8 hover:shadow-xl transition-all group">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-2xl shadow-inner group-hover:scale-110 transition-transform">
                    {cat.icon}
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-slate-900">{cat.title}</h2>
                    <p className="text-slate-500 text-sm">{cat.description}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {cat.articles.map((art) => (
                    <button
                      key={art.id}
                      onClick={() => setSelectedArticle(art.id)}
                      className="w-full flex items-center justify-between p-4 rounded-xl hover:bg-slate-50 transition-colors text-left border border-transparent hover:border-slate-200"
                    >
                      <div className="flex items-center gap-3">
                        <BookOpen size={18} className="text-slate-300" />
                        <span className="font-semibold text-slate-700">{art.title}</span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400 text-xs">
                        <span>{art.duration}</span>
                        <ChevronRight size={14} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-20 bg-gradient-to-br from-blue-900 to-indigo-900 rounded-3xl p-8 md:p-12 text-center text-white relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl" />
          <h2 className="text-3xl font-bold mb-4 relative z-10">Can't find what you're looking for?</h2>
          <p className="text-blue-200 mb-8 relative z-10">Our support team is available 24/7 to help you with technical or billing issues.</p>
          <div className="flex flex-wrap justify-center gap-4 relative z-10">
            <a href="/contact" className="bg-white text-blue-900 px-8 py-3 rounded-xl font-bold hover:bg-blue-50 transition-all flex items-center gap-2">
              <MessageSquare size={18} />
              Open a Ticket
            </a>
            <button className="bg-blue-700 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-800 transition-all flex items-center gap-2">
              <PlayCircle size={18} />
              Watch Video Tutorials
            </button>
          </div>
        </div>
      </div>
    </PageLayout>
  );
};
