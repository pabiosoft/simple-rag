import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import XLSX from 'xlsx';
import { qdrant, openai, COLLECTION_NAME } from '../config/database.js';
import { PDFService } from './pdfService.js';

const CORPUS_DIR = path.resolve('./corpus');
const EXCEL_DIR = path.join(CORPUS_DIR, 'excel');
const EXCEL_SPEC_FILE = path.join(EXCEL_DIR, 'spec-owner.json');
const SUPPORTED_EXCEL_EXTENSIONS = new Set(['.xlsx', '.xls']);

function normalizeValue(value) {
    if (value === undefined || value === null) {
        return '';
    }
    if (typeof value === 'string') {
        return value.trim();
    }
    if (value instanceof Date) {
        return value.toISOString().split('T')[0];
    }
    return String(value).trim();
}

function pickValue(row, keys, fallback = '') {
    for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(row, key)) {
            const normalized = normalizeValue(row[key]);
            if (normalized) {
                return normalized;
            }
        }
    }
    return fallback;
}

function normalizeTagsInput(value) {
    if (!value) {
        return [];
    }
    if (Array.isArray(value)) {
        return value.map(normalizeValue).filter(Boolean);
    }
    if (typeof value === 'string') {
        return value
            .split(',')
            .map(tag => tag.trim())
            .filter(Boolean);
    }
    const normalized = normalizeValue(value);
    return normalized ? [normalized] : [];
}

function extractTags(row, fallback = []) {
    const tagKeys = ['tags', 'Tags', 'tag', 'Tag'];
    for (const key of tagKeys) {
        if (!Object.prototype.hasOwnProperty.call(row, key)) {
            continue;
        }
        const normalized = normalizeTagsInput(row[key]);
        return normalized.length > 0 ? normalized : fallback;
    }
    return fallback;
}

function buildExcelDocument(row, context) {
    const textChunks = [];

    for (const [key, value] of Object.entries(row)) {
        if (!key) {
            continue;
        }

        const lowerKey = key.toLowerCase();
        if ([
            'title',
            'author',
            'date',
            'category',
            'tags',
            'tag'
        ].includes(lowerKey)) {
            continue;
        }

        const normalized = normalizeValue(value);
        if (!normalized) {
            continue;
        }

        textChunks.push(`${key}: ${normalized}`);
    }

    const text = textChunks.join('\n').trim();

    if (!text) {
        return null;
    }

    const title = pickValue(row, ['title', 'Title'], context.title);
    const author = pickValue(row, ['author', 'Author'], context.author || 'Anonyme');
    const date = pickValue(row, ['date', 'Date'], context.date || 'Non précisée');
    const category = pickValue(row, ['category', 'Category'], context.category || 'Divers');
    const tags = Array.from(new Set([
        ...context.tags,
        ...extractTags(row)
    ]));

    return {
        title,
        author,
        date,
        category,
        text,
        tags,
        source: context.source,
        sourceFile: context.sourceFile,
    };
}

function normalizeMetadataEntry(entry = {}) {
    return {
        title: entry.title ? normalizeValue(entry.title) : '',
        author: entry.author ? normalizeValue(entry.author) : '',
        date: entry.date ? normalizeValue(entry.date) : '',
        category: entry.category ? normalizeValue(entry.category) : '',
        tags: normalizeTagsInput(entry.tags),
    };
}

function normalizeMetadataMap(map = {}) {
    const result = {};
    for (const [key, value] of Object.entries(map)) {
        if (value && typeof value === 'object') {
            result[key] = normalizeMetadataEntry(value);
        }
    }
    return result;
}

function loadExcelMetadata() {
    const defaults = {
        defaults: {},
        files: {},
        sheets: {},
    };

    if (!fs.existsSync(EXCEL_SPEC_FILE)) {
        return defaults;
    }

    try {
        const raw = fs.readFileSync(EXCEL_SPEC_FILE, 'utf-8');
        const data = JSON.parse(raw);

        if (!data || typeof data !== 'object') {
            return defaults;
        }

        if (data.defaults || data.files || data.sheets) {
            return {
                defaults: normalizeMetadataEntry(data.defaults || {}),
                files: normalizeMetadataMap(data.files || {}),
                sheets: normalizeMetadataMap(data.sheets || {}),
            };
        }

        return {
            defaults: normalizeMetadataEntry(data),
            files: {},
            sheets: {},
        };
    } catch (error) {
        console.error('❌ Impossible de lire spec-owner.json :', error.message);
        return defaults;
    }
}

