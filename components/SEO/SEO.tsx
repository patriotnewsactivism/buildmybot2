import { useEffect } from 'react';

type MetaTag = { name?: string; property?: string; content: string };

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  author?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogImageAlt?: string;
  ogUrl?: string;
  ogType?: 'website' | 'article' | 'product' | 'profile';
  siteName?: string;
  locale?: string;
  twitterCard?: 'summary' | 'summary_large_image' | 'app' | 'player';
  twitterSite?: string;
  twitterCreator?: string;
  canonical?: string;
  robots?: string;
  themeColor?: string;
  noindex?: boolean;
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>;
  extraMeta?: MetaTag[];
}

export const SEO: React.FC<SEOProps> = ({
  title = 'BuildMyBot - AI Chatbot Builder for Business',
  description = 'Create powerful AI chatbots for your business in minutes. No coding required. Increase leads, automate customer support, and boost sales with BuildMyBot.',
  keywords = 'AI chatbot, chatbot builder, customer support automation, lead generation, conversational AI, business automation',
  author,
  ogTitle,
  ogDescription,
  ogImage = 'https://buildmybot.app/logo.jpg',
  ogImageAlt = 'BuildMyBot AI chatbot platform',
  ogUrl,
  ogType = 'website',
  siteName = 'BuildMyBot',
  locale = 'en_US',
  twitterCard = 'summary_large_image',
  twitterSite = '@buildmybot',
  twitterCreator = '@buildmybot',
  canonical,
  robots = 'index,follow,max-image-preview:large',
  themeColor = '#0f172a',
  noindex = false,
  structuredData,
  extraMeta = [],
}) => {
  useEffect(() => {
    const resolvedCanonical =
      canonical ||
      (typeof window !== 'undefined'
        ? `${window.location.origin}${window.location.pathname}`
        : undefined);
    const resolvedOgUrl = ogUrl || resolvedCanonical;
    const resolvedRobots = noindex ? 'noindex,nofollow' : robots;

    document.title = title;

    const metaTags: MetaTag[] = [
      { name: 'description', content: description },
      { name: 'keywords', content: keywords },
      { name: 'robots', content: resolvedRobots },
      { name: 'application-name', content: siteName },
      { name: 'theme-color', content: themeColor },

      { property: 'og:title', content: ogTitle || title },
      { property: 'og:description', content: ogDescription || description },
      { property: 'og:image', content: ogImage },
      { property: 'og:image:alt', content: ogImageAlt },
      { property: 'og:type', content: ogType },
      { property: 'og:site_name', content: siteName },
      { property: 'og:locale', content: locale },

      { name: 'twitter:card', content: twitterCard },
      { name: 'twitter:site', content: twitterSite },
      { name: 'twitter:creator', content: twitterCreator },
      { name: 'twitter:title', content: ogTitle || title },
      { name: 'twitter:description', content: ogDescription || description },
      { name: 'twitter:image', content: ogImage },
      { name: 'twitter:image:alt', content: ogImageAlt },
      ...extraMeta,
    ];

    if (author) {
      metaTags.push({ name: 'author', content: author });
    }

    if (resolvedOgUrl) {
      metaTags.push({ property: 'og:url', content: resolvedOgUrl });
    }

    for (const { name, property, content } of metaTags) {
      if (!content) {
        continue;
      }
      const selector = name
        ? `meta[name="${name}"]`
        : `meta[property="${property}"]`;
      let element = document.querySelector(selector);

      if (!element) {
        element = document.createElement('meta');
        if (name) element.setAttribute('name', name);
        if (property) element.setAttribute('property', property);
        document.head.appendChild(element);
      }

      element.setAttribute('content', content);
    }

    if (resolvedCanonical) {
      let linkElement = document.querySelector('link[rel="canonical"]');

      if (!linkElement) {
        linkElement = document.createElement('link');
        linkElement.setAttribute('rel', 'canonical');
        document.head.appendChild(linkElement);
      }

      linkElement.setAttribute('href', resolvedCanonical);
    }

    const existingStructuredData = document.querySelectorAll(
      'script[data-seo="structured-data"]',
    );
    for (const script of existingStructuredData) {
      script.parentNode?.removeChild(script);
    }

    if (structuredData) {
      const dataItems = Array.isArray(structuredData)
        ? structuredData
        : [structuredData];
      for (const item of dataItems) {
        const script = document.createElement('script');
        script.setAttribute('type', 'application/ld+json');
        script.setAttribute('data-seo', 'structured-data');
        script.textContent = JSON.stringify(item);
        document.head.appendChild(script);
      }
    }
  }, [
    title,
    description,
    keywords,
    author,
    ogTitle,
    ogDescription,
    ogImage,
    ogImageAlt,
    ogUrl,
    ogType,
    siteName,
    locale,
    twitterCard,
    twitterSite,
    twitterCreator,
    canonical,
    robots,
    themeColor,
    noindex,
    structuredData,
    extraMeta,
  ]);

  return null;
};

