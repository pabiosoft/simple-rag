import dotenv from 'dotenv';
import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';

dotenv.config();

// Configuration Qdrant
export const qdrant = new QdrantClient({ 
    url: process.env.QDRANT_URL || 'http://vectordb:6333' 
});

// Configuration OpenAI
export const openai = new OpenAI({ 
    apiKey: process.env.OPENAI_API_KEY 
});

// Constants
export const COLLECTION_NAME = 'corpus';
export const VECTOR_SIZE = 1536;