function resolveExcelMetadata(metadata, file, sheet) {
    const fileMeta = metadata.files[file] || {};
    const sheetKey = `${file}#${sheet}`;
    const sheetMeta = metadata.sheets[sheetKey]
        || metadata.sheets[sheet]
        || {};

    return {
        title: sheetMeta.title || fileMeta.title || metadata.defaults.title || '',
        author: sheetMeta.author || fileMeta.author || metadata.defaults.author || '',
        date: sheetMeta.date || fileMeta.date || metadata.defaults.date || '',
        category: sheetMeta.category || fileMeta.category || metadata.defaults.category || '',
        tags: normalizeTagsInput([
            ...(metadata.defaults.tags || []),
            ...(fileMeta.tags || []),
            ...(sheetMeta.tags || []),
        ].flat()),
    };
}

class IndexerService {
    async ensureCollection({ purge = false } = {}) {
        try {
            const collection = await qdrant.getCollection(COLLECTION_NAME);

            if (purge && collection.points_count > 0) {
                console.log(`🗑️ Suppression de ${collection.points_count} points existants...`);
                await qdrant.delete(COLLECTION_NAME, {
                    wait: true,
                    filter: {},
                });
                console.log('✅ Collection vidée avec succès');
            }
        } catch (err) {
            console.log(`📚 Création de la collection "${COLLECTION_NAME}"...`);
            await qdrant.createCollection(COLLECTION_NAME, {
                vectors: {
                    size: 1536,
                    distance: 'Cosine',
                },
            });
            console.log(`✅ Collection "${COLLECTION_NAME}" créée`);
        }
    }

    async listJsonFiles() {
        if (!fs.existsSync(CORPUS_DIR)) {
            return [];
        }

        return fs.readdirSync(CORPUS_DIR).filter(file => file.endsWith('.json'));
    }

    async loadJsonDocuments() {
        const files = await this.listJsonFiles();
        const documents = [];

        for (const file of files) {
            const filePath = path.join(CORPUS_DIR, file);

            try {
                const rawData = fs.readFileSync(filePath, 'utf-8');
                const doc = JSON.parse(rawData);

                if (!doc.text || typeof doc.text !== 'string' || !doc.text.trim()) {
                    console.warn(`⚠️ Skipping ${file} - champ "text" manquant ou vide.`);
                    continue;
                }

                documents.push({
                    title: doc.title || 'Inconnu',
                    author: doc.author || 'Anonyme',
                    date: doc.date || 'Non précisée',
                    category: doc.category || 'Divers',
                    text: doc.text,
                    tags: Array.isArray(doc.tags) ? doc.tags : [],
                    source: file,
                    sourceFile: file,
                });
            } catch (error) {
                console.error(`❌ Erreur de lecture pour ${file}:`, error.message);
            }
        }

        return documents;
    }

    /**
     * Charge et indexe tous les documents PDF
     * @returns {Promise<Array>} Documents générés à partir des PDF
     */
    async loadPDFDocuments() {
        try {
            return await new PDFService().loadAndIndexAllPDFs();
        } catch (error) {
            console.error('❌ Erreur chargement PDF:', error.message);
            return [];
        }
    }

    async loadExcelDocuments() {
        if (!fs.existsSync(EXCEL_DIR)) {
            return [];
        }

        const entries = fs.readdirSync(EXCEL_DIR).filter(file =>
            SUPPORTED_EXCEL_EXTENSIONS.has(path.extname(file).toLowerCase())
        );

        const documents = [];
        const metadata = loadExcelMetadata();

        for (const file of entries) {
            const docsFromFile = await this.loadExcelDocumentsFromFile(file, metadata);
            documents.push(...docsFromFile);
        }

        return documents;
    }

