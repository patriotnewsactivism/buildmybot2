import { ArrowLeft, Bot } from 'lucide-react';
import type React from 'react';
import { CookieConsent } from '../../Support/CookieConsent';

interface PageLayoutProps {
  children: React.ReactNode;
}

export const PageLayout: React.FC<PageLayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <nav className="h-14 sm:h-16 md:h-20 border-b border-slate-200/60 bg-white/95 backdrop-blur-lg px-4 sm:px-6 lg:px-12 flex items-center justify-between sticky top-0 z-40 shadow-sm">
        <a href="/" className="flex items-center gap-2">
          <Bot className="w-6 h-6 text-blue-700" />
          <span className="font-bold text-lg text-slate-900">BuildMyBot</span>
        </a>
        <a
          href="/"
          className="flex items-center gap-2 text-slate-600 hover:text-blue-700 transition-colors font-medium"
        >
          <ArrowLeft size={18} />
          <span className="hidden sm:inline">Back to Home</span>
        </a>
      </nav>

      <main className="flex-1">{children}</main>

      <CookieConsent />

      <footer className="bg-slate-900 text-slate-400 py-12 sm:py-20 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 sm:gap-12">
          <div>
            <div className="flex items-center gap-2 text-white font-bold text-xl mb-4">
              <Bot size={24} /> BuildMyBot
            </div>
            <p className="text-sm">
              The AI workforce that never sleeps. Convert more leads, close more
              deals, grow your business.
            </p>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Product</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="/features" className="hover:text-white transition">
                  Features
                </a>
              </li>
              <li>
                <a href="/pricing" className="hover:text-white transition">
                  Pricing
                </a>
              </li>
              <li>
                <a href="/demo" className="hover:text-white transition">
                  Demo
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Company</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="/about" className="hover:text-white transition">
                  About
                </a>
              </li>
              <li>
                <a href="/blog" className="hover:text-white transition">
                  Blog
                </a>
              </li>
              <li>
                <a href="/careers" className="hover:text-white transition">
                  Careers
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-white font-bold mb-4">Support</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="/help" className="hover:text-white transition">
                  Help Center
                </a>
              </li>
              <li>
                <a href="/faq" className="hover:text-white transition">
                  FAQ
                </a>
              </li>
              <li>
                <a href="/contact" className="hover:text-white transition">
                  Contact
                </a>
              </li>
              <li>
                <a href="/privacy" className="hover:text-white transition">
                  Privacy Policy
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="max-w-7xl mx-auto mt-12 pt-8 border-t border-slate-800 text-center text-sm">
          © 2026 BuildMyBot AI. All rights reserved.
        </div>
      </footer>
    </div>
  );
};
