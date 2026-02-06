/**
 * Service de chunking pour diviser les grands fichiers en fragments
 * Optimisé pour les embeddings et la recherche RAG
 */

import { appConfig } from '../config/runtime/appConfig.js';

class ChunkingService {
    chunkSize: number;
    overlap: number;
    MAX_TOKENS_PER_CHUNK: number;

    constructor(chunkSize = appConfig.chunking.size, overlap = appConfig.chunking.overlap) {
        this.chunkSize = Number(chunkSize) || 500; // Nombre de tokens par chunk
        this.overlap = Number(overlap) || 50;     // Chevauchement entre les chunks
        this.MAX_TOKENS_PER_CHUNK = appConfig.chunking.maxTokens; // Limite pour éviter l'erreur
    }

    /**
     * Estime le nombre de tokens dans un texte
     * @param {string} text - Texte à évaluer
     * @returns {number} Estimation du nombre de tokens
     */
    estimateTokens(text) {
        if (!text) return 0;
        // Approximation : 1 token ≈ 4 caractères en moyenne
        // Plus précis que text.length / 4
        const words = text.split(/\s+/).length;
        const chars = text.length;
        // Mix des deux méthodes pour une meilleure estimation
        return Math.ceil((words * 1.3 + chars / 4) / 2);
    }

    /**
     * Divise un texte en chunks basés sur les tokens
     * @param {string} text - Texte à diviser
     * @param {number} maxTokens - Maximum de tokens par chunk
     * @param {number} overlapTokens - Chevauchement en tokens
     * @returns {Array<string>} Tableau de chunks
     */
    chunkByTokens(text, maxTokens = this.MAX_TOKENS_PER_CHUNK, overlapTokens = this.overlap) {
        if (!text || typeof text !== 'string') {
            throw new Error('Le texte doit être une chaîne non vide');
        }

        // Diviser en phrases pour éviter de couper au milieu
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        const chunks = [];
        let currentChunk = '';
        let currentTokens = 0;

        for (const sentence of sentences) {
            const sentenceTokens = this.estimateTokens(sentence);
            
            // Si la phrase seule dépasse la limite, il faut la diviser
            if (sentenceTokens > maxTokens) {
                // Diviser la phrase trop longue en morceaux
                const subChunks = this.splitLongSentence(sentence, maxTokens);
                for (const subChunk of subChunks) {
                    this.addToChunk(chunks, subChunk, maxTokens, overlapTokens);
                }
            } else {
                this.addToChunk(chunks, sentence, maxTokens, overlapTokens);
            }
        }

        // Ajouter le dernier chunk s'il n'est pas vide
        if (currentChunk.trim() && chunks[chunks.length - 1] !== currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }

        console.log(`📦 Texte divisé en ${chunks.length} chunks (par tokens, max ${maxTokens} tokens)`);
        return chunks;
    }

    /**
     * Ajoute un texte au chunk courant ou crée un nouveau chunk
     * @private
     */
    addToChunk(chunks, text, maxTokens, overlapTokens) {
        const textTokens = this.estimateTokens(text);
        
        if (textTokens > maxTokens) {
            // Le texte est trop long même seul, on le divise
            const subChunks = this.splitLongSentence(text, maxTokens);
            for (const subChunk of subChunks) {
                this.addToChunk(chunks, subChunk, maxTokens, overlapTokens);
            }
        } else {
            // Ajouter au chunk courant ou créer un nouveau
            if (chunks.length === 0) {
                chunks.push(text);
            } else {
                const lastChunk = chunks[chunks.length - 1];
                const lastChunkTokens = this.estimateTokens(lastChunk);
                
                if (lastChunkTokens + textTokens <= maxTokens) {
                    // Fusionner avec le dernier chunk
                    chunks[chunks.length - 1] = lastChunk + ' ' + text;
                } else {
                    // Créer un nouveau chunk avec chevauchement
                    if (overlapTokens > 0 && lastChunkTokens > overlapTokens) {
                        // Garder la fin du dernier chunk comme chevauchement
                        const overlapText = this.extractOverlap(lastChunk, overlapTokens);
                        chunks.push(overlapText + ' ' + text);
                    } else {
                        chunks.push(text);
                    }
                }
            }
        }
    }

