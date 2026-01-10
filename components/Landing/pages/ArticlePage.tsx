import { ArrowLeft, Calendar, Clock, Tag, User } from 'lucide-react';
import type React from 'react';
import { PageLayout } from './PageLayout';

const author = {
  name: 'Matthew Reardon',
  role: 'Founder & CEO',
  bio: 'Matthew Reardon is the founder and CEO of BuildMyBot. With over 10 years of experience in sales, business development, branding, and entrepreneurship, Matthew is passionate about helping businesses leverage AI to create better customer experiences.',
};

const articleContent: Record<
  number,
  {
    title: string;
    category: string;
    date: string;
    readTime: string;
    content: React.ReactNode;
  }
> = {
  1: {
    title:
      'The Complete BuildMyBot Feature Guide: Everything You Need to Automate Customer Conversations',
    category: 'Product Features',
    date: 'January 2, 2026',
    readTime: '15 min read',
    content: (
      <>
        <p className="text-lg text-slate-600 mb-8 leading-relaxed">
          BuildMyBot offers a comprehensive suite of AI-powered tools designed
          to transform how businesses interact with customers. Whether you need
          a simple FAQ bot or a sophisticated sales assistant that works 24/7,
          BuildMyBot has you covered.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          No-Code Bot Builder
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          Our intuitive drag-and-drop bot builder makes it easy for anyone to
          create powerful AI chatbots without writing a single line of code.
          Choose from multiple persona options—from friendly and casual to
          professional and formal—to match your brand voice perfectly.
        </p>
        <p className="text-slate-700 mb-6 leading-relaxed">
          The bot builder includes customizable system prompts, adjustable
          response temperatures for creativity control, and the ability to
          upload documents to create a custom knowledge base. Your bot learns
          from your content and provides accurate, on-brand responses to
          customer inquiries.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          Voice Agents Powered by Cartesia
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          Take customer engagement to the next level with our ultra-realistic
          voice agents. Powered by Cartesia's advanced voice synthesis
          technology, our voice agents sound remarkably human—complete with
          natural intonation, appropriate pauses, and emotional nuance.
        </p>
        <p className="text-slate-700 mb-6 leading-relaxed">
          Choose from six professionally crafted voices including Katie (warm
          and professional), Sarah (friendly and approachable), British Lady
          (sophisticated and clear), and more. Each voice is optimized for
          customer service interactions and can be previewed directly in the
          dashboard before deployment.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          Lead Capture CRM
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          Every conversation is an opportunity. BuildMyBot's integrated CRM
          automatically captures lead information during chat interactions,
          scoring prospects based on engagement level and conversation
          sentiment. Never miss a potential customer again.
        </p>
        <p className="text-slate-700 mb-6 leading-relaxed">
          The CRM dashboard provides a clear view of all captured leads with
          filtering options by status (New, Contacted, Qualified, Closed),
          source bot, and date range. Export leads to your existing CRM or
          manage the entire sales pipeline directly within BuildMyBot.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          Marketing Automation
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          BuildMyBot includes powerful marketing tools to help you engage leads
          and customers at scale. Create automated email sequences triggered by
          chat interactions, segment your audience based on behavior and
          preferences, and track campaign performance with detailed analytics.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          White-Label Partner Program
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          For agencies and resellers, BuildMyBot offers comprehensive
          white-label capabilities. Set up your own custom domain, apply your
          branding, and offer BuildMyBot's technology to your clients under your
          own brand. Our tiered partner program offers commissions from 20% to
          50% based on your client volume.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          Flexible Deployment Options
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          Deploy your chatbot exactly where your customers are. BuildMyBot
          supports multiple embed types including hover widgets that appear in
          the corner of your website, fixed chat windows, and full-page chat
          experiences. Simply copy the provided embed code and paste it into
          your website—it's that easy.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          Getting Started
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          Ready to transform your customer engagement? Sign up for a free trial
          today and experience the power of AI-driven conversations. Our team is
          here to help you every step of the way, from initial setup to
          optimization and scaling.
        </p>
      </>
    ),
  },
  2: {
    title:
      'The Future of Business: How AI Chatbots Are Reshaping Customer Engagement in 2026 and Beyond',
    category: 'Industry Insights',
    date: 'December 30, 2025',
    readTime: '12 min read',
    content: (
      <>
        <p className="text-lg text-slate-600 mb-8 leading-relaxed">
          The business landscape is undergoing a fundamental transformation.
          Companies that embrace AI-powered customer engagement are pulling
          ahead of competitors stuck in traditional models. Let's explore what
          this means for your business and how to position yourself for success.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          The Shift Has Already Begun
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          Customer expectations have fundamentally changed. Today's consumers
          expect instant responses, 24/7 availability, and personalized
          interactions. They don't want to wait on hold, fill out contact forms
          and wait days for responses, or navigate complex phone trees. They
          want answers now.
        </p>
        <p className="text-slate-700 mb-6 leading-relaxed">
          Businesses that recognize this shift are implementing AI assistants
          that handle routine inquiries instantly while routing complex issues
          to human team members. This hybrid approach delivers the best of both
          worlds: speed and efficiency for common questions, human expertise for
          nuanced situations.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          Voice-First Interfaces
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          The rise of smart speakers and voice assistants has conditioned
          consumers to expect voice interaction capabilities. Forward-thinking
          businesses are already implementing voice agents that can handle phone
          inquiries with remarkably human-like conversation abilities.
        </p>
        <p className="text-slate-700 mb-6 leading-relaxed">
          Modern voice synthesis technology, like that provided by Cartesia, has
          crossed the uncanny valley. Today's voice agents sound natural, with
          appropriate emotional inflection and conversational rhythm. Customers
          often can't tell they're speaking with an AI—and that's exactly the
          point.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          Hyper-Personalization at Scale
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          AI enables a level of personalization that was previously impossible.
          By analyzing conversation history, purchase patterns, and behavioral
          data, AI assistants can tailor every interaction to the individual
          customer. This isn't just using someone's first name—it's
          understanding their preferences, anticipating their needs, and
          providing relevant recommendations.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          Predictive Customer Service
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          The most advanced AI systems don't just react to customer
          inquiries—they predict them. By analyzing patterns in customer
          behavior, these systems can proactively reach out with relevant
          information before customers even ask. Imagine a chatbot that notices
          a customer has been browsing shipping information and proactively
          offers to track their recent order.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          The Human Element Remains Essential
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          It's important to note that AI doesn't replace human connection—it
          enhances it. The goal isn't to eliminate human customer service
          representatives but to free them from repetitive tasks so they can
          focus on complex, high-value interactions that truly require human
          judgment and empathy.
        </p>
        <p className="text-slate-700 mb-6 leading-relaxed">
          The businesses that will thrive are those that find the right balance:
          using AI to handle the 80% of inquiries that are routine and
          predictable, while ensuring seamless handoff to humans for the 20%
          that require deeper engagement.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          Preparing Your Business
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          The time to act is now. Implementing AI customer engagement isn't just
          about staying competitive—it's about survival. Businesses that delay
          will find themselves increasingly unable to meet customer expectations
          as those expectations continue to rise.
        </p>
        <p className="text-slate-700 mb-6 leading-relaxed">
          Start by identifying your highest-volume customer inquiries. These are
          prime candidates for AI automation. Then, choose a platform like
          BuildMyBot that makes implementation simple and provides the
          flexibility to grow with your needs.
        </p>
      </>
    ),
  },
  3: {
    title:
      'Slash Your Operating Costs: How BuildMyBot Helps Businesses Reduce Expenses Without Sacrificing Quality',
    category: 'Business Strategy',
    date: 'December 22, 2025',
    readTime: '10 min read',
    content: (
      <>
        <p className="text-lg text-slate-600 mb-8 leading-relaxed">
          Hiring, training, and managing customer service teams is expensive.
          Missed calls mean missed opportunities. Let's explore how businesses
          are using AI to dramatically reduce operational costs while actually
          improving customer satisfaction.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          The True Cost of Traditional Customer Service
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          Most businesses underestimate the full cost of their customer service
          operations. Beyond salaries, consider: recruiting and hiring costs,
          training and onboarding time, management overhead, technology and
          tools, physical office space, employee benefits, and turnover costs
          (customer service has notoriously high turnover rates).
        </p>
        <p className="text-slate-700 mb-6 leading-relaxed">
          Then there are the hidden costs: the leads lost because phones weren't
          answered after hours, the customers who gave up waiting for email
          responses, the opportunities missed because your team was overwhelmed
          with routine questions.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          24/7 Availability Without 24/7 Staffing
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          One of the most immediate benefits of AI chatbots is round-the-clock
          availability. Your BuildMyBot assistant never sleeps, never takes
          breaks, and never calls in sick. It's there at 2 AM when a prospect
          from another timezone has questions. It's there on holidays when your
          competitors are closed.
        </p>
        <p className="text-slate-700 mb-6 leading-relaxed">
          This doesn't mean eliminating human staff—it means your human team can
          work normal hours while customers still receive instant responses at
          any time. The AI handles after-hours inquiries, captures lead
          information, and ensures nothing falls through the cracks.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          Handling Volume Spikes Without Panic Hiring
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          Seasonal businesses face a particular challenge: how do you staff for
          peak periods without overpaying during slow times? AI chatbots scale
          instantly. Whether you're handling 10 conversations or 10,000, the
          cost remains predictable. No emergency hiring, no overtime, no stress.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          Reducing Time Spent on Repetitive Questions
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          "What are your hours?" "Where are you located?" "Do you offer free
          shipping?" These questions come up hundreds of times, and every answer
          takes employee time. BuildMyBot handles these routine inquiries
          automatically, freeing your team to focus on complex issues that truly
          require human attention.
        </p>
        <p className="text-slate-700 mb-6 leading-relaxed">
          By uploading your FAQ documents, product information, and company
          policies to BuildMyBot's knowledge base, you ensure accurate,
          consistent answers every time—without tying up staff.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          Reallocating Resources to Growth
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          The goal isn't just cost reduction—it's resource reallocation. When
          your team isn't buried in routine inquiries, they can focus on
          activities that drive growth: building relationships with key
          accounts, developing new products, improving processes, and handling
          the complex customer situations that truly benefit from human
          expertise.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          Getting Started
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          Ready to see how BuildMyBot can reduce your operational costs? Start
          with a free trial and experience the difference AI-powered customer
          engagement can make for your business.
        </p>
      </>
    ),
  },
  4: {
    title:
      'From Visitors to Revenue: How AI Chatbots Drive Sales and Build Lasting Customer Trust',
    category: 'Growth & Revenue',
    date: 'December 15, 2025',
    readTime: '11 min read',
    content: (
      <>
        <p className="text-lg text-slate-600 mb-8 leading-relaxed">
          Every website visitor is a potential customer—but only if you engage
          them at the right moment. Let's explore how AI chatbots transform
          passive browsing into active conversations that drive revenue and
          build trust.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          The Problem: Visitors Leave Without Converting
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          Think about your own browsing behavior. How often do you land on a
          website, have a quick question, and leave when you can't find an
          immediate answer? Maybe you meant to come back later, but life got in
          the way. That business lost a potential customer—not because their
          product wasn't good, but because they weren't there when you needed
          them.
        </p>
        <p className="text-slate-700 mb-6 leading-relaxed">
          This happens thousands of times every day on websites around the
          world. Visitors come, browse, and leave—often just one answered
          question away from becoming a customer.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          Engaging Visitors at the Right Moment
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          BuildMyBot's hover widget appears at the perfect moment—visible enough
          to be helpful, unobtrusive enough not to annoy. When visitors have
          questions, help is immediately available. No searching for contact
          information, no waiting for email responses, no frustrating phone
          trees.
        </p>
        <p className="text-slate-700 mb-6 leading-relaxed">
          This instant availability dramatically increases the likelihood of
          conversion. When customers can get immediate answers to their
          questions about pricing, features, or policies, they're far more
          likely to take the next step.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          Building Trust Through Responsiveness
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          Speed matters more than most businesses realize. In an era of instant
          gratification, customers judge businesses by their responsiveness. A
          company that answers in seconds signals that they value their
          customers' time. A company that takes hours or days sends the opposite
          message.
        </p>
        <p className="text-slate-700 mb-6 leading-relaxed">
          BuildMyBot ensures every inquiry receives an immediate
          response—building trust from the very first interaction. This positive
          first impression sets the tone for the entire customer relationship.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          Capturing Leads Around the Clock
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          Your best leads might visit your website at midnight. They might be in
          a different timezone. They might be night owls who do their research
          after the kids are in bed. Without AI, these leads slip away.
        </p>
        <p className="text-slate-700 mb-6 leading-relaxed">
          BuildMyBot captures lead information during every conversation,
          automatically populating your CRM with contact details, conversation
          history, and engagement scores. When your sales team arrives in the
          morning, qualified leads are waiting.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          The Virtuous Cycle of Great Service
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          Great customer service creates a virtuous cycle. Fast, helpful
          responses lead to satisfied customers. Satisfied customers become
          repeat buyers. Repeat buyers refer their friends. Referrals bring new
          customers who receive the same great service—and the cycle continues.
        </p>
        <p className="text-slate-700 mb-6 leading-relaxed">
          BuildMyBot helps you start this cycle by ensuring every interaction,
          from the first website visit through ongoing support, meets the high
          expectations of today's customers.
        </p>

        <h2 className="text-2xl font-bold text-slate-900 mt-12 mb-4">
          Take the First Step
        </h2>
        <p className="text-slate-700 mb-6 leading-relaxed">
          Ready to stop losing leads to slow response times? Try BuildMyBot
          today and experience what it's like to engage every visitor, capture
          every lead, and build lasting customer relationships—automatically.
        </p>
      </>
    ),
  },
};

