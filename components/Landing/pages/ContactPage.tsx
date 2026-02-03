import {
  CheckCircle,
  Linkedin,
  Mail,
  MessageSquare,
  Send,
  Twitter,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { SEO, SEOConfig } from '../../SEO/SEO';
import { PageLayout } from './PageLayout';

export const ContactPage: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
    priority: false,
    betaTesting: false,
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <PageLayout>
      <SEO
        title={SEOConfig.contact.title}
        description={SEOConfig.contact.description}
        keywords={SEOConfig.contact.keywords}
      />
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16 space-y-16">
        <section className="text-center space-y-6">
          <div className="inline-flex items-center gap-2 bg-yellow-400 text-slate-900 px-6 py-2 rounded-full text-sm font-bold mb-4">
            <span className="w-2 h-2 bg-slate-900 rounded-full animate-pulse"></span>
            BETA TESTING IN PROGRESS
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900">
            Contact Us
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto">
            Interested in beta testing? Have questions? We're here for you. Reach out and our
            team will get back to you within 24 hours.
          </p>
        </section>

        <section className="grid lg:grid-cols-3 gap-12">
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
              <h2 className="text-2xl font-bold text-slate-900 mb-6">
                Send Us a Message
              </h2>

              {submitted ? (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="text-emerald-600" size={32} />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">
                    Message Sent!
                  </h3>
                  <p className="text-slate-600 mb-6">
                    Thank you for reaching out. We'll get back to you within 24
                    hours.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setSubmitted(false);
                      setFormData({
                        name: '',
                        email: '',
                        subject: '',
                        message: '',
                        priority: false,
                        betaTesting: false,
                      });
                    }}
                    className="text-blue-700 font-medium hover:underline"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label
                        htmlFor="contact-name"
                        className="block text-sm font-medium text-slate-700 mb-2"
                      >
                        Your Name
                      </label>
                      <input
                        id="contact-name"
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) =>
                          setFormData({ ...formData, name: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="John Smith"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="contact-email"
                        className="block text-sm font-medium text-slate-700 mb-2"
                      >
                        Email Address
                      </label>
                      <input
                        id="contact-email"
                        type="email"
                        required
                        value={formData.email}
                        onChange={(e) =>
                          setFormData({ ...formData, email: e.target.value })
                        }
                        className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="john@company.com"
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      htmlFor="contact-subject"
                      className="block text-sm font-medium text-slate-700 mb-2"
                    >
                      Subject
                    </label>
                    <input
                      id="contact-subject"
                      type="text"
                      required
                      value={formData.subject}
                      onChange={(e) =>
                        setFormData({ ...formData, subject: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="How can we help?"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="contact-message"
                      className="block text-sm font-medium text-slate-700 mb-2"
                    >
                      Message
                    </label>
                    <textarea
                      id="contact-message"
                      required
                      rows={5}
                      value={formData.message}
                      onChange={(e) =>
                        setFormData({ ...formData, message: e.target.value })
                      }
                      className="w-full border border-slate-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                      placeholder="Tell us more about your inquiry..."
                    />
                  </div>
                  <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <input
                      id="contact-beta"
                      type="checkbox"
                      checked={formData.betaTesting}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          betaTesting: e.target.checked,
                        })
                      }
                      className="mt-1 h-4 w-4 rounded border-blue-300 text-blue-700 focus:ring-blue-600"
                    />
                    <div>
                      <label
                        htmlFor="contact-beta"
                        className="text-sm font-semibold text-blue-900"
                      >
                        I'm interested in beta testing
                      </label>
                      <p className="text-xs text-blue-700">
                        Get early access to BuildMyBot before our official launch.
                        Beta testers receive exclusive benefits and priority support.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <input
                      id="contact-priority"
                      type="checkbox"
                      checked={formData.priority}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          priority: e.target.checked,
                        })
                      }
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-600"
                    />
                    <div>
                      <label
                        htmlFor="contact-priority"
                        className="text-sm font-semibold text-slate-900"
                      >
                        Mark as priority for immediate review
                      </label>
                      <p className="text-xs text-slate-600">
                        Urgent issues are flagged in the support inbox for immediate attention.
                      </p>
                    </div>
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-blue-700 text-white py-4 rounded-xl font-bold hover:bg-blue-800 transition flex items-center justify-center gap-2"
                  >
                    <Send size={18} />
                    Send Message
                  </button>
                </form>
              )}
            </div>
          </div>

          <div className="space-y-6 lg:sticky lg:top-24 h-fit">
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <MessageSquare size={20} className="text-blue-700" />
                <h3 className="font-bold text-lg text-slate-900">
                  Embedded Support Chat
                </h3>
              </div>
              <p className="text-slate-600 text-sm mb-4">
                Get instant answers from our AI assistant. Priority requests are
                flagged for the support inbox so admins can respond ASAP.
              </p>
              <div className="h-[420px] rounded-2xl overflow-hidden border border-slate-200 bg-slate-50">
                <iframe
                  title="BuildMyBot Support Chat"
                  src="/chat/support?mode=embed"
                  className="h-full w-full"
                  loading="lazy"
                />
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>Need a full view?</span>
                <a
                  href="/chat/support"
                  className="text-blue-700 font-semibold hover:underline"
                >
                  Open chat
                </a>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-bold text-lg text-slate-900 mb-4">
                Support Inbox Routing
              </h3>
              <div className="space-y-3 text-sm text-slate-600">
                <p>
                  Vetted urgent issues are automatically marked for the support
                  inbox so you and other admins can triage them quickly.
                </p>
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-700">
                  Priority messages are labeled &quot;ASAP&quot; for immediate
                  attention.
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-bold text-lg text-slate-900 mb-4">
                Contact Information
              </h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700 shrink-0">
                    <Mail size={18} />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Email</p>
                    <a
                      href="mailto:support@buildmybot.app"
                      className="text-blue-700 hover:underline"
                    >
                      support@buildmybot.app
                    </a>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center text-blue-700 shrink-0">
                    <MessageSquare size={18} />
                  </div>
                  <div>
                    <p className="font-medium text-slate-900">Response Time</p>
                    <p className="text-slate-600">
                      We typically respond within 24 hours
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
              <h3 className="font-bold text-lg text-slate-900 mb-4">
                Follow Us
              </h3>
              <div className="flex gap-3">
                <a
                  href="https://twitter.com/buildmybot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 hover:bg-blue-100 hover:text-blue-700 transition"
                >
                  <Twitter size={20} />
                </a>
                <a
                  href="https://linkedin.com/company/buildmybot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-slate-600 hover:bg-blue-100 hover:text-blue-700 transition"
                >
                  <Linkedin size={20} />
                </a>
              </div>
            </div>

            <div className="bg-blue-50 rounded-2xl p-6 border-2 border-blue-200">
              <h3 className="font-bold text-lg text-slate-900 mb-2">
                Beta Testing Program
              </h3>
              <p className="text-slate-600 text-sm mb-3">
                Join our exclusive beta program and get early access to cutting-edge AI technology.
              </p>
              <p className="text-blue-700 font-medium text-sm">
                Check the beta testing box above to express your interest!
              </p>
            </div>
          </div>
        </section>
      </div>
    </PageLayout>
  );
};
