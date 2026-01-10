import {
  CheckCircle,
  Layout,
  Monitor,
  RefreshCcw,
  Rocket,
  Smartphone,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { generateWebsiteStructure } from '../../services/openaiService';

export const WebsiteBuilder: React.FC = () => {
  const [businessName, setBusinessName] = useState('');
  const [description, setDescription] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [siteData, setSiteData] = useState<any>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>(
    'desktop',
  );

  const handleGenerate = async () => {
    if (!businessName || !description) return;
    setIsGenerating(true);
    try {
      const resultJson = await generateWebsiteStructure(
        businessName,
        description,
      );
      setSiteData(JSON.parse(resultJson));
    } catch (error) {
      console.error('Failed to parse website JSON', error);
      // Fallback
      setSiteData({
        headline: `Welcome to ${businessName}`,
        subheadline: `We provide the best services for ${description}`,
        features: ['Quality Service', 'Expert Team', '24/7 Support'],
        ctaText: 'Get Started Now',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-6 animate-fade-in">
      {/* Editor Sidebar */}
      <div className="w-80 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-y-auto">
        <div className="p-6 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 flex items-center gap-2">
            <Layout className="text-blue-900" size={20} /> Site Builder
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Generate a landing page in seconds.
          </p>
        </div>

        <div className="p-6 space-y-6 flex-1">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Business Name
            </label>
            <input
              type="text"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              className="w-full rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900"
              placeholder="e.g. Acme Coffee"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              What do you do?
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full h-32 rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900 p-3 text-sm"
              placeholder="Describe your services, target audience, and key value propositions..."
            />
          </div>
          <button
            type="button"
            onClick={handleGenerate}
            disabled={isGenerating || !businessName}
            className="w-full bg-blue-900 text-white py-3 rounded-lg font-medium hover:bg-blue-950 disabled:opacity-50 flex items-center justify-center gap-2 shadow-md shadow-blue-200 transition"
          >
            {isGenerating ? (
              <RefreshCcw className="animate-spin" size={18} />
            ) : (
              <Rocket size={18} />
            )}
            {siteData ? 'Regenerate Site' : 'Generate Site'}
          </button>
        </div>

        {siteData && (
          <div className="p-6 bg-slate-50 border-t border-slate-200">
            <div className="flex items-center gap-2 text-emerald-600 mb-3">
              <CheckCircle size={16} />{' '}
              <span className="text-sm font-medium">Ready to Publish</span>
            </div>
            <button
              type="button"
              className="w-full bg-slate-900 text-white py-2 rounded-lg text-sm font-medium hover:bg-slate-800"
            >
              Publish to Custom Domain
            </button>
          </div>
        )}
      </div>

      {/* Preview Area */}
      <div className="flex-1 bg-slate-100 rounded-xl border border-slate-200 flex flex-col overflow-hidden relative">
        <div className="h-12 bg-white border-b border-slate-200 flex items-center justify-between px-4">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Live Preview
          </span>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setPreviewMode('desktop')}
              className={`p-1.5 rounded ${previewMode === 'desktop' ? 'bg-white shadow text-blue-900' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Monitor size={16} />
            </button>
            <button
              type="button"
              onClick={() => setPreviewMode('mobile')}
              className={`p-1.5 rounded ${previewMode === 'mobile' ? 'bg-white shadow text-blue-900' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Smartphone size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto flex justify-center p-8">
          {siteData ? (
            <div
              className={`bg-white shadow-xl transition-all duration-300 overflow-hidden ${previewMode === 'mobile' ? 'w-[375px] rounded-3xl border-8 border-slate-800' : 'w-full rounded-lg'}`}
            >
              {/* Mock Generated Website */}
              <div className="flex flex-col min-h-full">
                <nav className="p-4 border-b border-gray-100 flex justify-between items-center">
                  <span className="font-bold text-lg text-gray-800">
                    {businessName}
                  </span>
                  <button
                    type="button"
                    className="px-4 py-1.5 bg-blue-900 text-white rounded text-sm hover:bg-blue-950"
                  >
                    Contact
                  </button>
                </nav>
                <header className="py-16 px-6 text-center bg-gradient-to-b from-blue-50 to-white">
                  <h1 className="text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
                    {siteData.headline}
                  </h1>
                  <p className="text-lg text-gray-600 max-w-lg mx-auto mb-8">
                    {siteData.subheadline}
                  </p>
                  <button
                    type="button"
                    className="px-8 py-3 bg-blue-900 text-white rounded-lg font-semibold shadow-lg hover:bg-blue-950 transform hover:-translate-y-0.5 transition"
                  >
                    {siteData.ctaText}
                  </button>
                </header>
                <section className="py-12 px-6 bg-white">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {siteData.features?.map((feat: string, i: number) => (
                      <div
                        key={i}
                        className="p-6 bg-gray-50 rounded-xl border border-gray-100"
                      >
                        <div className="w-10 h-10 bg-blue-100 text-blue-900 rounded-lg flex items-center justify-center mb-3">
                          <CheckCircle size={20} />
                        </div>
                        <h3 className="font-bold text-gray-800">{feat}</h3>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Embedded Bot Placeholder */}
                <div className="fixed bottom-4 right-4 animate-bounce-slow">
                  <div className="w-14 h-14 bg-blue-900 rounded-full shadow-lg flex items-center justify-center text-white cursor-pointer hover:bg-blue-950 transition">
                    <svg
                      width="24"
                      height="24"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-400">
              <div className="w-24 h-24 bg-slate-200 rounded-full flex items-center justify-center mb-4">
                <Layout size={48} className="text-slate-400" />
              </div>
              <p className="font-medium">
                Enter your business info to generate a site.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
