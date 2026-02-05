import express from 'express';
import { ragService } from '../services/rag.js';

const router = express.Router();

/**
 * Route POST /ask - Traite les questions utilisateur
 */
router.post('/ask', async (req, res) => {
    try {
        const { question, conversation_id, last_topic, last_answer, last_question, raw, row_json, include_sources } = req.body || {};
        const rawFlag = raw === true || raw === 'true'
          || row_json === true || row_json === 'true'
          || req.query.raw === 'true'
          || req.query['row-json'] === 'true'
          || req.query.format === 'raw';
        const includeSources = include_sources === true || include_sources === 'true'
          || req.query.include_sources === 'true'
          || req.query['include-sources'] === 'true';

        // Validation
        if (!question || typeof question !== 'string' || question.length > 1000) {
            return res.status(400).json({ 
                error: 'Question invalide ou trop longue' 
            });
        }

        const context = {
            conversationId: typeof conversation_id === 'string' ? conversation_id.slice(0, 100) : '',
            lastTopic: typeof last_topic === 'string' ? last_topic.slice(0, 200) : '',
            lastAnswer: typeof last_answer === 'string' ? last_answer.slice(0, 2000) : '',
            lastQuestion: typeof last_question === 'string' ? last_question.slice(0, 500) : '',
        };

        // Traitement avec le service RAG
        const result = await ragService.processQuestion(question, context);
        if (rawFlag) {
            const payload: { raw: string; sources?: unknown } = { raw: result.raw || result.answer };
            if (includeSources) payload.sources = result.sources || [];
            return res.json(payload);
        }
        res.json(result);

    } catch (error) {
        console.error('❌ Erreur dans /ask:', error.message);
        
        // Gestion spécifique de l'erreur de tokens
        if (error.message.includes('CONTEXT_TOO_LONG') || 
            error.message.includes('maximum context length') ||
            error.message.includes('16385 tokens')) {
            
            return res.status(400).json({
                error: 'Contexte trop long',
                message: 'Les documents sont trop volumineux. Essayez une question plus spécifique.',
                suggestion: 'Posez des questions plus ciblées ou réduisez la taille des documents PDF.'
            });
        }

        // Autres erreurs
        res.status(500).json({ 
            error: 'Erreur serveur',
            details: error.message 
        });
    }
});

export default router;
