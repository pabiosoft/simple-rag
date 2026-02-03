import { describe, expect, it } from 'vitest';
import { vectorService } from '../../services/vector.js';

describe('vectorService.getAdaptiveThreshold', () => {
  it('returns lower threshold for short questions', () => {
    expect(vectorService.getAdaptiveThreshold('ok')).toBe(0.72);
    expect(vectorService.getAdaptiveThreshold('two words')).toBe(0.72);
  });

  it('returns higher threshold for longer questions', () => {
    expect(vectorService.getAdaptiveThreshold('one two three four five six')).toBe(0.77);
    expect(vectorService.getAdaptiveThreshold('one two three four five six seven eight nine ten eleven twelve')).toBe(0.8);
    expect(vectorService.getAdaptiveThreshold('one two three four five six seven eight nine ten eleven twelve thirteen')).toBe(0.82);
  });
});
