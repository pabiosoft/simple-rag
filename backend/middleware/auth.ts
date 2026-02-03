import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';

let warnedOnce = false;

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function apiAuth(req: Request, res: Response, next: NextFunction) {
  const requiredKey = process.env.API_KEY || '';

  if (!requiredKey) {
    if (!warnedOnce) {
      console.warn('⚠️  API_KEY non défini: authentification désactivée.');
      warnedOnce = true;
    }
    return next();
  }

  const headerKey = req.header('x-api-key') || '';
  const bearer = req.header('authorization') || '';
  const token = bearer.toLowerCase().startsWith('bearer ')
    ? bearer.slice(7).trim()
    : '';

  const provided = headerKey || token;

  if (provided && safeEqual(provided, requiredKey)) {
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
}

export function isSameOriginRequest(req: Request) {
  const origin = req.header('origin');
  if (!origin) return false;

  const forwardedProto = (req.header('x-forwarded-proto') || '').split(',')[0].trim();
  const proto = forwardedProto || req.protocol;
  const host = req.header('x-forwarded-host') || req.header('host');
  if (!host) return false;

  const expectedOrigin = `${proto}://${host}`;
  return origin === expectedOrigin;
}
