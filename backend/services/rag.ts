import { openai } from '../config/database.js';
import { vectorService } from './vector.js';
import { appConfig } from '../config/appConfig.js';
import chunkingService from './chunking.js'; 

/**
 * Service RAG principal - gère le cycle complet de question-réponse
 */
type ConversationContext = {
    conversationId?: string;
    lastTopic?: string;
    lastAnswer?: string;
    lastQuestion?: string;
};

type RewriteResult = {
    text: string;
    baseQuestion?: string;
    focus?: string;
};

export class RAGService {
    MAX_CONTEXT_TOKENS: number;
    MAX_CHUNKS_TO_RETRIEVE: number;
    MAX_CHUNK_SIZE_TOKENS: number;
    defaultWelcomeMessage: string;
    theme: string;
    lastTopicHints: string[];

    constructor() {
        this.MAX_CONTEXT_TOKENS = 12000; // Laisser de la marge pour le prompt
        this.MAX_CHUNKS_TO_RETRIEVE = 4; // Réduire le nombre de chunks
        this.MAX_CHUNK_SIZE_TOKENS = 1500; // Réduire la taille max des chunks
        this.defaultWelcomeMessage = "Bonjour ! Je suis votre assistant spécialisé. Posez-moi une question pour démarrer.";
        this.theme = (appConfig.appTheme || '').trim();
        this.lastTopicHints = (appConfig.suggestedTopics || []).filter(Boolean);
    }

