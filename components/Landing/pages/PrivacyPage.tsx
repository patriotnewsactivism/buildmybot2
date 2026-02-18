import type React from 'react';
import { SEO, SEOConfig } from '../../SEO/SEO';
import { PageLayout } from './PageLayout';

export const PrivacyPage: React.FC = () => {
  return (
    <PageLayout>
      <SEO
        title={SEOConfig.privacy.title}
        description={SEOConfig.privacy.description}
        keywords={SEOConfig.privacy.keywords}
      />
      <div className="max-w-4xl mx-auto px-6 lg:px-12 py-16">
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 mb-4">
          Privacy Policy
        </h1>
        <p className="text-slate-500 mb-12">Last updated: January 1, 2026</p>

        <div className="prose prose-slate max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              1. Introduction
            </h2>
            <p className="text-slate-600 leading-relaxed">
              BuildMyBot AI ("we," "our," or "us") is committed to protecting
              your privacy. This Privacy Policy explains how we collect, use,
              disclose, and safeguard your information when you use our website,
              platform, and services (collectively, the "Services"). Please read
              this privacy policy carefully. If you do not agree with the terms
              of this privacy policy, please do not access the Services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              2. Information We Collect
            </h2>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">
              Personal Information
            </h3>
            <p className="text-slate-600 leading-relaxed mb-4">
              We may collect personal information that you voluntarily provide
              to us when you:
            </p>
            <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
              <li>Register for an account</li>
              <li>Subscribe to our newsletter</li>
              <li>Make a purchase or payment</li>
              <li>Contact our support team</li>
              <li>Participate in surveys or promotions</li>
            </ul>
            <p className="text-slate-600 leading-relaxed mb-4">
              This information may include: name, email address, phone number,
              billing address, company name, job title, and payment information.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">
              Usage Data
            </h3>
            <p className="text-slate-600 leading-relaxed mb-4">
              We automatically collect certain information when you access our
              Services, including:
            </p>
            <ul className="list-disc list-inside text-slate-600 space-y-2">
              <li>
                Device information (browser type, operating system, device
                identifiers)
              </li>
              <li>Log data (IP address, access times, pages viewed)</li>
              <li>Usage patterns and preferences</li>
              <li>Chatbot interaction data and conversation logs</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              3. How We Use Your Information
            </h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              We use the information we collect to:
            </p>
            <ul className="list-disc list-inside text-slate-600 space-y-2">
              <li>Provide, operate, and maintain our Services</li>
              <li>Process transactions and send related information</li>
              <li>Send you technical notices, updates, and support messages</li>
              <li>
                Respond to your comments, questions, and customer service
                requests
              </li>
              <li>
                Communicate with you about products, services, offers, and
                events
              </li>
              <li>Monitor and analyze trends, usage, and activities</li>
              <li>
                Improve our Services and develop new products and features
              </li>
              <li>
                Detect, investigate, and prevent fraudulent transactions and
                other illegal activities
              </li>
              <li>Personalize your experience and deliver targeted content</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              4. Cookies and Tracking Technologies
            </h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              We use cookies and similar tracking technologies to collect and
              store information about your interactions with our Services.
              Cookies are small data files stored on your device that help us
              improve your experience and our Services.
            </p>

            <h3 className="text-xl font-semibold text-slate-900 mb-3">
              Types of Cookies We Use
            </h3>
            <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
              <li>
                <strong>Essential Cookies:</strong> Necessary for the website to
                function properly
              </li>
              <li>
                <strong>Analytics Cookies:</strong> Help us understand how
                visitors interact with our Services
              </li>
              <li>
                <strong>Functional Cookies:</strong> Enable enhanced
                functionality and personalization
              </li>
              <li>
                <strong>Advertising Cookies:</strong> Used to deliver relevant
                advertisements
              </li>
            </ul>
            <p className="text-slate-600 leading-relaxed">
              You can control cookies through your browser settings. However,
              disabling certain cookies may limit your ability to use some
              features of our Services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              5. Data Sharing and Disclosure
            </h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              We may share your information with the following third-party
              processors to provide our Services:
            </p>
            <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
              <li>
                <strong>Cloud Infrastructure:</strong> Amazon Web Services (AWS)
                for secure data hosting and processing.
              </li>
              <li>
                <strong>Payment Processing:</strong> Stripe for secure,
                PCI-compliant transaction handling.
              </li>
              <li>
                <strong>AI Services:</strong> OpenAI and Cartesia for generating
                chatbot and voice agent responses.
              </li>
              <li>
                <strong>Communication:</strong> Twilio and Telnyx for telephony
                and SMS services.
              </li>
            </ul>
            <p className="text-slate-600 leading-relaxed mt-4">
              We do not sell your personal information to third parties. All
              service providers are bound by data processing agreements that
              protect your information. For more details, request our Data
              Processing Addendum (DPA).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              6. Data Security
            </h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              We implement industry-standard security measures to protect your
              information:
            </p>
            <ul className="list-disc list-inside text-slate-600 space-y-2 mb-4">
              <li>
                <strong>Encryption in Transit:</strong> All data transmitted
                between your browser and our servers is encrypted using TLS 1.3
                with modern, secure ciphers.
              </li>
              <li>
                <strong>Encryption at Rest:</strong> Sensitive data, including
                account credentials and personal information, is encrypted at
                rest using AES-256 encryption.
              </li>
              <li>
                <strong>Database Security:</strong> We use parameterized queries
                and strictly enforced RLS (Row Level Security) to prevent
                unauthorized data access.
              </li>
              <li>
                <strong>Regular Audits:</strong> We conduct periodic security
                reviews and vulnerability scans to maintain our SOC 2 compliant
                status.
              </li>
            </ul>
            <p className="text-slate-600 leading-relaxed">
              However, no method of transmission over the Internet or electronic
              storage is 100% secure, and we cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              7. Data Retention
            </h2>
            <p className="text-slate-600 leading-relaxed">
              We retain your personal information for as long as necessary to
              fulfill the purposes for which it was collected, including to
              satisfy any legal, accounting, or reporting requirements. The
              retention period may vary depending on the context of the Services
              we provide and our legal obligations.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              8. Your Rights and Choices
            </h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              Depending on your location, you may have certain rights regarding
              your personal information:
            </p>
            <ul className="list-disc list-inside text-slate-600 space-y-2">
              <li>
                <strong>Access:</strong> Request a copy of the personal
                information we hold about you
              </li>
              <li>
                <strong>Correction:</strong> Request correction of inaccurate or
                incomplete information
              </li>
              <li>
                <strong>Deletion:</strong> Request deletion of your personal
                information
              </li>
              <li>
                <strong>Portability:</strong> Request transfer of your
                information to another service
              </li>
              <li>
                <strong>Opt-out:</strong> Opt out of marketing communications at
                any time
              </li>
              <li>
                <strong>Restriction:</strong> Request restriction of processing
                of your information
              </li>
            </ul>
            <p className="text-slate-600 leading-relaxed mt-4">
              To exercise these rights, please contact us at
              privacy@buildmybot.app.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              9. GDPR Compliance (European Users)
            </h2>
            <p className="text-slate-600 leading-relaxed mb-4">
              If you are located in the European Economic Area (EEA), you have
              additional rights under the General Data Protection Regulation
              (GDPR):
            </p>
            <ul className="list-disc list-inside text-slate-600 space-y-2">
              <li>Right to be informed about how your data is processed</li>
              <li>Right to lodge a complaint with a supervisory authority</li>
              <li>
                Right to object to processing based on legitimate interests
              </li>
              <li>Right not to be subject to automated decision-making</li>
            </ul>
            <p className="text-slate-600 leading-relaxed mt-4">
              Our legal bases for processing personal information include:
              consent, contract performance, legal obligations, and legitimate
              interests.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              10. California Privacy Rights (CCPA)
            </h2>
            <p className="text-slate-600 leading-relaxed">
              California residents have specific rights under the California
              Consumer Privacy Act (CCPA), including the right to know what
              personal information is collected, the right to delete personal
              information, the right to opt-out of the sale of personal
              information (we do not sell personal information), and the right
              to non-discrimination for exercising CCPA rights.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              11. Children's Privacy
            </h2>
            <p className="text-slate-600 leading-relaxed">
              Our Services are not intended for children under 16 years of age.
              We do not knowingly collect personal information from children
              under 16. If we become aware that we have collected personal
              information from a child under 16, we will take steps to delete
              that information.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              12. International Data Transfers
            </h2>
            <p className="text-slate-600 leading-relaxed">
              Your information may be transferred to and maintained on servers
              located outside of your country of residence. We ensure that any
              such transfers comply with applicable data protection laws and
              that your information remains protected in accordance with this
              Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              13. Changes to This Privacy Policy
            </h2>
            <p className="text-slate-600 leading-relaxed">
              We may update this Privacy Policy from time to time. We will
              notify you of any changes by posting the new Privacy Policy on
              this page and updating the "Last updated" date. We encourage you
              to review this Privacy Policy periodically for any changes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold text-slate-900 mb-4">
              14. Contact Us
            </h2>
            <p className="text-slate-600 leading-relaxed">
              If you have any questions about this Privacy Policy or our privacy
              practices, please contact us:
            </p>
            <div className="bg-slate-100 rounded-xl p-6 mt-4">
              <p className="text-slate-900 font-medium">BuildMyBot AI</p>
              <p className="text-slate-600 mt-2">
                For privacy inquiries, please use our{' '}
                <a href="/contact" className="text-blue-700 hover:underline">
                  contact form
                </a>{' '}
                or email us at{' '}
                <a
                  href="mailto:support@buildmybot.app"
                  className="text-blue-700 hover:underline"
                >
                  support@buildmybot.app
                </a>
              </p>
              <p className="text-slate-600 mt-2">
                We respond to all privacy-related requests within 30 days.
              </p>
            </div>
          </section>
        </div>
      </div>
    </PageLayout>
  );
};
