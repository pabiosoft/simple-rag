import { openai } from '../config/database.js';
import { vectorService } from './vector.js';
import chunkingService from './chunking.js'; 

/**
 * Service RAG principal - gère le cycle complet de question-réponse
 */
export class RAGService {
    constructor() {
        this.MAX_CONTEXT_TOKENS = 12000; // Laisser de la marge pour le prompt
        this.MAX_CHUNKS_TO_RETRIEVE = 4; // Réduire le nombre de chunks
        this.MAX_CHUNK_SIZE_TOKENS = 1500; // Réduire la taille max des chunks
    }

    /**
     * Traite une question utilisateur avec RAG
     * @param {string} question - Question de l'utilisateur
     * @returns {Promise<Object>} Réponse avec answer, sources et found
     */
    async processQuestion(question) {
        // Gestion des salutations
        if (this.isGreeting(question)) {
            return {
                answer: "Bonjour ! Comment puis-je vous aider aujourd'hui ?",
                sources: [],
                found: true
            };
        }

        try {
            // 1. Génération de l'embedding
            const vector = await this.generateEmbedding(question);

            // 2. Recherche vectorielle avec limites
            const threshold = vectorService.getAdaptiveThreshold(question);
            let searchResults = await vectorService.search(vector, this.MAX_CHUNKS_TO_RETRIEVE, threshold);

            // Fallback : si rien trouvé, relancer avec un seuil plus bas
            if (searchResults.length === 0 && threshold > 0.7) {
                searchResults = await vectorService.search(vector, this.MAX_CHUNKS_TO_RETRIEVE, 0.7);
            }

            if (searchResults.length === 0) {
                return {
                    answer: "Désolé, je n'ai pas d'informations sur ce sujet dans ma base de connaissances.",
                    sources: [],
                    found: false
                };
            }

            // 3. VÉRIFICATION CRITIQUE : Limiter la taille totale des chunks
            const filteredResults = this.filterResultsByTokenLimit(searchResults);
            
            if (filteredResults.length === 0) {
                return {
                    answer: "Les documents trouvés sont trop longs pour être traités. Essayez une question plus spécifique.",
                    sources: [],
                    found: false
                };
            }

            // 4. Préparation du contexte avec taille contrôlée
            const context = this.buildContext(filteredResults);
            
            // 5. Vérifier la taille du contexte avant d'envoyer
            const totalTokens = this.estimateTokens(context + question);
            console.log(`📊 Tokens estimés: ${totalTokens} (limite: ${this.MAX_CONTEXT_TOKENS})`);
            
            if (totalTokens > 14000) {
                console.warn('⚠️  Contexte trop long, réduction...');
                // Réduire encore plus si contexte trop long
                const furtherFiltered = filteredResults.slice(0, Math.max(1, filteredResults.length - 1));
                return this.processQuestionWithContext(question, furtherFiltered);
            }

            // 6. Génération de la réponse avec modèle adapté
            const answer = await this.generateAnswer(question, context);

            // 7. Formatage des sources
            const sources = this.formatSources(filteredResults);

            return {
                answer,
                sources,
                found: true,
                metadata: {
                    chunksUsed: filteredResults.length,
                    totalTokens: totalTokens
                }
            };

        } catch (error) {
            console.error('❌ Erreur dans processQuestion:', error.message);
            
            // Gestion spécifique de l'erreur de tokens
            if (error.message.includes('maximum context length') || error.message.includes('16385 tokens')) {
                throw new Error('CONTEXT_TOO_LONG: Le contexte dépasse la limite de tokens. Essayez une question plus courte ou plus spécifique.');
            }
            
            throw error;
        }
    }

    /**
     * Filtre les résultats pour respecter la limite de tokens
     * @param {Array} searchResults - Résultats de recherche
     * @returns {Array} Résultats filtrés
     */
    filterResultsByTokenLimit(searchResults) {
        const filtered = [];
        let totalTokens = 0;
        
        for (const result of searchResults) {
            const chunkText = result.payload.text;
            const chunkTokens = chunkingService.estimateTokens(chunkText);
            
            // Vérifier la taille individuelle du chunk
            if (chunkTokens > this.MAX_CHUNK_SIZE_TOKENS) {
                console.warn(`⚠️  Chunk trop long (${chunkTokens} tokens), troncature...`);
                // Tronquer le chunk trop long
                result.payload.text = this.truncateChunk(chunkText, this.MAX_CHUNK_SIZE_TOKENS);
            }
            
            const newTotal = totalTokens + chunkingService.estimateTokens(result.payload.text);
            
            if (newTotal <= this.MAX_CONTEXT_TOKENS) {
                filtered.push(result);
                totalTokens = newTotal;
            } else {
                // Stop quand on atteint la limite
                break;
            }
        }
        
        console.log(`📦 Chunks utilisés: ${filtered.length}/${searchResults.length}, Tokens: ${totalTokens}`);
        return filtered;
    }

