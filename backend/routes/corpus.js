import express from 'express';
import multer from 'multer';
import { corpusService } from '../services/corpus.js';
import { indexerService } from '../services/indexer.js';
import { pdfService } from '../services/pdfService.js';
import path from 'path';
import fs from 'fs';
import fsPromises from 'fs/promises';

const router = express.Router();

const CORPUS_DIR = path.resolve('./corpus');
const SUPPORTED_EXTENSIONS = new Set(['.xlsx', '.xls', '.pdf', '.json']);
const SUPPORTED_TYPES = new Set(['excel', 'pdf', 'json']);

function sanitizeSubdir(value = '') {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    if (trimmed.includes('..')) return '';
    return trimmed.replace(/^\/+|\/+$/g, '');
}

function resolveSafeSubdir(baseDir, subdir) {
    if (!subdir) return baseDir;
    const resolved = path.resolve(baseDir, subdir);
    const base = path.resolve(baseDir) + path.sep;
    if (!resolved.startsWith(base)) {
        throw new Error('Sous-dossier invalide');
    }
    return resolved;
}

function inferTypeFromExtension(ext) {
    if (ext === '.pdf') return 'pdf';
    if (ext === '.xls' || ext === '.xlsx') return 'excel';
    if (ext === '.json') return 'json';
    return null;
}

function resolveUploadBase(type) {
    switch (type) {
        case 'pdf':
            return pdfService.getPdfDir();
        case 'excel':
            return corpusService.getExcelDir();
        case 'json':
            return CORPUS_DIR;
        default:
            return CORPUS_DIR;
    }
}

function ensureDirSync(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

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


const TEMP_UPLOAD_DIR = path.resolve(CORPUS_DIR, '_uploads');
ensureDirSync(TEMP_UPLOAD_DIR);

const universalUpload = multer({
    dest: TEMP_UPLOAD_DIR,
});

/**
 * Route POST /corpus/upload/universal - Upload multi-format (PDF/Excel/JSON)
 * Champs attendus (multipart/form-data):
 * - file: le fichier à uploader
 * - type (optionnel): pdf | excel | json
 * - subdir / folder (optionnel): sous-dossier dans le type choisi
 */
router.post('/corpus/upload/universal', universalUpload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Aucun fichier reçu ou format invalide' });
    }

    try {
        const ext = path.extname(req.file.originalname).toLowerCase();
        const inferredType = inferTypeFromExtension(ext);
        const requestedType = String(req.body?.type || '').trim().toLowerCase();
        const uploadType = SUPPORTED_TYPES.has(requestedType) ? requestedType : inferredType;

        if (!uploadType) {
            return res.status(400).json({ error: 'Type de fichier non supporté' });
        }

        const subdir = sanitizeSubdir(req.body?.subdir || req.body?.folder || '');
        const baseDir = resolveUploadBase(uploadType);
        const targetDir = resolveSafeSubdir(baseDir, subdir);
        ensureDirSync(targetDir);

        const targetPath = path.join(targetDir, req.file.originalname);
        await fsPromises.rename(req.file.path, targetPath);

        if (uploadType === 'excel') {
            const summary = await indexerService.indexExcelFile(req.file.originalname);
            return res.status(201).json({
                message: 'Fichier Excel reçu et indexé',
                file: {
                    name: req.file.originalname,
                    path: targetPath,
                },
                indexed: summary.indexed,
            });
        }

        if (uploadType === 'pdf') {
            const sourceLabel = subdir
                ? path.join(subdir, req.file.originalname)
                : req.file.originalname;

            const document = await pdfService.generateDocumentFromPDF(
                targetPath,
                req.file.originalname,
                sourceLabel
            );

            await indexerService.indexDocuments([document]);

            return res.status(201).json({
                message: 'Fichier PDF reçu et indexé',
                file: {
                    name: req.file.originalname,
                    path: targetPath,
                },
                document: {
                    title: document.title,
                    category: document.category,
                    date: document.date
                }
            });
        }

        return res.status(201).json({
            message: 'Fichier JSON reçu',
            file: {
                name: req.file.originalname,
                path: targetPath,
            }
        });
    } catch (error) {
        console.error('❌ Erreur upload universal:', error.message);
        const status = error.statusCode || 500;
        res.status(status).json({
            error: status >= 500
                ? 'Erreur serveur: impossible de traiter le fichier'
                : error.message,
        });
    }
});

export default router;
