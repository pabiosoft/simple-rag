/**
 * Service de chunking pour diviser les grands fichiers en fragments
 * Optimisé pour les embeddings et la recherche RAG
 */

class ChunkingService {
    constructor(chunkSize = 500, overlap = 50) {
        this.chunkSize = chunkSize; // Nombre de tokens/mots par chunk
        this.overlap = overlap;     // Chevauchement entre les chunks
    }

    /**
     * Divise un texte en chunks avec chevauchement
     * @param {string} text - Texte à diviser
     * @param {number} chunkSize - Taille du chunk (défaut: this.chunkSize)
     * @param {number} overlap - Chevauchement (défaut: this.overlap)
     * @returns {Array<string>} Tableau de chunks
     */
    chunkText(text, chunkSize = this.chunkSize, overlap = this.overlap) {
        if (!text || typeof text !== 'string') {
            throw new Error('Le texte doit être une chaîne non vide');
        }

        const words = text.split(/\s+/);
        const chunks = [];
        let start = 0;

        while (start < words.length) {
            const end = Math.min(start + chunkSize, words.length);
            const chunk = words.slice(start, end).join(' ');
            chunks.push(chunk);
            
            // Avancer avec chevauchement
            start = end - overlap;
            if (start < 0) start = 0;
        }

        console.log(`📦 Texte divisé en ${chunks.length} chunks`);
        return chunks;
    }

    /**
     * Divise un texte en chunks basés sur les caractères
     * Utile pour les PDFs et documents structurés
     * @param {string} text - Texte à diviser
     * @param {number} charSize - Nombre de caractères par chunk
     * @param {number} overlap - Chevauchement en caractères
     * @returns {Array<string>} Tableau de chunks
     */
    chunkByCharacters(text, charSize = 2000, overlap = 200) {
        if (!text || typeof text !== 'string') {
            throw new Error('Le texte doit être une chaîne non vide');
        }

        const chunks = [];
        let start = 0;

        while (start < text.length) {
            const end = Math.min(start + charSize, text.length);
            const chunk = text.substring(start, end);
            chunks.push(chunk);
            
            // Avancer avec chevauchement
            start = end - overlap;
            if (start < 0) start = 0;
        }

        console.log(`📦 Texte divisé en ${chunks.length} chunks (par caractères)`);
        return chunks;
    }

    /**
     * Divise un texte en chunks basés sur les paragraphes
     * Préserve la structure du document
     * @param {string} text - Texte à diviser
     * @param {number} paragraphsPerChunk - Nombre de paragraphes par chunk
     * @returns {Array<string>} Tableau de chunks
     */
    chunkByParagraphs(text, paragraphsPerChunk = 3) {
        if (!text || typeof text !== 'string') {
            throw new Error('Le texte doit être une chaîne non vide');
        }

        // Séparer par paragraphes (double saut de ligne ou point final)
        const paragraphs = text.split(/\n\n+|(?<=[.!?])\s+/);
        const chunks = [];

        for (let i = 0; i < paragraphs.length; i += paragraphsPerChunk) {
            const chunk = paragraphs
                .slice(i, i + paragraphsPerChunk)
                .join('\n\n')
                .trim();
            
            if (chunk.length > 0) {
                chunks.push(chunk);
            }
        }

        console.log(`📦 Texte divisé en ${chunks.length} chunks (par paragraphes)`);
        return chunks;
    }

    /**
     * Divise un tableau de documents
     * @param {Array<{id: string, content: string}>} documents - Documents à chunker
     * @param {string} strategy - Stratégie: 'words', 'characters', 'paragraphs'
     * @returns {Array<{id: string, chunkIndex: number, content: string}>} Chunks avec métadonnées
     */
    chunkDocuments(documents, strategy = 'words') {
        const chunkedDocs = [];

        for (const doc of documents) {
            let chunks = [];
            
            switch (strategy) {
                case 'characters':
                    chunks = this.chunkByCharacters(doc.content);
                    break;
                case 'paragraphs':
                    chunks = this.chunkByParagraphs(doc.content);
                    break;
                case 'words':
                default:
                    chunks = this.chunkText(doc.content);
            }

            chunks.forEach((content, chunkIndex) => {
                chunkedDocs.push({
                    id: `${doc.id}_chunk_${chunkIndex}`,
                    originalDocId: doc.id,
                    chunkIndex,
                    totalChunks: chunks.length,
                    content,
                });
            });
        }

        console.log(`✅ ${documents.length} document(s) divisé(s) en ${chunkedDocs.length} chunk(s)`);
        return chunkedDocs;
    }

    /**
     * Calcule les statistiques des chunks
     * @param {Array<string>} chunks - Tableau de chunks
     * @returns {Object} Statistiques
     */
    getChunkStatistics(chunks) {
        const sizes = chunks.map(chunk => chunk.length);
        const words = chunks.map(chunk => chunk.split(/\s+/).length);

        return {
            totalChunks: chunks.length,
            avgChunkSize: (sizes.reduce((a, b) => a + b, 0) / chunks.length).toFixed(2),
            minChunkSize: Math.min(...sizes),
            maxChunkSize: Math.max(...sizes),
            avgWords: (words.reduce((a, b) => a + b, 0) / chunks.length).toFixed(2),
            minWords: Math.min(...words),
            maxWords: Math.max(...words),
        };
    }
}

export default new ChunkingService();
