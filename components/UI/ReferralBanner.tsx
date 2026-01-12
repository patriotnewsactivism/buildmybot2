import { Copy, Gift, Share2, Users } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

interface ReferralUser {
  resellerCode?: string | null;
  referralCredits?: number | null;
}

interface ReferralBannerProps {
  user: ReferralUser;
}

export const ReferralBanner: React.FC<ReferralBannerProps> = ({ user }) => {
  const [copied, setCopied] = useState(false);

  if (!user.resellerCode) {
    return null;
  }

  const baseUrl = window.location.origin;
  const referralUrl = `${baseUrl}/?ref=${user.resellerCode}`;

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const shareReferral = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Join BuildMyBot',
          text: 'Create AI chatbots for your business with BuildMyBot!',
          url: referralUrl,
        });
      } catch (error) {
        copyToClipboard();
      }
    } else {
      copyToClipboard();
    }
  };

  return (
    <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-4 md:p-6 text-white shadow-lg">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2 bg-white/20 rounded-lg">
            <Gift size={24} />
          </div>
          <div>
            <h3 className="font-bold text-lg">Earn Rewards!</h3>
            <p className="text-purple-100 text-sm">
              Share your referral link and earn credits when friends sign up.
            </p>
            {user.referralCredits && user.referralCredits > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <Users size={14} />
                <span className="text-sm font-medium">
                  {user.referralCredits} credits available
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="flex items-center gap-2 bg-white/10 rounded-lg px-3 py-2 border border-white/20">
            <code className="text-xs truncate max-w-[200px]">
              {referralUrl}
            </code>
            <button
              type="button"
              onClick={copyToClipboard}
              className="p-1 hover:bg-white/10 rounded transition"
              title="Copy link"
            >
              <Copy size={14} />
            </button>
          </div>
          <button
            type="button"
            onClick={shareReferral}
            className="flex items-center justify-center gap-2 bg-white text-purple-700 font-semibold px-4 py-2 rounded-lg hover:bg-purple-50 transition"
          >
            <Share2 size={16} />
            <span>{copied ? 'Copied!' : 'Share'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReferralBanner;
