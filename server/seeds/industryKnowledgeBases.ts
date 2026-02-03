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
    description:
      'Common questions about buying, selling, and renting properties',
    faqs: [
      {
        question: 'What documents do I need to buy a house?',
        answer:
          'To buy a house, you typically need: proof of income (pay stubs, tax returns), bank statements, photo ID, proof of insurance, and pre-approval letter from your lender. Additional documents may include gift letters if receiving down payment assistance and divorce decrees if applicable.',
      },
      {
        question: 'How much down payment do I need?',
        answer:
          'Down payment requirements vary by loan type. Conventional loans typically require 3-20%, FHA loans require 3.5%, VA loans may require 0%, and USDA loans may require 0% for eligible rural properties. A larger down payment often means better interest rates and lower monthly payments.',
      },
      {
        question: 'What is the home buying process?',
        answer:
          'The home buying process includes: 1) Get pre-approved for a mortgage, 2) Find a real estate agent, 3) Search for homes and attend showings, 4) Make an offer, 5) Get a home inspection, 6) Secure financing, 7) Close on the property. The entire process typically takes 30-60 days from offer to closing.',
      },
      {
        question: 'What are closing costs?',
        answer:
          'Closing costs are fees associated with finalizing your home purchase, typically 2-5% of the loan amount. They include appraisal fees, title insurance, attorney fees, origination fees, and prepaid items like property taxes and homeowners insurance.',
      },
      {
        question: 'Should I get a home inspection?',
        answer:
          'Yes, a home inspection is highly recommended. It helps identify potential issues with the property before you buy, including structural problems, electrical issues, plumbing concerns, and roof condition. The typical cost is $300-$500 and can save you thousands in unexpected repairs.',
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
        answer:
          'Most dental professionals recommend visiting every 6 months for a routine checkup and cleaning. However, depending on your oral health, your dentist may recommend more frequent visits. Regular checkups help prevent cavities, gum disease, and catch problems early.',
      },
      {
        question: 'Do you accept dental insurance?',
        answer:
          'We accept most major dental insurance plans. Please contact our office with your insurance information and we can verify your coverage before your appointment. We also offer payment plans for patients without insurance.',
      },
      {
        question: 'What should I do for a dental emergency?',
        answer:
          'For dental emergencies like severe toothache, knocked-out tooth, or broken tooth, call our office immediately. For knocked-out teeth, keep the tooth moist in milk or saliva and see a dentist within 30 minutes for the best chance of saving it.',
      },
      {
        question: 'How can I whiten my teeth?',
        answer:
          'We offer several teeth whitening options: in-office professional whitening for immediate results, take-home whitening kits with custom trays, and whitening toothpastes for maintenance. Professional whitening is more effective and safer than over-the-counter products.',
      },
      {
        question: 'What age should children first visit the dentist?',
        answer:
          'Children should have their first dental visit by their first birthday or within 6 months after their first tooth appears. Early visits help establish good oral hygiene habits and allow us to monitor development.',
      },
    ],
  },
  {
    id: 'hvac-kb',
    name: 'HVAC Services FAQ',
    industry: 'Home Services',
    description:
      'Common questions about heating, ventilation, and air conditioning',
    faqs: [
      {
        question: 'How often should I change my air filter?',
        answer:
          'Standard 1-inch filters should be changed every 1-3 months. Thicker 4-inch filters can last 6-12 months. Factors affecting frequency include pets, allergies, home size, and system usage. A dirty filter reduces efficiency and can damage your system.',
      },
      {
        question: 'What temperature should I set my thermostat?',
        answer:
          'For optimal comfort and efficiency, set your thermostat to 68°F in winter and 78°F in summer when home. When away, adjust by 7-10 degrees to save up to 10% on energy bills. Programmable or smart thermostats make this automatic.',
      },
      {
        question: 'How long does an HVAC system last?',
        answer:
          'With proper maintenance, air conditioners typically last 15-20 years, furnaces 15-30 years, and heat pumps 10-15 years. Regular maintenance, including annual tune-ups, can extend the life of your system and prevent costly breakdowns.',
      },
      {
        question: 'Why is my AC not cooling properly?',
        answer:
          'Common causes include dirty air filters, low refrigerant, frozen evaporator coils, dirty condenser unit, or thermostat issues. Check and replace your filter first. If problems persist, schedule a service call for professional diagnosis.',
      },
      {
        question: 'Do you offer financing for new systems?',
        answer:
          'Yes, we offer flexible financing options for new HVAC installations. We work with multiple lenders to find plans that fit your budget, including 0% interest options for qualified buyers. Contact us for a free estimate and financing options.',
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
        answer:
          'A free consultation is an initial meeting where we discuss your legal situation, evaluate your case, and explain your options at no cost. This helps you understand if you have a valid case and allows us to determine how we can help.',
      },
      {
        question: 'How much does a lawyer cost?',
        answer:
          'Legal fees vary by case type. Personal injury cases often work on contingency (no fee unless you win). Other matters may be hourly ($150-$500/hour) or flat-fee. We provide transparent pricing and discuss all costs upfront during your consultation.',
      },
      {
        question: 'How long will my case take?',
        answer:
          'Case duration depends on complexity, court schedules, and whether settlement is reached. Simple matters may resolve in weeks, while litigation can take months or years. We provide realistic timelines during your consultation.',
      },
      {
        question: 'What documents should I bring to my consultation?',
        answer:
          'Bring any documents related to your case: contracts, correspondence, police reports, medical records, photos, insurance policies, and a timeline of events. The more information you provide, the better we can evaluate your situation.',
      },
      {
        question: 'Do you handle cases on contingency?',
        answer:
          'For personal injury and some other case types, we work on contingency, meaning you pay nothing upfront and we only get paid if you win. Our typical contingency fee is 33-40% of the recovery, depending on the case complexity.',
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
        answer:
          'Yes, we accept reservations for parties of all sizes. You can book online through our website, call us directly, or use popular booking apps. For large parties of 8 or more, we recommend booking at least one week in advance.',
      },
      {
        question: 'Do you accommodate dietary restrictions?',
        answer:
          'Absolutely! We offer vegetarian, vegan, gluten-free, and allergen-friendly options. Please inform your server of any allergies or dietary needs when ordering, and our kitchen will accommodate your requirements.',
      },
      {
        question: 'What are your hours of operation?',
        answer:
          'Our regular hours are Monday-Thursday 11am-9pm, Friday-Saturday 11am-10pm, and Sunday 10am-8pm (brunch until 2pm). Hours may vary on holidays. Check our website or call for the most current information.',
      },
      {
        question: 'Do you offer catering or private events?',
        answer:
          'Yes, we offer full-service catering for events of all sizes and have a private dining room for groups up to 40 guests. Contact our events team to discuss menus, pricing, and availability for your special occasion.',
      },
      {
        question: 'Is there parking available?',
        answer:
          'We have a private parking lot with complimentary parking for guests. Street parking is also available. For valet service on weekends, a nominal fee applies. We validate parking for the nearby garage with any purchase.',
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
        answer:
          'We offer flexible memberships: monthly (no contract), annual (best value), and class-only passes. All memberships include gym access, group classes, and locker room amenities. Personal training packages are available separately.',
      },
      {
        question: 'Can I try the gym before joining?',
        answer:
          'Yes! We offer a free 7-day trial pass for first-time visitors. This gives you full access to all facilities and classes. No credit card required. Stop by the front desk with a valid ID to get started.',
      },
      {
        question: 'What group classes do you offer?',
        answer:
          'We offer over 50 classes weekly including yoga, spin, HIIT, Pilates, Zumba, strength training, and more. All classes are included with membership. Check our app or website for the current schedule.',
      },
      {
        question: 'Do you have personal trainers?',
        answer:
          'Yes, we have certified personal trainers available for one-on-one sessions, partner training, and small group training. New members receive a complimentary fitness assessment and orientation session.',
      },
      {
        question: 'What are your peak hours?',
        answer:
          'Peak hours are typically 6-9am and 5-8pm on weekdays. For a less crowded experience, visit mid-morning, early afternoon, or weekends. Our app shows real-time capacity so you can plan your visit.',
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
        answer:
          'We provide comprehensive coverage including auto, home, renters, life, health, business, and umbrella insurance. We work with multiple carriers to find you the best rates and coverage for your needs.',
      },
      {
        question: 'How can I lower my insurance premiums?',
        answer:
          'Common ways to reduce premiums include bundling policies, increasing deductibles, maintaining good credit, installing safety devices, being claims-free, and asking about available discounts for seniors, students, or professional affiliations.',
      },
      {
        question: 'How do I file a claim?',
        answer:
          'To file a claim, call our 24/7 claims hotline, use our mobile app, or visit our website. Have your policy number ready and document the incident with photos if possible. We aim to process claims within 48 hours.',
      },
      {
        question: 'What does my policy cover?',
        answer:
          'Coverage varies by policy type. We recommend reviewing your declarations page which summarizes your coverage limits, deductibles, and exclusions. Our agents are happy to explain your coverage and identify any gaps.',
      },
      {
        question: 'When should I update my policy?',
        answer:
          'Review your policy annually and after major life events: buying a home, getting married, having children, starting a business, or acquiring valuable items. These changes may require coverage adjustments.',
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
        answer:
          'We offer standard shipping (5-7 business days), expedited (2-3 business days), and overnight delivery. Free shipping is available on orders over $50. International shipping is available to select countries.',
      },
      {
        question: 'What is your return policy?',
        answer:
          'We offer a 30-day return policy for unused items in original packaging. Returns are free with our prepaid shipping label. Refunds are processed within 5-7 business days of receiving the return.',
      },
      {
        question: 'How can I track my order?',
        answer:
          'Once your order ships, you will receive an email with tracking information. You can also log into your account to view order status and tracking details. Most orders ship within 1-2 business days.',
      },
      {
        question: 'Do you offer gift wrapping?',
        answer:
          'Yes! Gift wrapping is available for $5 per item. You can add a personalized message during checkout. Orders marked as gifts will not include pricing information in the package.',
      },
      {
        question: 'How do I use a promo code?',
        answer:
          'Enter your promo code in the designated field at checkout and click Apply. Discounts will be reflected in your order total. Only one promo code can be used per order, and some exclusions may apply.',
      },
    ],
  },
  {
    id: 'automotive-kb',
    name: 'Auto Dealership FAQ',
    industry: 'Automotive',
    description: 'Common questions for car dealerships and auto services',
    faqs: [
      {
        question: 'Do you offer financing options?',
        answer:
          'Yes, we work with multiple lenders to offer competitive financing for all credit types. We can often get you approved the same day with rates starting as low as 2.9% APR for qualified buyers. Bring your pay stubs and ID to get pre-approved.',
      },
      {
        question: 'Can I trade in my current vehicle?',
        answer:
          'Absolutely! We accept trade-ins of all makes and models. Our appraisers will evaluate your vehicle and provide a fair market value offer. You can also get an online estimate through our website before visiting.',
      },
      {
        question: 'What is included in your vehicle warranty?',
        answer:
          'New vehicles include manufacturer warranties typically covering 3 years/36,000 miles bumper-to-bumper and 5 years/60,000 miles powertrain. Certified pre-owned vehicles include extended warranty coverage. Extended warranties are available for additional protection.',
      },
      {
        question: 'Do you offer test drives?',
        answer:
          'Yes, test drives are encouraged! Simply bring a valid drivers license and proof of insurance. You can schedule a test drive online or walk in during business hours. We recommend calling ahead to ensure the vehicle you want is available.',
      },
      {
        question: 'What service packages do you offer?',
        answer:
          'Our service center handles oil changes, tire rotations, brake service, inspections, and major repairs. We offer prepaid maintenance packages that save up to 30%. Schedule online or call for same-day appointments on most services.',
      },
    ],
  },
  {
    id: 'salon-kb',
    name: 'Salon & Spa FAQ',
    industry: 'Beauty',
    description: 'Common questions for hair salons, spas, and beauty services',
    faqs: [
      {
        question: 'How do I book an appointment?',
        answer:
          'You can book online through our website 24/7, call us directly, or download our app. New clients are always welcome! We recommend booking color services 1-2 weeks in advance, especially for weekends.',
      },
      {
        question: 'What is your cancellation policy?',
        answer:
          'We require 24-hour notice for cancellations. Late cancellations or no-shows may be charged 50% of the service cost. We understand emergencies happen, so please call us as soon as possible if your plans change.',
      },
      {
        question: 'Do you offer gift cards?',
        answer:
          'Yes! Gift cards are available in any amount and never expire. Purchase them in-salon or online. Digital gift cards can be emailed directly to the recipient. They make perfect gifts for any occasion.',
      },
      {
        question: 'What hair products do you use and sell?',
        answer:
          'We use and sell professional-grade products including brands like Redken, Olaplex, and Kevin Murphy. Our stylists can recommend the best products for your hair type. Members receive 15% off all retail purchases.',
      },
      {
        question: 'Do you offer bridal or special event packages?',
        answer:
          'Yes! We offer complete bridal packages including trials, day-of styling, and group services. We also do prom, graduation, and special occasion styling. Book your consultation at least 2 months before your event for best availability.',
      },
    ],
  },
  {
    id: 'veterinary-kb',
    name: 'Veterinary Clinic FAQ',
    industry: 'Veterinary',
    description: 'Common questions for animal hospitals and pet care',
    faqs: [
      {
        question: 'What vaccines does my pet need?',
        answer:
          'Core vaccines for dogs include rabies, distemper, parvovirus, and adenovirus. Cats need rabies, FVRCP (feline distemper combo), and may need feline leukemia. We create personalized vaccination schedules based on your pets age and lifestyle.',
      },
      {
        question: 'Do you offer emergency services?',
        answer:
          'We handle urgent care during regular hours. For after-hours emergencies, we partner with the 24-hour emergency animal hospital located at [address]. Always call ahead so we can prepare for your arrival.',
      },
      {
        question: 'How often should my pet have a checkup?',
        answer:
          'Annual wellness exams are recommended for adult pets. Puppies and kittens need more frequent visits for vaccinations. Senior pets (7+ years) benefit from twice-yearly exams to catch age-related issues early.',
      },
      {
        question: 'Do you offer payment plans?',
        answer:
          'We accept CareCredit and Scratchpay for financing larger procedures. We also offer wellness plans with monthly payments that cover routine care including exams, vaccines, and preventive medications at a discounted rate.',
      },
      {
        question: 'What should I bring to my pets first visit?',
        answer:
          'Please bring any medical records from previous veterinarians, current medications, a list of foods and treats your pet eats, and a fresh stool sample if possible. Keep dogs on leash and cats in carriers for safety.',
      },
    ],
  },
  {
    id: 'photography-kb',
    name: 'Photography Studio FAQ',
    industry: 'Photography',
    description: 'Common questions for photography services and studios',
    faqs: [
      {
        question: 'What types of photography do you offer?',
        answer:
          'We specialize in portraits, weddings, events, family sessions, headshots, and commercial photography. Each session is customized to your needs. View our portfolio online to see examples of our work in each category.',
      },
      {
        question: 'How long until I receive my photos?',
        answer:
          'Portrait sessions are delivered within 2 weeks. Wedding galleries take 6-8 weeks for full editing. You will receive an online gallery with high-resolution downloads. Rush delivery is available for an additional fee.',
      },
      {
        question: 'What should I wear for my session?',
        answer:
          'Choose solid colors and avoid busy patterns. Coordinate but dont match exactly for group photos. Bring outfit options and we can help you choose. A style guide is sent upon booking with detailed recommendations.',
      },
      {
        question: 'Do you offer prints and albums?',
        answer:
          'Yes! We offer professional-quality prints, canvas wraps, albums, and wall art. Products are ordered through your online gallery. We use archival-quality materials that last generations. Album design consultations are included with wedding packages.',
      },
      {
        question: 'How do I book and what is the deposit?',
        answer:
          'A 50% deposit secures your date, with the balance due before the session. Wedding deposits are non-refundable. You can book online or contact us for a custom quote. Popular dates book months in advance, especially for weddings.',
      },
    ],
  },
  {
    id: 'accounting-kb',
    name: 'Accounting Services FAQ',
    industry: 'Accounting',
    description: 'Common questions for accountants and tax professionals',
    faqs: [
      {
        question: 'What documents do I need for tax preparation?',
        answer:
          'Bring W-2s, 1099s, mortgage interest statements, property tax records, charitable donation receipts, medical expense records, and prior year tax returns. Self-employed clients should also bring business income and expense records.',
      },
      {
        question: 'When is the tax filing deadline?',
        answer:
          'Individual tax returns are due April 15th. Extensions are available until October 15th, but any taxes owed are still due by April 15th. Business deadlines vary by entity type. We recommend starting early to maximize deductions.',
      },
      {
        question: 'Do you handle small business accounting?',
        answer:
          'Yes! We offer full-service bookkeeping, payroll, quarterly taxes, financial statements, and year-end tax preparation for small businesses. We work with QuickBooks, Xero, and other popular accounting software.',
      },
      {
        question: 'What are your fees?',
        answer:
          'Fees vary by complexity. Simple individual returns start at $150. Business returns and complex situations are quoted after review. We offer upfront pricing with no surprises. Payment plans are available for larger engagements.',
      },
      {
        question: 'Can you help if I am being audited?',
        answer:
          'Yes, we provide audit representation and can communicate with the IRS on your behalf. We will review your situation, gather documentation, and guide you through the process. Having professional representation often leads to better outcomes.',
      },
    ],
  },
  {
    id: 'cleaning-kb',
    name: 'Cleaning Services FAQ',
    industry: 'Cleaning',
    description: 'Common questions for residential and commercial cleaning',
    faqs: [
      {
        question: 'What cleaning services do you offer?',
        answer:
          'We offer regular house cleaning, deep cleaning, move-in/move-out cleaning, post-construction cleanup, and commercial office cleaning. Services can be weekly, bi-weekly, monthly, or one-time. All services are customizable to your needs.',
      },
      {
        question: 'Do I need to be home during cleaning?',
        answer:
          'No, many clients provide a key, garage code, or smart lock access. All our cleaners are background-checked and bonded. We can also work around your schedule if you prefer to be present.',
      },
      {
        question: 'What products do you use?',
        answer:
          'We use professional-grade, eco-friendly cleaning products that are safe for children and pets. If you have allergies or preferences for specific products, we can accommodate your requests at no extra charge.',
      },
      {
        question: 'How much does cleaning cost?',
        answer:
          'Pricing depends on home size, condition, and frequency. Regular cleanings for a 3-bedroom home typically range $120-180. Deep cleans and first-time visits cost more. We provide free in-home estimates for accurate quotes.',
      },
      {
        question: 'What is your satisfaction guarantee?',
        answer:
          'If you are not completely satisfied, contact us within 24 hours and we will re-clean any areas of concern at no additional charge. Your satisfaction is our top priority and we stand behind our work.',
      },
    ],
  },
  {
    id: 'plumbing-kb',
    name: 'Plumbing Services FAQ',
    industry: 'Plumbing',
    description: 'Common questions for plumbing contractors',
    faqs: [
      {
        question: 'Do you offer emergency plumbing services?',
        answer:
          'Yes, we offer 24/7 emergency service for urgent issues like burst pipes, sewage backups, and no hot water. Our emergency line is always answered by a real person. We aim to arrive within 1-2 hours for emergencies.',
      },
      {
        question: 'How much does a plumber cost?',
        answer:
          'Service calls start at $89 for diagnosis. We provide upfront pricing before any work begins. Common repairs range from $150-500. Major projects like water heater replacement or repiping are quoted individually.',
      },
      {
        question: 'What causes a clogged drain?',
        answer:
          'Common causes include hair, soap buildup, grease, food particles, and foreign objects. Tree roots can also infiltrate sewer lines. We use camera inspection to diagnose stubborn clogs and recommend the best solution.',
      },
      {
        question: 'Should I repair or replace my water heater?',
        answer:
          'Water heaters typically last 10-15 years. If yours is over 10 years old and needs major repairs, replacement is often more cost-effective. We offer both traditional and tankless options with financing available.',
      },
      {
        question: 'Are you licensed and insured?',
        answer:
          'Yes, we are fully licensed, bonded, and insured. All our plumbers are certified and undergo regular training. We pull permits when required and our work meets all local codes. Licensing information is available upon request.',
      },
    ],
  },
  {
    id: 'education-kb',
    name: 'Tutoring & Education FAQ',
    industry: 'Education',
    description:
      'Common questions for tutoring centers and educational services',
    faqs: [
      {
        question: 'What subjects do you tutor?',
        answer:
          'We offer tutoring in math (all levels through calculus), science, English, reading, writing, foreign languages, and test prep (SAT, ACT, GRE). Our tutors are subject-matter experts with teaching credentials or advanced degrees.',
      },
      {
        question: 'How do tutoring sessions work?',
        answer:
          'Sessions are typically 1 hour, either in-person at our center or online via video. We assess your child first to create a personalized learning plan. Sessions are interactive with practice problems and immediate feedback.',
      },
      {
        question: 'How much does tutoring cost?',
        answer:
          'Rates range from $40-80 per hour depending on subject and tutor level. Test prep and specialized subjects are at the higher end. We offer package discounts for 10+ sessions. Financial assistance may be available.',
      },
      {
        question: 'How do I know if my child needs tutoring?',
        answer:
          'Signs include declining grades, homework struggles, lack of confidence, or falling behind peers. Early intervention is key. We offer a free assessment to identify gaps and determine if tutoring would help.',
      },
      {
        question: 'Do you offer test preparation?',
        answer:
          'Yes! We offer comprehensive SAT, ACT, PSAT, and AP exam prep. Our proven methods typically improve scores by 150+ points on the SAT. We also provide practice tests, strategy sessions, and flexible scheduling.',
      },
    ],
  },
  {
    id: 'hotel-kb',
    name: 'Hotel & Hospitality FAQ',
    industry: 'Hospitality',
    description: 'Common questions for hotels and lodging',
    faqs: [
      {
        question: 'What time is check-in and check-out?',
        answer:
          'Standard check-in is 3:00 PM and check-out is 11:00 AM. Early check-in and late check-out may be available upon request for an additional fee, subject to availability. Contact the front desk to arrange.',
      },
      {
        question: 'Do you offer airport shuttle service?',
        answer:
          'Yes, complimentary airport shuttle runs every 30 minutes from 5 AM to midnight. Call the shuttle hotline when you arrive at baggage claim. Private car service can also be arranged for an additional fee.',
      },
      {
        question: 'Is breakfast included?',
        answer:
          'Complimentary hot breakfast is included with all room rates, served daily from 6-10 AM. Our breakfast includes eggs, bacon, pastries, fresh fruit, yogurt, and coffee. In-room dining is also available.',
      },
      {
        question: 'Do you have a pool and fitness center?',
        answer:
          'Yes! Our heated indoor pool and hot tub are open 6 AM-10 PM. The 24-hour fitness center features cardio equipment and free weights. Pool towels are provided. Guests under 16 must be accompanied by an adult.',
      },
      {
        question: 'What is your pet policy?',
        answer:
          'We are pet-friendly! Dogs under 50 lbs are welcome for a $50 per night fee (max $150 per stay). Pets must be crated when unattended. We provide water bowls and treats. Designated pet relief areas are on the property.',
      },
    ],
  },
  {
    id: 'construction-kb',
    name: 'Construction & Remodeling FAQ',
    industry: 'Construction',
    description: 'Common questions for contractors and home remodeling',
    faqs: [
      {
        question: 'How long will my project take?',
        answer:
          'Timelines vary by project scope. Kitchen remodels typically take 6-10 weeks, bathroom remodels 3-6 weeks, and room additions 3-5 months. We provide detailed timelines in our proposal and communicate any changes promptly.',
      },
      {
        question: 'Do you handle permits?',
        answer:
          'Yes, we handle all permit applications and inspections as part of our service. Permit costs are included in our proposals. Working with permits ensures your project meets code and protects your investment.',
      },
      {
        question: 'What is included in a free estimate?',
        answer:
          'Our free estimate includes an on-site consultation, project assessment, design recommendations, material options, and a detailed written proposal. There is no obligation and we are happy to answer all your questions.',
      },
      {
        question: 'How do you handle payments?',
        answer:
          'We typically require a deposit to secure materials and schedule work, with progress payments at milestones. Final payment is due upon completion and your satisfaction. We accept checks, cards, and offer financing options.',
      },
      {
        question: 'Are you licensed and insured?',
        answer:
          'Yes, we are fully licensed, bonded, and insured with workers compensation and liability coverage. We are happy to provide copies of all documentation. Our license number is displayed on all contracts and proposals.',
      },
    ],
  },
  {
    id: 'medical-kb',
    name: 'Medical Practice FAQ',
    industry: 'Medical',
    description: 'Common questions for doctors offices and clinics',
    faqs: [
      {
        question: 'Are you accepting new patients?',
        answer:
          'Yes, we are currently accepting new patients! Call our office to schedule your first appointment. Please arrive 15 minutes early to complete paperwork, or download forms from our website to fill out in advance.',
      },
      {
        question: 'What insurance do you accept?',
        answer:
          'We accept most major insurance plans including Blue Cross, Aetna, Cigna, United, and Medicare. Please contact our billing department to verify your specific coverage. We also offer self-pay rates and payment plans.',
      },
      {
        question: 'How do I request prescription refills?',
        answer:
          'Request refills through our patient portal, by calling our prescription line, or by having your pharmacy send a refill request. Please allow 48-72 hours for processing. Controlled substances may require an office visit.',
      },
      {
        question: 'Do you offer telehealth appointments?',
        answer:
          'Yes! We offer video visits for many conditions including follow-ups, minor illnesses, and medication management. Telehealth visits are covered by most insurance. Schedule through our portal or call the office.',
      },
      {
        question: 'How do I access my medical records?',
        answer:
          'Access your records anytime through our patient portal where you can view test results, visit summaries, and immunization records. For official copies, submit a records release request. Records are typically ready within 5-7 days.',
      },
    ],
  },
];