    /**
     * Divise une phrase trop longue
     * @private
     */
    splitLongSentence(sentence, maxTokens) {
        const words = sentence.split(/\s+/);
        const chunks = [];
        let currentChunk = '';
        let currentTokens = 0;

        for (const word of words) {
            const wordTokens = this.estimateTokens(word);
            
            if (currentTokens + wordTokens > maxTokens && currentChunk) {
                chunks.push(currentChunk.trim());
                currentChunk = word;
                currentTokens = wordTokens;
            } else {
                currentChunk += (currentChunk ? ' ' : '') + word;
                currentTokens += wordTokens;
            }
        }

        if (currentChunk.trim()) {
            chunks.push(currentChunk.trim());
        }

        return chunks;
    }

    /**
     * Extrait une partie d'un texte pour le chevauchement
     * @private
     */
    extractOverlap(text, targetTokens) {
        const words = text.split(/\s+/);
        let overlap = '';
        let overlapTokens = 0;
        
        // Prendre les derniers mots jusqu'à atteindre targetTokens
        for (let i = words.length - 1; i >= 0; i--) {
            const word = words[i];
            const wordTokens = this.estimateTokens(word);
            
            if (overlapTokens + wordTokens > targetTokens && overlap) {
                break;
            }
            
            overlap = word + (overlap ? ' ' + overlap : '');
            overlapTokens += wordTokens;
        }
        
        return overlap;
    }

    /**
     * Divise un texte en chunks basés sur les caractères
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
            // Trouver un bon point de coupure (fin de phrase)
            let end = Math.min(start + charSize, text.length);
            
            if (end < text.length) {
                // Chercher la fin de la phrase la plus proche
                const nextPeriod = text.indexOf('.', end - 100);
                const nextExclamation = text.indexOf('!', end - 100);
                const nextQuestion = text.indexOf('?', end - 100);
                const nextNewline = text.indexOf('\n', end - 100);
                
                const breakPoints = [
                    nextPeriod, nextExclamation, nextQuestion, nextNewline
                ].filter(pos => pos !== -1 && pos > end - 200 && pos < end + 100);
                
                if (breakPoints.length > 0) {
                    end = Math.min(...breakPoints) + 1;
                }
            }

            const chunk = text.substring(start, end).trim();
            if (chunk.length > 0) {
                chunks.push(chunk);
            }
            
            // Avancer avec chevauchement
            start = end - overlap;
            if (start < 0) start = 0;
            if (start >= text.length) break;
        }

        console.log(`📦 Texte divisé en ${chunks.length} chunks (par caractères, ${charSize} chars)`);
        return chunks;
    }

    /**
     * Divise un tableau de documents avec la stratégie optimisée pour RAG
     * @param {Array<Object>} documents - Documents à chunker
     * @param {string} strategy - 'tokens', 'characters', 'paragraphs'
     * @param {Object} options - Options de chunking
     * @returns {Array<Object>} Documents chunkés
     */
    chunkDocumentsForRAG(documents, strategy = 'tokens', options = {}) {
        const defaultOptions = {
            maxTokens: 1200,  // Limite sécuritaire pour RAG
            overlap: 100,
            maxDocuments: 5,  // Limiter le nombre de documents
            relevanceThreshold: 0.7
        };
        
        const config = { ...defaultOptions, ...options };
        const chunkedDocs = [];
        let docCount = 0;

        for (const doc of documents) {
            if (docCount >= config.maxDocuments) break;
            
            let chunks = [];
            switch (strategy) {
                case 'tokens':
                    chunks = this.chunkByTokens(doc.text || doc.content, config.maxTokens, config.overlap);
                    break;
                case 'characters':
                    chunks = this.chunkByCharacters(doc.text || doc.content, config.maxTokens * 4, config.overlap);
                    break;
                case 'paragraphs':
                    chunks = this.chunkByParagraphs(doc.text || doc.content);
                    break;
                default:
                    chunks = this.chunkByTokens(doc.text || doc.content, config.maxTokens, config.overlap);
            }

            chunks.forEach((content, chunkIndex) => {
                chunkedDocs.push({
                    id: `${doc.id || doc.title}_chunk_${chunkIndex}`,
                    originalDocId: doc.id || doc.title,
                    chunkIndex: chunkIndex + 1,
                    totalChunks: chunks.length,
                    content: content,
                    title: doc.title,
                    author: doc.author,
                    date: doc.date,
                    category: doc.category,
                    sourceFile: doc.sourceFile,
                    score: doc.score || 1.0,
                    metadata: {
                        ...doc.metadata,
                        isChunked: true,
                        chunkSize: this.estimateTokens(content),
                        strategy: strategy
                    }
                });
            });

            docCount++;
        }

        console.log(`✅ ${docCount} document(s) divisé(s) en ${chunkedDocs.length} chunk(s) pour RAG`);
        
        // Vérifier la taille totale des tokens
        const totalTokens = chunkedDocs.reduce((sum, chunk) => sum + this.estimateTokens(chunk.content), 0);
        console.log(`📊 Total tokens: ${totalTokens}`);
        
        if (totalTokens > 14000) {
            console.warn(`⚠️  Attention: ${totalTokens} tokens au total, proche de la limite de 16K`);
        }

        return chunkedDocs;
    }

