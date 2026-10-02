import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeAudioUrl, getAudioCacheKey, cacheAudioResponse, readCachedAudioResponse } from '../js/audio-cache.js';

test('normalizeAudioUrl trims whitespace and rejects empty values', () => {
  assert.equal(normalizeAudioUrl('  https://example.com/audio.mp3  '), 'https://example.com/audio.mp3');
  assert.equal(normalizeAudioUrl('   '), '');
  assert.equal(normalizeAudioUrl(''), '');
});

test('getAudioCacheKey keeps a canonical URL for audio files', () => {
  const keyA = getAudioCacheKey('https://example.com/audio.mp3');
  const keyB = getAudioCacheKey('https://example.com/audio.mp3?token=abc');

  assert.ok(keyA.includes('example.com/audio.mp3'));
  assert.equal(typeof keyA, 'string');
  assert.equal(typeof keyB, 'string');
  assert.notEqual(keyA, keyB);
});

test('cacheAudioResponse stores a response under the source url', async () => {
  const memory = new Map();
  const fakeStorage = {
    async open() {
      return {
        async put(key, response) {
          memory.set(key, response);
        },
        async match(key) {
          return memory.get(key) || null;
        }
      };
    }
  };

  const response = new Response('hello-audio', {
    headers: { 'Content-Type': 'audio/mpeg' }
  });

  const stored = await cacheAudioResponse('https://example.com/audio.mp3', response, fakeStorage);
  const cached = await readCachedAudioResponse('https://example.com/audio.mp3', fakeStorage);

  assert.equal(stored, true);
  assert.ok(cached);
  assert.equal(await cached.text(), 'hello-audio');
});