export function getKnowledgeBaseByIndustry(
  industry: string,
): IndustryKnowledgeBase | undefined {
  return INDUSTRY_KNOWLEDGE_BASES.find(
    (kb) => kb.industry.toLowerCase() === industry.toLowerCase(),
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

// Database seeding function
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { knowledgeChunks, knowledgeSources } from '../../shared/schema';
import { db } from '../db';

export async function seedIndustryKnowledgeBases() {
  console.log('🌱 Seeding industry knowledge bases...\n');

  try {
    let inserted = 0;
    let skipped = 0;
    let totalChunks = 0;

    for (const kb of INDUSTRY_KNOWLEDGE_BASES) {
      console.log(`Processing: ${kb.name} (${kb.industry})`);

      // Check if this knowledge base already exists
      const existingSources = await db
        .select()
        .from(knowledgeSources)
        .where(eq(knowledgeSources.sourceName, kb.name))
        .limit(1);

      if (existingSources.length > 0) {
        console.log(`  ⏭️  Skipping ${kb.name} (already exists)\n`);
        skipped++;
        continue;
      }

      // Create knowledge source record
      const sourceId = uuidv4();
      await db.insert(knowledgeSources).values({
        id: sourceId,
        sourceType: 'manual',
        sourceName: kb.name,
        sourceUrl: null,
        status: 'completed',
        organizationId: null, // System-wide knowledge base
        botId: null, // Available to all bots
        pagesCrawled: kb.faqs.length,
        lastCrawledAt: new Date(),
        metadata: {
          industry: kb.industry,
          description: kb.description,
          knowledgeBaseId: kb.id,
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      console.log(`  ✅ Created knowledge source: ${kb.name}`);

      // Insert chunks for each FAQ
      const chunks = kb.faqs.map((faq, index) => ({
        id: uuidv4(),
        sourceId: sourceId,
        botId: null, // Available to all bots
        content: `Q: ${faq.question}\n\nA: ${faq.answer}`,
        contentHash: null,
        metadata: {
          industry: kb.industry,
          question: faq.question,
          answer: faq.answer,
          faqIndex: index,
        },
        chunkIndex: index,
        tokenCount: Math.ceil((faq.question.length + faq.answer.length) / 4), // Rough estimate
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await db.insert(knowledgeChunks).values(chunks);

      console.log(`  📝 Inserted ${chunks.length} FAQ chunks`);
      console.log('');

      inserted++;
      totalChunks += chunks.length;
    }

    console.log('═'.repeat(60));
    console.log('📊 SEEDING SUMMARY');
    console.log('═'.repeat(60));
    console.log(`✅ Knowledge bases inserted: ${inserted}`);
    console.log(`⏭️  Knowledge bases skipped: ${skipped}`);
    console.log(`📝 Total FAQ chunks created: ${totalChunks}`);
    console.log('═'.repeat(60));

    console.log('\n✅ Industry knowledge bases seeded successfully!');

    return { success: true, inserted, skipped, totalChunks };
  } catch (error) {
    console.error('\n❌ Failed to seed industry knowledge bases:');
    console.error('Error:', error);
    throw error;
  }
}

// CLI execution support
const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  seedIndustryKnowledgeBases()
    .then(() => {
      console.log('\n✅ Seeding complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Seeding failed:', error);
      process.exit(1);
    });
}
