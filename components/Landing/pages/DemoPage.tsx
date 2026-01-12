import {
  ArrowRight,
  CheckCircle,
  Globe,
  Loader,
  Megaphone,
  Play,
  Search,
  Sparkles,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import {
  generateMarketingContent,
  scrapeWebsiteContent,
} from '../../../services/openaiService';
import { PageLayout } from './PageLayout';

interface DemoPageProps {
  onLogin?: () => void;
}

const LOGIN_FALLBACK_URL = 'https://login.buildmybot.app/?auth=signup';

export const DemoPage: React.FC<DemoPageProps> = ({ onLogin }) => {
  const [demoUrl, setDemoUrl] = useState('');
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoResult, setDemoResult] = useState('');
  const [marketingTopic, setMarketingTopic] = useState('');
  const [marketingLoading, setMarketingLoading] = useState(false);
  const [marketingResult, setMarketingResult] = useState('');

  const handleLogin = () => {
    if (onLogin) {
      onLogin();
      return;
    }
    if (typeof window !== 'undefined') {
      window.location.href = LOGIN_FALLBACK_URL;
    }
  };

  const handleDemoScrape = async () => {
    if (!demoUrl.trim()) return;
    setDemoLoading(true);
    setDemoResult('');
    try {
      const result = await scrapeWebsiteContent(demoUrl.trim());
      setDemoResult(result);
    } catch (error) {
      setDemoResult(
        error instanceof Error
          ? error.message
          : 'Failed to analyze the website.',
      );
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
        'social post',
        marketingTopic.trim(),
        'confident, helpful',
      );
      setMarketingResult(result);
    } catch (error) {
      setMarketingResult('Failed to generate content.');
    } finally {
      setMarketingLoading(false);
    }
  };

  return (
    <PageLayout>
      <div className="max-w-6xl mx-auto px-6 lg:px-12 py-16 space-y-16">
        <section className="text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-2 rounded-full text-sm font-semibold">
            <Sparkles size={16} />
            Live demo
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900">
            See BuildMyBot in action
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto leading-relaxed">
            Watch the quick walkthrough and try the AI tools below. You can
            generate content and analyze a website in seconds.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <button
              type="button"
              onClick={handleLogin}
              className="inline-flex items-center gap-2 bg-blue-900 text-white px-8 py-4 rounded-xl font-bold hover:bg-blue-950 transition-all"
            >
              Start free
              <ArrowRight size={18} />
            </button>
            <a
              href="/pricing"
              className="inline-flex items-center gap-2 border-2 border-slate-200 text-slate-700 px-8 py-4 rounded-xl font-bold hover:border-blue-300 hover:text-blue-700 transition-all"
            >
              View pricing
            </a>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-slate-500">
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

        <section className="text-center space-y-6">
          <div>
            <p className="text-blue-600 font-semibold text-sm uppercase tracking-wider mb-3">
              Watch the overview
            </p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-4">
              BuildMyBot in 2 minutes
            </h2>
            <p className="text-slate-600 text-lg max-w-2xl mx-auto">
              Get a quick tour of the platform and see how teams use it to
              capture leads and automate follow-ups.
            </p>
          </div>
          <div className="max-w-4xl mx-auto">
            <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl border border-slate-200">
              <iframe
                src="https://www.youtube.com/embed/H8bIoQiDSNk?rel=0"
                title="BuildMyBot introduction"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="absolute inset-0 w-full h-full"
              />
            </div>
          </div>
        </section>

        <section className="space-y-8">
          <div className="text-center">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
              Try it yourself
            </h2>
            <p className="text-slate-600 text-lg">
              Run a quick AI demo to experience BuildMyBot.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Globe className="text-blue-900 shrink-0" size={24} />
                <h3 className="text-lg font-bold">Website URL trainer</h3>
              </div>
              <p className="text-slate-600 mb-4 text-sm sm:text-base">
                Enter a website URL and see what the AI learns about the
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
                <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 max-h-56 overflow-y-auto whitespace-pre-wrap">
                  {demoResult}
                </div>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-6">
              <div className="flex items-center gap-3 mb-4">
                <Megaphone className="text-blue-900 shrink-0" size={24} />
                <h3 className="text-lg font-bold">Marketing post creator</h3>
              </div>
              <p className="text-slate-600 mb-4 text-sm sm:text-base">
                Generate a short social post for your product or campaign.
              </p>
              <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <input
                  type="text"
                  value={marketingTopic}
                  onChange={(e) => setMarketingTopic(e.target.value)}
                  placeholder="Enter your topic or product"
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
                <div className="bg-slate-50 rounded-lg p-4 text-sm text-slate-700 max-h-56 overflow-y-auto whitespace-pre-wrap">
                  {marketingResult}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="bg-slate-900 text-white rounded-2xl p-8 md:p-12 text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full text-sm">
            <Play size={16} />
            Ready to build?
          </div>
          <h2 className="text-2xl md:text-3xl font-bold">
            Launch your AI agent today
          </h2>
          <p className="text-slate-300 max-w-2xl mx-auto">
            Start free and turn more visitors into qualified leads with 24/7
            automation.
          </p>
          <button
            type="button"
            onClick={handleLogin}
            className="inline-flex items-center gap-2 bg-white text-slate-900 px-6 py-3 rounded-xl font-bold hover:bg-slate-100 transition-all"
          >
            Start free
            <ArrowRight size={18} />
          </button>
        </section>
      </div>
    </PageLayout>
  );
};
