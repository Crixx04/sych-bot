'use strict';

// Разбор просьбы «озвучь»: что именно читать голосом.
// Обращение «сыч» и сама просьба из текста убираются, остаток — то, что нужно произнести.
// Если своего текста нет, берём сообщение, на которое ответили.
//
// Важно различать просьбу и простое упоминание: «сыч, озвучь это» — просьба,
// а «сыч, озвучка в видео была плохая» — нет. Поэтому повелительные формы ловим сразу,
// а существительное («озвучка», «озвучь-ка»→ нет) — только когда за ним идёт разделитель
// или конец фразы.

const IMPERATIVE = /(?:озвучь|озвучивай|проговори|проговаривай|прочитай\s+вслух|скажи\s+голосом|голосом\s+скажи|войсом)/i;
// \w не покрывает кириллицу, поэтому окончания слов берём классом [а-яё].
const NOUN = /(?:озвучк[а-яё]*|озвуч[а-яё]*)(?=\s*[:\-—?!.,]|\s*$)/i;

function isVoiceRequest(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  return IMPERATIVE.test(text) || NOUN.test(text);
}

function stripRequestWords(text) {
  return String(text)
    .replace(/(?<![а-яёa-z])(сыч|sych)(?![а-яёa-z])/gi, ' ')
    .replace(new RegExp(IMPERATIVE.source, 'gi'), ' ')
    .replace(new RegExp(NOUN.source, 'gi'), ' ')
    .replace(/[«»"'`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseVoiceRequest(text, replyText = '') {
  if (!isVoiceRequest(text)) return null;

  const target = stripRequestWords(text)
    .replace(/^[:,\-—.]+/, '')
    .trim();

  if (target) return { text: target };

  const fallback = String(replyText || '').replace(/\s+/g, ' ').trim();
  return fallback ? { text: fallback, fromReply: true } : null;
}

module.exports = { isVoiceRequest, parseVoiceRequest };
