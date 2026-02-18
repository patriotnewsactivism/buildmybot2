import React, { useState, useEffect } from 'react';
import { Shield, X, Check, ArrowRight } from 'lucide-react';

export const CookieConsent: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('bmb_cookie_consent');
    if (!consent) {
      const timer = setTimeout(() => setIsVisible(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem('bmb_cookie_consent', 'accepted');
    setIsVisible(false);
  };

  const handleDecline = () => {
    localStorage.setItem('bmb_cookie_consent', 'declined');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-6 left-6 right-6 md:left-auto md:right-8 md:max-w-md z-[9999] animate-fade-in">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 text-white relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
          <Shield size={80} />
        </div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/40">
              <Shield size={20} className="text-white" />
            </div>
            <h3 className="font-bold text-lg">Privacy Matters</h3>
            <button 
              onClick={() => setIsVisible(false)}
              className="ml-auto p-1 hover:bg-slate-800 rounded-lg transition-colors text-slate-400"
            >
              <X size={18} />
            </button>
          </div>

          <p className="text-slate-300 text-sm leading-relaxed mb-6">
            We use cookies to enhance your experience, analyze site traffic, and support our lead generation features. By clicking "Accept", you agree to our use of cookies as detailed in our <a href="/privacy" className="text-blue-400 hover:text-blue-300 underline underline-offset-4">Privacy Policy</a>.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={handleAccept}
              className="flex-1 bg-white text-slate-900 font-bold py-2.5 rounded-xl hover:bg-slate-100 transition-all flex items-center justify-center gap-2"
            >
              <Check size={18} />
              Accept All
            </button>
            <button
              onClick={handleDecline}
              className="flex-1 bg-slate-800 text-white font-bold py-2.5 rounded-xl hover:bg-slate-750 transition-all border border-slate-700"
            >
              Essential Only
            </button>
          </div>
          
          <div className="mt-4 pt-4 border-t border-slate-800 flex items-center justify-between">
            <span className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
              GDPR & CCPA COMPLIANT
            </span>
            <a href="/privacy" className="text-[10px] text-blue-400 font-bold hover:underline flex items-center gap-1">
              LEARN MORE <ArrowRight size={10} />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
