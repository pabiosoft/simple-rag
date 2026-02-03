import path from 'path';
import fs from 'fs';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockIndexer = vi.hoisted(() => ({
    indexExcelFile: vi.fn().mockResolvedValue({ indexed: 3 }),
    indexJsonFile: vi.fn().mockResolvedValue({ indexed: 1 }),
    indexPdfFile: vi.fn().mockResolvedValue({ indexed: 1 })
}));

vi.mock('../../services/indexer.js', () => ({
    indexerService: mockIndexer
}));

import corpusRoutes from '../../routes/corpus.js';

const app = express();
app.use(corpusRoutes);

const CORPUS_JSON_DIR = path.resolve('./corpus/json');

beforeEach(async () => {
    mockIndexer.indexJsonFile.mockClear();
    mockIndexer.indexPdfFile.mockClear();
    mockIndexer.indexExcelFile.mockClear();
    await fs.promises.mkdir(CORPUS_JSON_DIR, { recursive: true });
});

afterEach(async () => {
    const files = await fs.promises.readdir(CORPUS_JSON_DIR);
    await Promise.all(
        files
            .filter(name => name.startsWith('spec-upload'))
            .map(file => fs.promises.unlink(path.join(CORPUS_JSON_DIR, file)))
    );
});

describe('POST /corpus/upload', () => {
    it('détecte un JSON et déclenche la bonne indexation', async () => {
        const payload = {
            title: 'Spec Upload',
            date: '2025-01-01',
            category: 'Test',
            text: 'Document généré par les tests'
        };

        const response = await request(app)
            .post('/corpus/upload')
            .attach('file', Buffer.from(JSON.stringify(payload), 'utf-8'), 'spec-upload.json');

        expect(response.status).toBe(201);
        expect(response.body.type).toBe('json');
        expect(response.body.indexed).toBe(1);
        expect(mockIndexer.indexJsonFile).toHaveBeenCalledWith('spec-upload.json');

        const storedFile = path.join(CORPUS_JSON_DIR, 'spec-upload.json');
        expect(fs.existsSync(storedFile)).toBe(true);
    });
});
