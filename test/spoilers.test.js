const assert = require('node:assert/strict');
const test = require('node:test');
const { SPOILER_PLACEHOLDER, redactSpoilers } = require('../src/utils/spoilers');

test('без сущностей текст не меняется', () => {
  assert.equal(redactSpoilers('обычный текст', []), 'обычный текст');
  assert.equal(redactSpoilers('обычный текст', undefined), 'обычный текст');
  assert.equal(redactSpoilers('', []), '');
  assert.equal(redactSpoilers(null, []), '');
});

test('текст под спойлером заменяется заглушкой', () => {
  // 'секрет' — 6 символов после 'ай, '
  const text = 'ай, секрет тут';
  const entities = [{ type: 'spoiler', offset: 4, length: 6 }];
  assert.equal(redactSpoilers(text, entities), `ай, ${SPOILER_PLACEHOLDER} тут`);
});

test('несколько спойлеров не съезжают по смещениям', () => {
  const text = 'первый тайна и второй секрет конец';
  const entities = [
    { type: 'spoiler', offset: 7, length: 5 },
    { type: 'spoiler', offset: 20, length: 6 },
  ];
  const result = redactSpoilers(text, entities);
  assert.ok(result.startsWith('первый '), result);
  assert.equal((result.match(/\[скрыто под спойлером\]/g) || []).length, 2, result);
  assert.ok(!result.includes('тайна') && !result.includes('секрет'), result);
  assert.ok(result.endsWith(' конец'), result);
});

test('чужие сущности игнорируются', () => {
  const text = 'ссылка и жирный';
  const entities = [
    { type: 'bold', offset: 0, length: 6 },
    { type: 'url', offset: 0, length: 6 },
    { type: 'text_link', offset: 10, length: 7 },
  ];
  assert.equal(redactSpoilers(text, entities), text);
});

test('битые сущности не ломают разбор', () => {
  const text = 'короткий текст';
  const entities = [
    { type: 'spoiler' },
    { type: 'spoiler', offset: 100, length: 5 },
    { type: 'spoiler', offset: 0, length: 0 },
    null,
  ];
  assert.equal(redactSpoilers(text, entities), text);
});
