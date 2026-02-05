import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import { appConfig, secrets } from './appConfig.js';

// Configuration Qdrant
export const qdrant = new QdrantClient({ 
    url: appConfig.qdrantUrl,
});

// Configuration OpenAI
export const openai = new OpenAI({ 
    apiKey: secrets.openaiApiKey,
});

// Constants
export const COLLECTION_NAME = appConfig.collectionName;
export const VECTOR_SIZE = appConfig.vectorSize;
export const DEFAULT_DOCUMENT_AUTHOR = appConfig.defaultDocumentAuthor;
