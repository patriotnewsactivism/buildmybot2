import {
  BookOpen,
  Briefcase,
  Building2,
  Calculator,
  Camera,
  Car,
  Check,
  Dog,
  Dumbbell,
  Gavel,
  GraduationCap,
  Hammer,
  Heart,
  Hotel,
  Loader,
  Package,
  Scissors,
  ShoppingCart,
  Sparkles,
  Stethoscope,
  Utensils,
  Wrench,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';

interface PrebuiltKnowledgeBase {
  id: string;
  name: string;
  industry: string;
  description: string;
  faqCount: number;
}

interface PrebuiltKnowledgeSelectorProps {
  botId: string;
  onInstallComplete?: () => void;
}

const industryIcons: Record<string, React.ElementType> = {
  'Real Estate': Building2,
  Healthcare: Heart,
  'Home Services': Wrench,
  Legal: Gavel,
  'Food Service': Utensils,
  Fitness: Dumbbell,
  Insurance: Package,
  'E-commerce': ShoppingCart,
  Automotive: Car,
  Beauty: Scissors,
  Veterinary: Dog,
  Photography: Camera,
  Accounting: Calculator,
  Cleaning: Sparkles,
  Plumbing: Wrench,
  Education: GraduationCap,
  Hospitality: Hotel,
  Construction: Hammer,
  Medical: Stethoscope,
};

export const PrebuiltKnowledgeSelector: React.FC<
  PrebuiltKnowledgeSelectorProps
> = ({ botId, onInstallComplete }) => {
  const [knowledgeBases, setKnowledgeBases] = useState<PrebuiltKnowledgeBase[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installed, setInstalled] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchKnowledgeBases = async () => {
      try {
        const response = await fetch('/api/knowledge/prebuilt', {
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          setKnowledgeBases(data.knowledgeBases || []);
        } else {
          setError('Failed to load knowledge bases');
        }
      } catch (err) {
        setError('Failed to load knowledge bases');
      } finally {
        setLoading(false);
      }
    };

    fetchKnowledgeBases();
  }, []);

  const handleInstall = async (kb: PrebuiltKnowledgeBase) => {
    setInstalling(kb.id);
    setError(null);

    try {
      const response = await fetch(`/api/knowledge/prebuilt/${botId}/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ knowledgeBaseId: kb.id }),
      });

      if (response.ok) {
        setInstalled((prev) => new Set([...prev, kb.id]));
        onInstallComplete?.();
      } else {
        const data = await response.json();
        setError(data.error || 'Failed to install knowledge base');
      }
    } catch (err) {
      setError('Failed to install knowledge base');
    } finally {
      setInstalling(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="flex items-center justify-center py-8">
          <Loader className="animate-spin text-slate-400" size={24} />
          <span className="ml-2 text-slate-500">
            Loading knowledge bases...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 md:p-6">
      <div className="flex items-center gap-2 mb-4">
        <BookOpen size={20} className="text-orange-600" />
        <h3 className="font-semibold text-slate-900">
          Pre-built Industry Knowledge
        </h3>
      </div>

      <p className="text-sm text-slate-500 mb-4">
        Instantly add common FAQs for your industry. Your bot will use this
        knowledge to answer customer questions accurately.
      </p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {knowledgeBases.map((kb) => {
          const Icon = industryIcons[kb.industry] || BookOpen;
          const isInstalled = installed.has(kb.id);
          const isInstalling = installing === kb.id;

          return (
            <div
              key={kb.id}
              className={`border rounded-lg p-4 transition ${
                isInstalled
                  ? 'border-green-200 bg-green-50'
                  : 'border-slate-200 hover:border-orange-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`p-2 rounded-lg ${
                    isInstalled
                      ? 'bg-green-100 text-green-600'
                      : 'bg-orange-50 text-orange-600'
                  }`}
                >
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-slate-900 text-sm">
                    {kb.name}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">
                    {kb.description}
                  </p>
                  <p className="text-xs text-slate-400 mt-1">
                    {kb.faqCount} FAQs included
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleInstall(kb)}
                disabled={isInstalled || isInstalling}
                className={`w-full mt-3 py-2 px-3 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2 ${
                  isInstalled
                    ? 'bg-green-100 text-green-700 cursor-default'
                    : isInstalling
                      ? 'bg-slate-100 text-slate-400 cursor-wait'
                      : 'bg-orange-600 text-white hover:bg-orange-700'
                }`}
              >
                {isInstalling ? (
                  <>
                    <Loader size={14} className="animate-spin" />
                    Installing...
                  </>
                ) : isInstalled ? (
                  <>
                    <Check size={14} />
                    Installed
                  </>
                ) : (
                  'Add to Bot'
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default PrebuiltKnowledgeSelector;
