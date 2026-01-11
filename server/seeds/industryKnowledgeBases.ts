export interface IndustryKnowledgeBase {
  id: string;
  name: string;
  industry: string;
  description: string;
  faqs: { question: string; answer: string }[];
}

export const INDUSTRY_KNOWLEDGE_BASES: IndustryKnowledgeBase[] = [
  {
    id: 'real-estate-kb',
    name: 'Real Estate FAQ',
    industry: 'Real Estate',
    description: 'Common questions about buying, selling, and renting properties',
    faqs: [
      {
        question: 'What documents do I need to buy a house?',
        answer: 'To buy a house, you typically need: proof of income (pay stubs, tax returns), bank statements, photo ID, proof of insurance, and pre-approval letter from your lender. Additional documents may include gift letters if receiving down payment assistance and divorce decrees if applicable.',
      },
      {
        question: 'How much down payment do I need?',
        answer: 'Down payment requirements vary by loan type. Conventional loans typically require 3-20%, FHA loans require 3.5%, VA loans may require 0%, and USDA loans may require 0% for eligible rural properties. A larger down payment often means better interest rates and lower monthly payments.',
      },
      {
        question: 'What is the home buying process?',
        answer: 'The home buying process includes: 1) Get pre-approved for a mortgage, 2) Find a real estate agent, 3) Search for homes and attend showings, 4) Make an offer, 5) Get a home inspection, 6) Secure financing, 7) Close on the property. The entire process typically takes 30-60 days from offer to closing.',
      },
      {
        question: 'What are closing costs?',
        answer: 'Closing costs are fees associated with finalizing your home purchase, typically 2-5% of the loan amount. They include appraisal fees, title insurance, attorney fees, origination fees, and prepaid items like property taxes and homeowners insurance.',
      },
      {
        question: 'Should I get a home inspection?',
        answer: 'Yes, a home inspection is highly recommended. It helps identify potential issues with the property before you buy, including structural problems, electrical issues, plumbing concerns, and roof condition. The typical cost is $300-$500 and can save you thousands in unexpected repairs.',
      },
    ],
  },
  {
    id: 'dental-kb',
    name: 'Dental Practice FAQ',
    industry: 'Healthcare',
    description: 'Common questions for dental offices and patients',
    faqs: [
      {
        question: 'How often should I visit the dentist?',
        answer: 'Most dental professionals recommend visiting every 6 months for a routine checkup and cleaning. However, depending on your oral health, your dentist may recommend more frequent visits. Regular checkups help prevent cavities, gum disease, and catch problems early.',
      },
      {
        question: 'Do you accept dental insurance?',
        answer: 'We accept most major dental insurance plans. Please contact our office with your insurance information and we can verify your coverage before your appointment. We also offer payment plans for patients without insurance.',
      },
      {
        question: 'What should I do for a dental emergency?',
        answer: 'For dental emergencies like severe toothache, knocked-out tooth, or broken tooth, call our office immediately. For knocked-out teeth, keep the tooth moist in milk or saliva and see a dentist within 30 minutes for the best chance of saving it.',
      },
      {
        question: 'How can I whiten my teeth?',
        answer: 'We offer several teeth whitening options: in-office professional whitening for immediate results, take-home whitening kits with custom trays, and whitening toothpastes for maintenance. Professional whitening is more effective and safer than over-the-counter products.',
      },
      {
        question: 'What age should children first visit the dentist?',
        answer: 'Children should have their first dental visit by their first birthday or within 6 months after their first tooth appears. Early visits help establish good oral hygiene habits and allow us to monitor development.',
      },
    ],
  },
  {
    id: 'hvac-kb',
    name: 'HVAC Services FAQ',
    industry: 'Home Services',
    description: 'Common questions about heating, ventilation, and air conditioning',
    faqs: [
      {
        question: 'How often should I change my air filter?',
        answer: 'Standard 1-inch filters should be changed every 1-3 months. Thicker 4-inch filters can last 6-12 months. Factors affecting frequency include pets, allergies, home size, and system usage. A dirty filter reduces efficiency and can damage your system.',
      },
      {
        question: 'What temperature should I set my thermostat?',
        answer: 'For optimal comfort and efficiency, set your thermostat to 68°F in winter and 78°F in summer when home. When away, adjust by 7-10 degrees to save up to 10% on energy bills. Programmable or smart thermostats make this automatic.',
      },
      {
        question: 'How long does an HVAC system last?',
        answer: 'With proper maintenance, air conditioners typically last 15-20 years, furnaces 15-30 years, and heat pumps 10-15 years. Regular maintenance, including annual tune-ups, can extend the life of your system and prevent costly breakdowns.',
      },
      {
        question: 'Why is my AC not cooling properly?',
        answer: 'Common causes include dirty air filters, low refrigerant, frozen evaporator coils, dirty condenser unit, or thermostat issues. Check and replace your filter first. If problems persist, schedule a service call for professional diagnosis.',
      },
      {
        question: 'Do you offer financing for new systems?',
        answer: 'Yes, we offer flexible financing options for new HVAC installations. We work with multiple lenders to find plans that fit your budget, including 0% interest options for qualified buyers. Contact us for a free estimate and financing options.',
      },
    ],
  },
  {
    id: 'legal-kb',
    name: 'Legal Services FAQ',
    industry: 'Legal',
    description: 'Common questions for law firms and legal consultations',
    faqs: [
      {
        question: 'What is a free consultation?',
        answer: 'A free consultation is an initial meeting where we discuss your legal situation, evaluate your case, and explain your options at no cost. This helps you understand if you have a valid case and allows us to determine how we can help.',
      },
      {
        question: 'How much does a lawyer cost?',
        answer: 'Legal fees vary by case type. Personal injury cases often work on contingency (no fee unless you win). Other matters may be hourly ($150-$500/hour) or flat-fee. We provide transparent pricing and discuss all costs upfront during your consultation.',
      },
      {
        question: 'How long will my case take?',
        answer: 'Case duration depends on complexity, court schedules, and whether settlement is reached. Simple matters may resolve in weeks, while litigation can take months or years. We provide realistic timelines during your consultation.',
      },
      {
        question: 'What documents should I bring to my consultation?',
        answer: 'Bring any documents related to your case: contracts, correspondence, police reports, medical records, photos, insurance policies, and a timeline of events. The more information you provide, the better we can evaluate your situation.',
      },
      {
        question: 'Do you handle cases on contingency?',
        answer: 'For personal injury and some other case types, we work on contingency, meaning you pay nothing upfront and we only get paid if you win. Our typical contingency fee is 33-40% of the recovery, depending on the case complexity.',
      },
    ],
  },
  {
    id: 'restaurant-kb',
    name: 'Restaurant FAQ',
    industry: 'Food Service',
    description: 'Common questions for restaurants and dining',
    faqs: [
      {
        question: 'Do you take reservations?',
        answer: 'Yes, we accept reservations for parties of all sizes. You can book online through our website, call us directly, or use popular booking apps. For large parties of 8 or more, we recommend booking at least one week in advance.',
      },
      {
        question: 'Do you accommodate dietary restrictions?',
        answer: 'Absolutely! We offer vegetarian, vegan, gluten-free, and allergen-friendly options. Please inform your server of any allergies or dietary needs when ordering, and our kitchen will accommodate your requirements.',
      },
      {
        question: 'What are your hours of operation?',
        answer: 'Our regular hours are Monday-Thursday 11am-9pm, Friday-Saturday 11am-10pm, and Sunday 10am-8pm (brunch until 2pm). Hours may vary on holidays. Check our website or call for the most current information.',
      },
      {
        question: 'Do you offer catering or private events?',
        answer: 'Yes, we offer full-service catering for events of all sizes and have a private dining room for groups up to 40 guests. Contact our events team to discuss menus, pricing, and availability for your special occasion.',
      },
      {
        question: 'Is there parking available?',
        answer: 'We have a private parking lot with complimentary parking for guests. Street parking is also available. For valet service on weekends, a nominal fee applies. We validate parking for the nearby garage with any purchase.',
      },
    ],
  },
  {
    id: 'fitness-kb',
    name: 'Fitness Center FAQ',
    industry: 'Fitness',
    description: 'Common questions for gyms and fitness centers',
    faqs: [
      {
        question: 'What membership options do you offer?',
        answer: 'We offer flexible memberships: monthly (no contract), annual (best value), and class-only passes. All memberships include gym access, group classes, and locker room amenities. Personal training packages are available separately.',
      },
      {
        question: 'Can I try the gym before joining?',
        answer: 'Yes! We offer a free 7-day trial pass for first-time visitors. This gives you full access to all facilities and classes. No credit card required. Stop by the front desk with a valid ID to get started.',
      },
      {
        question: 'What group classes do you offer?',
        answer: 'We offer over 50 classes weekly including yoga, spin, HIIT, Pilates, Zumba, strength training, and more. All classes are included with membership. Check our app or website for the current schedule.',
      },
      {
        question: 'Do you have personal trainers?',
        answer: 'Yes, we have certified personal trainers available for one-on-one sessions, partner training, and small group training. New members receive a complimentary fitness assessment and orientation session.',
      },
      {
        question: 'What are your peak hours?',
        answer: 'Peak hours are typically 6-9am and 5-8pm on weekdays. For a less crowded experience, visit mid-morning, early afternoon, or weekends. Our app shows real-time capacity so you can plan your visit.',
      },
    ],
  },
  {
    id: 'insurance-kb',
    name: 'Insurance FAQ',
    industry: 'Insurance',
    description: 'Common questions about insurance policies and claims',
    faqs: [
      {
        question: 'What types of insurance do you offer?',
        answer: 'We provide comprehensive coverage including auto, home, renters, life, health, business, and umbrella insurance. We work with multiple carriers to find you the best rates and coverage for your needs.',
      },
      {
        question: 'How can I lower my insurance premiums?',
        answer: 'Common ways to reduce premiums include bundling policies, increasing deductibles, maintaining good credit, installing safety devices, being claims-free, and asking about available discounts for seniors, students, or professional affiliations.',
      },
      {
        question: 'How do I file a claim?',
        answer: 'To file a claim, call our 24/7 claims hotline, use our mobile app, or visit our website. Have your policy number ready and document the incident with photos if possible. We aim to process claims within 48 hours.',
      },
      {
        question: 'What does my policy cover?',
        answer: 'Coverage varies by policy type. We recommend reviewing your declarations page which summarizes your coverage limits, deductibles, and exclusions. Our agents are happy to explain your coverage and identify any gaps.',
      },
      {
        question: 'When should I update my policy?',
        answer: 'Review your policy annually and after major life events: buying a home, getting married, having children, starting a business, or acquiring valuable items. These changes may require coverage adjustments.',
      },
    ],
  },
  {
    id: 'ecommerce-kb',
    name: 'E-commerce FAQ',
    industry: 'E-commerce',
    description: 'Common questions for online stores',
    faqs: [
      {
        question: 'What are your shipping options?',
        answer: 'We offer standard shipping (5-7 business days), expedited (2-3 business days), and overnight delivery. Free shipping is available on orders over $50. International shipping is available to select countries.',
      },
      {
        question: 'What is your return policy?',
        answer: 'We offer a 30-day return policy for unused items in original packaging. Returns are free with our prepaid shipping label. Refunds are processed within 5-7 business days of receiving the return.',
      },
      {
        question: 'How can I track my order?',
        answer: 'Once your order ships, you will receive an email with tracking information. You can also log into your account to view order status and tracking details. Most orders ship within 1-2 business days.',
      },
      {
        question: 'Do you offer gift wrapping?',
        answer: 'Yes! Gift wrapping is available for $5 per item. You can add a personalized message during checkout. Orders marked as gifts will not include pricing information in the package.',
      },
      {
        question: 'How do I use a promo code?',
        answer: 'Enter your promo code in the designated field at checkout and click Apply. Discounts will be reflected in your order total. Only one promo code can be used per order, and some exclusions may apply.',
      },
    ],
  },
];

export function getKnowledgeBaseByIndustry(industry: string): IndustryKnowledgeBase | undefined {
  return INDUSTRY_KNOWLEDGE_BASES.find(
    (kb) => kb.industry.toLowerCase() === industry.toLowerCase()
  );
}

export function formatKnowledgeBaseAsText(kb: IndustryKnowledgeBase): string {
  let content = `# ${kb.name}\n\n`;
  content += `${kb.description}\n\n`;
  content += '## Frequently Asked Questions\n\n';
  
  for (const faq of kb.faqs) {
    content += `### ${faq.question}\n\n`;
    content += `${faq.answer}\n\n`;
  }
  
  return content;
}