    /**
     * Traite une question utilisateur avec RAG
     * @param {string} question - Question de l'utilisateur
     * @returns {Promise<Object>} Réponse avec answer, sources et found
     */
    async processQuestion(question, context: ConversationContext = {}) {
        const normalizedQuestion = this.stripLeadingAck(question);
        const rewritten = this.rewriteIfAck(normalizedQuestion, context);
        let refinedQuestion = rewritten.text || question;
        if (rewritten.focus) {
            refinedQuestion = `${refinedQuestion}\nFocalise uniquement sur: ${rewritten.focus}. Évite un résumé général.`;
        }
        // Gestion des salutations
        if (this.isGreeting(refinedQuestion)) {
            return {
                answer: this.buildWelcomeMessage(),
                sources: [],
                found: true,
                followups: [],
                context: {
                    last_topic: context?.lastTopic || '',
                    last_answer: '',
                    last_question: refinedQuestion
                }
            };
        }

        if (this.isSmallTalk(refinedQuestion)) {
            if (!this.isOtherTopicAllowed('smalltalk')) {
                return {
                    answer: this.buildGuidanceAnswer('no_results', context),
                    sources: [],
                    found: false,
                    followups: [],
                    context: {
                        last_topic: context?.lastTopic || '',
                        last_answer: '',
                        last_question: refinedQuestion
                    }
                };
            }
            return this.generateOffTopicAnswer(refinedQuestion, context);
        }

        if (this.isDistanceQuestion(refinedQuestion)) {
            if (!this.isOtherTopicAllowed('distance')) {
                return {
                    answer: this.buildGuidanceAnswer('no_results', context),
                    sources: [],
                    found: false,
                    followups: [],
                    context: {
                        last_topic: context?.lastTopic || '',
                        last_answer: '',
                        last_question: refinedQuestion
                    }
                };
            }
            return this.generateOffTopicAnswer(refinedQuestion, context);
        }

        const mathResult = this.trySolveMath(refinedQuestion);
        if (mathResult !== null) {
            if (!this.isOtherTopicAllowed('math')) {
                return {
                    answer: this.buildGuidanceAnswer('no_results', context),
                    sources: [],
                    found: false,
                    followups: [],
                    context: {
                        last_topic: context?.lastTopic || '',
                        last_answer: '',
                        last_question: refinedQuestion
                    }
                };
            }
            return this.generateOffTopicAnswer(refinedQuestion, context);
        }

        if (this.isVagueQuestion(refinedQuestion)) {
            return {
                answer: this.buildGuidanceAnswer('vague', context),
                sources: [],
                found: false,
                followups: [],
                context: {
                    last_topic: context?.lastTopic || '',
                    last_answer: '',
                    last_question: refinedQuestion
                }
            };
        }

        try {
            // 1. Génération de l'embedding
            const vector = await this.generateEmbedding(refinedQuestion);

            // 2. Recherche vectorielle avec limites
            const threshold = vectorService.getAdaptiveThreshold(question);
            let searchResults = await vectorService.search(vector, this.MAX_CHUNKS_TO_RETRIEVE, threshold);
            console.log(`🔎 Score threshold: ${threshold}, résultats: ${searchResults.length}`);

            // Fallback : si rien trouvé, relancer avec un seuil plus bas
            if (searchResults.length === 0 && threshold > appConfig.fallbackScore) {
                searchResults = await vectorService.search(vector, this.MAX_CHUNKS_TO_RETRIEVE, appConfig.fallbackScore);
                console.log(`🔎 Fallback threshold: ${appConfig.fallbackScore}, résultats: ${searchResults.length}`);
            }

            if (searchResults.length === 0) {
                return {
                    answer: this.buildGuidanceAnswer('no_results', context),
                    sources: [],
                    found: false,
                    followups: [],
                    context: {
                        last_topic: context?.lastTopic || '',
                        last_answer: '',
                        last_question: refinedQuestion
                    }
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
            const contextText = this.buildContext(filteredResults);
            
            // 5. Vérifier la taille du contexte avant d'envoyer
            const totalTokens = this.estimateTokens(contextText + refinedQuestion);
            console.log(`📊 Tokens estimés: ${totalTokens} (limite: ${this.MAX_CONTEXT_TOKENS})`);
            
            if (totalTokens > 14000) {
                console.warn('⚠️  Contexte trop long, réduction...');
                // Réduire encore plus si contexte trop long
                const furtherFiltered = filteredResults.slice(0, Math.max(1, filteredResults.length - 1));
                return this.processQuestionWithContext(refinedQuestion, furtherFiltered);
            }

            // 6. Génération de la réponse avec modèle adapté
            const { answer, followups } = await this.generateAnswer(refinedQuestion, contextText);

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
                },
                context: {
                    last_topic: sources?.[0]?.title || context?.lastTopic || '',
                    last_answer: answer,
                    last_question: rewritten?.baseQuestion || refinedQuestion
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

    pickDeepenHint(context: ConversationContext = {}) {
        if (context?.lastTopic) return context.lastTopic;
        if (context?.lastQuestion && context.lastQuestion.length > 6) return context.lastQuestion;
        if (this.lastTopicHints.length > 0) return this.lastTopicHints[0];
        return '';
    }

    rewriteIfAck(question, context: ConversationContext = {}): RewriteResult {
        const text = String(question || '').trim();
        if (!text) return { text };

        const normalized = text.toLowerCase();
        const ackSet = new Set([
            'oui', 'ok', 'okay', 'okey', 'daccord', "d'accord", 'va y', 'vas y', 'vas-y', 'continue',
            'oui vas y', 'oui vas-y', 'go', 'encore', 'plus', 'approfondis',
            'développe', 'developpe', 'explique', 'détaille', 'detaille'
        ]);

        if (text.length <= 20 && ackSet.has(normalized)) {
            const baseQuestion = context?.lastQuestion || context?.lastTopic || '';
            const hint = this.pickDeepenHint(context);
            if (hint) {
                return {
                    text: `Explique en détail : ${hint}`,
                    baseQuestion,
                    focus: hint
                };
            }
            if (context?.lastAnswer) {
                return {
                    text: `Explique en détail ce que tu viens d'expliquer.`,
                    baseQuestion,
                    focus: ''
                };
            }
        }

        return { text: question };
    }

    isVagueQuestion(question) {
        const text = String(question || '').trim().toLowerCase();
        if (!text) return true;
        if (text.length <= 3) return true;

        const exactVague = new Set([
            'tu peux me parler de quoi',
            'tu peux parler de quoi',
            'de quoi peux-tu parler',
            'tu sais quoi',
            'dis-moi quelque chose',
            'parle moi de quoi',
            'parle moi de',
            'parle de',
            'tu connais',
            'tu sais',
            'c est quoi',
            "c'est quoi"
        ]);

        return exactVague.has(text);
    }

    buildGuidanceAnswer(reason = 'general', context: ConversationContext = {}) {
        const theme = this.theme || appConfig.appTheme;
        const topics = (appConfig.suggestedTopics || []).filter(Boolean);
        const topicLine = topics.length > 0
            ? `Je peux t’aider sur : ${topics.slice(0, 5).join(', ')}.`
            : 'Je peux t’aider sur un résumé, une définition, une obligation, ou une procédure précise.';

        const focusLine = theme
            ? `Je suis spécialisé sur ${theme} d’après les documents disponibles.`
            : 'Je réponds uniquement à partir des documents disponibles.';

        const lastTopic = context?.lastQuestion
            ? `Si tu veux, je peux détailler ${this.cleanTopic(context.lastQuestion)}.`
            : context?.lastTopic
                ? `Si tu veux, je peux t’en dire plus sur ${context.lastTopic}.`
                : '';
        const prefix = reason === 'vague'
            ? 'Pour t’aider à démarrer, voici des pistes simples.'
            : 'Je n’ai pas trouvé ce point précis dans les documents, mais je peux aider sur ces sujets.';

        return `${focusLine} ${prefix} ${topicLine} ${lastTopic}`.trim();
    }

    buildWelcomeMessage() {
        const theme = this.theme || appConfig.appTheme;
        const topics = (appConfig.suggestedTopics || []).filter(Boolean);
        const focusLine = appConfig.welcomeMessage?.trim()
            ? appConfig.welcomeMessage.trim()
            : (theme
                ? `Bonjour ! Je suis votre assistant spécialisé en ${theme}.`
                : 'Bonjour ! Je suis votre assistant spécialisé.');
        const topicLine = topics.length > 0
            ? `${topics.slice(0, 4).join(', ')}.`
            : '';
        const fallbackLine = topics.length === 0
            ? 'Je peux t’aider avec un résumé, une définition, une obligation ou une procédure précise.'
            : '';
        const base = [focusLine, topicLine].filter(Boolean).join(' ').trim();
        return `${base} ${fallbackLine} Dis-moi ce que tu veux savoir aujourd’hui et je t’explique simplement.`.trim();
    }

    cleanTopic(text) {
        const raw = String(text || '').trim();
        if (!raw) return 'ce point';
        const lower = raw.toLowerCase();
        const badPrefixes = [
            'parle', 'parle moi', 'parle-moi', 'explique', 'explique moi', 'explique-moi',
            'dis moi', 'dis-moi', 'de quoi', 'tu peux', 'peux-tu', 'pouvez-vous',
            'tu connais', 'tu sais'
        ];
        const greetings = ['salut', 'bonjour', 'hello', 'coucou', 'ça va', 'ca va', 'merci'];
        if (greetings.includes(lower)) {
            return 'ce point';
        }
        if (badPrefixes.some(prefix => lower.startsWith(prefix))) {
            return 'ce point';
        }
        return raw;
    }

    stripLeadingAck(text) {
        const raw = String(text || '').trim();
        if (!raw) return raw;
        const lower = raw.toLowerCase();
        const prefixes = [
            'ok', 'okay', 'okey', 'oui', 'daccord', "d'accord", 'vas y', 'va y', 'vas-y'
        ];
        for (const prefix of prefixes) {
            if (lower === prefix) return raw;
            if (lower.startsWith(`${prefix} `)) {
                return raw.slice(prefix.length).trim();
            }
        }
        return raw;
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
            model: appConfig.embeddingModel,
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
        const prompt = `Tu es un assistant clair, pédagogique et rigoureux.${themeLine}

        CONTEXTE (extraits de documents) :
        ${context}

        QUESTION : "${question}"

        INSTRUCTIONS :
        1. Réponds UNIQUEMENT avec les informations présentes dans le CONTEXTE.
        2. Explique simplement, comme à une personne qui découvre le sujet.
        3. Si le CONTEXTE ne suffit pas, dis-le clairement en une phrase (sans inventer).
        4. Donne une réponse structurée, claire et utile (4 à 8 phrases selon la matière disponible).
        5. N'ajoute aucune question dans la réponse (pas de phrase interrogative).
        6. Propose 2 à 3 relances sous forme de propositions d'aide (pas de point d'interrogation).
        6.1 Ne mentionne pas "document", "documents", "sources", "corpus" ou "dossier".
        6.2 Si une THÉMATIQUE est fournie, aligne les relances sur cette thématique.
        6.3 Ton des relances : bienveillant, orienté aide, commence par "Si tu veux," ou "Dis-moi".
        7. Réponds en JSON strict avec ce format :
           {"answer":"...","followups":["...","..."]}

        RÉPONSE :`;

        try {
            const gptRes = await openai.chat.completions.create({
                model: appConfig.chatModel,
                messages: [
                    { 
                        role: 'system', 
                        content: 'Tu donnes des réponses claires, simples et exactes, uniquement à partir du contexte fourni.' 
                    },
                    { role: 'user', content: prompt }
                ],
                temperature: appConfig.chatTemperature,
                max_tokens: appConfig.chatMaxTokens // Limiter la réponse
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
            model: appConfig.chatModelFallback, 
            messages: [{ role: 'user', content: prompt }],
            temperature: appConfig.fallbackTemperature,
            max_tokens: appConfig.fallbackMaxTokens
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

    isSmallTalk(question) {
        const text = String(question || '').trim().toLowerCase();
        if (!text) return false;
        const exact = new Set([
            'ça va', 'ca va', 'comment ça va', 'comment ca va', 'comment vas-tu', 'comment vas tu',
            'merci', 'merci beaucoup', 'ok merci', 'ok', 'daccord', "d'accord", 'super'
        ]);
        return exact.has(text);
    }

    getSmallTalkResponse() {
        return "Ça va bien, merci ! Si tu veux, je peux répondre à une question précise sur le sujet.";
    }

    isDistanceQuestion(question) {
        const text = String(question || '').trim().toLowerCase();
        if (!text) return false;
        if (text.includes('distance entre')) return true;
        if (text.includes('distance de') && text.includes('à')) return true;
        if (text.includes('combien de km')) return true;
        return false;
    }

    isOtherTopicAllowed(kind) {
        const allowed = (appConfig.otherTopicAllowed || []).map(item => item.toLowerCase());
        return allowed.includes(kind.toLowerCase());
    }

    buildOffTopicRedirect() {
        const theme = this.theme || appConfig.appTheme;
        const topics = (appConfig.suggestedTopics || []).filter(Boolean).slice(0, 4);
        const hint = topics.length > 0
            ? `Si tu veux, je peux plutôt t’aider sur ${topics.join(', ')}.`
            : 'Si tu veux, pose-moi une question en lien avec mes documents.';
        const humorLine = appConfig.offTopicRedirectLine?.trim()
            ? appConfig.offTopicRedirectLine.trim()
            : (theme
                ? `Je ne pourrai pas tenir longtemps sur ce sujet, par contre je suis à l’aise sur ${theme}.`
                : `Je ne pourrai pas tenir longtemps sur ce sujet, mais je peux aider sur les sujets du corpus.`);
        return `${humorLine} ${hint}`.trim();
    }

    async generateOffTopicAnswer(question, context: ConversationContext = {}) {
        const prompt = `Réponds poliment et brièvement à la question suivante (1-2 phrases), puis ajoute une phrase d’orientation vers le domaine principal.

QUESTION : "${question}"

RÉPONSE :`;

        try {
            const gptRes = await openai.chat.completions.create({
                model: appConfig.chatModelFallback,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.3,
                max_tokens: 120
            });

            const raw = gptRes.choices[0].message.content?.trim() || '';
            return {
                answer: `${raw}\n\n${this.buildOffTopicRedirect()}`,
                sources: [],
                found: true,
                followups: [],
                context: {
                    last_topic: context?.lastTopic || '',
                    last_answer: '',
                    last_question: question
                }
            };
        } catch (error) {
            return {
                answer: this.buildGuidanceAnswer('no_results', context),
                sources: [],
                found: false,
                followups: [],
                context: {
                    last_topic: context?.lastTopic || '',
                    last_answer: '',
                    last_question: question
                }
            };
        }
    }

    trySolveMath(question) {
        const raw = String(question || '').toLowerCase().trim();
        if (!raw) return null;
        const cleaned = raw
            .replace(/^et\s+/i, '')
            .replace(/^tu\s+connais\s+/i, '')
            .replace(/^tu\s+sais\s+/i, '')
            .replace(/combien\s+fait\s+/i, '')
            .replace(/combien\s+fais\s+/i, '')
            .replace(/combien\s+faire\s+/i, '')
            .replace(/combien\s+ça\s+fait\s+/i, '')
            .replace(/combien\s+cela\s+fait\s+/i, '')
            .replace(/=?\s*$/g, '')
            .trim();

        const mathCandidate = /^[0-9+\-*/().\s]+$/.test(cleaned)
            ? cleaned
            : (raw.match(/[-+*/()0-9\s]{3,}/)?.[0] || '').trim();

        if (!/[\d]/.test(mathCandidate)) return null;
        if (!/^[0-9+\-*/().\s]+$/.test(mathCandidate)) return null;
        if (cleaned.length > 80) return null;

        try {
            // eslint-disable-next-line no-new-func
            const result = Function(`"use strict"; return (${mathCandidate});`)();
            if (typeof result === 'number' && Number.isFinite(result)) {
                return result;
            }
        } catch (error) {
            return null;
        }
        return null;
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
        if (lower.includes('veux-tu') || lower.includes('veux tu') || lower.includes('tu veux')) {
            return this.theme
                ? `Si tu veux, je peux approfondir sur ${this.theme}.`
                : 'Si tu veux, je peux approfondir ce point.';
        }
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
        const trimmed = this.stripTrailingQuestion(String(answer || '').trim());
        if (!trimmed) return trimmed;
        const openLine = this.pickOpenEndedLine(followups);
        if (!openLine) return trimmed;
        if (trimmed.toLowerCase().includes(openLine.toLowerCase())) {
            return trimmed;
        }
        return `${trimmed}\n\n${openLine}`;
    }

    stripTrailingQuestion(text) {
        if (!text) return text;
        const sentences = text.split(/(?<=[.!?])\s+/);
        if (sentences.length <= 1) return text;

        const last = sentences[sentences.length - 1].trim();
        const lower = last.toLowerCase();
        const isQuestion = last.endsWith('?');
        const questionStarters = [
            'dis-moi', 'peux-tu', 'pouvez-vous', 'pourrais-tu', 'pourriez-vous',
            'est-ce que', 'comment', 'pourquoi', 'où', 'quand', 'quel', 'quelle', 'quels', 'quelles'
        ];
        const startsLikeQuestion = questionStarters.some(starter => lower.startsWith(starter));

        if (isQuestion || startsLikeQuestion) {
            sentences.pop();
            return sentences.join(' ').trim();
        }

        return text;
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
