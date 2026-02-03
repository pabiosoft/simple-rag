import { vi } from 'vitest';

export const qdrantMock = {
  getCollections: vi.fn().mockResolvedValue({}),
  getCollection: vi.fn().mockResolvedValue({ points_count: 0 }),
  createCollection: vi.fn().mockResolvedValue({}),
  delete: vi.fn().mockResolvedValue({}),
  search: vi.fn().mockResolvedValue([]),
  upsert: vi.fn().mockResolvedValue({}),
};

export const openaiMock = {
  embeddings: {
    create: vi.fn().mockResolvedValue({
      data: [{ embedding: Array.from({ length: 3 }, () => 0) }],
    }),
  },
  chat: {
    completions: {
      create: vi.fn().mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: 'Test',
                followups: ['Si tu veux, je peux détailler.'],
              }),
            },
          },
        ],
      }),
    },
  },
};
