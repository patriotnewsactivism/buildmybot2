import { useEffect } from 'react';

interface SEOProps {
  title?: string;
  description?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  ogUrl?: string;
  twitterCard?: 'summary' | 'summary_large_image' | 'app' | 'player';
  twitterSite?: string;
  canonical?: string;
  noindex?: boolean;
}

export const SEO: React.FC<SEOProps> = ({
  title = 'BuildMyBot - AI Chatbot Builder for Business',
  description = 'Create powerful AI chatbots for your business in minutes. No coding required. Increase leads, automate customer support, and boost sales with BuildMyBot.',
  keywords = 'AI chatbot, chatbot builder, customer support automation, lead generation, conversational AI, business automation',
  ogTitle,
  ogDescription,
  ogImage = 'https://www.buildmybot.app/og-image.png',
  ogUrl,
  twitterCard = 'summary_large_image',
  twitterSite = '@buildmybot',
  canonical,
  noindex = false,
}) => {
  useEffect(() => {
    // Update document title
    document.title = title;

    // Update or create meta tags
    const metaTags: { name?: string; property?: string; content: string }[] = [
      { name: 'description', content: description },
      { name: 'keywords', content: keywords },

      // Open Graph
      { property: 'og:title', content: ogTitle || title },
      { property: 'og:description', content: ogDescription || description },
      { property: 'og:image', content: ogImage },
      { property: 'og:type', content: 'website' },

      // Twitter
      { name: 'twitter:card', content: twitterCard },
      { name: 'twitter:site', content: twitterSite },
      { name: 'twitter:title', content: ogTitle || title },
      { name: 'twitter:description', content: ogDescription || description },
      { name: 'twitter:image', content: ogImage },
    ];

    // Add OG URL if provided
    if (ogUrl) {
      metaTags.push({ property: 'og:url', content: ogUrl });
    }

    // Add robots meta if noindex
    if (noindex) {
      metaTags.push({ name: 'robots', content: 'noindex,nofollow' });
    }

    // Update or create each meta tag
    for (const { name, property, content } of metaTags) {
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

    // Update canonical URL
    if (canonical) {
      let linkElement = document.querySelector('link[rel="canonical"]');

      if (!linkElement) {
        linkElement = document.createElement('link');
        linkElement.setAttribute('rel', 'canonical');
        document.head.appendChild(linkElement);
      }

      linkElement.setAttribute('href', canonical);
    }
  }, [
    title,
    description,
    keywords,
    ogTitle,
    ogDescription,
    ogImage,
    ogUrl,
    twitterCard,
    twitterSite,
    canonical,
    noindex,
  ]);

  return null;
};

// Predefined SEO configurations for common pages
export const SEOConfig = {
  home: {
    title: 'BuildMyBot - AI Chatbot Builder for Business | No Code Required',
    description:
      'Build powerful AI chatbots for your business in minutes. Increase leads by 300%, automate customer support, and boost sales. Start free today!',
    keywords:
      'AI chatbot builder, no-code chatbot, customer support automation, lead generation bot, business chatbot, conversational AI',
  },
  features: {
    title: 'Features - BuildMyBot AI Chatbot Platform',
    description:
      'Explore BuildMyBot features: AI-powered conversations, lead capture, CRM integration, analytics, multi-channel support, and more. Everything you need to scale customer engagement.',
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
    title: 'Pricing - BuildMyBot Plans & Pricing',
    description:
      'Flexible pricing for businesses of all sizes. Start free, upgrade as you grow. No hidden fees. Cancel anytime.',
    keywords:
      'chatbot pricing, AI chatbot cost, subscription plans, free chatbot, enterprise chatbot',
  },
  about: {
    title: 'About Us - BuildMyBot Story & Mission',
    description:
      'Learn about BuildMyBot mission to democratize AI for small businesses. Meet our team and discover why 10,000+ companies trust us.',
    keywords:
      'about buildmybot, company mission, AI for business, chatbot company',
  },
  contact: {
    title: 'Contact Us - BuildMyBot Support & Sales',
    description:
      'Get in touch with BuildMyBot. Questions about features, pricing, or enterprise plans? Our team is here to help.',
    keywords:
      'contact support, chatbot support, sales inquiry, customer service',
  },
  partnerProgram: {
    title: 'Partner Program - Earn Money Selling BuildMyBot',
    description:
      'Join the BuildMyBot partner program and earn recurring commissions. White-label options, dedicated support, and exclusive resources.',
    keywords:
      'partner program, reseller program, white label chatbot, referral program, earn commission',
  },
};