    async loadExcelDocumentsFromFile(file, metadata = loadExcelMetadata()) {
        const filePath = path.join(EXCEL_DIR, file);

        const workbook = XLSX.readFile(filePath, { cellDates: true });
        const fileStat = fs.statSync(filePath);
        const fileDateIso = fileStat.mtime.toISOString().split('T')[0];

        const documents = [];

        workbook.SheetNames.forEach(sheetName => {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) {
                return;
            }

            const rows = XLSX.utils.sheet_to_json(sheet, {
                defval: '',
                raw: false,
            });

            if (rows.length === 0) {
                console.log(`⚠️ Feuille "${sheetName}" vide dans ${file}, ignorée.`);
                return;
            }

            rows.forEach((row, index) => {
                const resolved = resolveExcelMetadata(metadata, file, sheetName);
                const metaTags = normalizeTagsInput(resolved.tags);
                const baseTitle = resolved.title
                    ? `${resolved.title} ${index + 1}`
                    : `${path.parse(file).name} - ${sheetName} ${index + 1}`;

                const context = {
                    title: baseTitle,
                    author: resolved.author || 'Equipe dashlab',
                    date: resolved.date || fileDateIso,
                    category: resolved.category || sheetName,
                    tags: Array.from(new Set([
                        sheetName,
                        ...metaTags,
                    ])),
                    source: `${file}#${sheetName}#${index + 2}`,
                    sourceFile: file,
                };

                const document = buildExcelDocument(row, context);

                if (!document) {
                    console.log(`⚠️ Ligne ${index + 2} (feuille "${sheetName}" dans ${file}) ignorée : aucune donnée exploitable.`);
                    return;
                }

                documents.push(document);
            });
        });

        return documents;
    }

    async indexDocuments(documents) {
        for (const doc of documents) {
            try {
                console.log(`🔄 Indexation de ${doc.source}...`);

                const embedding = await openai.embeddings.create({
                    model: 'text-embedding-ada-002',
                    input: doc.text,
                });

                const vector = embedding.data[0].embedding;
                const id = randomUUID();

                const point = {
                    id,
                    vector,
                    payload: {
                        text: doc.text,
                        title: doc.title,
                        author: doc.author,
                        date: doc.date,
                        category: doc.category,
                        tags: doc.tags,
                        source: doc.source,
                        source_file: doc.sourceFile,
                    },
                };

                await qdrant.upsert(COLLECTION_NAME, {
                    wait: true,
                    points: [point],
                });

                console.log(`✅ ${doc.source} indexé avec succès`);
            } catch (error) {
                console.error(`❌ Erreur lors de l'indexation de ${doc.source} :`, error?.response?.data || error.message);
            }
        }
    }

    async removeDocumentsBySourceFile(sourceFile) {
        await qdrant.delete(COLLECTION_NAME, {
            wait: true,
            filter: {
                must: [
                    {
                        key: 'source_file',
                        match: { value: sourceFile },
                    },
                ],
            },
        });
    }

    async reindexCorpus() {
        await this.ensureCollection({ purge: true });

        console.log('📂 Lecture du corpus (JSON + PDF + Excel)...');

        const documents = [
            ...(await this.loadJsonDocuments()),
            ...(await this.loadPDFDocuments()),
            ...(await this.loadExcelDocuments()),
        ];

        if (documents.length === 0) {
            console.log('⚠️ Aucun document indexable trouvé dans corpus/.');
            return;
        }

        await this.indexDocuments(documents);

        console.log('🏁 Indexation terminée.');
    }

    async indexExcelFile(fileName) {
        const extension = path.extname(fileName).toLowerCase();
        if (!SUPPORTED_EXCEL_EXTENSIONS.has(extension)) {
            const error = new Error('Format de fichier non supporté');
            error.statusCode = 400;
            throw error;
        }

        const filePath = path.join(EXCEL_DIR, fileName);
        if (!fs.existsSync(filePath)) {
            const error = new Error('Fichier introuvable dans corpus/excel');
            error.statusCode = 404;
            throw error;
        }

        await this.ensureCollection({ purge: false });

        const metadata = loadExcelMetadata();
        const documents = await this.loadExcelDocumentsFromFile(fileName, metadata);

        if (documents.length === 0) {
            return { indexed: 0 };
        }

        console.log(`♻️ Ré-indexation ciblée pour ${fileName} (${documents.length} document(s))`);

        await this.removeDocumentsBySourceFile(fileName);
        await this.indexDocuments(documents);

        return { indexed: documents.length };
    }
}

export const indexerService = new IndexerService();
