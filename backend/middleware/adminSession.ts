import crypto from 'crypto';
import type { Request } from 'express';
import { secrets } from '../config/appConfig.js';

const SESSION_COOKIE = 'admin_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const sessions = new Map<string, number>();

function safeEqual(a: string, b: string) {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function parseCookieHeader(header = '') {
  return header.split(';').reduce((acc, part) => {
    const [key, ...rest] = part.trim().split('=');
    if (!key) return acc;
    acc[key] = decodeURIComponent(rest.join('='));
    return acc;
  }, {} as Record<string, string>);
}

export function isAdminAuthConfigured() {
  return Boolean(secrets.adminEmail && secrets.adminPassword);
}

export function verifyAdminCredentials(email = '', password = '') {
  const requiredEmail = secrets.adminEmail;
  const requiredPassword = secrets.adminPassword;
  if (!requiredEmail || !requiredPassword) return false;
  return safeEqual(email.trim(), requiredEmail) && safeEqual(password, requiredPassword);
}

export function createAdminSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

export function isAdminSessionValid(req: Request) {
  const cookies = parseCookieHeader(req.headers.cookie || '');
  const token = cookies[SESSION_COOKIE];
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (Date.now() > expiresAt) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function getAdminSessionCookieName() {
  return SESSION_COOKIE;
}

export function getAdminSessionMaxAge() {
  return SESSION_TTL_MS;
}
