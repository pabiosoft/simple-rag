import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';

const mockRagService = vi.hoisted(() => ({
    processQuestion: vi.fn()
}));

vi.mock('../../services/rag.js', () => ({
    ragService: mockRagService
}));

import chatRoutes from '../../routes/chat.js';

function buildApp() {
    const app = express();
    app.use(express.json());
    app.use(chatRoutes);
    return app;
}

describe('POST /ask', () => {
    beforeEach(() => {
        mockRagService.processQuestion.mockReset();
    });

    it('retourne 400 si la question est absente', async () => {
        const response = await request(buildApp()).post('/ask').send({});
        expect(response.status).toBe(400);
        expect(response.body.error).toBeDefined();
        expect(mockRagService.processQuestion).not.toHaveBeenCalled();
    });

    it('retourne 400 si la question est trop longue', async () => {
        const longQuestion = 'x'.repeat(1001);
        const response = await request(buildApp()).post('/ask').send({ question: longQuestion });
        expect(response.status).toBe(400);
        expect(mockRagService.processQuestion).not.toHaveBeenCalled();
    });

    it('délègue à ragService et renvoie la réponse', async () => {
        const expected = { answer: 'Hello', sources: [], found: true };
        mockRagService.processQuestion.mockResolvedValueOnce(expected);

        const response = await request(buildApp()).post('/ask').send({ question: 'Salut' });

        expect(response.status).toBe(200);
        expect(response.body).toEqual(expected);
        expect(mockRagService.processQuestion).toHaveBeenCalledWith('Salut');
    });

    it('retourne 500 si ragService lève une erreur', async () => {
        mockRagService.processQuestion.mockRejectedValueOnce(new Error('OpenAI down'));

        const response = await request(buildApp()).post('/ask').send({ question: 'Problème ?' });

        expect(response.status).toBe(500);
        expect(response.body.error).toContain('Erreur serveur');
    });
});
