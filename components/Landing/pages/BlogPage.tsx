import { ArrowRight, Clock, Tag } from 'lucide-react';
import React from 'react';
import { PageLayout } from './PageLayout';

const blogPosts = [
  {
    id: 1,
    title:
      'The Complete BuildMyBot Feature Guide: Everything You Need to Automate Customer Conversations',
    excerpt:
      'BuildMyBot offers a comprehensive suite of AI-powered tools designed to transform how businesses interact with customers. From our intuitive no-code bot builder with multiple persona options to advanced voice agents powered by Cartesia, lead capture CRM, marketing automation, and white-label partner capabilities—discover every feature that makes BuildMyBot the all-in-one platform for modern customer engagement. Whether you need a simple FAQ bot or a sophisticated sales assistant that works 24/7, BuildMyBot has you covered.',
    date: 'January 2, 2026',
    category: 'Product Features',
    readTime: '15 min read',
    featured: true,
  },
  {
    id: 2,
    title:
      'The Future of Business: How AI Chatbots Are Reshaping Customer Engagement in 2026 and Beyond',
    excerpt:
      'The business landscape is undergoing a fundamental transformation. Companies that embrace AI-powered customer engagement are pulling ahead of competitors stuck in traditional models. With BuildMyBot, businesses are discovering that AI assistants handle routine inquiries while humans focus on complex, high-value interactions. We explore emerging trends like voice-first interfaces, hyper-personalization, and predictive customer service—and how forward-thinking companies are positioning themselves for the AI-driven future.',
    date: 'December 30, 2025',
    category: 'Industry Insights',
    readTime: '12 min read',
    featured: true,
  },
  {
    id: 3,
    title:
      'Slash Your Operating Costs: How BuildMyBot Helps Businesses Reduce Expenses Without Sacrificing Quality',
    excerpt:
      'Hiring, training, and managing customer service teams is expensive. Missed calls mean missed opportunities. BuildMyBot customers report significant reductions in operational costs by automating routine inquiries, eliminating after-hours staffing needs, and reducing the time employees spend on repetitive questions. Learn how companies are reallocating resources from answering the same questions repeatedly to strategic initiatives that drive growth—all while maintaining (and often improving) customer satisfaction scores.',
    date: 'December 22, 2025',
    category: 'Business Strategy',
    readTime: '10 min read',
    featured: false,
  },
  {
    id: 4,
    title:
      'From Visitors to Revenue: How AI Chatbots Drive Sales and Build Lasting Customer Trust',
    excerpt:
      'Every website visitor is a potential customer—but only if you engage them at the right moment. BuildMyBot transforms passive browsing into active conversations, capturing leads around the clock and nurturing them with personalized responses. Companies using AI chatbots see dramatic increases in conversion rates because no inquiry goes unanswered. More importantly, customers appreciate instant, accurate responses that build trust. Discover how businesses are using BuildMyBot to create a virtuous cycle: faster responses lead to happier customers, which leads to more referrals and repeat business.',
    date: 'December 15, 2025',
    category: 'Growth & Revenue',
    readTime: '11 min read',
    featured: false,
  },
];

const categories = [
  'All',
  'Product Features',
  'Industry Insights',
  'Business Strategy',
  'Growth & Revenue',
];

export const BlogPage: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = React.useState('All');

  const filteredPosts =
    selectedCategory === 'All'
      ? blogPosts
      : blogPosts.filter((post) => post.category === selectedCategory);

  const featuredPosts = blogPosts.filter((post) => post.featured);

  return (
    <PageLayout>
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16 space-y-16">
        <section className="text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900">
            BuildMyBot Blog
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto">
            Insights, strategies, and tips on AI automation, lead generation,
            and customer engagement.
          </p>
        </section>

        <section className="space-y-8">
          <h2 className="text-2xl font-bold text-slate-900">
            Featured Articles
          </h2>
          <div className="grid md:grid-cols-2 gap-8">
            {featuredPosts.map((post) => (
              <a
                key={post.id}
                href={`/blog/${post.id}`}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-xl transition-shadow group"
              >
                <div className="h-48 bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
                  <span className="text-6xl font-bold text-white/20">
                    {post.id}
                  </span>
                </div>
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-3 text-sm">
                    <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium">
                      {post.category}
                    </span>
                    <span className="text-slate-500 flex items-center gap-1">
                      <Clock size={14} /> {post.readTime}
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 group-hover:text-blue-700 transition-colors">
                    {post.title}
                  </h3>
                  <p className="text-slate-600 text-sm line-clamp-3">
                    {post.excerpt}
                  </p>
                  <div className="flex items-center justify-between pt-2">
                    <div className="text-slate-500 text-sm">
                      <span className="text-slate-700 font-medium">
                        Matthew Reardon
                      </span>{' '}
                      · {post.date}
                    </div>
                    <span className="text-blue-700 font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
                      Read More <ArrowRight size={16} />
                    </span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>

        <section className="space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h2 className="text-2xl font-bold text-slate-900">All Articles</h2>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  type="button"
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                    selectedCategory === category
                      ? 'bg-blue-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPosts.map((post) => (
              <a
                key={post.id}
                href={`/blog/${post.id}`}
                className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm hover:shadow-lg transition-shadow group"
              >
                <div className="flex items-center gap-2 mb-3 text-sm">
                  <Tag size={14} className="text-blue-600" />
                  <span className="text-blue-700 font-medium">
                    {post.category}
                  </span>
                </div>
                <h3 className="font-bold text-lg text-slate-900 mb-2 group-hover:text-blue-700 transition-colors line-clamp-2">
                  {post.title}
                </h3>
                <p className="text-slate-600 text-sm mb-4 line-clamp-3">
                  {post.excerpt}
                </p>
                <div className="flex items-center justify-between text-sm text-slate-500">
                  <span>
                    <span className="text-slate-700 font-medium">
                      Matthew Reardon
                    </span>{' '}
                    · {post.date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock size={14} /> {post.readTime}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </section>

        <section className="bg-gradient-to-br from-blue-900 to-blue-800 rounded-3xl p-12 text-center text-white">
          <h2 className="text-3xl font-bold mb-4">Stay Updated</h2>
          <p className="text-blue-200 mb-8 max-w-xl mx-auto">
            Get the latest AI insights and product updates delivered to your
            inbox. No spam, just valuable content.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
            <input
              type="email"
              placeholder="Enter your email"
              className="flex-1 px-4 py-3 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
            <button
              type="button"
              className="bg-white text-blue-900 px-6 py-3 rounded-xl font-bold hover:bg-blue-50 transition"
            >
              Subscribe
            </button>
          </div>
        </section>
      </div>
    </PageLayout>
  );
};