interface ArticlePageProps {
  articleId: number;
}

export const ArticlePage: React.FC<ArticlePageProps> = ({ articleId }) => {
  const article = articleContent[articleId];

  const goToBlog = () => {
    window.location.href = '/blog';
  };

  const goToHome = () => {
    window.location.href = '/';
  };

  if (!article) {
    return (
      <PageLayout>
        <div className="max-w-4xl mx-auto px-6 py-16 text-center">
          <h1 className="text-3xl font-bold text-slate-900 mb-4">
            Article Not Found
          </h1>
          <button
            type="button"
            onClick={goToBlog}
            className="text-blue-700 hover:text-blue-800 font-medium flex items-center gap-2 mx-auto"
          >
            <ArrowLeft size={18} /> Back to Blog
          </button>
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <article className="max-w-4xl mx-auto px-6 lg:px-12 py-16">
        <button
          type="button"
          onClick={goToBlog}
          className="text-blue-700 hover:text-blue-800 font-medium flex items-center gap-2 mb-8"
        >
          <ArrowLeft size={18} /> Back to Blog
        </button>

        <header className="mb-12">
          <div className="flex items-center gap-3 mb-4 text-sm">
            <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full font-medium flex items-center gap-1">
              <Tag size={14} /> {article.category}
            </span>
            <span className="text-slate-500 flex items-center gap-1">
              <Clock size={14} /> {article.readTime}
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-slate-900 leading-tight mb-6">
            {article.title}
          </h1>

          <div className="flex items-center gap-4 pt-6 border-t border-slate-200">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-blue-800 rounded-full flex items-center justify-center text-white font-bold text-xl">
              DM
            </div>
            <div>
              <div className="flex items-center gap-2">
                <User size={16} className="text-slate-400" />
                <span className="font-semibold text-slate-900">
                  {author.name}
                </span>
              </div>
              <div className="flex items-center gap-4 text-sm text-slate-500">
                <span>{author.role}</span>
                <span className="flex items-center gap-1">
                  <Calendar size={14} /> {article.date}
                </span>
              </div>
            </div>
          </div>
        </header>

        <div className="prose prose-lg max-w-none">{article.content}</div>

        <footer className="mt-16 pt-8 border-t border-slate-200">
          <div className="bg-slate-50 rounded-2xl p-6 flex flex-col sm:flex-row gap-6 items-start">
            <div className="w-20 h-20 bg-gradient-to-br from-blue-600 to-blue-800 rounded-full flex items-center justify-center text-white font-bold text-2xl flex-shrink-0">
              DM
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900 mb-1">
                About {author.name}
              </h3>
              <p className="text-slate-600">{author.bio}</p>
            </div>
          </div>

          <div className="mt-8 text-center">
            <h3 className="font-bold text-xl text-slate-900 mb-4">
              Ready to transform your customer engagement?
            </h3>
            <button
              type="button"
              onClick={goToHome}
              className="bg-blue-700 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-800 transition"
            >
              Get Started with BuildMyBot
            </button>
          </div>
        </footer>
      </article>
    </PageLayout>
  );
};
