'use strict';

// Озвучка через нативный Google Gemini TTS. Почему так, а не через основной канал:
// TTS отдаёт сырой PCM, а не текст, и работает только на ключах Google —
// в OpenAI-совместимом канале (OpenRouter и прочие) такого режима нет.
//
// Голосовое сообщение в Telegram — это OGG/Opus, поэтому PCM оборачиваем в WAV
// (чистый JS, без зависимостей), а в OGG конвертируем через ffmpeg, если он есть.
// Нет ffmpeg — отправляем WAV как аудиофайл: смысл сохраняется, вид другой.

const { execFileSync } = require('child_process');

const DEFAULT_SAMPLE_RATE = 24000; // Gemini TTS: 24 кГц, моно, 16 бит
const DEFAULT_CHANNELS = 1;
const DEFAULT_BITS = 16;

function pcmToWav(pcm, { sampleRate = DEFAULT_SAMPLE_RATE, channels = DEFAULT_CHANNELS, bitsPerSample = DEFAULT_BITS } = {}) {
  if (!Buffer.isBuffer(pcm) || pcm.length === 0) throw new Error('пустой аудиобуфер');
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new Error('некорректная частота дискретизации');

  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM без сжатия
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);

  return Buffer.concat([header, pcm]);
}

function defaultRunner(command, args, input) {
  return execFileSync(command, args, {
    input,
    stdio: ['pipe', 'pipe', 'ignore'],
    maxBuffer: 32 * 1024 * 1024,
  });
}

// ffmpeg есть не везде — проверяем один раз за запуск и запоминаем ответ.
let ffmpegAvailable = null;

function hasFfmpeg({ runner = defaultRunner, cache = true } = {}) {
  if (cache && ffmpegAvailable !== null) return ffmpegAvailable;
  let result;
  try {
    runner('ffmpeg', ['-version'], undefined);
    result = true;
  } catch (error) {
    result = false;
  }
  if (cache) ffmpegAvailable = result;
  return result;
}

function wavToOpus(wav, { runner = defaultRunner } = {}) {
  const out = runner('ffmpeg', [
    '-hide_banner', '-loglevel', 'error',
    '-i', 'pipe:0',
    '-c:a', 'libopus', '-b:a', '48k', '-ar', '48000',
    '-f', 'ogg', 'pipe:1',
  ], wav);
  if (!Buffer.isBuffer(out) || out.length === 0) throw new Error('ffmpeg вернул пустой файл');
  return out;
}

// Возвращает то, что можно отправить: голосовое (OGG/Opus) или обычный аудиофайл (WAV).
function toVoiceNote(wav, options = {}) {
  if (!Buffer.isBuffer(wav) || wav.length === 0) throw new Error('пустой аудиобуфер');
  if (!hasFfmpeg(options)) return { buffer: wav, filename: 'answer.wav', voice: false };
  try {
    return { buffer: wavToOpus(wav, options), filename: 'answer.ogg', voice: true };
  } catch (error) {
    return { buffer: wav, filename: 'answer.wav', voice: false };
  }
}

// Запрос к Gemini TTS. Ответ: base64 PCM в inlineData плюс mimeType с частотой.
async function synthesizeSpeech(text, {
  apiKey, model, voice, timeoutMs = 30000, http = require('axios'),
} = {}) {
  if (!apiKey) throw new Error('нет ключа Google Gemini для озвучки');
  if (!text || !String(text).trim()) throw new Error('нечего озвучивать');

  const response = await http.post(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      contents: [{ parts: [{ text: String(text) }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    },
    {
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      timeout: timeoutMs,
    }
  );

  const parts = response?.data?.candidates?.[0]?.content?.parts || [];
  const audioPart = parts.find(part => part?.inlineData?.data);
  if (!audioPart) throw new Error('Gemini не вернул аудио');

  const pcm = Buffer.from(audioPart.inlineData.data, 'base64');
  if (pcm.length === 0) throw new Error('Gemini вернул пустое аудио');

  const mime = String(audioPart.inlineData.mimeType || '');
  const rate = Number((mime.match(/rate=(\d+)/) || [])[1]);

  return {
    wav: pcmToWav(pcm, Number.isFinite(rate) && rate > 0 ? { sampleRate: rate } : {}),
    mime,
  };
}

module.exports = {
  DEFAULT_SAMPLE_RATE,
  hasFfmpeg,
  pcmToWav,
  synthesizeSpeech,
  toVoiceNote,
  wavToOpus,
};
