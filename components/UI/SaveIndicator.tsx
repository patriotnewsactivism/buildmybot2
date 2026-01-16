import { AlertCircle, Check, Loader2 } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';

interface SaveIndicatorProps {
  state: 'idle' | 'saving' | 'saved' | 'error';
  lastSaved?: Date | null;
  error?: string | null;
}

export const SaveIndicator: React.FC<SaveIndicatorProps> = ({
  state,
  lastSaved,
  error,
}) => {
  const [timeAgo, setTimeAgo] = useState<string>('');

  useEffect(() => {
    if (!lastSaved) return;

    const updateTimeAgo = () => {
      const seconds = Math.floor((Date.now() - lastSaved.getTime()) / 1000);

      if (seconds < 60) {
        setTimeAgo('just now');
      } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        setTimeAgo(`${minutes}m ago`);
      } else {
        const hours = Math.floor(seconds / 3600);
        setTimeAgo(`${hours}h ago`);
      }
    };

    updateTimeAgo();
    const interval = setInterval(updateTimeAgo, 30000); // Update every 30 seconds

    return () => clearInterval(interval);
  }, [lastSaved]);

  if (state === 'idle' && !lastSaved) {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      {state === 'saving' && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-500 text-white shadow-lg animate-pulse">
          <Loader2 className="animate-spin" size={16} />
          <span className="font-medium text-sm">Saving...</span>
        </div>
      )}

      {state === 'saved' && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-lg">
          <Check size={16} />
          <span className="font-medium text-sm">Saved</span>
        </div>
      )}

      {state === 'error' && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-rose-500 to-pink-500 text-white shadow-lg">
          <AlertCircle size={16} />
          <span className="font-medium text-sm">{error || 'Error saving'}</span>
        </div>
      )}

      {state === 'idle' && lastSaved && (
        <div className="text-sm text-slate-500 px-4 py-2">
          Saved {timeAgo}
        </div>
      )}
    </div>
  );
};