// Predefined SEO configurations for common pages
export const SEOConfig = {
  home: {
    title: 'BuildMyBot | White-Label AI Chatbot & Voice Agent Platform',
    description:
      'Build, deploy, and white-label AI chatbots and voice agents that capture leads, automate support, and grow revenue. No code required.',
    keywords:
      'white label ai chatbot, chatbot builder, voice agent, lead generation, customer support automation, conversational ai',
  },
  features: {
    title: 'BuildMyBot Features | AI Chatbot & Voice Agent Platform',
    description:
      'Explore BuildMyBot features: AI chatbots, voice agents, lead capture CRM, analytics, and white-label tools to scale customer engagement.',
    keywords:
      'chatbot features, AI features, lead capture, CRM integration, chatbot analytics, customer engagement',
  },
  marketplace: {
    title: 'Template Marketplace - Pre-built AI Chatbot Templates',
    description:
      'Browse 100+ industry-specific chatbot templates. Real estate, healthcare, SaaS, e-commerce, and more. Clone and customize in minutes.',
    keywords:
      'chatbot templates, industry chatbots, pre-built bots, chatbot marketplace, ready-made chatbots',
  },
  pricing: {
    title: 'BuildMyBot Pricing | Plans for AI Chatbots and Voice Agents',
    description:
      'Flexible pricing for businesses of all sizes. Start free, upgrade as you grow. No hidden fees. Cancel anytime.',
    keywords:
      'chatbot pricing, AI chatbot cost, subscription plans, free chatbot, enterprise chatbot',
  },
  about: {
    title: 'About BuildMyBot | AI Chatbot Platform for Growing Businesses',
    description:
      'Learn how BuildMyBot helps businesses capture leads and automate conversations with AI. Meet the team and our mission.',
    keywords:
      'about buildmybot, company mission, AI for business, chatbot company',
  },
  contact: {
    title: 'Contact BuildMyBot | Support, Sales, and Partnerships',
    description:
      'Get in touch with BuildMyBot. Questions about features, pricing, or enterprise plans? Our team is here to help.',
    keywords:
      'contact support, chatbot support, sales inquiry, customer service',
  },
  partnerProgram: {
    title: 'BuildMyBot Partner Program | White-Label AI Chatbot Reseller',
    description:
      'Join the BuildMyBot partner program with sales-agent tiers or $499/mo partner access, optional white-label branding, and sales resources.',
    keywords:
      'partner program, reseller program, white label chatbot, referral program, earn commission',
  },
  blog: {
    title: 'BuildMyBot Blog | AI Chatbots, Lead Gen, and Automation',
    description:
      'Insights on AI chatbots, lead generation, customer support automation, and growth strategies for modern businesses.',
    keywords:
      'AI chatbot blog, lead generation tips, customer support automation, conversational AI insights',
  },
  careers: {
    title: 'Careers at BuildMyBot | AI and SaaS Jobs',
    description:
      'Join BuildMyBot and help build the future of AI-powered customer engagement. Explore open roles in engineering, design, and success.',
    keywords:
      'buildmybot careers, AI jobs, SaaS jobs, chatbot company careers',
  },
  demo: {
    title: 'BuildMyBot Demo | See the AI Chatbot Builder in Action',
    description:
      'Watch the BuildMyBot demo and try live AI tools to see how our chatbots and voice agents work.',
    keywords:
      'chatbot demo, AI chatbot demo, voice agent demo, buildmybot demo',
  },
  faq: {
    title: 'BuildMyBot FAQ | AI Chatbot Platform Questions',
    description:
      'Answers to common questions about BuildMyBot, pricing, setup, integrations, and data security.',
    keywords:
      'chatbot FAQ, buildmybot questions, AI chatbot support, chatbot pricing FAQ',
  },
  privacy: {
    title: 'BuildMyBot Privacy Policy | Data Protection',
    description:
      'Read the BuildMyBot privacy policy and learn how we protect your data.',
    keywords:
      'buildmybot privacy policy, data protection, AI chatbot privacy',
  },
  status: {
    title: 'BuildMyBot Status | System Health',
    description: 'Real-time status for BuildMyBot services and infrastructure.',
    keywords: 'buildmybot status, system status, uptime, service health',
  },
};
