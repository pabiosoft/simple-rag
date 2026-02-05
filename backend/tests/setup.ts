import { vi } from 'vitest';
import { qdrantMock, openaiMock } from './utils/mocks.js';

process.env.NODE_ENV = 'test';
process.env.OPENAI_API_KEY = 'test-key';
process.env.EMBEDDING_MODEL = 'text-embedding-3-small';
process.env.DEFAULT_DOCUMENT_AUTHOR = 'test-author';
process.env.API_KEY = 'test-key';

vi.mock('../config/runtime/database.js', () => ({
  qdrant: qdrantMock,
  openai: openaiMock,
  COLLECTION_NAME: 'corpus',
  VECTOR_SIZE: 1536,
}));
