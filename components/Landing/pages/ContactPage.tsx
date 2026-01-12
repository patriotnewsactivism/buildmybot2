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
import { PageLayout } from './PageLayout';

export const ContactPage: React.FC = () => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
  };

  return (
    <PageLayout>
      <div className="max-w-7xl mx-auto px-6 lg:px-12 py-16 space-y-16">
        <section className="text-center space-y-6">
          <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900">
            Contact Us
          </h1>
          <p className="text-xl text-slate-600 max-w-3xl mx-auto">
            Have a question or need help? We're here for you. Reach out and our
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

          <div className="space-y-6">
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

            <div className="bg-gradient-to-br from-blue-900 to-blue-700 rounded-2xl p-6 text-white">
              <div className="flex items-center gap-3 mb-3">
                <MessageSquare size={24} />
                <h3 className="font-bold text-lg">Live Chat</h3>
              </div>
              <p className="text-blue-200 text-sm mb-4">
                Need immediate help? Chat with our AI assistant 24/7 or connect
                with a team member during business hours.
              </p>
              <button
                type="button"
                className="w-full bg-white text-blue-900 py-3 rounded-xl font-bold hover:bg-blue-50 transition"
              >
                Start Chat
              </button>
            </div>

            <div className="bg-slate-100 rounded-2xl p-6">
              <h3 className="font-bold text-lg text-slate-900 mb-2">
                Sales Inquiries
              </h3>
              <p className="text-slate-600 text-sm mb-3">
                Interested in enterprise plans or custom solutions?
              </p>
              <a
                href="mailto:sales@buildmybot.app"
                className="text-blue-700 font-medium hover:underline"
              >
                sales@buildmybot.app
              </a>
            </div>
          </div>
        </section>
      </div>
    </PageLayout>
  );
};
