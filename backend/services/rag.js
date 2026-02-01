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
        this.defaultWelcomeMessage = "Bonjour ! Comment puis-je vous aider aujourd'hui ? Je suis là comme votre spécialiste, posez-moi une question.";
        this.theme = (process.env.APP_THEME || '').trim();
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
                answer: (process.env.WELCOME_MESSAGE || this.defaultWelcomeMessage).trim(),
                sources: [],
                found: true,
                followups: []
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
                    found: false,
                    followups: [
                        "Peux-tu préciser le sujet ou le contexte ?",
                        "As-tu un document ou un titre précis à rechercher ?"
                    ]
                };
            }

            // 3. VÉRIFICATION CRITIQUE : Limiter la taille totale des chunks
            const filteredResults = this.filterResultsByTokenLimit(searchResults);
            
            if (filteredResults.length === 0) {
                return {
                    answer: "Les documents trouvés sont trop longs pour être traités. Essayez une question plus spécifique.",
                    sources: [],
                    found: false,
                    followups: [
                        "Peux-tu reformuler la question de façon plus précise ?",
                        "Sur quelle partie du document veux-tu te concentrer ?"
                    ]
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
            const { answer, followups } = await this.generateAnswer(question, context);

            // 7. Formatage des sources
            const sources = this.formatSources(filteredResults);

            return {
                answer,
                sources,
                found: true,
                followups,
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
        const { answer, followups } = await this.generateAnswer(question, context);
        const sources = this.formatSources(searchResults);
        
        return {
            answer,
            sources,
            found: true,
            followups,
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
        const themeLine = this.theme ? `\n        THÉMATIQUE : ${this.theme}` : '';
        const prompt = `Tu es DashLab, un assistant analytique expert.${themeLine}

        CONTEXTE (extraits de documents) :
        ${context}

        QUESTION : "${question}"

        INSTRUCTIONS :
        1. Réponds UNIQUEMENT à partir du contexte ci-dessus.
        2. Explique comme si l'utilisateur ne connaît rien au sujet.
        3. Si l'information manque, dis-le simplement.
        4. Donne une réponse structurée et développée (minimum 6-8 phrases si le contexte le permet).
        5. Propose 2 à 3 questions de suivi pertinentes pour continuer la conversation.
        5.1 Ne mentionne pas "document", "documents", "sources", "corpus" ou "dossier" dans les questions.
        5.2 Si une THÉMATIQUE est fournie, aligne les questions de suivi sur cette thématique.
        5.3 Ton des questions de suivi : bienveillant, orienté aide, commence par "Si tu veux," ou "Dis-moi".
        5.4 Les questions de suivi doivent être formulées comme des propositions d'aide (pas de point d'interrogation).
        6. Réponds en JSON strict avec ce format :
           {"answer":"...","followups":["...","..."]}

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

            const raw = gptRes.choices[0].message.content?.trim() || '';
            const parsed = this.parseAnswerJson(raw);

            if (parsed) {
                const styledFollowups = this.applyFollowupStyle(parsed.followups);
                return {
                    answer: this.appendOpenEndedLine(parsed.answer, styledFollowups),
                    followups: styledFollowups
                };
            }

            return {
                answer: this.appendOpenEndedLine(raw, []),
                followups: this.getDefaultFollowups()
            };

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

        const raw = gptRes.choices[0].message.content?.trim() || '';
        const parsed = this.parseAnswerJson(raw);

        if (parsed) {
            const styledFollowups = this.applyFollowupStyle(parsed.followups);
            return {
                answer: this.appendOpenEndedLine(parsed.answer, styledFollowups),
                followups: styledFollowups
            };
        }

        return {
            answer: this.appendOpenEndedLine(raw, []),
            followups: this.getDefaultFollowups()
        };
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

    /**
     * Parse une réponse JSON issue du modèle.
     * @param {string} text
     * @returns {{answer: string, followups: string[]} | null}
     */
    parseAnswerJson(text) {
        if (!text) return null;
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start === -1 || end === -1 || end <= start) return null;

        const jsonText = text.slice(start, end + 1);
        try {
            const parsed = JSON.parse(jsonText);
            if (!parsed || typeof parsed !== 'object') return null;
            const answer = String(parsed.answer || '').trim();
            if (!answer) return null;
            const followups = this.normalizeFollowups(parsed.followups);
            return { answer, followups };
        } catch {
            return null;
        }
    }

    /**
     * Normalise et limite les questions de suivi.
     * @param {unknown} followups
     * @returns {string[]}
     */
    normalizeFollowups(followups) {
        if (!Array.isArray(followups)) return [];
        const banned = ['document', 'documents', 'sources', 'corpus', 'dossier'];
        const normalized = followups
            .map(item => String(item || '').trim())
            .filter(Boolean)
            .map(item => item.replace(/[?？]\s*$/u, '').trim())
            .filter(item => !banned.some(word => item.toLowerCase().includes(word)));

        const deduped = [];
        const seen = new Set();
        for (const item of normalized) {
            const key = item.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            deduped.push(item);
            if (deduped.length >= 3) break;
        }

        return deduped;
    }

    /**
     * Applique le ton "Si tu veux / Dis-moi" et fallback si vide.
     * @param {string[]} followups
     * @returns {string[]}
     */
    applyFollowupStyle(followups) {
        const normalized = this.normalizeFollowups(followups);
        if (normalized.length === 0) {
            return this.getDefaultFollowups();
        }

        return normalized.map(item => {
            return this.coerceToOffer(item);
        });
    }

    /**
     * Questions de suivi par défaut (ton bienveillant, neutre).
     * @returns {string[]}
     */
    getDefaultFollowups() {
        if (this.theme) {
            return [
                `Si tu veux, je peux te donner un résumé rapide sur ${this.theme}.`,
                `Si tu veux, je peux détailler un aspect précis de ${this.theme}.`,
                `Dis-moi ce que tu veux obtenir sur ${this.theme}.`
            ];
        }

        return [
            "Si tu veux, je peux te donner un résumé rapide.",
            "Si tu veux, je peux détailler un aspect précis.",
            "Dis-moi ce que tu veux obtenir."
        ];
    }

    /**
     * Force une formulation d'aide (pas une question).
     * @param {string} text
     * @returns {string}
     */
    coerceToOffer(text) {
        const trimmed = String(text || '').trim();
        if (!trimmed) return trimmed;

        const lower = trimmed.toLowerCase();
        if (lower.startsWith('dis-moi')) {
            return trimmed;
        }

        const politeQuestionPatterns = [
            /^peux[- ]tu\b/i,
            /^pouvez[- ]vous\b/i,
            /^pourrais[- ]tu\b/i,
            /^pourriez[- ]vous\b/i,
            /^est-ce que tu peux\b/i,
            /^est-ce que vous pouvez\b/i,
        ];

        if (politeQuestionPatterns.some(pattern => pattern.test(trimmed))) {
            const normalized = trimmed
                .replace(/^peux[- ]tu\b/i, '')
                .replace(/^pouvez[- ]vous\b/i, '')
                .replace(/^pourrais[- ]tu\b/i, '')
                .replace(/^pourriez[- ]vous\b/i, '')
                .replace(/^est-ce que tu peux\b/i, '')
                .replace(/^est-ce que vous pouvez\b/i, '')
                .trim();

            if (normalized) {
                const topic = normalized
                    .replace(/^m['’]en dire plus sur\b/i, 't’en dire plus sur')
                    .replace(/^m['’]expliquer\b/i, 't’expliquer')
                    .replace(/^m['’]en dire\b/i, 't’en dire')
                    .replace(/^me dire\b/i, 'te dire')
                    .replace(/^me donner\b/i, 'te donner');

                return `Si tu veux, je peux ${topic}`;
            }
        }

        const withoutPrefix = lower.startsWith('si tu veux,')
            ? trimmed.slice('si tu veux,'.length).trim()
            : trimmed;

        const questionStarters = [
            'qui', 'quoi', 'quel', 'quelle', 'quels', 'quelles',
            'comment', 'pourquoi', 'où', 'quand', 'est-ce'
        ];

        const startsLikeQuestion = questionStarters.some(word =>
            withoutPrefix.toLowerCase().startsWith(word)
        );

        if (startsLikeQuestion) {
            return this.theme
                ? `Si tu veux, je peux approfondir sur ${this.theme}.`
                : "Si tu veux, je peux approfondir ce point.";
        }

        if (withoutPrefix.toLowerCase().startsWith('je peux')) {
            return `Si tu veux, ${withoutPrefix.charAt(0).toLowerCase()}${withoutPrefix.slice(1)}`;
        }

        return `Si tu veux, je peux ${withoutPrefix.charAt(0).toLowerCase()}${withoutPrefix.slice(1)}`;
    }

    /**
     * Ajoute une phrase d'ouverture pour inviter à poursuivre.
     * @param {string} answer
     * @returns {string}
     */
    appendOpenEndedLine(answer, followups = []) {
        const trimmed = String(answer || '').trim();
        if (!trimmed) return trimmed;
        const openLine = this.pickOpenEndedLine(followups);
        if (!openLine) return trimmed;
        if (trimmed.toLowerCase().includes(openLine.toLowerCase())) {
            return trimmed;
        }
        return `${trimmed}\n\n${openLine}`;
    }

    /**
     * Choisit une phrase d'ouverture liée à la réponse.
     * @param {string[]} followups
     * @returns {string}
     */
    pickOpenEndedLine(followups) {
        const normalized = this.normalizeFollowups(followups);
        if (normalized.length > 0) {
            return normalized[0];
        }

        const defaults = this.getDefaultFollowups();
        return defaults.length > 0 ? defaults[0] : '';
    }
}

export const ragService = new RAGService();
