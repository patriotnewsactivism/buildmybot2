import {
  Download,
  Eye,
  Loader,
  Search,
  ShoppingBag,
  Star,
  Tag,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';

interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  priceCents: number;
  installCount: number;
  rating: number;
  configuration?: {
    tags?: string[];
  };
}

interface MarketplaceProps {
  onInstall?: (template: Template) => void;
}

export const Marketplace: React.FC<MarketplaceProps> = ({ onInstall }) => {
  const [filter, setFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const response = await fetch(buildApiUrl('/templates?featured=true'));
      if (!response.ok) throw new Error('Failed to fetch templates');
      const data = await response.json();
      setTemplates(data);
    } catch (err) {
      console.error('Error fetching templates:', err);
      setError('Failed to load templates');
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (template: Template) => {
    try {
      const response = await fetch(
        buildApiUrl(`/templates/${template.id}/install`),
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
      );

      if (!response.ok) throw new Error('Failed to install template');

      const newBot = await response.json();
      alert(`✅ Successfully installed "${template.name}"!`);

      if (onInstall) {
        onInstall(template);
      }
    } catch (err) {
      console.error('Error installing template:', err);
      alert('Failed to install template. Please try again.');
    }
  };

  const filteredTemplates = templates.filter((t) => {
    const matchesCategory = filter === 'All' || t.category === filter;
    const matchesSearch =
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const categories = [
    'All',
    ...Array.from(new Set(templates.map((t) => t.category))),
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-900" />
          <p className="text-slate-500">Loading marketplace...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            type="button"
            onClick={fetchTemplates}
            className="px-4 py-2 bg-blue-900 text-white rounded-lg hover:bg-blue-950"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            Template Marketplace
          </h2>
          <p className="text-slate-500">
            Jumpstart your bot with pre-trained industry templates.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="px-4 py-2 bg-blue-900 text-white rounded-lg font-medium hover:bg-blue-950 shadow-sm transition flex items-center gap-2"
          >
            <Zap size={16} /> Request Custom Template
          </button>
        </div>
      </div>

      {/* Search & Filter */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center">
        <div className="relative flex-1 w-full">
          <Search
            className="absolute left-3 top-2.5 text-slate-400"
            size={18}
          />
          <input
            type="text"
            placeholder="Search templates (e.g., 'Real Estate', 'Support')..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900"
          />
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto pb-2 md:pb-0">
          {categories.map((cat) => (
            <button
              type="button"
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                filter === cat
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map((template) => (
          <div
            key={template.id}
            className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition group flex flex-col h-full"
          >
            <div className="p-6 flex-1">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-blue-50 text-blue-900 rounded-xl group-hover:bg-blue-900 group-hover:text-white transition">
                  <ShoppingBag size={24} />
                </div>
                <div className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-2 py-1 rounded-full text-xs font-bold">
                  <Star size={12} fill="currentColor" /> {template.rating}
                </div>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">
                {template.name}
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed mb-4">
                {template.description}
              </p>
              <div className="flex flex-wrap gap-2 mb-4">
                {template.configuration?.tags?.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider bg-slate-100 text-slate-600 px-2 py-1 rounded"
                  >
                    <Tag size={10} /> {tag}
                  </span>
                ))}
              </div>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between rounded-b-xl">
              <div>
                <span className="text-xs text-slate-500 block mb-0.5">
                  {template.installCount.toLocaleString()} installs
                </span>
                <span className="font-bold text-slate-800">
                  {template.priceCents === 0
                    ? 'Free'
                    : `$${(template.priceCents / 100).toFixed(0)}`}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="p-2 text-slate-500 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition"
                >
                  <Eye size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => handleInstall(template)}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-800 hover:text-white transition shadow-sm"
                >
                  <Download size={16} /> Clone
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
