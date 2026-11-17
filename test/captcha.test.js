'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { createApp } = require('../src/app');
const app = createApp();

test('health endpoint reports service status', async () => {
  const response = await request(app).get('/health');
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { success: true, status: 'ok' });
});

test('captcha endpoint returns an id and SVG data URL without exposing the answer', async () => {
  const response = await request(app).get('/api/captcha');
  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.match(response.body.captchaId, /^[0-9a-f-]{36}$/i);
  assert.match(response.body.image, /^data:image\/svg\+xml;base64,/);
  assert.equal(typeof response.body.expiresIn, 'number');
  assert.equal(Object.hasOwn(response.body, 'answer'), false);
});

test('verification rejects missing fields', async () => {
  const response = await request(app).post('/api/captcha/verify').send({ captchaId: 'test-id' });
  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
});

test('verification rejects unknown or expired ids', async () => {
  const response = await request(app)
    .post('/api/captcha/verify')
    .send({ captchaId: 'unknown-id', answer: '123456' });
  assert.equal(response.status, 410);
  assert.equal(response.body.valid, false);
});
