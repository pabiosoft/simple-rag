import { describe, expect, it } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { qdrantMock, openaiMock } from '../utils/mocks.js';

const mockSearchResult = [
  {
    score: 0.9,
    payload: {
      text: 'Contenu de test',
      title: 'Doc',
      author: 'Auteur',
      date: '2024-01-01',
    },
  },
];

describe('POST /ask', () => {
  it('returns greeting response', async () => {
    const res = await request(app).post('/ask').send({ question: 'bonjour' });
    expect(res.status).toBe(200);
    expect(res.body.answer).toContain('Bonjour');
  });

  it('returns answer with sources', async () => {
    qdrantMock.search.mockResolvedValueOnce(mockSearchResult);
    openaiMock.chat.completions.create.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({ answer: 'Réponse', followups: [] }) } }],
    });

    const res = await request(app).post('/ask').send({ question: 'test' });
    expect(res.status).toBe(200);
    expect(res.body.sources.length).toBeGreaterThan(0);
  });
});
