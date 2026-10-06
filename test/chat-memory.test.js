const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DEFAULT_RETENTION_DAYS,
  pruneMemories,
  memoryContext,
  nextCompressionSize,
} = require('../src/utils/chat-memory');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-10-06T12:00:00Z');

function entry(daysAgo, summary) {
  return {
    createdAt: new Date(NOW - daysAgo * DAY).toISOString(),
    summary,
  };
}

test('по умолчанию память хранится 180 дней', () => {
  assert.equal(DEFAULT_RETENTION_DAYS, 180);
});

test('записи старше срока хранения отбрасываются', () => {
  const kept = pruneMemories([entry(10, 'свежая'), entry(179, 'на грани'), entry(181, 'старая')], 180, NOW);
  assert.equal(kept.length, 2);
  assert.deepEqual(kept.map(e => e.summary), ['свежая', 'на грани']);
});

test('запись без даты не остаётся в памяти навсегда', () => {
  const kept = pruneMemories([{ summary: 'без даты' }, entry(5, 'с датой')], 180, NOW);
  assert.deepEqual(kept.map(e => e.summary), ['с датой']);
});

test('мусор вместо списка не ломает чистку', () => {
  assert.deepEqual(pruneMemories(null, 180, NOW), []);
  assert.deepEqual(pruneMemories([null, 'строка', 42], 180, NOW), []);
});

test('срок хранения из настроек важнее значения по умолчанию', () => {
  const kept = pruneMemories([entry(40, 'сорок дней')], 30, NOW);
  assert.equal(kept.length, 0);
});

test('текст памяти собирается из выжимок с датами', () => {
  const context = memoryContext([entry(3, 'обсуждали бюджет'), entry(1, 'решили ставить счётчики')], 4000);
  assert.match(context, /ПАМЯТЬ ЧАТА/);
  assert.match(context, /обсуждали бюджет/);
  assert.match(context, /решили ставить счётчики/);
  assert.ok(context.indexOf('обсуждали бюджет') < context.indexOf('решили ставить счётчики'),
    'старые выжимки идут раньше свежих');
  assert.match(context, /КОНЕЦ ПАМЯТИ/);
});

test('свежие выжимки приоритетнее старых при жёстком лимите символов', () => {
  const old = entry(100, 'С'.repeat(200));
  const fresh = entry(1, 'свежая и важная выжимка');
  const context = memoryContext([old, fresh], 60);
  assert.match(context, /свежая и важная выжимка/);
  assert.ok(!context.includes('С'.repeat(200)), 'старая выжимка не должна вытеснять свежую');
});

test('пустая память не добавляет мусора в промпт', () => {
  assert.equal(memoryContext([], 4000), '');
  assert.equal(memoryContext([{ createdAt: new Date(NOW).toISOString(), summary: '   ' }], 4000), '');
});

test('сжатие запускается только при переполнении окна', () => {
  assert.equal(nextCompressionSize(100, 100, 30), 0, 'ровно окно — сжимать нечего');
  assert.equal(nextCompressionSize(130, 100, 30), 30, 'переполнение на 30 — берём 30');
  assert.equal(nextCompressionSize(105, 100, 30), 5, 'переполнение на 5 — берём 5');
  assert.equal(nextCompressionSize(0, 100, 30), 0);
});
