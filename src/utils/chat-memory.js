'use strict';

// Долгая память чата: сжатые выжимки из старых сообщений.
// Хранятся рядом с остальными данными бота и живут ограниченное число дней.
// Здесь только чистые функции — их проверяет test/chat-memory.test.js без сети и Telegram.

const DEFAULT_RETENTION_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

// Убираем записи старше срока хранения. Записи без даты тоже отбрасываем:
// иначе они остались бы в памяти навсегда.
function pruneMemories(entries, retentionDays = DEFAULT_RETENTION_DAYS, now = Date.now()) {
  const days = Number(retentionDays) > 0 ? Number(retentionDays) : DEFAULT_RETENTION_DAYS;
  const cutoff = now - days * DAY_MS;
  return (Array.isArray(entries) ? entries : []).filter(entry => {
    if (!entry || typeof entry !== 'object') return false;
    const created = Date.parse(entry.createdAt);
    return Number.isFinite(created) && created >= cutoff;
  });
}

// Текст для промпта: свежие выжимки важнее старых, поэтому набираем их с конца,
// а хвост обрезаем по бюджету символов.
function memoryContext(entries, maxChars = 4000) {
  const usable = (Array.isArray(entries) ? entries : []).filter(
    entry => entry && typeof entry.summary === 'string' && entry.summary.trim()
  );
  if (!usable.length) return '';

  const limit = Number(maxChars) > 0 ? Number(maxChars) : 4000;
  const blocks = [];
  let total = 0;

  for (let i = usable.length - 1; i >= 0; i--) {
    const entry = usable[i];
    const period = formatPeriod(entry);
    const block = `${period}${entry.summary.trim()}`;
    if (blocks.length && total + block.length > limit) break;
    blocks.unshift(block);
    total += block.length;
  }

  if (!blocks.length) return '';
  return `=== ПАМЯТЬ ЧАТА (сжатая история прошлых дней, используй как контекст) ===\n${blocks.join('\n')}\n=== КОНЕЦ ПАМЯТИ ===\n`;
}

function formatPeriod(entry) {
  const from = String(entry.from || entry.createdAt || '').slice(0, 10);
  const to = String(entry.to || '').slice(0, 10);
  if (from && to && from !== to) return `[${from} — ${to}] `;
  return from ? `[${from}] ` : '';
}

// Пора сжимать, когда в живом окне накопилось больше, чем помещается в контекст.
function nextCompressionSize(historyLength, contextSize, chunkSize) {
  const window = Number(contextSize) > 0 ? Number(contextSize) : 100;
  const chunk = Number(chunkSize) > 0 ? Number(chunkSize) : 30;
  if (!Number.isFinite(historyLength) || historyLength <= window) return 0;
  const excess = historyLength - window;
  return Math.min(chunk, excess) > 0 ? Math.min(chunk, excess) : 0;
}

module.exports = {
  DEFAULT_RETENTION_DAYS,
  pruneMemories,
  memoryContext,
  nextCompressionSize,
};
