import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { indexerService } from '../services/indexer.js';

const router = express.Router();

const CORPUS_DIR = path.resolve('./corpus');
const PDF_DIR = path.join(CORPUS_DIR, 'pdf');

function sanitizeSubdir(value = '') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (trimmed.includes('..')) return '';
  return trimmed.replace(/^\/+|\/+$/g, '');
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

router.get('/admin/api/folders', async (req, res) => {
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

router.post('/admin/api/index', async (req, res) => {
  const rawPath = sanitizeSubdir(req.body?.path || req.body?.subdir || '');
  const isFull = Boolean(req.body?.full);

  try {
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

export default router;
