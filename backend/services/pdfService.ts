/**
 * Service pour l'extraction de texte à partir de fichiers PDF
 * Utilise pdfjs-dist (version legacy) pour extraire le contenu textuel
 * Inclut le chunking automatique pour gérer les gros documents
 */

import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { pathToFileURL } from 'url';

// Import spécifique pour Node.js (version legacy)
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import chunkingService from './chunking.js';
import { appConfig } from '../config/runtime/appConfig.js';

const CORPUS_DIR = path.resolve('./corpus');
const PDF_DIR = path.join(CORPUS_DIR, 'pdf');
const MAX_CHUNK_TOKENS = appConfig.chunking.maxTokens; 
const DEFAULT_AUTHOR = appConfig.defaultDocumentAuthor;
const STANDARD_FONTS_PATH = path.resolve('node_modules/pdfjs-dist/standard_fonts/') + path.sep;
const STANDARD_FONTS_URL = pathToFileURL(STANDARD_FONTS_PATH).toString();

export class PDFService {
    constructor() {
        this.ensurePdfDir();
    }

    /**
     * Retourne le chemin du dossier PDF
     * @returns {string} Chemin du dossier PDF
     */
    getPdfDir() {
        return PDF_DIR;
    }

    /**
     * Crée le dossier PDF s'il n'existe pas
     */
    ensurePdfDir() {
        if (!fs.existsSync(PDF_DIR)) {
            fs.mkdirSync(PDF_DIR, { recursive: true });
            console.log(`📁 Dossier PDF créé: ${PDF_DIR}`);
        }
    }

