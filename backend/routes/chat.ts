import express from 'express';
import { ragService } from '../services/rag.js';

const router = express.Router();

/**
 * Route POST /ask - Traite les questions utilisateur
 */
router.post('/ask', async (req, res) => {
    try {
        const { question } = req.body;

        // Validation
        if (!question || question.length > 1000) {
            return res.status(400).json({ 
                error: 'Question invalide ou trop longue' 
            });
        }

        // Traitement avec le service RAG
        const result = await ragService.processQuestion(question);
        
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