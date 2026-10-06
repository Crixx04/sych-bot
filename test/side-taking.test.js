const assert = require('node:assert/strict');
const test = require('node:test');
const { parseSideTaking } = require('../src/utils/side-taking');

test('просьбы встать на сторону распознаются', () => {
  const cases = [
    ['сыч, встань на сторону директора', 'директора'],
    ['Сыч встань за удалёнку', 'удалёнку'],
    ['сыч, будь на стороне Подколзина', 'Подколзина'],
    ['сыч поддержи новый оффер', 'новый оффер'],
    ['сыч, защити идею с двадцатью страницами', 'идею с двадцатью страницами'],
    ['сыч играй за команду дизайна', 'команду дизайна'],
  ];
  for (const [text, expected] of cases) {
    const parsed = parseSideTaking(text);
    assert.ok(parsed, `не распознано: ${text}`);
    assert.equal(parsed.target, expected, text);
  }
});

test('цель обрезается по знакам вопроса и длине', () => {
  assert.equal(parseSideTaking('сыч, встань на сторону клиента?')?.target, 'клиента');
  assert.equal(parseSideTaking('сыч, встань на сторону клиента!')?.target, 'клиента');
  const long = parseSideTaking(`сыч, встань на сторону ${'а'.repeat(300)}`);
  assert.ok(long && long.target.length <= 120);
});

test('без содержательной цели режим не включается', () => {
  assert.equal(parseSideTaking('сыч, поддержи меня'), null);
  assert.equal(parseSideTaking('сыч, встань на сторону'), null);
  assert.equal(parseSideTaking('сыч, что думаешь про оффер?'), null);
  assert.equal(parseSideTaking(''), null);
  assert.equal(parseSideTaking(null), null);
});
