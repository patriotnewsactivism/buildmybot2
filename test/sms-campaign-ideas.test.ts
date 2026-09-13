import { describe, expect, it } from 'vitest';
import { KIND_LABELS } from '../shared/sms';
import { CAMPAIGN_IDEAS, campaignDraft } from '../shared/sms-campaign-ideas';

describe('SMS campaign ideas', () => {
  it('keeps demonstration drafts inactive and unlabeled as live offers', () => {
    expect(CAMPAIGN_IDEAS.length).toBeGreaterThan(0);
    for (const idea of CAMPAIGN_IDEAS) {
      const draft = campaignDraft(idea);
      expect(draft.status).toBe('draft');
      expect(draft.steps).toEqual([]);
      expect(draft.keyword).toBeTruthy();
      expect(draft.text).toBeTruthy();
    }
  });

  it('labels every program kind for the editor', () => {
    expect(KIND_LABELS.campaign).toMatch(/campaign/i);
    expect(KIND_LABELS.keyword).toMatch(/keyword/i);
    expect(KIND_LABELS.contest).toMatch(/contest/i);
    expect(KIND_LABELS.birthday).toMatch(/birthday/i);
  });
});
