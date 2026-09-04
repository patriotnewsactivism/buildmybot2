import { ThumbsDown, ThumbsUp } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { sendAnswerFeedback } from '../../services/openaiService';

/**
 * Thumbs up/down on a single bot answer.
 *
 * A 👎 is the strongest signal in the product: it drops the question straight
 * into the owner's missing-answer inbox, where a correction gets written back
 * into the bot's knowledge base. Deliberately quiet UI — one row of small
 * icons, and it disappears once the visitor has voted, so the widget never
 * nags anyone for feedback.
 */
export const AnswerFeedback: React.FC<{ answerId: string }> = ({
  answerId,
}) => {
  const [sent, setSent] = useState<'up' | 'down' | null>(null);

  const vote = (feedback: 'up' | 'down') => {
    setSent(feedback);
    // Fire and forget: a visitor should never see an error because a rating
    // failed to save.
    void sendAnswerFeedback(answerId, feedback);
  };

  if (sent) {
    return (
      <div className="mt-1.5 text-[10px] text-slate-400">
        {sent === 'up' ? 'Thanks for the feedback' : 'Thanks — we’ll improve this'}
      </div>
    );
  }

  return (
    <div className="mt-1.5 flex items-center gap-2">
      <button
        type="button"
        aria-label="This answer was helpful"
        onClick={() => vote('up')}
        className="text-slate-300 hover:text-emerald-500 transition-colors"
      >
        <ThumbsUp className="w-3 h-3" />
      </button>
      <button
        type="button"
        aria-label="This answer was not helpful"
        onClick={() => vote('down')}
        className="text-slate-300 hover:text-rose-500 transition-colors"
      >
        <ThumbsDown className="w-3 h-3" />
      </button>
    </div>
  );
};

export default AnswerFeedback;
