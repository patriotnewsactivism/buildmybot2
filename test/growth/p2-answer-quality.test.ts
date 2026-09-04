import { describe, expect, it } from 'vitest';
import {
  classifyAnswer,
  mergeCorrection,
  summarizeInbox,
} from '../../api/growth/answer-quality';

describe('classifyAnswer', () => {
  const good = 'We are open Monday to Friday, 8am to 6pm, and Saturdays 9-1.';

  it('treats a substantive, knowledge-backed answer as answered', () => {
    const r = classifyAnswer({
      question: 'What are your hours?',
      answer: good,
      retrievedChunks: 3,
      hasKnowledge: true,
    });
    expect(r.status).toBe('answered');
    expect(r.reason).toBeNull();
    expect(r.confidence).toBeGreaterThan(0.6);
  });

  it('flags explicit deflections', () => {
    for (const answer of [
      "I don't have that information about pricing.",
      "I'm not sure, sorry!",
      'Please contact us for more details on that.',
      'I am unable to help with refunds.',
    ]) {
      const r = classifyAnswer({
        question: 'Do you offer refunds?',
        answer,
        retrievedChunks: 2,
        hasKnowledge: true,
      });
      expect(r.status, answer).toBe('unanswered');
      expect(r.reason, answer).toBe('deflected');
    }
  });

  it('flags fluent answers that had no knowledge behind them', () => {
    const r = classifyAnswer({
      question: 'Do you service commercial roofs?',
      answer:
        'Yes, most roofing companies handle commercial work of this kind and it typically takes a few days.',
      retrievedChunks: 0,
      hasKnowledge: true,
    });
    // This is the case owners care most about: it reads well but is invented.
    expect(r.status).toBe('unanswered');
    expect(r.reason).toBe('no_knowledge');
  });

  it('does not punish bots with no knowledge base configured yet', () => {
    const r = classifyAnswer({
      question: 'What are your hours?',
      answer: good,
      retrievedChunks: 0,
      hasKnowledge: false,
    });
    expect(r.status).toBe('answered');
  });

  it('flags very short answers as thin', () => {
    const r = classifyAnswer({
      question: 'Are you licensed in Texas?',
      answer: 'Yes.',
      retrievedChunks: 2,
      hasKnowledge: true,
    });
    expect(r.status).toBe('unanswered');
    expect(r.reason).toBe('thin_answer');
  });

  it('ignores turns with no question', () => {
    const r = classifyAnswer({ question: '  ', answer: 'Hi there!' });
    expect(r.status).toBe('answered');
    expect(r.confidence).toBe(1);
  });

  it('confidence rises with retrieved context but never exceeds 1', () => {
    const low = classifyAnswer({
      question: 'q',
      answer: good,
      retrievedChunks: 1,
      hasKnowledge: true,
    });
    const high = classifyAnswer({
      question: 'q',
      answer: good,
      retrievedChunks: 20,
      hasKnowledge: true,
    });
    expect(high.confidence).toBeGreaterThan(low.confidence);
    expect(high.confidence).toBeLessThanOrEqual(1);
  });
});

describe('mergeCorrection', () => {
  it('appends a Q/A pair to an empty knowledge base', () => {
    const merged = mergeCorrection(null, 'Do you offer refunds?', 'Yes, within 30 days.');
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('owner_correction');
    expect(merged[0].content).toBe(
      'Q: Do you offer refunds?\nA: Yes, within 30 days.',
    );
  });

  it('preserves existing string and object entries', () => {
    const merged = mergeCorrection(
      ['We are a roofing company.', { content: 'Founded 2009.', source: 'website' }],
      'Hours?',
      '8-6 weekdays.',
    );
    expect(merged).toHaveLength(3);
    expect(merged.map((m) => m.source)).toContain('website');
  });

  it('replaces a previous correction for the same question instead of stacking', () => {
    const first = mergeCorrection([], 'Hours?', '9-5');
    const second = mergeCorrection(first, 'Hours?', '8-6');
    expect(second).toHaveLength(1);
    expect(second[0].content).toContain('8-6');
    expect(second[0].content).not.toContain('9-5');
  });

  it('does not clobber a same-question entry that came from another source', () => {
    const merged = mergeCorrection(
      [{ content: 'Q: Hours?\nA: 9-5', source: 'website' }],
      'Hours?',
      '8-6',
    );
    expect(merged).toHaveLength(2);
  });

  it('drops empty entries', () => {
    const merged = mergeCorrection(['', { content: '' }], 'Hours?', '8-6');
    expect(merged).toHaveLength(1);
  });
});

describe('summarizeInbox', () => {
  it('counts only unresolved unanswered rows as open', () => {
    const s = summarizeInbox([
      { status: 'unanswered', resolved: false },
      { status: 'unanswered', resolved: true },
      { status: 'answered', resolved: false },
    ]);
    expect(s).toEqual({ open: 1, resolved: 1, total: 3 });
  });

  it('handles an empty inbox', () => {
    expect(summarizeInbox([])).toEqual({ open: 0, resolved: 0, total: 0 });
  });
});
