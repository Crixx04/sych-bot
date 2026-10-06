const packageInfo = require('../package.json');
// Файл с секретами можно вынести за пределы репозитория: SYCH_ENV_FILE=/путь/к/env.
require('dotenv').config({ path: process.env.SYCH_ENV_FILE || '.env' });

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
// Доля от 0 до 1 — для шансов и вероятностей, которые задаются в .env.
function ratio(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, 0), 1);
}

// Целое в заданных границах — для порогов вроде оценки 0..10.
function boundedInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}


// Собираем ключи для Native Google (Fallback или Search)
const geminiKeys = [];
if (process.env.GOOGLE_GEMINI_API_KEY) geminiKeys.push(process.env.GOOGLE_GEMINI_API_KEY);
let i = 2;
while (process.env[`GOOGLE_GEMINI_API_KEY_${i}`]) {
    geminiKeys.push(process.env[`GOOGLE_GEMINI_API_KEY_${i}`]);
    i++;
}

console.log(`[CONFIG] Загружено ключей Gemini (Native): ${geminiKeys.length}`);

module.exports = {
  // === TELEGRAM ===
  telegramToken: process.env.TELEGRAM_BOT_TOKEN,
  version: packageInfo.version,
  botId: parseInt(process.env.TELEGRAM_BOT_TOKEN.split(':')[0], 10),
  adminId: parseInt(process.env.ADMIN_USER_ID, 10),
  
  // === OPENROUTER / API (Основной канал) ===
  aiBaseUrl: process.env.AI_BASE_URL || "https://openrouter.ai/api/v1",
  aiKey: process.env.OPENROUTER_API_KEY || process.env.AI_API_KEY, 

  // === АКТУАЛЬНЫЕ МОДЕЛИ (АВГУСТ 2026) ===

  // 1. УМНАЯ (Ответы в чате)
  // Модели можно переопределить из .env: MAIN_MODEL и LOGIC_MODEL.
  mainModel: process.env.MAIN_MODEL || 'google/gemini-3.7-flash',
  
  // 2. ЛОГИКА (Анализ, реакции, проверки)
  // Free версия недоступна, используем эффективную платную
  logicModel: process.env.LOGIC_MODEL || 'google/gemma-3-27b-it', 

  // === ПОИСК (RAG или NATIVE) ===
  // Варианты: 
  // 'tavily'     -> Использует Tavily API (RAG). Лучший вариант для сторонних моделей.
  // 'perplexity' -> Использует модель Sonar через OpenRouter (RAG).
  // 'google'     -> Переключается на нативный Google API с встроенным поиском (Tools).
  // Если в .env не задано, по умолчанию используем 'tavily'
  searchProvider: process.env.SEARCH_PROVIDER || 'tavily',  
  
  // Настройки провайдеров
  tavilyKey: process.env.TAVILY_API_KEY,
  perplexityModel: 'perplexity/sonar', // Актуальный алиас

  // === GEMINI NATIVE (FALLBACK / SEARCH) ===
  geminiKeys: geminiKeys,
  // Модели Google тоже настраиваемые: Google выводит старые из эксплуатации без предупреждения.
  googleNativeModel: process.env.GOOGLE_NATIVE_MODEL || 'gemini-3.5-flash-lite', 
  voiceFallbackModel: process.env.VOICE_FALLBACK_MODEL || 'gemini-3.5-flash',
  voiceSummaryTimeoutMs: positiveNumber(process.env.VOICE_SUMMARY_TIMEOUT_SECONDS, 45) * 1000,
  fallbackModelName: process.env.FALLBACK_MODEL || 'gemini-3.5-flash-lite',
  contextSize: 30,

  // === ПОТОЛОК ВЫВОДА МОДЕЛИ ===
  // Раньше было 3500 — длинные ответы рвало на полуслове (особенно с блоком «Источники»).
  // Telegram rich (sendRichMessage) держит ~32k символов, а модели — до 64k токенов,
  // так что даём простор, чтобы большие сообщения доходили целиком. Это лишь ПОТОЛОК:
  // платим только за реально сгенерированные токены, модель сама останавливается раньше.
  maxOutputTokens: 16000,

  // Потолок длины описания-памяти картинки (символы). Подробное описание оседает в
  // истории чата и едет в контексте, пока картинка в окне, — поэтому потолок конечный.
  // ~1500 ≈ хороший абзац-полтора. Под скрины с большими таблицами текста можно поднять.
  imageDescMaxChars: 1500,

  // === НАДЁЖНОСТЬ ХРАНИЛИЩА ===
  backupIntervalMs: positiveNumber(process.env.BACKUP_INTERVAL_HOURS, 24) * 60 * 60 * 1000,
  backupRetention: Math.floor(positiveNumber(process.env.BACKUP_RETENTION, 14)),

  // === ВНЕШНИЙ КОНТЕНТ ===
  youtubeTranscriptMaxChars: Math.floor(positiveNumber(process.env.YOUTUBE_TRANSCRIPT_MAX_CHARS, 100000)),
  youtubeGeminiModel: process.env.YOUTUBE_GEMINI_MODEL || 'gemini-3.5-flash-lite',
  youtubeGeminiTimeoutMs: positiveNumber(process.env.YOUTUBE_GEMINI_TIMEOUT_SECONDS, 45) * 1000,
  youtubeGeminiCacheTtlMs: positiveNumber(process.env.YOUTUBE_GEMINI_CACHE_HOURS, 6) * 60 * 60 * 1000,
  officeTextMaxChars: Math.floor(positiveNumber(process.env.OFFICE_TEXT_MAX_CHARS, 100000)),
  officeExpandedMaxBytes: Math.floor(positiveNumber(process.env.OFFICE_EXPANDED_MAX_MB, 32) * 1024 * 1024),

  // === СПОНТАННАЯ АКТИВНОСТЬ В ЧАТЕ ===
  // Допуск случайности: какая доля подходящих сообщений доходит до оценки моделью.
  // 0.25 = четверть. Само решение о влезании принимает оценка ниже (spontaneousThreshold).
  spontaneousChance: ratio(process.env.SPONTANEOUS_CHANCE, 0.25),
  // Порог оценки 0..10: ниже него бот не влезает, даже если допуск выпал.
  spontaneousThreshold: boundedInt(process.env.SPONTANEOUS_THRESHOLD, 8, 0, 10),
  // Минимальная пауза между спонтанными репликами в одном чате, минуты.
  spontaneousCooldownMs: positiveNumber(process.env.SPONTANEOUS_COOLDOWN_MIN, 15) * 60 * 1000,
  // Потолок длины спонтанной реплики, символы.
  spontaneousMaxChars: Math.floor(positiveNumber(process.env.SPONTANEOUS_MAX_CHARS, 300)),
  // Разрешение искать в интернете по своей инициативе: не только по просьбе, но и когда
  // бот сам приводит аргумент в споре или короткой реплике. SPONTANEOUS_SEARCH=false
  // выключает поиск именно для спонтанных реплик.
  spontaneousSearch: process.env.SPONTANEOUS_SEARCH !== 'false',

  // Выключать «размышление» у моделей на механических задачах (JSON, оценки, реакции).
  // Иначе размышляющая модель тратит лимит токенов на мысли и отдаёт пустой ответ.
  disableThinking: process.env.AI_DISABLE_THINKING !== 'false',

  // Шанс одиночной эмодзи-реакции на чужое сообщение (раньше было зашито 0.015).
  reactionChance: ratio(process.env.REACTION_CHANCE, 0.015),
  // === ОЗВУЧКА (Gemini TTS) ===
  // Модель и голос озвучки: список доступных голосов — в документации Gemini TTS.
  // Озвучка выключена по умолчанию: включается SPEECH_ENABLED=true.
  // Причина: TTS требует ключа Google, а голосовые сообщения — ещё и ffmpeg на сервере.
  speechEnabled: process.env.SPEECH_ENABLED === 'true',
  speechModel: process.env.SPEECH_MODEL || 'gemini-2.5-flash-preview-tts',
  speechVoice: process.env.SPEECH_VOICE || 'Charon',
  // Потолок текста для озвучки (символы) и таймаут запроса.
  speechMaxChars: Math.floor(positiveNumber(process.env.SPEECH_MAX_CHARS, 400)),
  speechTimeoutMs: positiveNumber(process.env.SPEECH_TIMEOUT_SECONDS, 30) * 1000,

  triggerRegex: /(?<![а-яёa-z])(сыч|sych)(?![а-яёa-z])/i,
};
