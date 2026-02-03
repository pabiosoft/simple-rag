import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import dotenv from 'dotenv';

const envPath = process.env.NODE_ENV === 'test' ? path.resolve('.env.test') : undefined;
dotenv.config(envPath ? { path: envPath } : undefined);

type ChunkingConfig = {
  size: number;
  overlap: number;
  maxTokens: number;
};

type AppConfig = {
  port: number;
  adminPath: string;
  enableChatUI: boolean;
  allowedOrigins: string[];
  defaultDocumentAuthor: string;
  appTheme: string;
  welcomeMessage: string;
  embeddingModel: string;
  chatModel: string;
  chatModelFallback: string;
  chatTemperature: number;
  chatMaxTokens: number;
  fallbackTemperature: number;
  fallbackMaxTokens: number;
  suggestedTopics: string[];
  otherTopicAllowed: string[];
  offTopicRedirectLine: string;
  qdrantUrl: string;
  collectionName: string;
  vectorSize: number;
  minScore: number;
  fallbackScore: number;
  chunking: ChunkingConfig;
};

type RawConfig = Partial<{
  port: number;
  adminPath: string;
  enableChatUI: boolean;
  allowedOrigins: string[];
  defaultDocumentAuthor: string;
  appTheme: string;
  welcomeMessage: string;
  embeddingModel: string;
  chatModel: string;
  chatModelFallback: string;
  chatTemperature: number;
  chatMaxTokens: number;
  fallbackTemperature: number;
  fallbackMaxTokens: number;
  suggestedTopics: string[];
  otherTopicAllowed: string[];
  offTopicRedirectLine: string;
  qdrantUrl: string;
  collectionName: string;
  vectorSize: number;
  minScore: number;
  fallbackScore: number;
  chunking: Partial<ChunkingConfig>;
}>;

function loadYamlConfig(filePath: string): RawConfig {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const parsed = yaml.parse(content);
  if (!parsed || typeof parsed !== 'object') return {};
  return parsed as RawConfig;
}

function deepMerge(base: RawConfig, override: RawConfig): RawConfig {
  return {
    ...base,
    ...override,
    chunking: {
      ...(base.chunking || {}),
      ...(override.chunking || {}),
    },
  };
}

function normalizePath(value: string) {
  const raw = (value || '/admin').trim() || '/admin';
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, '') || '/admin';
}

function parseBoolean(value: unknown, fallback: boolean) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
  }
  return fallback;
}

const baseConfigPath = path.resolve('config/app.yaml');
const envConfigPath = path.resolve(`config/app.${process.env.NODE_ENV || 'development'}.yaml`);
const rawConfig = deepMerge(loadYamlConfig(baseConfigPath), loadYamlConfig(envConfigPath));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

const appConfig: AppConfig = {
  port: Number(process.env.PORT || rawConfig.port || 8000),
  adminPath: normalizePath(process.env.ADMIN_PATH || rawConfig.adminPath || '/admin'),
  enableChatUI: parseBoolean(process.env.ENABLE_CHAT_UI ?? rawConfig.enableChatUI, true),
  allowedOrigins: allowedOrigins.length > 0 ? allowedOrigins : rawConfig.allowedOrigins || [],
  defaultDocumentAuthor: process.env.DEFAULT_DOCUMENT_AUTHOR || rawConfig.defaultDocumentAuthor || 'Anonyme',
  appTheme: process.env.APP_THEME || rawConfig.appTheme || '',
  welcomeMessage: process.env.WELCOME_MESSAGE || rawConfig.welcomeMessage || '',
  embeddingModel: process.env.EMBEDDING_MODEL || rawConfig.embeddingModel || 'text-embedding-3-small',
  chatModel: process.env.CHAT_MODEL || rawConfig.chatModel || 'gpt-3.5-turbo-16k',
  chatModelFallback: process.env.CHAT_MODEL_FALLBACK || rawConfig.chatModelFallback || 'gpt-3.5-turbo',
  chatTemperature: Number(process.env.CHAT_TEMPERATURE || rawConfig.chatTemperature || 0.3),
  chatMaxTokens: Number(process.env.CHAT_MAX_TOKENS || rawConfig.chatMaxTokens || 800),
  fallbackTemperature: Number(process.env.FALLBACK_TEMPERATURE || rawConfig.fallbackTemperature || 0.3),
  fallbackMaxTokens: Number(process.env.FALLBACK_MAX_TOKENS || rawConfig.fallbackMaxTokens || 500),
  suggestedTopics: (process.env.SUGGESTED_TOPICS || '')
    .split(',')
    .map(topic => topic.trim())
    .filter(Boolean)
    .concat(rawConfig.suggestedTopics || [])
    .filter((topic, index, list) => list.indexOf(topic) === index),
  otherTopicAllowed: (process.env.OTHER_TOPIC_ALLOWED || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .concat(rawConfig.otherTopicAllowed || [])
    .filter((item, index, list) => list.indexOf(item) === index),
  offTopicRedirectLine: process.env.OFF_TOPIC_REDIRECT_LINE || rawConfig.offTopicRedirectLine || '',
  qdrantUrl: process.env.QDRANT_URL || rawConfig.qdrantUrl || 'http://vectordb:6333',
  collectionName: process.env.COLLECTION_NAME || rawConfig.collectionName || 'corpus',
  vectorSize: Number(process.env.VECTOR_SIZE || rawConfig.vectorSize || 1536),
  minScore: Number(process.env.MIN_SCORE || rawConfig.minScore || 0.6),
  fallbackScore: Number(process.env.FALLBACK_SCORE || rawConfig.fallbackScore || 0.45),
  chunking: {
    size: Number(process.env.CHUNK_SIZE || rawConfig.chunking?.size || 500),
    overlap: Number(process.env.CHUNK_OVERLAP || rawConfig.chunking?.overlap || 50),
    maxTokens: Number(process.env.MAX_TOKENS_PER_CHUNK || rawConfig.chunking?.maxTokens || 1500),
  },
};

const secrets = {
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  apiKey: process.env.API_KEY || '',
  adminEmail: process.env.ADMIN_EMAIL || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
};

export { appConfig, secrets };
