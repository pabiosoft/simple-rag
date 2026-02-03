import fs from 'fs/promises';
import path from 'path';
import { createWorker } from 'tesseract.js';

const IMAGE_DIR = path.resolve('./corpus/images');
const SUPPORTED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.bmp', '.tiff', '.webp']);

class OCRService {
    constructor() {
        this.imageDir = IMAGE_DIR;
        this.worker = null;
    }

    /**
     * Initialiser le worker Tesseract
     * @returns {Promise<void>}
     */
    async initializeWorker() {
        if (!this.worker) {
            this.worker = await createWorker();
            console.log('✅ Worker Tesseract initialisé');
        }
    }

    /**
     * Traite une image unique avec OCR
     * @param {string} imagePath - Chemin vers l'image
     * @returns {Promise<string>} Texte extrait
     */
    async extractTextFromImage(imagePath) {
        console.log(`🔍 Extraction OCR de: ${imagePath}`);
        
        try {
            await this.initializeWorker();
            
            const result = await this.worker.recognize(imagePath);
            const text = result.data.text;
            
            console.log(`✅ OCR complété - ${text.length} caractères extraits`);
            return text;
        } catch (error) {
            console.error(`❌ Erreur OCR pour ${imagePath}:`, error);
            throw error;
        }
    }

    /**
     * Traite toutes les images du répertoire corpus/images
     * @returns {Promise<Object>} Map des chemins vers le texte extrait
     */
    async extractTextFromAllImages() {
        console.log('🔄 Début de l\'extraction OCR pour toutes les images...');
        
        try {
            await this.initializeWorker();
            
            const files = await fs.readdir(this.imageDir);
            const imageFiles = files.filter(file => 
                SUPPORTED_IMAGE_EXTENSIONS.has(path.extname(file).toLowerCase())
            );

            const results = {};

            for (const file of imageFiles) {
                const imagePath = path.join(this.imageDir, file);
                try {
                    const text = await this.extractTextFromImage(imagePath);
                    results[file] = text;
                } catch (error) {
                    console.error(`❌ Erreur lors du traitement de ${file}`);
                    results[file] = '';
                }
            }

            console.log(`✅ Extraction OCR terminée - ${Object.keys(results).length} images traitées`);
            return results;
        } catch (error) {
            console.error('❌ Erreur lors de l\'extraction OCR:', error);
            throw error;
        }
    }

    /**
     * Libère les ressources du worker
     * @returns {Promise<void>}
     */
    async terminate() {
        if (this.worker) {
            await this.worker.terminate();
            this.worker = null;
            console.log('✅ Worker Tesseract terminé');
        }
    }
}

export default new OCRService();
