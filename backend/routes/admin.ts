import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { indexerService } from '../services/indexer.js';
import { createAdminSession, getAdminSessionCookieName, getAdminSessionMaxAge, isAdminAuthConfigured, verifyAdminCredentials } from '../middleware/adminSession.js';

const router = express.Router();

const CORPUS_DIR = path.resolve('./corpus');
const PDF_DIR = path.join(CORPUS_DIR, 'pdf');

function sanitizeSubdir(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.includes('..')) return '';
  if (trimmed.length > 200) return '';
  return trimmed.replace(/^\/+|\/+$/g, '');
}

function hasControlChars(value = '') {
  return /[\u0000-\u001F\u007F]/.test(value);
}

function validateAdminLoginInput(email = '', password = '') {
  const cleanedEmail = String(email || '').trim();
  const cleanedPassword = String(password || '');

  if (!cleanedEmail || !cleanedPassword) return null;
  if (cleanedEmail.length > 200 || cleanedPassword.length > 200) return null;
  if (hasControlChars(cleanedEmail) || hasControlChars(cleanedPassword)) return null;

  return {
    email: cleanedEmail,
    password: cleanedPassword,
  };
}

async function listSubdirTree(rootDir, baseDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const directories = entries.filter((entry) => entry.isDirectory() && entry.name !== '_uploads');

  const children = [];
  for (const dir of directories) {
    const fullPath = path.join(rootDir, dir.name);
    const relPath = path.relative(baseDir, fullPath);
    const subtree = await listSubdirTree(fullPath, baseDir);
    children.push({
      name: dir.name,
      path: relPath,
      children: subtree,
    });
  }

  return children;
}

router.get('/api/folders', async (req, res) => {
  const scope = String(req.query.scope || 'corpus').toLowerCase();

  try {
    if (scope === 'pdf') {
      const tree = await listSubdirTree(PDF_DIR, PDF_DIR);
      return res.json({ root: 'pdf', tree });
    }

    const tree = await listSubdirTree(CORPUS_DIR, CORPUS_DIR);
    return res.json({ root: 'corpus', tree });
  } catch (error) {
    res.status(500).json({ error: 'Impossible de lister les dossiers' });
  }
});

router.post('/api/index', async (req, res) => {
  const rawPath = sanitizeSubdir(req.body?.path || req.body?.subdir || '');
  const isFull = Boolean(req.body?.full);

  try {
    if (!isFull && !rawPath) {
      return res.status(400).json({ error: 'Chemin invalide' });
    }
    const indexed = await indexerService.indexCorpusFolder(isFull ? '' : rawPath);
    res.json({
      message: 'Indexation lancée',
      path: rawPath,
      indexed: indexed?.indexed ?? indexed ?? 0,
      sources: indexed?.sources ?? null,
      mode: isFull ? 'full' : 'folder',
    });
  } catch (error) {
    console.error('❌ Erreur indexation admin:', error?.message || error);
    res.status(500).json({ error: error?.message || 'Erreur lors de l\'indexation' });
  }
});

router.post('/login', (req, res) => {
  if (!isAdminAuthConfigured()) {
    return res.status(400).json({ error: 'Authentification admin désactivée' });
  }

  const validated = validateAdminLoginInput(req.body?.email, req.body?.password);
  if (!validated) {
    return res.status(400).json({ error: 'Entrées invalides' });
  }

  if (!verifyAdminCredentials(validated.email, validated.password)) {
    return res.status(401).json({ error: 'Identifiants invalides' });
  }

  const token = createAdminSession();
  res.cookie(getAdminSessionCookieName(), token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: getAdminSessionMaxAge(),
  });

  return res.json({ ok: true });
});

export default router;
