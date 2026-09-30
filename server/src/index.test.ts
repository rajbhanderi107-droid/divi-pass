import { describe, expect, it } from 'vitest';
import worker from './index';

const env = { ANTHROPIC_API_KEY: 'sk-test', APP_TOKEN: 'right-code', ALLOWED_ORIGIN: 'https://example.github.io' };
const post = (body: unknown, token = 'right-code') =>
  worker.fetch(new Request('https://w.test/', { method: 'POST', headers: { 'x-app-token': token, 'content-type': 'application/json' }, body: JSON.stringify(body) }), env);

describe('photo reader worker', () => {
  it('answers CORS preflight for your site only', async () => {
    const r = await worker.fetch(new Request('https://w.test/', { method: 'OPTIONS' }), env);
    expect(r.status).toBe(204); expect(r.headers.get('access-control-allow-origin')).toBe('https://example.github.io');
  });
  it('rejects a wrong or missing access code before doing anything', async () => {
    expect((await post({ image: 'abc', mediaType: 'image/jpeg' }, 'nope')).status).toBe(401);
    expect((await worker.fetch(new Request('https://w.test/', { method: 'POST', body: '{}' }), env)).status).toBe(401);
  });
  it('rejects non-POST, bad media types, and oversize images (after the code is accepted)', async () => {
    expect((await worker.fetch(new Request('https://w.test/', { method: 'GET' }), env)).status).toBe(405);
    expect((await post({ image: 'abc', mediaType: 'text/plain' })).status).toBe(400);
    expect((await post({ image: 'x'.repeat(6_000_001), mediaType: 'image/jpeg' })).status).toBe(400);
    expect((await post({ mediaType: 'image/jpeg' })).status).toBe(400);
  });
  it('fails closed when no APP_TOKEN is configured', async () => {
    const r = await worker.fetch(new Request('https://w.test/', { method: 'POST', headers: { 'x-app-token': '' }, body: '{}' }), { ...env, APP_TOKEN: '' });
    expect(r.status).toBe(401);
  });
});
