import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import app from '../../app.js';
import { indexerService } from '../../services/indexer.js';

describe('Admin API', () => {
  it('lists folders', async () => {
    const res = await request(app).get('/admin/api/folders?scope=corpus');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tree');
  });

  it('indexes a folder', async () => {
    const spy = vi.spyOn(indexerService, 'indexCorpusFolder').mockResolvedValue({
      indexed: 1,
      sources: 1,
    });

    const res = await request(app)
      .post('/admin/api/index')
      .send({ path: 'pdf' });

    expect(res.status).toBe(200);
    expect(res.body.indexed).toBe(1);
    spy.mockRestore();
  });
});
