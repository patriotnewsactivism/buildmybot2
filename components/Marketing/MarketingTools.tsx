import {
  Check,
  Copy,
  Instagram,
  Loader,
  Mail,
  Megaphone,
  Smartphone,
  Twitter,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { generateMarketingContent } from '../../services/openaiService';

type MarketingContentType = 'email' | 'social' | 'ad' | 'viral-thread' | 'story';

type MarketingTool = {
  id: MarketingContentType;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  desc: string;
};

export const MarketingTools: React.FC = () => {
  const [topic, setTopic] = useState('');
  const [tone, setTone] = useState('Professional');
  const [activeType, setActiveType] = useState<MarketingContentType>('email');
  const [generatedContent, setGeneratedContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const topicInputId = 'marketing-topic';
  const toneSelectId = 'marketing-tone';

  const handleGenerate = async () => {
    if (!topic) return;
    setLoading(true);
    setGeneratedContent('');
    try {
      const content = await generateMarketingContent(activeType, topic, tone);
      setGeneratedContent(content);
    } catch (e) {
      setGeneratedContent('Error generating content. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const tools: MarketingTool[] = [
    {
      id: 'email',
      label: 'Email Campaign',
      icon: Mail,
      desc: 'Cold outreach or newsletters',
    },
    {
      id: 'social',
      label: 'Social Post',
      icon: Instagram,
      desc: 'LinkedIn, Twitter, or FB',
    },
    {
      id: 'ad',
      label: 'Ad Copy',
      icon: Megaphone,
      desc: 'Google Ads or Facebook Ads',
    },
    {
      id: 'viral-thread',
      label: 'Viral Thread',
      icon: Twitter,
      desc: 'Twitter/X Thread Generator',
    },
    {
      id: 'story',
      label: 'IG/TikTok Story',
      icon: Smartphone,
      desc: '15s Video Script',
    },
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-slate-800">
          AI Marketing Suite
        </h2>
        <p className="text-slate-500">
          Generate high-converting copy in seconds using GPT-5o Mini.
        </p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {tools.map((t) => (
          <button
            type="button"
            key={t.id}
            onClick={() => setActiveType(t.id)}
            className={`p-3 rounded-xl border text-left transition flex flex-col justify-between min-h-[100px] ${
              activeType === t.id
                ? 'border-blue-900 bg-blue-50 ring-1 ring-blue-900'
                : 'border-slate-200 bg-white hover:border-blue-300'
            }`}
          >
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${activeType === t.id ? 'bg-blue-900 text-white' : 'bg-slate-100 text-slate-500'}`}
            >
              <t.icon size={16} />
            </div>
            <div>
              <div className="font-semibold text-slate-800 text-xs">
                {t.label}
              </div>
              <div className="text-[10px] text-slate-500 leading-tight mt-1">
                {t.desc}
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="md:col-span-2">
            <label
              htmlFor={topicInputId}
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              What is this about?
            </label>
            <input
              id={topicInputId}
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g., New Summer Sale, Product Launch, Webinar Invite"
              className="w-full rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900"
            />
          </div>
          <div>
            <label
              htmlFor={toneSelectId}
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              Tone of Voice
            </label>
            <select
              id={toneSelectId}
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              className="w-full rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900"
            >
              <option>Professional</option>
              <option>Friendly</option>
              <option>Urgent</option>
              <option>Witty</option>
              <option>Luxury</option>
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={handleGenerate}
          disabled={!topic || loading}
          className="w-full bg-blue-900 text-white py-3 rounded-lg font-medium hover:bg-blue-950 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {loading ? (
            <Loader className="animate-spin" size={20} />
          ) : (
            <Megaphone size={20} />
          )}
          Generate Content
        </button>
      </div>

      {generatedContent && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden animate-fade-in">
          <div className="bg-slate-50 px-6 py-3 border-b border-slate-100 flex justify-between items-center">
            <h3 className="font-medium text-slate-700">Generated Result</h3>
            <button
              type="button"
              onClick={copyToClipboard}
              className="text-sm text-blue-900 hover:text-blue-950 flex items-center gap-1"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied' : 'Copy Text'}
            </button>
          </div>
          <div className="p-6 whitespace-pre-wrap text-slate-600 text-sm leading-relaxed">
            {generatedContent}
          </div>
        </div>
      )}
    </div>
  );
};
