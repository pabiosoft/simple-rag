import { describe, expect, it } from 'vitest';
import chunkingService from '../../services/chunking.js';

describe('chunkingService', () => {
  it('splits long text into chunks within limit', () => {
    const text = Array.from({ length: 2000 }, () => 'word').join(' ');
    const chunks = chunkingService.chunkByTokens(text, 200, 20);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => {
      expect(chunkingService.estimateTokens(chunk)).toBeLessThanOrEqual(220);
    });
  });
});
