import { qdrant, COLLECTION_NAME } from '../config/runtime/database.js';
import { appConfig } from '../config/runtime/appConfig.js';

/**
 * Service pour les opérations vectorielles avec Qdrant
 */
export class VectorService {
    /**
     * Vérifie la connexion à Qdrant
     */
    async checkConnection() {
        try {
            await qdrant.getCollections();
            console.log('🟢 Qdrant connecté');
            return true;
        } catch (err) {
            console.error('❌ Erreur Qdrant:', err.message);
            return false;
        }
    }

    /**
     * Recherche sémantique dans la collection
     * @param {number[]} vector - Vecteur de recherche
     * @param {number} limit - Nombre de résultats
     * @param {number} scoreThreshold - Seuil de pertinence
     * @returns {Promise<Array>} Résultats de recherche
     */
    async search(vector, limit = 3, scoreThreshold = appConfig.minScore) {
        try {
            const results = await qdrant.search(COLLECTION_NAME, {
                vector,
                limit,
                with_payload: true,
                score_threshold: scoreThreshold
            });
            return results;
        } catch (err) {
            console.error('❌ Erreur de recherche vectorielle:', err.message);
            throw err;
        }
    }

    /**
     * Calcule un seuil adaptatif selon la longueur de la question
     * @param {string} question - Question analysée
     * @returns {number} Seuil de pertinence
     */
    getAdaptiveThreshold(question) {
        const wordCount = question.split(/\s+/).filter(Boolean).length;

        if (wordCount <= 3) return Math.max(0.5, appConfig.minScore - 0.1); // questions très courtes
        if (wordCount <= 6) return Math.max(0.55, appConfig.minScore - 0.05);
        if (wordCount <= 12) return appConfig.minScore;
        return Math.min(0.85, appConfig.minScore + 0.05);
    }
}

export const vectorService = new VectorService();
