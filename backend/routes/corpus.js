import express from 'express';
import multer from 'multer';
import { corpusService } from '../services/corpus.js';
import { indexerService } from '../services/indexer.js';

const router = express.Router();

/**
 * Route GET /corpus - Liste les fichiers Excel disponibles
 */
router.get('/corpus', async (_, res) => {
    try {
        const files = await corpusService.listExcelFiles();
        const items = files.map(name => ({
            name,
            url: `/corpus/excel/${encodeURIComponent(name)}`,
        }));
        res.json({ files: items });
    } catch (error) {
        console.error('❌ Erreur dans GET /corpus:', error.message);
        res.status(500).json({
            error: 'Erreur serveur: impossible de lister les fichiers Excel',
        });
    }
});

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, callback) => {
            let destination;

            try {
                destination = corpusService.resolveDestination(file.originalname);
                file.corpusType = destination.type;
            } catch (error) {
                return callback(error);
            }

            corpusService.ensureDirForType(destination.type)
                .then(() => callback(null, destination.dir))
                .catch(callback);
        },
        filename: (_, file, callback) => {
            callback(null, file.originalname);
        }
    }),
    fileFilter: (_, file, callback) => {
        try {
            corpusService.detectFileType(file.originalname);
            callback(null, true);
        } catch (error) {
            callback(error);
        }
    }
});

/**
 * Route POST /corpus/upload - Upload d'un fichier Excel
 */
router.post('/corpus/upload', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier reçu' });
    }

    try {
        await corpusService.ensureReadable(req.file.path);
        const fileType = req.file.corpusType || corpusService.detectFileType(req.file.originalname);
        let summary = null;

        if (fileType === 'excel') {
            summary = await indexerService.indexExcelFile(req.file.filename);
        } else if (fileType === 'json') {
            summary = await indexerService.indexJsonFile(req.file.filename);
        } else if (fileType === 'pdf') {
            summary = await indexerService.indexPdfFile(req.file.filename);
        }

        res.status(201).json({
            message: 'Fichier reçu et traité',
            type: fileType,
            file: {
                name: req.file.filename,
                url: `/corpus/${fileType}/${encodeURIComponent(req.file.filename)}`,
            },
            indexed: summary?.indexed ?? null,
        });
    } catch (error) {
        console.error('❌ Erreur lors du traitement du fichier:', error.message);
        const status = error.statusCode || 500;
        res.status(status).json({
            error: status >= 500
                ? 'Erreur serveur: impossible de traiter le fichier'
                : error.message,
        });
    }
});

export default router;