    /**
     * Tronque un chunk trop long
     * @param {string} text - Texte du chunk
     * @param {number} maxTokens - Maximum de tokens
     * @returns {string} Texte tronqué
     */
    truncateChunk(text, maxTokens) {
        // Approximation: 1 token ≈ 4 caractères
        const maxChars = maxTokens * 4;
        
        if (text.length <= maxChars) {
            return text;
        }
        
        // Tronquer à la fin de la phrase la plus proche
        const truncated = text.substring(0, maxChars);
        const lastSentenceEnd = Math.max(
            truncated.lastIndexOf('.'),
            truncated.lastIndexOf('!'),
            truncated.lastIndexOf('?'),
            truncated.lastIndexOf('\n')
        );
        
        if (lastSentenceEnd > maxChars * 0.8) {
            return truncated.substring(0, lastSentenceEnd + 1) + ' [suite...]';
        }
        
        return truncated + ' [suite...]';
    }

    /**
     * Version alternative avec contrôle strict du contexte
     */
    async processQuestionWithContext(question, searchResults) {
        const context = this.buildContext(searchResults);
        const answer = await this.generateAnswer(question, context);
        const sources = this.formatSources(searchResults);
        
        return {
            answer,
            sources,
            found: true,
            metadata: {
                chunksUsed: searchResults.length,
                contextReduced: true
            }
        };
    }

    /**
     * Génère un embedding pour la question
     * @param {string} question - Question à vectoriser
     * @returns {Promise<number[]>} Vecteur d'embedding
     */
    async generateEmbedding(question) {
        const embeddingRes = await openai.embeddings.create({
            model: process.env.EMBEDDING_MODEL ,
            input: question,
        });
        return embeddingRes.data[0].embedding;
    }

    /** 
     *  Génère une réponse avec GPT - VERSION OPTIMISÉE
     * @param {string} question - Question utilisateur
     * @param {string} context - Contexte récupéré
     * @returns {Promise<string>} Réponse générée
     */
    async generateAnswer(question, context) {
        // PROMPT OPTIMISÉ - plus court
        const prompt = `Tu es DashLab, un assistant analytique expert.

        CONTEXTE (extraits de documents) :
        ${context}

        QUESTION : "${question}"

        INSTRUCTIONS :
        1. Réponds UNIQUEMENT à partir du contexte ci-dessus.
        2. Sois concis et précis.
        3. Si l'information manque, dis-le simplement.
        4. Maximum 3-4 phrases.

        RÉPONSE :`;

        try {
            const gptRes = await openai.chat.completions.create({
                model: 'gpt-3.5-turbo-16k',
                messages: [
                    { 
                        role: 'system', 
                        content: 'Tu réponds concisement en utilisant uniquement le contexte fourni.' 
                    },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.3,
                max_tokens: 800 // Limiter la réponse
            });

            return gptRes.choices[0].message.content.trim();

        } catch (error) {
            // Fallback sur un modèle plus petit si erreur de tokens
            if (error.message.includes('maximum context length')) {
                console.warn('⚠️  Modèle 16K échoue, essai avec modèle 4K...');
                return this.generateAnswerFallback(question, context);
            }
            throw error;
        }
    }

    /**
     * Fallback pour les contextes plus courts
     */
    async generateAnswerFallback(question, context) {
        const prompt = `Contexte: ${context}\n\nQuestion: ${question}\n\nRéponse courte:`;
        
        const gptRes = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo', 
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.3,
            max_tokens: 500
        });

        return gptRes.choices[0].message.content;
    }

    /**
     * Vérifie si la question est une salutation
     */
    isGreeting(question) {
        const greetings = ['salut', 'bonjour', 'hello', 'coucou'];
        return greetings.includes(question.toLowerCase().trim());
    }

    /**
     * Construit le contexte à partir des résultats de recherche
     * @param {Array} searchResults - Résultats de recherche
     * @returns {string} Contexte formaté
     */
    buildContext(searchResults) {
        return searchResults
            .map((hit, index) => `[Source ${index + 1}]\n${hit.payload.text}`)
            .join('\n\n---\n\n');
    }

    /**
     * Formate les sources pour l'affichage
     */
    formatSources(searchResults) {
        const uniqueSources = new Map();

        searchResults.forEach(hit => {
            const key = `${hit.payload.title}-${hit.payload.author}`;
            if (!uniqueSources.has(key)) {
                uniqueSources.set(key, {
                    title: hit.payload.title || 'Document',
                    author: hit.payload.author || 'Inconnu',
                    date: hit.payload.date || 'Date inconnue',
                    score: Math.round(hit.score * 100)
                });
            }
        });

        return Array.from(uniqueSources.values());
    }

    /**
     * Estimation simple des tokens
     */
    estimateTokens(text) {
        if (!text) return 0;
        // Approximation améliorée
        const words = text.split(/\s+/).length;
        const chars = text.length;
        return Math.ceil((words * 1.3 + chars / 4) / 2);
    }
}

export const ragService = new RAGService();