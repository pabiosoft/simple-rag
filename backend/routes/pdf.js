/**
 * Routes pour la gestion des fichiers PDF
 * Upload et traitement des fichiers PDF
 */

import express from 'express';
import { pdfService } from '../services/pdfService.js';
import { indexerService } from '../services/indexer.js';

const router = express.Router();

/**
 * Route GET /pdf - Liste les fichiers PDF disponibles
 */
router.get('/pdf', async (_, res) => {
    try {
        const files = await pdfService.listPDFFiles();
        const items = files.map(name => ({
            name,
            url: `/pdf/${encodeURIComponent(name)}`,
        }));
        res.json({ files: items });
    } catch (error) {
        console.error('❌ Erreur liste PDF:', error.message);
        res.status(500).json({
            error: 'Erreur serveur: impossible de lister les fichiers PDF'
        });
    }
});

/**
 * Route POST /pdf/reindex - Réindexe tous les PDF
 */
router.post('/pdf/reindex', async (_, res) => {
    try {
        const documents = await pdfService.loadAndIndexAllPDFs();
        
        if (documents.length === 0) {
            return res.json({
                message: 'Aucun fichier PDF trouvé dans corpus/pdf/'
            });
        }

        await indexerService.indexDocuments(documents);

        res.json({
            message: 'PDF réindexés avec succès',
            count: documents.length,
            documents: documents.map(d => d.title)
        });

    } catch (error) {
        console.error('❌ Erreur réindexation PDF:', error.message);
        res.status(500).json({
            error: 'Erreur serveur: impossible de réindexer les PDF'
        });
    }
});

export default router;
