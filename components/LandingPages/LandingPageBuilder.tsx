import {
  ArrowLeft,
  BarChart3,
  Bot as BotIcon,
  CheckCircle,
  Edit3,
  Eye,
  FileText,
  FormInput,
  Globe,
  GripVertical,
  Image as ImageIcon,
  Link,
  Loader2,
  MessageSquare,
  Monitor,
  MousePointer,
  Palette,
  Plus,
  Save,
  Search,
  Shield,
  Smartphone,
  ToggleLeft,
  ToggleRight,
  Trash2,
  Type,
  Upload,
  X,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../services/apiConfig';
import type { Bot } from '../../types';

interface FormField {
  id: string;
  type: 'text' | 'email' | 'phone' | 'textarea' | 'select' | 'checkbox';
  label: string;
  placeholder?: string;
  required: boolean;
  options?: string[];
}

interface LandingPage {
  id: string;
  name: string;
  slug: string;
  headline?: string;
  subheadline?: string;
  heroImageUrl?: string;
  ctaText: string;
  ctaColor: string;
  formFields: FormField[];
  thankYouMessage?: string;
  seoTitle?: string;
  seoDescription?: string;
  botId?: string;
  isPublished: boolean;
  viewCount: number;
  conversionCount: number;
  createdAt: string;
  updatedAt: string;
}

interface LandingPageBuilderProps {
  bots: Bot[];
  organizationId?: string;
}

type EditorTabId = 'basic' | 'hero' | 'cta' | 'form' | 'thankyou' | 'bot';

type EditorTab = {
  id: EditorTabId;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
};

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

const DEFAULT_FORM_FIELDS: FormField[] = [
  {
    id: 'default-name',
    type: 'text',
    label: 'Full Name',
    placeholder: 'Enter your name',
    required: true,
  },
  {
    id: 'default-email',
    type: 'email',
    label: 'Email Address',
    placeholder: 'you@example.com',
    required: true,
  },
];

const createEmptyPage = (): LandingPage => ({
  id: `lp-${Date.now()}`,
  name: 'New Landing Page',
  slug: `page-${Date.now()}`,
  headline: 'Your Compelling Headline Here',
  subheadline: 'A persuasive subheadline that explains your value proposition.',
  ctaText: 'Get Started',
  ctaColor: '#F97316',
  formFields: [...DEFAULT_FORM_FIELDS],
  thankYouMessage: 'Thank you for your submission! We will be in touch soon.',
  isPublished: false,
  viewCount: 0,
  conversionCount: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const LandingPageBuilder: React.FC<LandingPageBuilderProps> = ({
  bots,
}) => {
  const [pages, setPages] = useState<LandingPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'editor'>('list');
  const [selectedPage, setSelectedPage] = useState<LandingPage | null>(null);
  const [activeEditorTab, setActiveEditorTab] = useState<EditorTabId>('basic');
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>(
    'desktop',
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [draggedFieldId, setDraggedFieldId] = useState<string | null>(null);
  const heroImageInputRef = useRef<HTMLInputElement>(null);

  const fetchLandingPages = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE}/landing-pages`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = (await response.json()) as LandingPage[];
        setPages(
          data.map((page) => ({
            ...page,
            formFields: page.formFields || [],
            createdAt: page.createdAt || new Date().toISOString(),
            updatedAt: page.updatedAt || new Date().toISOString(),
          })),
        );
      }
    } catch (error) {
      console.error('Error fetching landing pages:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLandingPages();
  }, [fetchLandingPages]);

  const filteredPages = pages.filter(
    (page) =>
      page.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      page.slug.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const handleCreateNew = () => {
    const newPage = createEmptyPage();
    setSelectedPage(newPage);
    setView('editor');
    setActiveEditorTab('basic');
  };

  const handleEdit = (page: LandingPage) => {
    setSelectedPage({ ...page });
    setView('editor');
    setActiveEditorTab('basic');
  };

  const handleDelete = async (pageId: string) => {
    if (window.confirm('Are you sure you want to delete this landing page?')) {
      try {
        const response = await fetch(`${API_BASE}/landing-pages/${pageId}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (response.ok) {
          setPages(pages.filter((p) => p.id !== pageId));
        } else {
          console.error('Failed to delete landing page');
        }
      } catch (error) {
        console.error('Error deleting landing page:', error);
      }
    }
  };

  const handleTogglePublish = async (pageId: string) => {
    try {
      const response = await fetch(
        `${API_BASE}/landing-pages/${pageId}/publish`,
        {
          method: 'PATCH',
          credentials: 'include',
        },
      );
      if (response.ok) {
        const updatedPage = await response.json();
        setPages(
          pages.map((p) =>
            p.id === pageId
              ? {
                  ...p,
                  isPublished: updatedPage.isPublished,
                  updatedAt: updatedPage.updatedAt,
                }
              : p,
          ),
        );
      } else {
        console.error('Failed to toggle publish status');
      }
    } catch (error) {
      console.error('Error toggling publish status:', error);
    }
  };

  const handleSave = async () => {
    if (!selectedPage) return;
    setSaving(true);

    try {
      const existingPage = pages.find((p) => p.id === selectedPage.id);
      const isNewPage = !existingPage;

      const method = isNewPage ? 'POST' : 'PUT';
      const url = isNewPage
        ? `${API_BASE}/landing-pages`
        : `${API_BASE}/landing-pages/${selectedPage.id}`;

      const response = await fetch(url, {
        method,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: selectedPage.name,
          slug: selectedPage.slug,
          headline: selectedPage.headline,
          subheadline: selectedPage.subheadline,
          heroImageUrl: selectedPage.heroImageUrl,
          ctaText: selectedPage.ctaText,
          ctaColor: selectedPage.ctaColor,
          formFields: selectedPage.formFields,
          thankYouMessage: selectedPage.thankYouMessage,
          seoTitle: selectedPage.seoTitle,
          seoDescription: selectedPage.seoDescription,
          botId: selectedPage.botId,
          isPublished: selectedPage.isPublished,
        }),
      });

      if (response.ok) {
        const savedPage = await response.json();
        const updatedPage = {
          ...savedPage,
          formFields: savedPage.formFields || [],
          createdAt: savedPage.createdAt || new Date().toISOString(),
          updatedAt: savedPage.updatedAt || new Date().toISOString(),
        };

        if (isNewPage) {
          setPages([...pages, updatedPage]);
        } else {
          setPages(
            pages.map((p) => (p.id === selectedPage.id ? updatedPage : p)),
          );
        }
        setSelectedPage(updatedPage);
      } else {
        console.error('Failed to save landing page');
      }
    } catch (error) {
      console.error('Error saving landing page:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleBackToList = () => {
    setView('list');
    setSelectedPage(null);
  };

  const updateSelectedPage = <K extends keyof LandingPage>(
    field: K,
    value: LandingPage[K],
  ) => {
    if (selectedPage) {
      setSelectedPage({ ...selectedPage, [field]: value });
    }
  };

  const handleAddFormField = (type: FormField['type']) => {
    if (!selectedPage) return;
    const newField: FormField = {
      id: `field-${Date.now()}`,
      type,
      label:
        type === 'checkbox'
          ? 'I agree to the terms'
          : `New ${type.charAt(0).toUpperCase() + type.slice(1)} Field`,
      placeholder: type === 'checkbox' ? undefined : `Enter ${type}...`,
      required: type === 'email',
    };
    updateSelectedPage('formFields', [...selectedPage.formFields, newField]);
  };

  const handleRemoveFormField = (fieldId: string) => {
    if (!selectedPage) return;
    updateSelectedPage(
      'formFields',
      selectedPage.formFields.filter((f) => f.id !== fieldId),
    );
  };

  const handleUpdateFormField = (
    fieldId: string,
    updates: Partial<FormField>,
  ) => {
    if (!selectedPage) return;
    updateSelectedPage(
      'formFields',
      selectedPage.formFields.map((f) =>
        f.id === fieldId ? { ...f, ...updates } : f,
      ),
    );
  };

  const handleDragStart = (fieldId: string) => {
    setDraggedFieldId(fieldId);
  };

  const handleDragOver = (e: React.DragEvent, targetFieldId: string) => {
    e.preventDefault();
    if (!selectedPage || !draggedFieldId || draggedFieldId === targetFieldId)
      return;

    const fields = [...selectedPage.formFields];
    const draggedIndex = fields.findIndex((f) => f.id === draggedFieldId);
    const targetIndex = fields.findIndex((f) => f.id === targetFieldId);

    if (draggedIndex !== -1 && targetIndex !== -1) {
      const [draggedField] = fields.splice(draggedIndex, 1);
      fields.splice(targetIndex, 0, draggedField);
      updateSelectedPage('formFields', fields);
    }
  };

  const handleDragEnd = () => {
    setDraggedFieldId(null);
  };

  const handleHeroImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && selectedPage) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateSelectedPage('heroImageUrl', reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const getConversionRate = (page: LandingPage) => {
    if (page.viewCount === 0) return 0;
    return ((page.conversionCount / page.viewCount) * 100).toFixed(1);
  };

  const getAssociatedBot = (botId?: string) => {
    return bots.find((b) => b.id === botId);
  };

  const currentDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const editorTabs: EditorTab[] = [
    { id: 'basic', label: 'Basic Info', icon: FileText },
    { id: 'hero', label: 'Hero Section', icon: ImageIcon },
    { id: 'cta', label: 'CTA Button', icon: MousePointer },
    { id: 'form', label: 'Form Builder', icon: FormInput },
    { id: 'thankyou', label: 'Thank You', icon: MessageSquare },
    { id: 'bot', label: 'Bot Selection', icon: BotIcon },
  ];

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-2 md:px-0">
        <div className="flex items-center justify-center h-64">
          <div className="flex flex-col items-center gap-4">
            <Loader2 size={40} className="animate-spin text-orange-500" />
            <p className="text-slate-500">Loading landing pages...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-4 md:space-y-6 animate-fade-in px-2 md:px-0">
      {view === 'list' ? (
        <>
          <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 rounded-xl md:rounded-2xl p-4 md:p-8">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-500/10 via-transparent to-amber-500/10" />
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-orange-500/20 to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-gradient-to-tr from-amber-500/20 to-transparent rounded-full blur-2xl translate-y-1/2 -translate-x-1/2" />

            <div className="relative z-10">
              <div className="flex items-center space-x-2 mb-2">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                <span className="text-emerald-400 text-sm font-medium">
                  Lead Capture
                </span>
              </div>
              <h1 className="text-2xl md:text-4xl font-bold bg-gradient-to-r from-white via-orange-100 to-amber-200 bg-clip-text text-transparent">
                Landing Page Builder
              </h1>
              <p className="text-slate-400 mt-2 text-sm md:text-lg">
                {currentDate}
              </p>
              <div className="flex flex-wrap items-center gap-4 mt-4">
                <div className="flex items-center space-x-2 text-slate-400 text-sm">
                  <Shield size={16} className="text-emerald-400" />
                  <span>{pages.length} Pages</span>
                </div>
                <div className="w-px h-4 bg-slate-700 hidden sm:block" />
                <div className="flex items-center space-x-2 text-slate-400 text-sm">
                  <Zap size={16} className="text-amber-400" />
                  <span>
                    {pages.filter((p) => p.isPublished).length} Published
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="relative w-full sm:w-80">
              <Search
                className="absolute left-3 top-2.5 text-slate-400"
                size={18}
              />
              <input
                type="text"
                placeholder="Search landing pages..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:ring-orange-500 focus:border-orange-500"
              />
            </div>
            <button
              type="button"
              onClick={handleCreateNew}
              className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg font-semibold shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 transition flex items-center justify-center gap-2"
            >
              <Plus size={18} /> Create Landing Page
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {filteredPages.map((page) => {
              const bot = getAssociatedBot(page.botId);
              return (
                <PremiumCard key={page.id} className="overflow-hidden">
                  <div className="p-4 md:p-6">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-slate-900 truncate">
                          {page.name}
                        </h3>
                        <div className="flex items-center gap-1.5 text-slate-500 text-xs mt-1">
                          <Link size={12} />
                          <span className="truncate">/{page.slug}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleTogglePublish(page.id)}
                        className={`flex-shrink-0 ml-2 ${page.isPublished ? 'text-emerald-500' : 'text-slate-400'}`}
                        title={page.isPublished ? 'Published' : 'Draft'}
                      >
                        {page.isPublished ? (
                          <ToggleRight size={28} />
                        ) : (
                          <ToggleLeft size={28} />
                        )}
                      </button>
                    </div>

                    {bot && (
                      <div className="flex items-center gap-2 mb-4 p-2 bg-slate-50 rounded-lg">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                          style={{ backgroundColor: bot.themeColor }}
                        >
                          {bot.name.substring(0, 2)}
                        </div>
                        <span className="text-sm text-slate-600 truncate">
                          {bot.name}
                        </span>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="text-center p-2 bg-slate-50 rounded-lg">
                        <div className="text-lg font-bold text-slate-900">
                          {page.viewCount.toLocaleString()}
                        </div>
                        <div className="text-xs text-slate-500">Views</div>
                      </div>
                      <div className="text-center p-2 bg-slate-50 rounded-lg">
                        <div className="text-lg font-bold text-slate-900">
                          {page.conversionCount}
                        </div>
                        <div className="text-xs text-slate-500">Leads</div>
                      </div>
                      <div className="text-center p-2 bg-slate-50 rounded-lg">
                        <div className="text-lg font-bold text-orange-600">
                          {getConversionRate(page)}%
                        </div>
                        <div className="text-xs text-slate-500">Rate</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleEdit(page)}
                        className="flex-1 px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition flex items-center justify-center gap-1.5"
                      >
                        <Edit3 size={14} /> Edit
                      </button>
                      <button
                        type="button"
                        className="px-3 py-2 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition"
                        title="Preview"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(page.id)}
                        className="px-3 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="px-4 md:px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${page.isPublished ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'}`}
                    >
                      {page.isPublished ? 'Published' : 'Draft'}
                    </span>
                    <span className="text-xs text-slate-400">
                      Updated {new Date(page.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </PremiumCard>
              );
            })}

            {filteredPages.length === 0 && (
              <div className="col-span-full">
                <PremiumCard className="p-12 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Globe size={32} className="text-slate-400" />
                  </div>
                  <h4 className="font-semibold text-slate-900 mb-2">
                    No landing pages found
                  </h4>
                  <p className="text-slate-500 text-sm mb-4">
                    Create your first landing page to start capturing leads.
                  </p>
                  <button
                    type="button"
                    onClick={handleCreateNew}
                    className="px-4 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition"
                  >
                    Create Landing Page
                  </button>
                </PremiumCard>
              </div>
            )}
          </div>
        </>
      ) : (
        selectedPage && (
          <div className="h-[calc(100vh-6rem)] flex flex-col lg:flex-row gap-4 md:gap-6">
            <div className="lg:w-1/2 flex flex-col bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="min-h-16 border-b border-slate-100 px-4 md:px-6 py-3 flex items-center justify-between gap-3 bg-white">
                <div className="flex items-center gap-3 min-w-0">
                  <button
                    type="button"
                    onClick={handleBackToList}
                    className="p-2 hover:bg-slate-100 rounded-lg transition"
                  >
                    <ArrowLeft size={20} className="text-slate-600" />
                  </button>
                  <div className="min-w-0">
                    <input
                      type="text"
                      value={selectedPage.name}
                      onChange={(e) =>
                        updateSelectedPage('name', e.target.value)
                      }
                      className="font-bold text-lg text-slate-800 border-none p-0 focus:ring-0 placeholder-slate-300 w-full truncate"
                      placeholder="Page Name"
                    />
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span
                        className={`w-2 h-2 rounded-full ${selectedPage.isPublished ? 'bg-emerald-500' : 'bg-slate-300'}`}
                      />
                      {selectedPage.isPublished ? 'Published' : 'Draft'}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-lg font-medium hover:shadow-lg transition disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <Save size={18} />
                  )}
                  <span className="hidden sm:inline">
                    {saving ? 'Saving...' : 'Save'}
                  </span>
                </button>
              </div>

              <div className="border-b border-slate-200 bg-slate-50 px-2 md:px-4 flex gap-1 overflow-x-auto scrollbar-hide">
                {editorTabs.map((tab) => {
                  const Icon = tab.icon;
                  const isActive = activeEditorTab === tab.id;
                  return (
                    <button
                      type="button"
                      key={tab.id}
                      onClick={() => setActiveEditorTab(tab.id)}
                      className={`py-3 px-3 text-xs md:text-sm font-medium flex items-center gap-1.5 border-b-2 transition whitespace-nowrap ${
                        isActive
                          ? 'border-orange-500 text-orange-600'
                          : 'border-transparent text-slate-500 hover:text-slate-700'
                      }`}
                    >
                      <Icon size={14} />
                      <span className="hidden sm:inline">{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/50">
                {activeEditorTab === 'basic' && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="bg-white p-6 rounded-xl border border-slate-200">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <FileText size={18} className="text-orange-500" /> Basic
                        Information
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <label
                            htmlFor="landing-page-name"
                            className="block text-sm font-medium text-slate-700 mb-2"
                          >
                            Page Name
                          </label>
                          <input
                            id="landing-page-name"
                            type="text"
                            value={selectedPage.name}
                            onChange={(e) =>
                              updateSelectedPage('name', e.target.value)
                            }
                            className="w-full rounded-lg border-slate-200 focus:ring-orange-500 focus:border-orange-500"
                            placeholder="My Landing Page"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="landing-page-slug"
                            className="block text-sm font-medium text-slate-700 mb-2"
                          >
                            URL Slug
                          </label>
                          <div className="flex items-center gap-2">
                            <span className="text-slate-400 text-sm">/</span>
                            <input
                              id="landing-page-slug"
                              type="text"
                              value={selectedPage.slug}
                              onChange={(e) =>
                                updateSelectedPage(
                                  'slug',
                                  e.target.value
                                    .toLowerCase()
                                    .replace(/\s+/g, '-')
                                    .replace(/[^a-z0-9-]/g, ''),
                                )
                              }
                              className="flex-1 rounded-lg border-slate-200 focus:ring-orange-500 focus:border-orange-500"
                              placeholder="my-page"
                            />
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            Only lowercase letters, numbers, and hyphens
                          </p>
                        </div>
                        <div>
                          <label
                            htmlFor="landing-page-seo-title"
                            className="block text-sm font-medium text-slate-700 mb-2"
                          >
                            SEO Title
                          </label>
                          <input
                            id="landing-page-seo-title"
                            type="text"
                            value={selectedPage.seoTitle || ''}
                            onChange={(e) =>
                              updateSelectedPage('seoTitle', e.target.value)
                            }
                            className="w-full rounded-lg border-slate-200 focus:ring-orange-500 focus:border-orange-500"
                            placeholder="Page Title for Search Engines"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="landing-page-seo-description"
                            className="block text-sm font-medium text-slate-700 mb-2"
                          >
                            SEO Description
                          </label>
                          <textarea
                            id="landing-page-seo-description"
                            value={selectedPage.seoDescription || ''}
                            onChange={(e) =>
                              updateSelectedPage(
                                'seoDescription',
                                e.target.value,
                              )
                            }
                            className="w-full h-20 rounded-lg border-slate-200 focus:ring-orange-500 focus:border-orange-500 p-3 text-sm resize-none"
                            placeholder="A brief description for search engines..."
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeEditorTab === 'hero' && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="bg-white p-6 rounded-xl border border-slate-200">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <Type size={18} className="text-orange-500" /> Hero
                        Content
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <label
                            htmlFor="landing-page-headline"
                            className="block text-sm font-medium text-slate-700 mb-2"
                          >
                            Headline
                          </label>
                          <input
                            id="landing-page-headline"
                            type="text"
                            value={selectedPage.headline || ''}
                            onChange={(e) =>
                              updateSelectedPage('headline', e.target.value)
                            }
                            className="w-full rounded-lg border-slate-200 focus:ring-orange-500 focus:border-orange-500 text-lg font-semibold"
                            placeholder="Your Main Headline"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="landing-page-subheadline"
                            className="block text-sm font-medium text-slate-700 mb-2"
                          >
                            Subheadline
                          </label>
                          <textarea
                            id="landing-page-subheadline"
                            value={selectedPage.subheadline || ''}
                            onChange={(e) =>
                              updateSelectedPage('subheadline', e.target.value)
                            }
                            className="w-full h-24 rounded-lg border-slate-200 focus:ring-orange-500 focus:border-orange-500 p-3 text-sm resize-none"
                            placeholder="A compelling subheadline that supports your main message..."
                          />
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-xl border border-slate-200">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <ImageIcon size={18} className="text-orange-500" /> Hero
                        Image
                      </h3>
                      {selectedPage.heroImageUrl ? (
                        <div className="relative group">
                          <img
                            src={selectedPage.heroImageUrl}
                            alt="Hero"
                            className="w-full h-48 object-cover rounded-lg"
                          />
                          <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition rounded-lg flex items-center justify-center gap-3">
                            <button
                              type="button"
                              onClick={() => heroImageInputRef.current?.click()}
                              className="px-4 py-2 bg-white text-slate-800 rounded-lg text-sm font-medium hover:bg-slate-100 transition"
                            >
                              Change
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                updateSelectedPage('heroImageUrl', undefined)
                              }
                              className="px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => heroImageInputRef.current?.click()}
                          className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-orange-400 hover:bg-slate-50 transition"
                        >
                          <Upload
                            className="mx-auto text-slate-400 mb-2"
                            size={32}
                          />
                          <p className="text-sm text-slate-600">
                            Click to upload or drag and drop
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            PNG, JPG up to 5MB
                          </p>
                        </button>
                      )}
                      <input
                        ref={heroImageInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleHeroImageUpload}
                        className="hidden"
                      />
                    </div>
                  </div>
                )}

                {activeEditorTab === 'cta' && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="bg-white p-6 rounded-xl border border-slate-200">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <MousePointer size={18} className="text-orange-500" />{' '}
                        Call to Action Button
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <label
                            htmlFor="landing-page-cta-text"
                            className="block text-sm font-medium text-slate-700 mb-2"
                          >
                            Button Text
                          </label>
                          <input
                            id="landing-page-cta-text"
                            type="text"
                            value={selectedPage.ctaText}
                            onChange={(e) =>
                              updateSelectedPage('ctaText', e.target.value)
                            }
                            className="w-full rounded-lg border-slate-200 focus:ring-orange-500 focus:border-orange-500"
                            placeholder="Get Started"
                          />
                        </div>
                        <div>
                          <label
                            htmlFor="landing-page-cta-color"
                            className="block text-sm font-medium text-slate-700 mb-2"
                          >
                            Button Color
                          </label>
                          <div className="flex items-center gap-3">
                            <div
                              className="w-12 h-12 rounded-lg border-2 border-slate-200 cursor-pointer overflow-hidden relative"
                              style={{ backgroundColor: selectedPage.ctaColor }}
                            >
                              <input
                                type="color"
                                value={selectedPage.ctaColor}
                                onChange={(e) =>
                                  updateSelectedPage('ctaColor', e.target.value)
                                }
                                aria-label="CTA button color picker"
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              />
                            </div>
                            <input
                              id="landing-page-cta-color"
                              type="text"
                              value={selectedPage.ctaColor}
                              onChange={(e) =>
                                updateSelectedPage('ctaColor', e.target.value)
                              }
                              className="flex-1 rounded-lg border-slate-200 focus:ring-orange-500 focus:border-orange-500 font-mono text-sm"
                              placeholder="#F97316"
                            />
                          </div>
                        </div>
                        <div className="pt-4">
                          <p className="block text-sm font-medium text-slate-700 mb-2">
                            Preview
                          </p>
                          <button
                            type="button"
                            className="px-6 py-3 rounded-lg font-semibold text-white shadow-lg transition transform hover:-translate-y-0.5"
                            style={{ backgroundColor: selectedPage.ctaColor }}
                          >
                            {selectedPage.ctaText || 'Button Text'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeEditorTab === 'form' && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="bg-white p-6 rounded-xl border border-slate-200">
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <FormInput size={18} className="text-orange-500" />{' '}
                          Form Fields
                        </h3>
                      </div>

                      <div className="space-y-3 mb-6">
                        {selectedPage.formFields.map((field) => (
                          <div
                            key={field.id}
                            draggable
                            onDragStart={() => handleDragStart(field.id)}
                            onDragOver={(e) => handleDragOver(e, field.id)}
                            onDragEnd={handleDragEnd}
                            className={`flex items-start gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200 cursor-move transition ${draggedFieldId === field.id ? 'opacity-50' : ''}`}
                          >
                            <GripVertical
                              className="text-slate-400 mt-2 flex-shrink-0"
                              size={16}
                            />
                            <div className="flex-1 space-y-3">
                              <div className="flex items-center gap-3">
                                <input
                                  type="text"
                                  value={field.label}
                                  onChange={(e) =>
                                    handleUpdateFormField(field.id, {
                                      label: e.target.value,
                                    })
                                  }
                                  className="flex-1 rounded-lg border-slate-200 focus:ring-orange-500 focus:border-orange-500 text-sm font-medium"
                                  placeholder="Field Label"
                                />
                                <select
                                  value={field.type}
                                  onChange={(e) =>
                                    handleUpdateFormField(field.id, {
                                      type: e.target.value as FormField['type'],
                                    })
                                  }
                                  className="rounded-lg border-slate-200 focus:ring-orange-500 focus:border-orange-500 text-sm"
                                >
                                  <option value="text">Text</option>
                                  <option value="email">Email</option>
                                  <option value="phone">Phone</option>
                                  <option value="textarea">Textarea</option>
                                  <option value="checkbox">Checkbox</option>
                                </select>
                              </div>
                              {field.type !== 'checkbox' && (
                                <input
                                  type="text"
                                  value={field.placeholder || ''}
                                  onChange={(e) =>
                                    handleUpdateFormField(field.id, {
                                      placeholder: e.target.value,
                                    })
                                  }
                                  className="w-full rounded-lg border-slate-200 focus:ring-orange-500 focus:border-orange-500 text-sm"
                                  placeholder="Placeholder text..."
                                />
                              )}
                              <div className="flex items-center gap-2">
                                <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={field.required}
                                    onChange={(e) =>
                                      handleUpdateFormField(field.id, {
                                        required: e.target.checked,
                                      })
                                    }
                                    className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                                  />
                                  Required
                                </label>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveFormField(field.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded transition"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        ))}

                        {selectedPage.formFields.length === 0 && (
                          <div className="text-center py-8 text-slate-400">
                            <FormInput
                              size={32}
                              className="mx-auto mb-2 opacity-50"
                            />
                            <p className="text-sm">
                              No form fields yet. Add fields below.
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="border-t border-slate-200 pt-4">
                        <p className="block text-sm font-medium text-slate-700 mb-3">
                          Add Field
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {(
                            [
                              'text',
                              'email',
                              'phone',
                              'textarea',
                              'checkbox',
                            ] as FormField['type'][]
                          ).map((type) => (
                            <button
                              type="button"
                              key={type}
                              onClick={() => handleAddFormField(type)}
                              className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition capitalize"
                            >
                              + {type}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeEditorTab === 'thankyou' && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="bg-white p-6 rounded-xl border border-slate-200">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <CheckCircle size={18} className="text-orange-500" />{' '}
                        Thank You Message
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <label
                            htmlFor="landing-page-thankyou-message"
                            className="block text-sm font-medium text-slate-700 mb-2"
                          >
                            Message after form submission
                          </label>
                          <textarea
                            id="landing-page-thankyou-message"
                            value={selectedPage.thankYouMessage || ''}
                            onChange={(e) =>
                              updateSelectedPage(
                                'thankYouMessage',
                                e.target.value,
                              )
                            }
                            className="w-full h-32 rounded-lg border-slate-200 focus:ring-orange-500 focus:border-orange-500 p-3 text-sm resize-none"
                            placeholder="Thank you for your submission! We'll be in touch soon."
                          />
                        </div>
                        <div className="p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                          <div className="flex items-center gap-2 text-emerald-700 mb-2">
                            <CheckCircle size={20} />
                            <span className="font-semibold">Preview</span>
                          </div>
                          <p className="text-emerald-600 text-sm">
                            {selectedPage.thankYouMessage ||
                              'Your thank you message will appear here.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeEditorTab === 'bot' && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="bg-white p-6 rounded-xl border border-slate-200">
                      <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                        <BotIcon size={18} className="text-orange-500" /> Bot
                        Integration
                      </h3>
                      <div className="space-y-4">
                        <div>
                          <label
                            htmlFor="landing-page-bot"
                            className="block text-sm font-medium text-slate-700 mb-2"
                          >
                            Select Bot
                          </label>
                          <select
                            id="landing-page-bot"
                            value={selectedPage.botId || ''}
                            onChange={(e) =>
                              updateSelectedPage(
                                'botId',
                                e.target.value || undefined,
                              )
                            }
                            className="w-full rounded-lg border-slate-200 focus:ring-orange-500 focus:border-orange-500"
                          >
                            <option value="">No bot (form only)</option>
                            {bots.map((bot) => (
                              <option key={bot.id} value={bot.id}>
                                {bot.name} - {bot.type}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-slate-500 mt-1">
                            The selected bot will power the chat widget on this
                            landing page.
                          </p>
                        </div>

                        {selectedPage.botId && (
                          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                            {(() => {
                              const bot = getAssociatedBot(selectedPage.botId);
                              if (!bot) return null;
                              return (
                                <div className="flex items-center gap-3">
                                  <div
                                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold"
                                    style={{ backgroundColor: bot.themeColor }}
                                  >
                                    {bot.name.substring(0, 2)}
                                  </div>
                                  <div>
                                    <div className="font-medium text-slate-800">
                                      {bot.name}
                                    </div>
                                    <div className="text-xs text-slate-500">
                                      {bot.type} • {bot.model}
                                    </div>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:w-1/2 flex flex-col bg-slate-100 rounded-xl border border-slate-200 overflow-hidden">
              <div className="h-12 bg-white border-b border-slate-200 flex items-center justify-between px-4">
                <div className="flex items-center gap-2">
                  <Eye size={16} className="text-slate-400" />
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Live Preview
                  </span>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setPreviewMode('desktop')}
                    className={`p-1.5 rounded transition ${previewMode === 'desktop' ? 'bg-white shadow text-orange-600' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <Monitor size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewMode('mobile')}
                    className={`p-1.5 rounded transition ${previewMode === 'mobile' ? 'bg-white shadow text-orange-600' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    <Smartphone size={16} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto flex justify-center p-4 md:p-8">
                <div
                  className={`bg-white shadow-xl transition-all duration-300 overflow-hidden ${previewMode === 'mobile' ? 'w-[375px] rounded-3xl border-8 border-slate-800' : 'w-full rounded-lg'}`}
                >
                  <div className="flex flex-col min-h-full">
                    <nav className="p-4 border-b border-gray-100 flex justify-between items-center">
                      <span className="font-bold text-lg text-gray-800">
                        {selectedPage.name}
                      </span>
                      <div className="w-8 h-8 bg-slate-200 rounded-full" />
                    </nav>

                    <header className="relative py-12 md:py-16 px-6 text-center bg-gradient-to-b from-slate-50 to-white overflow-hidden">
                      {selectedPage.heroImageUrl && (
                        <div className="absolute inset-0">
                          <img
                            src={selectedPage.heroImageUrl}
                            alt="Hero"
                            className="w-full h-full object-cover opacity-20"
                          />
                          <div className="absolute inset-0 bg-gradient-to-b from-white/80 to-white" />
                        </div>
                      )}
                      <div className="relative z-10">
                        <h1 className="text-2xl md:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
                          {selectedPage.headline || 'Your Headline Here'}
                        </h1>
                        <p className="text-base md:text-lg text-gray-600 max-w-lg mx-auto mb-8">
                          {selectedPage.subheadline ||
                            'Your subheadline will appear here.'}
                        </p>
                      </div>
                    </header>

                    <section className="py-8 md:py-12 px-6 bg-white">
                      <div className="max-w-md mx-auto">
                        <div className="bg-slate-50 rounded-xl p-6 border border-slate-200 space-y-4">
                          {selectedPage.formFields.map((field) => (
                            <div key={field.id}>
                              <p className="block text-sm font-medium text-gray-700 mb-1.5">
                                {field.label}
                                {field.required && (
                                  <span className="text-red-500 ml-1">*</span>
                                )}
                              </p>
                              {field.type === 'textarea' ? (
                                <textarea
                                  placeholder={field.placeholder}
                                  className="w-full rounded-lg border-gray-200 text-sm resize-none h-20"
                                  disabled
                                />
                              ) : field.type === 'checkbox' ? (
                                <label className="flex items-center gap-2 text-sm text-gray-600">
                                  <input
                                    type="checkbox"
                                    className="rounded border-gray-300"
                                    disabled
                                  />
                                  {field.label}
                                </label>
                              ) : (
                                <input
                                  type={field.type}
                                  placeholder={field.placeholder}
                                  className="w-full rounded-lg border-gray-200 text-sm"
                                  disabled
                                />
                              )}
                            </div>
                          ))}

                          {selectedPage.formFields.length === 0 && (
                            <p className="text-center text-slate-400 text-sm py-4">
                              Add form fields in the Form Builder tab
                            </p>
                          )}

                          <button
                            type="button"
                            className="w-full py-3 rounded-lg font-semibold text-white shadow-lg transition"
                            style={{ backgroundColor: selectedPage.ctaColor }}
                          >
                            {selectedPage.ctaText || 'Submit'}
                          </button>
                        </div>
                      </div>
                    </section>

                    {selectedPage.botId && (
                      <div className="fixed bottom-4 right-4 z-10">
                        <div
                          className="w-14 h-14 rounded-full shadow-lg flex items-center justify-center text-white cursor-pointer hover:scale-105 transition"
                          style={{
                            backgroundColor:
                              getAssociatedBot(selectedPage.botId)
                                ?.themeColor || '#3B82F6',
                          }}
                        >
                          <MessageSquare size={24} />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white border-t border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-sm">
                      <BarChart3 size={16} className="text-slate-400" />
                      <span className="text-slate-600">
                        <strong>
                          {selectedPage.viewCount.toLocaleString()}
                        </strong>{' '}
                        views
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle size={16} className="text-emerald-500" />
                      <span className="text-slate-600">
                        <strong>{selectedPage.conversionCount}</strong>{' '}
                        conversions
                      </span>
                    </div>
                  </div>
                  <div className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-sm font-semibold">
                    {getConversionRate(selectedPage)}% rate
                  </div>
                </div>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
};
