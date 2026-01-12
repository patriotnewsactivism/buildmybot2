/**
 * Template Gallery Component
 * Displays bot templates with categories, search, and smart recommendations
 */

import {
  Download,
  Filter,
  Search,
  Sparkles,
  Star,
  TrendingUp,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { dbService } from '../../services/dbService';
import type { BotTemplate } from '../../shared/schema';

interface TemplateGalleryProps {
  onSelect: (template: BotTemplate) => void;
  selectedTemplateId?: string;
}

export const TemplateGallery: React.FC<TemplateGalleryProps> = ({
  onSelect,
  selectedTemplateId,
}) => {
  const [templates, setTemplates] = useState<BotTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [showFeatured, setShowFeatured] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, [selectedCategory, showFeatured]);

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (selectedCategory) params.category = selectedCategory;
      if (showFeatured) params.featured = 'true';

      const data = await dbService.getTemplates(params);
      setTemplates(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Failed to load templates:', error);
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  const categories = [
    'All',
    'Customer Support',
    'Sales',
    'Healthcare',
    'Real Estate',
    'E-commerce',
    'Legal',
    'Education',
    'Technology',
  ];

  const filteredTemplates = templates.filter((template) => {
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        template.name.toLowerCase().includes(query) ||
        template.description?.toLowerCase().includes(query) ||
        template.category?.toLowerCase().includes(query) ||
        template.industry?.toLowerCase().includes(query)
      );
    }
    return true;
  });

  const sortedTemplates = [...filteredTemplates].sort((a, b) => {
    if (showFeatured) {
      return (b.rating || 0) - (a.rating || 0);
    }
    return (b.installCount || 0) - (a.installCount || 0);
  });

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="space-y-4">
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400"
            size={20}
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search templates by name, category, or industry..."
            className="w-full pl-10 pr-4 py-3 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Filter size={16} />
            <span className="font-medium">Category:</span>
          </div>
          {categories.map((category) => (
            <button
              type="button"
              key={category}
              onClick={() =>
                setSelectedCategory(category === 'All' ? null : category)
              }
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                (selectedCategory === null && category === 'All') ||
                selectedCategory === category
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {category}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setShowFeatured(!showFeatured)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
              showFeatured
                ? 'bg-orange-600 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <TrendingUp size={16} />
            Featured
          </button>
        </div>
      </div>

      {/* Templates Grid */}
      {loading ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <p className="text-slate-500 mt-2">Loading templates...</p>
        </div>
      ) : sortedTemplates.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
          <Sparkles className="mx-auto text-slate-400 mb-3" size={32} />
          <p className="text-slate-600">No templates found</p>
          <p className="text-sm text-slate-500 mt-1">
            Try adjusting your search or filters
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedTemplates.map((template) => (
            <button
              type="button"
              key={template.id}
              onClick={() => onSelect(template)}
              className={`text-left p-5 rounded-xl border-2 transition-all ${
                selectedTemplateId === template.id
                  ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-200'
                  : 'border-slate-200 hover:border-blue-300 bg-white hover:shadow-md'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h4 className="font-semibold text-slate-900 mb-1 flex items-center gap-2">
                    {template.name}
                    {template.isPremium && (
                      <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs font-medium rounded">
                        Premium
                      </span>
                    )}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {template.category}{' '}
                    {template.industry && `• ${template.industry}`}
                  </p>
                </div>
                {selectedTemplateId === template.id && (
                  <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                    <span className="text-white text-xs">✓</span>
                  </div>
                )}
              </div>

              <p className="text-sm text-slate-600 mb-4 line-clamp-2">
                {template.description}
              </p>

              <div className="flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-3">
                  {template.rating && template.rating > 0 && (
                    <div className="flex items-center gap-1">
                      <Star
                        className="text-yellow-500 fill-yellow-500"
                        size={14}
                      />
                      <span className="font-medium">
                        {template.rating.toFixed(1)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Download size={14} />
                    <span>{template.installCount || 0} installs</span>
                  </div>
                </div>
                {template.priceCents && template.priceCents > 0 && (
                  <span className="font-semibold text-slate-900">
                    ${(template.priceCents / 100).toFixed(2)}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Empty State - No Templates Available */}
      {!loading && templates.length === 0 && (
        <div className="text-center py-12 bg-slate-50 rounded-lg border border-slate-200">
          <Sparkles className="mx-auto text-slate-400 mb-3" size={32} />
          <p className="text-slate-600 font-medium">
            No templates available yet
          </p>
          <p className="text-sm text-slate-500 mt-1">
            Templates will appear here once they're created
          </p>
        </div>
      )}
    </div>
  );
};
