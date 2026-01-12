import {
  CheckCircle,
  Clock,
  Download,
  ExternalLink,
  Eye,
  MessageSquare,
  Search,
  ShoppingBag,
  Star,
  Tag,
  ThumbsUp,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

interface Review {
  id: string;
  author: string;
  rating: number;
  comment: string;
  date: string;
  helpful: number;
}

interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  price: number;
  installs: number;
  rating: number;
  reviewCount: number;
  tags: string[];
  features: string[];
  systemPrompt: string;
  previewUrl?: string;
  reviews: Review[];
  trending?: boolean;
  new?: boolean;
}

interface EnhancedMarketplaceProps {
  onInstall?: (template: Template) => void;
}

type SortOption = 'popular' | 'rating' | 'new';

const EXPANDED_TEMPLATES: Template[] = [
  {
    id: 't1',
    name: 'Real Estate Scheduler',
    category: 'Real Estate',
    description:
      'Qualifies leads, collects budget/location info, and schedules viewing appointments automatically.',
    price: 0,
    installs: 1240,
    rating: 4.8,
    reviewCount: 156,
    tags: ['Scheduling', 'Lead Gen', 'CRM'],
    features: [
      'Auto-qualification',
      'Calendar integration',
      'Lead scoring',
      'SMS reminders',
    ],
    systemPrompt:
      'You are a knowledgeable real estate agent. Qualify buyers by asking about budget, location, and preferences. Schedule property viewings.',
    trending: true,
    reviews: [
      {
        id: 'r1',
        author: 'Sarah M.',
        rating: 5,
        comment: 'Increased our qualified leads by 40%! Amazing template.',
        date: '2024-01-15',
        helpful: 12,
      },
      {
        id: 'r2',
        author: 'Mike R.',
        rating: 4,
        comment:
          'Great for basic lead qualification. Would love more customization options.',
        date: '2024-01-10',
        helpful: 8,
      },
    ],
  },
  {
    id: 't2',
    name: 'SaaS Support Pro',
    category: 'Technology',
    description:
      'Trained on technical documentation structure. Handles L1 support tickets and API queries.',
    price: 49,
    installs: 856,
    rating: 4.9,
    reviewCount: 98,
    tags: ['Support', 'Technical', 'API'],
    features: [
      'API documentation',
      'Ticket routing',
      'Code examples',
      'Multi-language',
    ],
    systemPrompt:
      'You are a Tier 1 Technical Support agent. Walk users through troubleshooting steps logically. Ask clarifying questions to diagnose the issue.',
    reviews: [
      {
        id: 'r3',
        author: 'Tech Co.',
        rating: 5,
        comment: 'Reduced our support ticket volume by 60%!',
        date: '2024-01-12',
        helpful: 15,
      },
    ],
  },
  {
    id: 't3',
    name: 'Dental Clinic Front Desk',
    category: 'Healthcare',
    description:
      'Compassionate receptionist that handles emergencies, bookings, and insurance FAQs.',
    price: 29,
    installs: 2100,
    rating: 4.7,
    reviewCount: 203,
    tags: ['Healthcare', 'Booking', 'Insurance'],
    features: [
      'Emergency triage',
      'Insurance verification',
      'Appointment reminders',
      'HIPAA compliant',
    ],
    systemPrompt:
      'You are a compassionate dental receptionist. Handle emergencies with urgency, help with insurance questions, and book appointments professionally.',
    trending: true,
    reviews: [
      {
        id: 'r4',
        author: 'Dr. Smith',
        rating: 5,
        comment: 'Patients love it! Very natural conversations.',
        date: '2024-01-14',
        helpful: 10,
      },
    ],
  },
  {
    id: 't4',
    name: 'E-commerce Sales Rep',
    category: 'Retail',
    description:
      'Product recommender that upsells items based on user preferences and cart contents.',
    price: 0,
    installs: 3400,
    rating: 4.6,
    reviewCount: 412,
    tags: ['Sales', 'Retail', 'Upsell'],
    features: [
      'Product recommendations',
      'Cart analysis',
      'Upselling logic',
      'Discount codes',
    ],
    systemPrompt:
      'You are an expert product specialist. Assist customers in finding the perfect product. Ask about their needs, compare options, and explain benefits clearly.',
    reviews: [
      {
        id: 'r5',
        author: 'Shop Owner',
        rating: 5,
        comment: 'Boosted AOV by 25%!',
        date: '2024-01-11',
        helpful: 20,
      },
    ],
  },
  {
    id: 't5',
    name: 'Gym Membership Closer',
    category: 'Fitness',
    description:
      'High-energy sales agent designed to book trial sessions and overcome pricing objections.',
    price: 19,
    installs: 520,
    rating: 4.5,
    reviewCount: 67,
    tags: ['Sales', 'Fitness', 'Trial'],
    features: [
      'Trial booking',
      'Objection handling',
      'Membership tiers',
      'Follow-up scheduling',
    ],
    systemPrompt:
      'You are a lifestyle and wellness coach. Motivate users, track progress, and provide encouraging feedback. Maintain a positive, energetic tone.',
    new: true,
    reviews: [],
  },
  {
    id: 't6',
    name: 'Restaurant Reservationist',
    category: 'Hospitality',
    description:
      'Manages table bookings, dietary restrictions, and opening hours queries.',
    price: 0,
    installs: 1800,
    rating: 4.8,
    reviewCount: 145,
    tags: ['Booking', 'Food', 'Reservations'],
    features: [
      'Table management',
      'Dietary tracking',
      'Wait list',
      'Special occasions',
    ],
    systemPrompt:
      'You manage restaurant reservations. Be friendly, note dietary restrictions, and suggest special seating for occasions.',
    reviews: [
      {
        id: 'r6',
        author: 'Bistro NYC',
        rating: 5,
        comment: 'No more missed bookings!',
        date: '2024-01-13',
        helpful: 9,
      },
    ],
  },
  {
    id: 't13',
    name: 'City Hall 311 Agent',
    category: 'Government',
    description:
      'Handles utility FAQs, payment routing, and general citizen inquiries. Reduces call volume.',
    price: 99,
    installs: 45,
    rating: 5.0,
    reviewCount: 12,
    tags: ['Gov', 'Utilities', '311', 'Public'],
    features: [
      'Multi-department routing',
      'Payment links',
      'Emergency protocols',
      'Multi-lingual',
    ],
    systemPrompt:
      'You are the official AI agent for City Government. Assist citizens with utility bill payments, trash pickup schedules, and permit applications. Be authoritative and helpful.',
    trending: true,
    new: true,
    reviews: [
      {
        id: 'r7',
        author: 'City Admin',
        rating: 5,
        comment: 'Cut call center costs by 45%!',
        date: '2024-01-16',
        helpful: 5,
      },
    ],
  },
  {
    id: 't14',
    name: 'Financial Advisor Bot',
    category: 'Finance',
    description:
      'Helps users understand banking products, explains loan options, and schedules consultations.',
    price: 59,
    installs: 380,
    rating: 4.7,
    reviewCount: 42,
    tags: ['Finance', 'Banking', 'Advisory'],
    features: [
      'Product comparison',
      'Rate calculator',
      'Compliance checks',
      'Appointment booking',
    ],
    systemPrompt:
      'You are a financial guide. Help users understand banking products, credit cards, and loan options. Explain complex terms simply. Be trustworthy and precise.',
    reviews: [],
  },
  {
    id: 't15',
    name: 'HR Onboarding Assistant',
    category: 'HR',
    description:
      'Guides new employees through onboarding, answers policy questions, collects documents.',
    price: 39,
    installs: 290,
    rating: 4.6,
    reviewCount: 38,
    tags: ['HR', 'Onboarding', 'Compliance'],
    features: [
      'Document collection',
      'Policy Q&A',
      'Task tracking',
      'Benefits enrollment',
    ],
    systemPrompt:
      'You are a Human Resources assistant. Answer employee questions about benefits, holidays, and company policy. Maintain strict confidentiality and professionalism.',
    new: true,
    reviews: [],
  },
  {
    id: 't16',
    name: 'Travel Booking Concierge',
    category: 'Travel',
    description:
      'Helps users plan trips, suggests destinations, and handles booking inquiries.',
    price: 29,
    installs: 670,
    rating: 4.8,
    reviewCount: 89,
    tags: ['Travel', 'Booking', 'Tourism'],
    features: [
      'Destination matching',
      'Budget planning',
      'Activity suggestions',
      'Booking links',
    ],
    systemPrompt:
      'You are a knowledgeable travel concierge. Help users plan their perfect trip by asking about their budget, preferred climate, and interests.',
    trending: true,
    reviews: [
      {
        id: 'r8',
        author: 'Travel Agency',
        rating: 5,
        comment: 'Customers love the personalized recommendations!',
        date: '2024-01-09',
        helpful: 7,
      },
    ],
  },
];

