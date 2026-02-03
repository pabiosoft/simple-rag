import { describe, expect, it } from 'vitest';
import { RAGService } from '../../services/rag.js';

describe('RAGService helpers', () => {
  it('detects greetings', () => {
    const service = new RAGService();
    expect(service.isGreeting('bonjour')).toBe(true);
    expect(service.isGreeting('salut')).toBe(true);
    expect(service.isGreeting('hello')).toBe(true);
    expect(service.isGreeting('question')).toBe(false);
  });

  it('normalizes followups and removes banned words', () => {
    const service = new RAGService();
    const result = service.normalizeFollowups([
      'Quels documents ?',
      'Si tu veux, je peux résumer',
      'Dis-moi la suite',
    ]);
    expect(result.some((item) => item.toLowerCase().includes('document'))).toBe(false);
    expect(result.length).toBeGreaterThan(0);
  });

  it('applies offer style', () => {
    const service = new RAGService();
    const result = service.applyFollowupStyle(['Peux-tu expliquer le sujet']);
    expect(result[0].toLowerCase().startsWith('si tu veux')).toBe(true);
  });
});