    /**
     * Extrait le texte d'un fichier PDF
     * @param {string} filePath - Chemin vers le fichier PDF
     * @returns {Promise<string>} Texte extrait
     */
    async extractTextFromPDF(filePath) {
        try {
            // 1. Lire le fichier
            const dataBuffer = await fsPromises.readFile(filePath);
            
            // 2. Vérifier si c'est un vrai PDF binaire ou du texte
            // Les vrais PDF commencent par %PDF-
            const header = dataBuffer.subarray(0, 5).toString();
            
            if (header.startsWith('%PDF-')) {
                // C'est un vrai PDF binaire
                const uint8Array = new Uint8Array(dataBuffer);
                
                // 3. Charger le document PDF
                const loadingTask = getDocument({
                    data: uint8Array,
                    standardFontDataUrl: STANDARD_FONTS_URL,
                });
                const pdfDocument = await loadingTask.promise;

                let fullText = '';

                // 4. Extraire le texte de chaque page
                for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
                    const page = await pdfDocument.getPage(pageNum);
                    const textContent = await page.getTextContent();

                    // Concaténer les éléments de texte de la page
                    const pageText = textContent.items
                        .map(item => ('str' in item ? item.str : ''))
                        .join(' ');

                    fullText += pageText + '\n';
                }

                if (!fullText.trim()) {
                    throw new Error('Aucun texte trouvé dans le PDF');
                }

                return fullText.trim();
            } else {
                // Ce n'est pas un vrai PDF, c'est probablement du texte simple
                // Lire comme texte UTF-8
                return dataBuffer.toString('utf-8').trim();
            }

        } catch (error) {
            console.error(`❌ Erreur extraction PDF ${filePath}:`, error.message);
            throw error;
        }
    }

    /**
     * Génère un document à partir d'un PDF
     * @param {string} filePath - Chemin vers le fichier PDF
     * @param {string} fileName - Nom du fichier original
     * @returns {Promise<Object>} Document structuré
     */
    async generateDocumentFromPDF(filePath, fileName, sourceLabel = fileName) {
        try {
            const text = await this.extractTextFromPDF(filePath);
            const now = new Date();
            const date = now.toISOString().split('T')[0];

            return {
                title: `PDF: ${path.parse(fileName).name}`,
                author: DEFAULT_AUTHOR,
                date: date,
                category: "PDF",
                text: text,
                isChunked: false,
                source: sourceLabel,
                sourceFile: sourceLabel
            };

        } catch (error) {
            console.error(`❌ Erreur génération document PDF ${fileName}:`, error.message);
            throw error;
        }
    }

    /**
     * Estime le nombre de tokens dans un texte (approximation)
     * @param {string} text - Texte à évaluer
     * @returns {number} Estimation du nombre de tokens
     */
    estimateTokens(text) {
        // Approximation : 1 token ≈ 4 caractères en moyenne
        return Math.ceil(text.length / 4);
    }

    /**
     * Divise un document PDF en chunks si nécessaire
     * Utilise une stratégie par phrases pour éviter les problèmes de mémoire
     * @param {Object} document - Document PDF
     * @param {string} fileName - Nom du fichier original
     * @returns {Array<Object>} Tableau de documents (1 ou plusieurs chunks)
     */
    chunkDocumentIfNeeded(document, sourceLabel) {
        const estimatedTokens = chunkingService.estimateTokens(document.text);
        
        // Si le document est sous la limite, pas besoin de chunker
        if (estimatedTokens <= MAX_CHUNK_TOKENS) {
            console.log(`   └─ Tokens estimés: ${estimatedTokens} (OK)`);
            document.isChunked = false;
            return [document];
        }

        console.log(`   └─ Tokens estimés: ${estimatedTokens} - Chunking en cours...`);
        
        // Utiliser le ChunkingService optimisé pour RAG
        const chunks = chunkingService.chunkByTokens(
            document.text, 
            MAX_CHUNK_TOKENS, 
            50 // overlap
        );
        
        const chunkDocuments = chunks.map((chunkText, index) => ({
            title: `${document.title} [Partie ${index + 1}/${chunks.length}]`,
            author: document.author,
            date: document.date,
            category: document.category,
            text: chunkText,
            source: `${sourceLabel}#chunk_${index + 1}`,
            sourceFile: sourceLabel,
            isChunked: true,
            chunkIndex: index + 1,
            totalChunks: chunks.length,
            metadata: {
                originalLength: document.text.length,
                chunkLength: chunkText.length,
                estimatedTokens: chunkingService.estimateTokens(chunkText)
            }
        }));

        console.log(`   └─ Document divisé en ${chunks.length} chunks`);
        return chunkDocuments;
    }

    /**
     * Liste les fichiers PDF disponibles
     * @returns {Promise<Array>} Liste des fichiers PDF
     */
    resolvePdfDir(subdir = '') {
        const raw = String(subdir || '');
        const normalized = raw
            .replace(/^[\\/]+/, '')
            .replace(/^pdf[\\/]/i, '');
        console.log(`🧭 resolvePdfDir raw="${raw}" normalized="${normalized}"`);
        const resolved = path.resolve(PDF_DIR, normalized);
        const base = path.resolve(PDF_DIR) + path.sep;
        if (resolved !== path.resolve(PDF_DIR) && !resolved.startsWith(base)) {
            throw new Error('Chemin PDF invalide');
        }
        return resolved;
    }

    async listPDFFiles(subdir = '') {
        try {
            const dirPath = this.resolvePdfDir(subdir);
            if (!fs.existsSync(dirPath)) return [];

            const files = await fsPromises.readdir(dirPath);
            return files
                .filter(file => file.toLowerCase().endsWith('.pdf'))
                .sort();
        } catch {
            return [];
        }
    }

    /**
     * Charge et indexe tous les PDF du dossier
     * Applique automatiquement le chunking si nécessaire
     * @returns {Promise<Array>} Liste des documents générés (potentiellement chunked)
     */
    async loadAndIndexAllPDFs({ subdir = '' } = {}) {
        const files = await this.listPDFFiles(subdir);
        const documents = [];

        for (const file of files) {
            try {
                const dirPath = this.resolvePdfDir(subdir);
                const filePath = path.join(dirPath, file);
                const sourceLabel = subdir ? path.join(subdir, file) : file;
                const document = await this.generateDocumentFromPDF(filePath, file, sourceLabel);
                
                // Appliquer le chunking si nécessaire
                const chunkedDocs = this.chunkDocumentIfNeeded(document, sourceLabel);
                documents.push(...chunkedDocs);
                
                console.log(`✅ PDF traité: ${file}${chunkedDocs.length > 1 ? ` (${chunkedDocs.length} chunks)` : ''}`);
            } catch (error) {
                console.error(`❌ Échec traitement ${file}:`, error.message);
            }
        }

        return documents;
    }

    async listPDFFilesRecursive(subdir = '') {
        const baseDir = this.resolvePdfDir('');
        const rootDir = this.resolvePdfDir(subdir);
        const results = [];

        const walk = async (currentDir) => {
            const entries = await fsPromises.readdir(currentDir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(currentDir, entry.name);
                if (entry.isDirectory()) {
                    await walk(fullPath);
                } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
                    const relativePath = path.relative(baseDir, fullPath);
                    results.push({ fullPath, relativePath });
                }
            }
        };

        if (!fs.existsSync(rootDir)) {
            return [];
        }

        await walk(rootDir);
        return results;
    }

    async loadAndIndexAllPDFsRecursive({ subdir = '' } = {}) {
        const files = await this.listPDFFilesRecursive(subdir);
        const documents = [];

        for (const file of files) {
            try {
                const fileName = path.basename(file.fullPath);
                const document = await this.generateDocumentFromPDF(
                    file.fullPath,
                    fileName,
                    file.relativePath
                );

                const chunkedDocs = this.chunkDocumentIfNeeded(document, file.relativePath);
                documents.push(...chunkedDocs);
                console.log(`✅ PDF traité: ${file.relativePath}${chunkedDocs.length > 1 ? ` (${chunkedDocs.length} chunks)` : ''}`);
            } catch (error) {
                console.error(`❌ Échec traitement ${file.relativePath}:`, error.message);
            }
        }

        return documents;
    }

    /**
     * Traite un fichier PDF spécifique
     * @param {string} fileName - Nom du fichier PDF
     * @returns {Promise<Object>} Document généré
     */
    async processSpecificPDF(fileName) {
        try {
            const filePath = path.join(PDF_DIR, fileName);
            
            // Vérifier si le fichier existe
            if (!fs.existsSync(filePath)) {
                throw new Error(`Fichier non trouvé: ${fileName}`);
            }

            const document = await this.generateDocumentFromPDF(filePath, fileName);
            console.log(`✅ PDF traité: ${fileName}`);
            
            return document;

        } catch (error) {
            console.error(`❌ Échec traitement ${fileName}:`, error.message);
            throw error;
        }
    }

    /**
     * Vérifie si un fichier PDF a déjà été indexé
     */
    async isPDFAlreadyIndexed(fileName) {
        return false;
    }
}

export const pdfService = new PDFService();
