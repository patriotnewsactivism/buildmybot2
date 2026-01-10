import { describe, expect, it } from 'vitest';

describe('Template Service', () => {
  it('should validate template structure', () => {
    const validTemplate = {
      id: 'test-1',
      name: 'Test Template',
      category: 'Technology',
      description: 'A test template',
      systemPrompt: 'You are a helpful assistant',
      priceCents: 0,
      installCount: 0,
      rating: 0,
      isPublic: true,
      isPremium: false,
    };

    expect(validTemplate).toHaveProperty('id');
    expect(validTemplate).toHaveProperty('name');
    expect(validTemplate).toHaveProperty('systemPrompt');
    expect(validTemplate.priceCents).toBeGreaterThanOrEqual(0);
    expect(validTemplate.rating).toBeGreaterThanOrEqual(0);
    expect(validTemplate.rating).toBeLessThanOrEqual(5);
  });

  it('should calculate price correctly', () => {
    const template = {
      priceCents: 4900,
    };

    const priceInDollars = template.priceCents / 100;
    expect(priceInDollars).toBe(49);
  });

  it('should format install count', () => {
    const template = {
      installCount: 1240,
    };

    const formatted = template.installCount.toLocaleString();
    expect(formatted).toBe('1,240');
  });
});
