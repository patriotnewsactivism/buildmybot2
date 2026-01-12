import {
  CheckCircle,
  ChevronDown,
  Clock,
  DollarSign,
  Download,
  Eye,
  Filter,
  Loader,
  Menu,
  MessageSquare,
  Package,
  Play,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Tag,
  ThumbsUp,
  TrendingUp,
  X,
  XCircle,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { buildApiUrl } from '../../services/apiConfig';

interface Template {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  industry: string | null;
  systemPrompt: string | null;
  configuration: {
    tags?: string[];
    features?: string[];
    previewFlow?: { role: string; content: string }[];
  } | null;
  isPublic: boolean;
  isPremium: boolean;
  priceCents: number;
  installCount: number;
  rating: number;
  createdAt: string;
}

interface TemplateMarketplaceProps {
  onInstall?: (template: Template) => void;
  userId?: string;
  organizationId?: string;
}

type TabType = 'browse' | 'my-templates';
type SortType = 'popular' | 'newest' | 'rating';
type PriceFilter = 'all' | 'free' | 'paid';

const PremiumCard: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className = '' }) => (
  <div
    className={`bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-200 ${className}`}
  >
    {children}
  </div>
);

export const TemplateMarketplace: React.FC<TemplateMarketplaceProps> = ({
  onInstall,
  userId,
  organizationId,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('browse');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [myTemplates, setMyTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null,
  );
  const [purchasing, setPurchasing] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [industryFilter, setIndustryFilter] = useState<string>('All');
  const [priceFilter, setPriceFilter] = useState<PriceFilter>('all');
  const [sortBy, setSortBy] = useState<SortType>('popular');

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const response = await fetch(buildApiUrl('/templates'), {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch templates');
      const data = await response.json();
      setTemplates(Array.isArray(data) ? data : []);
      const installed = (Array.isArray(data) ? data : []).filter((t: Template) => t.installCount > 0);
      setMyTemplates(installed.slice(0, 3));
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

      await response.json();

      setMyTemplates((prev) => {
        if (prev.find((t) => t.id === template.id)) return prev;
        return [...prev, template];
      });

      if (onInstall) {
        onInstall(template);
      }

      setSelectedTemplate(null);
      alert(`✅ Successfully installed "${template.name}"!`);
    } catch (err) {
      console.error('Error installing template:', err);
      alert('Failed to install template. Please try again.');
    }
  };

  const handlePurchase = async (template: Template) => {
    if (!organizationId || !userId) {
      alert('Please log in to purchase templates.');
      return;
    }

    try {
      setPurchasing(true);
      const response = await fetch(buildApiUrl('/revenue/services/order'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId,
          userId,
          serviceId: template.id,
          notes: `Template purchase: ${template.name}`,
        }),
      });

      if (!response.ok) throw new Error('Failed to process purchase');

      await handleInstall(template);
    } catch (err) {
      console.error('Error purchasing template:', err);
      alert('Failed to complete purchase. Please try again.');
    } finally {
      setPurchasing(false);
    }
  };

  const categories = [
    'All',
    ...(Array.from(
      new Set(templates.map((t) => t.category).filter(Boolean)),
    ) as string[]),
  ];
  const industries = [
    'All',
    ...(Array.from(
      new Set(templates.map((t) => t.industry).filter(Boolean)),
    ) as string[]),
  ];

  const filteredTemplates = templates.filter((t) => {
    const matchesSearch =
      !searchTerm ||
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.configuration?.tags?.some((tag) =>
        tag.toLowerCase().includes(searchTerm.toLowerCase()),
      );

    const matchesCategory =
      categoryFilter === 'All' || t.category === categoryFilter;
    const matchesIndustry =
      industryFilter === 'All' || t.industry === industryFilter;

    const matchesPrice =
      priceFilter === 'all' ||
      (priceFilter === 'free' && t.priceCents === 0) ||
      (priceFilter === 'paid' && t.priceCents > 0);

    return matchesSearch && matchesCategory && matchesIndustry && matchesPrice;
  });

  if (sortBy === 'popular') {
    filteredTemplates.sort((a, b) => b.installCount - a.installCount);
  } else if (sortBy === 'rating') {
    filteredTemplates.sort((a, b) => b.rating - a.rating);
  } else if (sortBy === 'newest') {
    filteredTemplates.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }

  const displayTemplates =
    activeTab === 'browse' ? filteredTemplates : myTemplates;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader className="w-8 h-8 animate-spin mx-auto mb-4 text-orange-500" />
          <p className="text-slate-500">Loading marketplace...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <XCircle className="w-12 h-12 mx-auto mb-4 text-red-400" />
          <p className="text-red-500 mb-4">{error}</p>
          <button
            type="button"
            onClick={fetchTemplates}
            className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl md:rounded-2xl p-4 md:p-8">
        <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 via-transparent to-amber-500/10" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-orange-500/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-2">
            <ShoppingBag className="text-orange-400" size={24} />
            <span className="text-orange-400 text-sm font-medium">
              Bot Templates
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-white via-orange-100 to-amber-200 bg-clip-text text-transparent">
            Template Marketplace
          </h1>
          <p className="text-slate-400 mt-2">
            {templates.length} templates •{' '}
            {templates
              .reduce((sum, t) => sum + t.installCount, 0)
              .toLocaleString()}
            + installs
          </p>
        </div>
      </div>

      <div className="bg-slate-900 rounded-xl p-1.5 shadow-lg">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setActiveTab('browse')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-200 ${
              activeTab === 'browse'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold shadow-lg shadow-orange-500/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Sparkles size={16} />
            <span className="text-sm">Browse Templates</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('my-templates')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg transition-all duration-200 ${
              activeTab === 'my-templates'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold shadow-lg shadow-orange-500/25'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Package size={16} />
            <span className="text-sm">My Templates ({myTemplates.length})</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <button
          type="button"
          onClick={() => setShowFilters(!showFilters)}
          className="lg:hidden flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-xl shadow-sm"
        >
          <Filter size={18} />
          <span className="font-medium">Filters</span>
          <ChevronDown
            size={16}
            className={`transition-transform ${showFilters ? 'rotate-180' : ''}`}
          />
        </button>

        <div
          className={`lg:w-72 flex-shrink-0 space-y-4 ${showFilters ? 'block' : 'hidden lg:block'}`}
        >
          <PremiumCard className="p-4 space-y-5">
            <div>
              <label
                htmlFor="template-search"
                className="block text-sm font-semibold text-slate-700 mb-2"
              >
                Search
              </label>
              <div className="relative">
                <Search
                  className="absolute left-3 top-2.5 text-slate-400"
                  size={18}
                />
                <input
                  id="template-search"
                  type="text"
                  placeholder="Search templates..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 transition"
                />
              </div>
            </div>

            <div>
              <p className="block text-sm font-semibold text-slate-700 mb-2">
                Category
              </p>
              <div className="flex flex-wrap gap-2">
                {categories.slice(0, 6).map((cat) => (
                  <button
                    type="button"
                    key={cat}
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                      categoryFilter === cat
                        ? 'bg-orange-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              {categories.length > 6 && (
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="mt-2 w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500"
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div>
              <label
                htmlFor="template-industry"
                className="block text-sm font-semibold text-slate-700 mb-2"
              >
                Industry
              </label>
              <select
                id="template-industry"
                value={industryFilter}
                onChange={(e) => setIndustryFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500"
              >
                {industries.map((ind) => (
                  <option key={ind} value={ind}>
                    {ind}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <p className="block text-sm font-semibold text-slate-700 mb-2">
                Price
              </p>
              <div className="flex gap-2">
                {(['all', 'free', 'paid'] as PriceFilter[]).map((price) => (
                  <button
                    type="button"
                    key={price}
                    onClick={() => setPriceFilter(price)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${
                      priceFilter === price
                        ? 'bg-orange-500 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {price === 'all'
                      ? 'All'
                      : price === 'free'
                        ? 'Free'
                        : 'Paid'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label
                htmlFor="template-sort"
                className="block text-sm font-semibold text-slate-700 mb-2"
              >
                Sort By
              </label>
              <select
                id="template-sort"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortType)}
                className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:ring-2 focus:ring-orange-500"
              >
                <option value="popular">Most Popular</option>
                <option value="newest">Newest First</option>
                <option value="rating">Highest Rated</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setCategoryFilter('All');
                setIndustryFilter('All');
                setPriceFilter('all');
                setSortBy('popular');
              }}
              className="w-full px-4 py-2 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
            >
              Reset Filters
            </button>
          </PremiumCard>
        </div>

        <div className="flex-1 space-y-4">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>
              Showing {displayTemplates.length} template
              {displayTemplates.length !== 1 ? 's' : ''}
            </span>
          </div>

          {displayTemplates.length === 0 ? (
            <PremiumCard className="p-12 text-center">
              <Sparkles className="mx-auto text-slate-300 mb-4" size={48} />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">
                {activeTab === 'my-templates'
                  ? 'No templates installed yet'
                  : 'No templates found'}
              </h3>
              <p className="text-slate-500">
                {activeTab === 'my-templates'
                  ? 'Browse and install templates to see them here'
                  : 'Try adjusting your filters or search terms'}
              </p>
            </PremiumCard>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {displayTemplates.map((template) => (
                <PremiumCard
                  key={template.id}
                  className="flex flex-col h-full group"
                >
                  <div className="p-5 flex-1">
                    <div className="flex items-start justify-between mb-3">
                      <div className="p-2.5 bg-gradient-to-br from-orange-100 to-amber-100 text-orange-600 rounded-xl group-hover:from-orange-500 group-hover:to-amber-500 group-hover:text-white transition">
                        <ShoppingBag size={20} />
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {template.isPremium && (
                          <span className="bg-gradient-to-r from-amber-400 to-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold shadow">
                            PREMIUM
                          </span>
                        )}
                        {template.rating > 4.5 && (
                          <span className="bg-orange-500 text-white text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                            <TrendingUp size={10} /> Popular
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="text-base font-bold text-slate-800 mb-1.5 line-clamp-1">
                      {template.name}
                    </h3>
                    <p className="text-sm text-slate-500 leading-relaxed mb-3 line-clamp-2">
                      {template.description}
                    </p>

                    <div className="flex items-center gap-2 mb-3">
                      <div className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-2 py-1 rounded-full text-xs font-bold">
                        <Star size={12} fill="currentColor" />{' '}
                        {template.rating.toFixed(1)}
                      </div>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-500">
                        {template.installCount.toLocaleString()} installs
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {template.category && (
                        <span className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider bg-slate-100 text-slate-600 px-2 py-1 rounded">
                          {template.category}
                        </span>
                      )}
                      {template.industry && (
                        <span className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider bg-blue-50 text-blue-600 px-2 py-1 rounded">
                          {template.industry}
                        </span>
                      )}
                      {template.configuration?.tags?.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider bg-slate-100 text-slate-600 px-2 py-1 rounded"
                        >
                          <Tag size={8} /> {tag}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 border-t border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between rounded-b-xl">
                    <div>
                      <span className="font-bold text-lg text-slate-800">
                        {template.priceCents === 0 ? (
                          <span className="text-emerald-600">Free</span>
                        ) : (
                          <span className="flex items-center gap-0.5">
                            <DollarSign size={16} />
                            {(template.priceCents / 100).toFixed(0)}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedTemplate(template)}
                        className="p-2 text-slate-500 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition"
                        title="Preview"
                      >
                        <Eye size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          template.priceCents === 0
                            ? handleInstall(template)
                            : handlePurchase(template)
                        }
                        className="flex items-center gap-2 px-3 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-medium rounded-lg hover:from-orange-600 hover:to-amber-600 transition shadow-sm"
                      >
                        <Download size={16} />
                        {template.priceCents === 0 ? 'Install' : 'Purchase'}
                      </button>
                    </div>
                  </div>
                </PremiumCard>
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedTemplate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="sticky top-0 bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-4 flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h2 className="text-xl font-bold text-white">
                    {selectedTemplate.name}
                  </h2>
                  {selectedTemplate.isPremium && (
                    <span className="bg-white/20 text-white text-xs px-2 py-0.5 rounded-full font-bold backdrop-blur">
                      PREMIUM
                    </span>
                  )}
                </div>
                <p className="text-sm text-orange-100">
                  {selectedTemplate.category}{' '}
                  {selectedTemplate.industry &&
                    `• ${selectedTemplate.industry}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTemplate(null)}
                className="text-white/80 hover:text-white p-1 hover:bg-white/10 rounded-lg transition"
              >
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-4 bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl border border-yellow-100">
                  <div className="flex items-center justify-center gap-1 text-yellow-600 mb-1">
                    <Star size={18} fill="currentColor" />
                    <span className="text-xl font-bold">
                      {selectedTemplate.rating.toFixed(1)}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">Rating</div>
                </div>
                <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100">
                  <div className="text-xl font-bold text-blue-600 mb-1">
                    {selectedTemplate.installCount.toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-500">Installs</div>
                </div>
                <div className="text-center p-4 bg-gradient-to-br from-emerald-50 to-green-50 rounded-xl border border-emerald-100">
                  <div className="text-xl font-bold text-emerald-600 mb-1">
                    {selectedTemplate.priceCents === 0
                      ? 'Free'
                      : `$${(selectedTemplate.priceCents / 100).toFixed(0)}`}
                  </div>
                  <div className="text-xs text-slate-500">One-time</div>
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                  <MessageSquare size={18} className="text-orange-500" />
                  Description
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  {selectedTemplate.description}
                </p>
              </div>

              {selectedTemplate.configuration?.features &&
                selectedTemplate.configuration.features.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <CheckCircle size={18} className="text-orange-500" />
                      Key Features
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {selectedTemplate.configuration.features.map(
                        (feature) => (
                          <div
                            key={feature}
                            className="flex items-center gap-2 text-sm text-slate-600 bg-slate-50 px-3 py-2 rounded-lg"
                          >
                            <CheckCircle
                              size={14}
                              className="text-emerald-500 shrink-0"
                            />
                            {feature}
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}

              {selectedTemplate.configuration?.previewFlow &&
                selectedTemplate.configuration.previewFlow.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <Play size={18} className="text-orange-500" />
                      Conversation Preview
                    </h3>
                    <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-100">
                      {selectedTemplate.configuration.previewFlow.map(
                        (msg) => (
                          <div
                            key={`${msg.role}-${msg.text}`}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[80%] px-4 py-2 rounded-2xl text-sm ${
                                msg.role === 'user'
                                  ? 'bg-orange-500 text-white rounded-br-md'
                                  : 'bg-white border border-slate-200 text-slate-700 rounded-bl-md shadow-sm'
                              }`}
                            >
                              {msg.content}
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}

              {selectedTemplate.configuration?.tags &&
                selectedTemplate.configuration.tags.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2">
                      <Tag size={18} className="text-orange-500" />
                      Tags
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedTemplate.configuration.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs bg-slate-100 text-slate-700 px-3 py-1.5 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </div>

            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">One-time purchase</div>
                <div className="font-bold text-2xl text-slate-900">
                  {selectedTemplate.priceCents === 0 ? (
                    <span className="text-emerald-600">Free</span>
                  ) : (
                    `$${(selectedTemplate.priceCents / 100).toFixed(0)}`
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (selectedTemplate.priceCents === 0) {
                    handleInstall(selectedTemplate);
                  } else {
                    handlePurchase(selectedTemplate);
                  }
                }}
                disabled={purchasing}
                className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-xl hover:from-orange-600 hover:to-amber-600 font-semibold flex items-center gap-2 transition shadow-lg shadow-orange-500/25 disabled:opacity-50"
              >
                {purchasing ? (
                  <>
                    <Loader size={18} className="animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Download size={18} />
                    {selectedTemplate.priceCents === 0
                      ? 'Install Template'
                      : 'Purchase & Install'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
