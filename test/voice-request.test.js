const assert = require('node:assert/strict');
const test = require('node:test');
const { isVoiceRequest, parseVoiceRequest } = require('../src/utils/voice-request');

test('просьба озвучить распознаётся', () => {
  for (const text of [
    'сыч, озвучь это',
    'Сыч скажи голосом привет',
    'сыч проговори список',
    'сыч прочитай вслух',
    'сыч, озвучка',
  ]) {
    assert.equal(isVoiceRequest(text), true, text);
  }
});

test('обычные сообщения просьбой не считаются', () => {
  for (const text of [
    'сыч, привет',
    'скажи, сколько время',
    'озвучка в видео была плохая',
    'сыч, озвучка в видео была плохая',
    '',
    null,
  ]) {
    assert.equal(isVoiceRequest(text), false, String(text));
  }
});

test('озвучка как существительное работает с разделителем или в конце фразы', () => {
  assert.equal(isVoiceRequest('сыч, озвучка'), true);
  assert.equal(isVoiceRequest('сыч, озвучка: привет мир'), true);
  assert.equal(isVoiceRequest('сыч, озвучка этого текста'), false, 'пояснение после слова — уже не просьба');
});

test('из просьбы вытаскивается текст для озвучки', () => {
  assert.equal(parseVoiceRequest('Сыч, озвучь «привет мир»')?.text, 'привет мир');
  assert.equal(parseVoiceRequest('сыч скажи голосом: сегодня пятница')?.text, 'сегодня пятница');
  assert.equal(parseVoiceRequest('Сыч, проговори СРОКИ СДАЧИ')?.text, 'СРОКИ СДАЧИ');
});

test('без своего текста берётся сообщение из реплая', () => {
  const parsed = parseVoiceRequest('сыч, озвучь', 'Отчёт готов, ждём правки.');
  assert.equal(parsed?.text, 'Отчёт готов, ждём правки.');
  assert.equal(parsed?.fromReply, true);
});

test('если озвучивать нечего — режим не включается', () => {
  assert.equal(parseVoiceRequest('сыч, озвучь'), null);
  assert.equal(parseVoiceRequest('сыч, озвучь', '   '), null);
  assert.equal(parseVoiceRequest('сыч, привет', 'текст'), null);
  assert.equal(parseVoiceRequest(null, 'текст'), null);
});
