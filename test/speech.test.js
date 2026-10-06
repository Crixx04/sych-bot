const assert = require('node:assert/strict');
const test = require('node:test');
const {
  DEFAULT_SAMPLE_RATE,
  pcmToWav,
  synthesizeSpeech,
  toVoiceNote,
  wavToOpus,
} = require('../src/services/speech');

const PCM = Buffer.alloc(480, 1); // 10 мс тишины при 24 кГц

test('PCM оборачивается в корректный WAV-заголовок', () => {
  const wav = pcmToWav(PCM);

  assert.equal(wav.slice(0, 4).toString(), 'RIFF');
  assert.equal(wav.slice(8, 12).toString(), 'WAVE');
  assert.equal(wav.slice(12, 16).toString(), 'fmt ');
  assert.equal(wav.slice(36, 40).toString(), 'data');
  assert.equal(wav.length, 44 + PCM.length, 'размер = заголовок + данные');
  assert.equal(wav.readUInt32LE(4), 36 + PCM.length, 'размер RIFF');
  assert.equal(wav.readUInt16LE(22), 1, 'моно');
  assert.equal(wav.readUInt32LE(24), DEFAULT_SAMPLE_RATE, 'частота по умолчанию');
  assert.equal(wav.readUInt16LE(34), 16, '16 бит');
  assert.equal(wav.readUInt32LE(40), PCM.length, 'размер данных');
});

test('частота дискретизации подставляется из mime', () => {
  const wav = pcmToWav(PCM, { sampleRate: 48000 });
  assert.equal(wav.readUInt32LE(24), 48000);
  assert.equal(wav.readUInt32LE(28), 48000 * 2, 'байт в секунду для моно 16 бит');
});

test('пустой буфер и мусорная частота — ошибка', () => {
  assert.throws(() => pcmToWav(Buffer.alloc(0)), /пустой аудиобуфер/);
  assert.throws(() => pcmToWav('не буфер'), /пустой аудиобуфер/);
  assert.throws(() => pcmToWav(PCM, { sampleRate: 0 }), /частота/);
});

test('без ffmpeg отдаём WAV как аудиофайл', () => {
  const runner = () => { throw new Error('ffmpeg не найден'); };
  const note = toVoiceNote(PCM, { runner, cache: false });

  assert.equal(note.voice, false);
  assert.equal(note.filename, 'answer.wav');
  assert.equal(note.buffer, PCM);
});

test('с ffmpeg получается голосовое сообщение', () => {
  const ogg = Buffer.from('OggS-подделка');
  const runner = (command, args, input) => {
    if (args[0] === '-version') return Buffer.from('ffmpeg version');
    assert.equal(command, 'ffmpeg');
    assert.equal(input, PCM, 'на вход уходит WAV');
    return ogg;
  };
  const note = toVoiceNote(PCM, { runner, cache: false });

  assert.equal(note.voice, true);
  assert.equal(note.filename, 'answer.ogg');
  assert.equal(note.buffer, ogg);
});

test('падение ffmpeg не ломает озвучку, а откатывает к WAV', () => {
  const runner = command => {
    if (command === 'ffmpeg') return Buffer.from('ok');
  };
  const runnerBroken = (command, args) => {
    if (args[0] === '-version') return Buffer.from('ffmpeg version');
    throw new Error('libopus недоступен');
  };

  assert.equal(wavToOpus(PCM, { runner }).length > 0, true);
  const note = toVoiceNote(PCM, { runner: runnerBroken, cache: false });
  assert.equal(note.voice, false);
  assert.equal(note.filename, 'answer.wav');
});

test('озвучка разбирает ответ Gemini', async () => {
  const pcm = Buffer.from([1, 2, 3, 4]);
  const http = {
    post: async (url, body, options) => {
      assert.ok(url.includes('gemini-2.5-flash-preview-tts'), url);
      assert.equal(body.generationConfig.responseModalities[0], 'AUDIO');
      assert.equal(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, 'Charon');
      assert.equal(options.headers['x-goog-api-key'], 'test-key');
      return {
        data: {
          candidates: [{ content: { parts: [{ inlineData: { data: pcm.toString('base64'), mimeType: 'audio/L16;rate=24000' } }] } }],
        },
      };
    },
  };

  const result = await synthesizeSpeech('привет', {
    apiKey: 'test-key', model: 'gemini-2.5-flash-preview-tts', voice: 'Charon', http,
  });

  assert.equal(result.wav.length, 44 + 4);
  assert.equal(result.wav.readUInt32LE(24), 24000);
  assert.equal(result.mime, 'audio/L16;rate=24000');
});

test('ошибки озвучки понятны и не молчат', async () => {
  await assert.rejects(() => synthesizeSpeech('текст', { model: 'm', voice: 'v' }), /нет ключа/);
  await assert.rejects(
    () => synthesizeSpeech('   ', { apiKey: 'k', model: 'm', voice: 'v', http: { post: async () => ({ data: {} }) } }),
    /нечего озвучивать/
  );
  await assert.rejects(
    () => synthesizeSpeech('текст', { apiKey: 'k', model: 'm', voice: 'v', http: { post: async () => ({ data: { candidates: [{ content: { parts: [] } }] } }) } }),
    /не вернул аудио/
  );
});
