'use strict';

// Режим «встань на сторону в споре» — идея из бота «Пошлый дед»: он не просто подкалывает,
// а занимает позицию и подогревает дискуссию. Здесь только разбор просьбы; сама инструкция
// для модели — в prompts.js.

const SIDE_PATTERNS = [
  /(?:^|[\s,])встань(?:те)?\s+(?:на\s+сторону|на\s+стороны|за|против)\s+([^?!.]+)/i,
  /(?:^|[\s,])будь\s+(?:на\s+стороне|за)\s+([^?!.]+)/i,
  /(?:^|[\s,])поддержи(?:те)?\s+([^?!.]+)/i,
  /(?:^|[\s,])защити(?:те)?\s+([^?!.]+)/i,
  /(?:^|[\s,])играй\s+за\s+([^?!.]+)/i,
];

const STOP_WORDS = new Set(['меня', 'нас', 'его', 'её', 'ее', 'их', 'себя', 'это', 'эту', 'этот']);

function parseSideTaking(text) {
  if (typeof text !== 'string') return null;

  for (const pattern of SIDE_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    const raw = String(match[1] || '').trim();
    if (!raw) continue;

    const target = raw.replace(/\s+/g, ' ').slice(0, 120).trim();
    if (!target) continue;
    // «поддержи меня» без содержания — не режим спора, а обычная просьба.
    if (STOP_WORDS.has(target.toLowerCase())) continue;

    return { target };
  }
  return null;
}

module.exports = { parseSideTaking };
