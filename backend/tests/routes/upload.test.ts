import { describe, expect, it } from 'vitest';
import request from 'supertest';
import path from 'path';
import app from '../../app.js';

const fixturePath = path.resolve('tests/fixtures/sample.json');

describe('POST /corpus/upload/universal', () => {
  it('uploads a json file', async () => {
    const res = await request(app)
      .post('/corpus/upload/universal')
      .set('x-api-key', 'test-key')
      .attach('file', fixturePath);

    expect(res.status).toBe(201);
    expect(res.body.file).toHaveProperty('name');
  });
});
