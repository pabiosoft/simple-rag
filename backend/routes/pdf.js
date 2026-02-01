/**
 * Routes pour la gestion des fichiers PDF
 * Upload et traitement des fichiers PDF
 */

import express from 'express';
import multer from 'multer';
import fs from 'fs';
import { pdfService } from '../services/pdfService.js';
import { indexerService } from '../services/indexer.js';

const router = express.Router();

// Configuration de Multer pour l'upload de PDF
const upload = multer({
    storage: multer.diskStorage({
        destination: (_, __, callback) => {
            callback(null, pdfService.getPdfDir());
        },
        filename: (_, file, callback) => {
            // Conserver le nom original du fichier
            callback(null, file.originalname);
        }
    }),
    fileFilter: (_, file, callback) => {
        // Accepter uniquement les fichiers PDF
        if (file.mimetype === 'application/pdf' || 
            file.originalname.toLowerCase().endsWith('.pdf')) {
            callback(null, true);
        } else {
            callback(new Error('Seuls les fichiers PDF sont acceptés'), false);
        }
    }
});

/**
 * Route POST /pdf/upload - Upload d'un fichier PDF
 */
router.post('/pdf/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ 
            error: 'Aucun fichier PDF reçu ou format invalide' 
        });
    }

    try {
        console.log(`📄 Fichier PDF reçu: ${req.file.originalname}`);
        await fs.promises.chmod(req.file.path, 0o644);

        // Générer le document à partir du PDF
        const filePath = `${pdfService.getPdfDir()}/${req.file.originalname}`;
        const document = await pdfService.generateDocumentFromPDF(filePath, req.file.originalname);

        // Indexer le document immédiatement
        await indexerService.indexDocuments([document]);

        res.status(201).json({
            message: 'Fichier PDF uploadé et indexé avec succès',
            file: {
                name: req.file.originalname,
                size: req.file.size,
                path: `/pdf/${encodeURIComponent(req.file.originalname)}`
            },
            document: {
                title: document.title,
                category: document.category,
                date: document.date
            }
        });

    } catch (error) {
        console.error('❌ Erreur upload PDF:', error.message);
        res.status(500).json({
            error: 'Erreur serveur: impossible de traiter le fichier PDF',
            details: error.message
        });
    }
});

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
