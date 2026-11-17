'use strict';

const crypto = require('node:crypto');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const svgCaptcha = require('svg-captcha');
const { rateLimit } = require('express-rate-limit');

function readPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

const CAPTCHA_TTL_SECONDS = readPositiveInt(process.env.CAPTCHA_TTL_SECONDS, 180);
const CAPTCHA_MAX_ATTEMPTS = readPositiveInt(process.env.CAPTCHA_MAX_ATTEMPTS, 5);
const CAPTCHA_MAX_ACTIVE = readPositiveInt(process.env.CAPTCHA_MAX_ACTIVE, 10000);
const CAPTCHA_SECRET = process.env.CAPTCHA_SECRET || crypto.randomBytes(32).toString('hex');

function digestAnswer(id, answer) {
  return crypto.createHmac('sha256', CAPTCHA_SECRET).update(`${id}:${answer}`, 'utf8').digest();
}

function safeEqual(left, right) {
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function createCaptchaStore() {
  const records = new Map();

  function removeExpired(now = Date.now()) {
    for (const [id, record] of records) {
      if (record.expiresAt <= now) records.delete(id);
    }
  }

  function add(id, answer) {
    const now = Date.now();
    removeExpired(now);
    while (records.size >= CAPTCHA_MAX_ACTIVE) {
      const oldestId = records.keys().next().value;
      if (!oldestId) break;
      records.delete(oldestId);
    }
    records.set(id, {
      answerHash: digestAnswer(id, answer),
      expiresAt: now + CAPTCHA_TTL_SECONDS * 1000,
      attempts: 0
    });
  }

  function verify(id, answer) {
    const record = records.get(id);
    if (!record) return { ok: false, reason: 'invalid_or_expired' };
    if (record.expiresAt <= Date.now()) {
      records.delete(id);
      return { ok: false, reason: 'invalid_or_expired' };
    }

    if (safeEqual(record.answerHash, digestAnswer(id, answer))) {
      records.delete(id);
      return { ok: true };
    }

    record.attempts += 1;
    if (record.attempts >= CAPTCHA_MAX_ATTEMPTS) {
      records.delete(id);
      return { ok: false, reason: 'attempts_exceeded' };
    }
    return {
      ok: false,
      reason: 'incorrect',
      attemptsRemaining: CAPTCHA_MAX_ATTEMPTS - record.attempts
    };
  }

  return { add, verify };
}

function createApp() {
  const app = express();
  const store = createCaptchaStore();
  const corsOrigin = process.env.CORS_ORIGIN;

  app.use(cors({
    origin: corsOrigin
      ? corsOrigin.split(',').map((item) => item.trim()).filter(Boolean)
      : '*'
  }));
  app.use(helmet());
  app.use(express.json({ limit: '10kb' }));

  const createLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Too many CAPTCHA requests. Try again later.' }
  });
  const verifyLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { success: false, message: 'Too many verification requests. Try again later.' }
  });

  app.get('/health', (_req, res) => res.json({ success: true, status: 'ok' }));

  app.get('/api/captcha', createLimiter, (_req, res, next) => {
    try {
      const id = crypto.randomUUID();
      const captcha = svgCaptcha.create({
        size: 6,
        charPreset: '0123456789',
        noise: 2,
        color: true,
        width: 180,
        height: 64,
        fontSize: 48,
        background: '#f4f6f8'
      });
      store.add(id, captcha.text);
      const image = Buffer.from(captcha.data, 'utf8').toString('base64');
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
      res.json({
        success: true,
        captchaId: id,
        image: `data:image/svg+xml;base64,${image}`,
        expiresIn: CAPTCHA_TTL_SECONDS
      });
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/captcha/verify', verifyLimiter, (req, res) => {
    const captchaId = typeof req.body?.captchaId === 'string' ? req.body.captchaId.trim() : '';
    const answer = typeof req.body?.answer === 'string' ? req.body.answer.trim() : '';
    if (!captchaId || !answer || answer.length > 32) {
      return res.status(400).json({ success: false, message: 'captchaId and answer are required.' });
    }

    const result = store.verify(captchaId, answer);
    if (result.ok) return res.json({ success: true, valid: true });
    if (result.reason === 'attempts_exceeded') {
      return res.status(429).json({
        success: false,
        valid: false,
        message: 'Maximum attempts exceeded. Request a new CAPTCHA.'
      });
    }
    if (result.reason === 'invalid_or_expired') {
      return res.status(410).json({
        success: false,
        valid: false,
        message: 'CAPTCHA is invalid, expired, or already used.'
      });
    }
    return res.status(400).json({
      success: false,
      valid: false,
      message: 'Incorrect CAPTCHA.',
      attemptsRemaining: result.attemptsRemaining
    });
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ success: false, message: 'Internal server error.' });
  });
  return app;
}

module.exports = { createApp };