    /**
     * Vérifie si un document doit être chunké
     * @param {Object} document - Document à vérifier
     * @param {number} maxTokens - Limite de tokens
     * @returns {boolean} True si besoin de chunking
     */
    needsChunking(document, maxTokens = 1500) {
        const content = document.text || document.content || '';
        return this.estimateTokens(content) > maxTokens;
    }

    /**
     * Divise un texte en chunks basés sur les paragraphes
     * @param {string} text - Texte à diviser
     * @param {number} paragraphsPerChunk - Nombre de paragraphes par chunk
     * @returns {Array<string>} Tableau de chunks
     */
    chunkByParagraphs(text, paragraphsPerChunk = 3) {
        if (!text || typeof text !== 'string') {
            throw new Error('Le texte doit être une chaîne non vide');
        }

        // Séparer par paragraphes
        const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
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

        console.log(`📦 Texte divisé en ${chunks.length} chunks (${paragraphsPerChunk} paragraphes/chunk)`);
        return chunks;
    }

    /**
     * Calcule les statistiques des chunks
     * @param {Array<Object>} chunks - Chunks à analyser
     * @returns {Object} Statistiques
     */
    getChunkStatistics(chunks) {
        const sizes = chunks.map(chunk => 
            this.estimateTokens(chunk.content || chunk.text || chunk)
        );
        const words = chunks.map(chunk => 
            (chunk.content || chunk.text || chunk).split(/\s+/).length
        );

        return {
            totalChunks: chunks.length,
            totalTokens: sizes.reduce((a, b) => a + b, 0),
            avgTokens: (sizes.reduce((a, b) => a + b, 0) / chunks.length).toFixed(2),
            minTokens: Math.min(...sizes),
            maxTokens: Math.max(...sizes),
            avgWords: (words.reduce((a, b) => a + b, 0) / chunks.length).toFixed(2),
            minWords: Math.min(...words),
            maxWords: Math.max(...words),
            warning: sizes.some(size => size > 1500) ? 'Certains chunks dépassent 1500 tokens' : 'OK'
        };
    }
}

export default new ChunkingService();
