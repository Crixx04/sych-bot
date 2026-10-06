'use strict';

// Текст под спойлером не должен попадать ни в контекст модели, ни в досье участников.
// Telegram отдаёт спойлер отдельной сущностью (type: 'spoiler') с offset/length в UTF-16 —
// ровно в тех единицах, в которых считает индексы JavaScript.

const SPOILER_PLACEHOLDER = '[скрыто под спойлером]';

function redactSpoilers(text, entities) {
  if (typeof text !== 'string' || !text) return '';
  if (!Array.isArray(entities) || entities.length === 0) return text;

  const spoilers = entities
    .filter(entity => entity
      && entity.type === 'spoiler'
      && Number.isInteger(entity.offset)
      && Number.isInteger(entity.length)
      && entity.length > 0)
    // С конца: тогда смещения ещё не тронутых сущностей остаются верными.
    .sort((a, b) => b.offset - a.offset);

  let result = text;
  for (const entity of spoilers) {
    const start = entity.offset;
    const end = entity.offset + entity.length;
    if (start >= result.length) continue;
    result = result.slice(0, start) + SPOILER_PLACEHOLDER + result.slice(end);
  }
  return result;
}

module.exports = { SPOILER_PLACEHOLDER, redactSpoilers };