export const EnhancedMarketplace: React.FC<EnhancedMarketplaceProps> = ({
  onInstall,
}) => {
  const [filter, setFilter] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('popular');
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null,
  );

  const sortedTemplates = [...EXPANDED_TEMPLATES];

  if (sortBy === 'popular') {
    sortedTemplates.sort((a, b) => b.installs - a.installs);
  } else if (sortBy === 'rating') {
    sortedTemplates.sort((a, b) => b.rating - a.rating);
  } else if (sortBy === 'new') {
    sortedTemplates.sort((a, b) => (b.new ? 1 : 0) - (a.new ? 1 : 0));
  }

  const filteredTemplates = sortedTemplates.filter((t) => {
    const matchesCategory = filter === 'All' || t.category === filter;
    const matchesSearch =
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.tags.some((tag) =>
        tag.toLowerCase().includes(searchTerm.toLowerCase()),
      );
    return matchesCategory && matchesSearch;
  });

  const categories = [
    'All',
    ...Array.from(new Set(EXPANDED_TEMPLATES.map((t) => t.category))),
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-end gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">
            Template Marketplace
          </h2>
          <p className="text-slate-500">
            50+ pre-trained industry templates •{' '}
            {EXPANDED_TEMPLATES.reduce(
              (sum, t) => sum + t.installs,
              0,
            ).toLocaleString()}
            + installs
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

      {/* Search, Filter & Sort */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search
              className="absolute left-3 top-2.5 text-slate-400"
              size={18}
            />
            <input
              type="text"
              placeholder="Search templates, categories, or tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="px-4 py-2 rounded-lg border-slate-200 focus:ring-blue-900 focus:border-blue-900 text-sm"
            >
              <option value="popular">Most Popular</option>
              <option value="rating">Highest Rated</option>
              <option value="new">Newest</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pb-2">
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

      {/* Results Count */}
      <div className="text-sm text-slate-500">
        Showing {filteredTemplates.length} template
        {filteredTemplates.length !== 1 ? 's' : ''}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map((template) => (
          <div
            key={template.id}
            className="bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition group flex flex-col h-full relative"
          >
            {/* Badges */}
            <div className="absolute top-3 right-3 flex flex-col gap-1 z-10">
              {template.trending && (
                <span className="bg-orange-500 text-white text-xs px-2 py-1 rounded-full font-bold flex items-center gap-1 shadow-lg">
                  <TrendingUp size={10} /> Trending
                </span>
              )}
              {template.new && (
                <span className="bg-blue-600 text-white text-xs px-2 py-1 rounded-full font-bold flex items-center gap-1 shadow-lg">
                  <Clock size={10} /> New
                </span>
              )}
            </div>

            <div className="p-6 flex-1">
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-blue-50 text-blue-900 rounded-xl group-hover:bg-blue-900 group-hover:text-white transition">
                  <ShoppingBag size={24} />
                </div>
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">
                {template.name}
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed mb-3">
                {template.description}
              </p>

              {/* Rating & Reviews */}
              <div className="flex items-center gap-2 mb-3">
                <div className="flex items-center gap-1 bg-yellow-50 text-yellow-700 px-2 py-1 rounded-full text-xs font-bold">
                  <Star size={12} fill="currentColor" /> {template.rating}
                </div>
                <span className="text-xs text-slate-400">
                  ({template.reviewCount}{' '}
                  {template.reviewCount === 1 ? 'review' : 'reviews'})
                </span>
              </div>

              <div className="mt-2 p-2 bg-green-50 rounded-lg border border-green-200">
                <p className="text-[10px] font-bold text-green-700 uppercase tracking-tight">
                  Upfront Earnings Potential
                </p>
                <p className="text-xs font-semibold text-green-800">
                  Partner: 50% ($${(template.price * 0.5).toFixed(2)}) •
                  Reseller: Up to 20%
                </p>
              </div>

              <div className="flex flex-wrap gap-2 mb-4">
                {template.tags.slice(0, 3).map((tag) => (
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
                  {template.installs.toLocaleString()} installs
                </span>
                <span className="font-bold text-slate-800">
                  {template.price === 0 ? 'Free' : `$${template.price}`}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedTemplate(template)}
                  className="p-2 text-slate-500 hover:text-blue-900 hover:bg-blue-50 rounded-lg transition"
                  title="View details"
                >
                  <Eye size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => onInstall?.(template)}
                  className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-800 hover:text-white transition shadow-sm"
                >
                  <Download size={16} /> Clone
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Template Detail Modal */}
      {selectedTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <h2 className="text-2xl font-bold text-slate-900">
                    {selectedTemplate.name}
                  </h2>
                  {selectedTemplate.trending && (
                    <span className="bg-orange-100 text-orange-700 text-xs px-2 py-1 rounded-full font-bold flex items-center gap-1">
                      <TrendingUp size={10} /> Trending
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-500">
                  {selectedTemplate.category}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTemplate(null)}
                className="text-slate-400 hover:text-slate-600 text-2xl leading-none ml-4"
              >
                ×
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center justify-center gap-1 text-yellow-600 mb-1">
                    <Star size={16} fill="currentColor" />
                    <span className="font-bold">{selectedTemplate.rating}</span>
                  </div>
                  <div className="text-xs text-slate-500">
                    {selectedTemplate.reviewCount} reviews
                  </div>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className="font-bold text-slate-900 mb-1">
                    {selectedTemplate.installs.toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-500">Installs</div>
                </div>
                <div className="text-center p-3 bg-slate-50 rounded-lg">
                  <div className="font-bold text-slate-900 mb-1">
                    {selectedTemplate.price === 0
                      ? 'Free'
                      : `$${selectedTemplate.price}`}
                  </div>
                  <div className="text-xs text-slate-500">One-time</div>
                </div>
              </div>

              {/* Description */}
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">
                  Description
                </h3>
                <p className="text-slate-600 leading-relaxed">
                  {selectedTemplate.description}
                </p>
              </div>

              {/* Features */}
              <div>
                <h3 className="font-semibold text-slate-900 mb-3">
                  Key Features
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {selectedTemplate.features.map((feature) => (
                    <div
                      key={feature}
                      className="flex items-center gap-2 text-sm text-slate-600"
                    >
                      <CheckCircle
                        size={16}
                        className="text-green-600 shrink-0"
                      />
                      {feature}
                    </div>
                  ))}
                </div>
              </div>

              {/* Tags */}
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedTemplate.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs bg-slate-100 text-slate-700 px-3 py-1 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              {/* Reviews */}
              {selectedTemplate.reviews.length > 0 && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <MessageSquare size={18} />
                    Reviews ({selectedTemplate.reviews.length})
                  </h3>
                  <div className="space-y-3">
                    {selectedTemplate.reviews.map((review) => (
                      <div
                        key={review.id}
                        className="bg-slate-50 p-4 rounded-lg"
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <div className="font-medium text-slate-900">
                              {review.author}
                            </div>
                            <div className="flex items-center gap-1 mt-1">
                              {[1, 2, 3, 4, 5].map((star) => (
                                <Star
                                  key={star}
                                  size={12}
                                  className={
                                    star <= review.rating
                                      ? 'text-yellow-500 fill-current'
                                      : 'text-slate-300'
                                  }
                                />
                              ))}
                            </div>
                          </div>
                          <span className="text-xs text-slate-400">
                            {review.date}
                          </span>
                        </div>
                        <p className="text-sm text-slate-600 mb-2">
                          {review.comment}
                        </p>
                        <button
                          type="button"
                          className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
                        >
                          <ThumbsUp size={12} /> Helpful ({review.helpful})
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">One-time purchase</div>
                <div className="font-bold text-xl text-slate-900">
                  {selectedTemplate.price === 0
                    ? 'Free'
                    : `$${selectedTemplate.price}`}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  onInstall?.(selectedTemplate);
                  setSelectedTemplate(null);
                }}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2 transition shadow-sm"
              >
                <Download size={18} />
                Install Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
