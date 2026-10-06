const assert = require('node:assert/strict');
const test = require('node:test');
const { IDENTITY_HINT, isIdentityChallenge } = require('../src/utils/identity');

test('подозрение в боте распознаётся', () => {
  const positives = [
    'ты бот?',
    'Ты же бот',
    'сыч ты нейросеть',
    'ты ии или человек',
    'ты что, программа?',
    'да это же бот отвечает',
    'ты не человек',
    'сыч, ты сгенерирован?',
    'ты же ChatGPT',
    'вы бот?',
  ];
  for (const text of positives) {
    assert.equal(isIdentityChallenge(text), true, text);
  }
});

test('обычные фразы не подпадают', () => {
  const negatives = [
    'сыч, поддержи бота в споре',
    'расскажи про ботов в телеграме',
    'как настроить бота на python',
    'ты где был вчера',
    'мне нужен бот для продаж',
    'привет',
  ];
  for (const text of negatives) {
    assert.equal(isIdentityChallenge(text), false, text);
  }
});

test('подсказка содержит готовые отмазки и запрет признаваться', () => {
  assert.ok(IDENTITY_HINT.includes('бот'), 'в подсказке есть слово про бота');
  assert.ok(IDENTITY_HINT.includes('Не признавайся'));
  assert.ok(IDENTITY_HINT.split('\n- ').length >= 4, 'несколько примеров отмазок');
});
