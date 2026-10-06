const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

// Проверяем саму фичу: бот влезает в чужой разговор без обращения по имени.
// Харнесс повторяет test/conversation-routing.test.js, но управляет шансом и случаем.
function harness({ chance = 1, cooldownMs = 15 * 60 * 1000, random = () => 0, reply = 'Ну и затея, конечно.', scores = [10], speechEnabled = true } = {}) {
  const state = { sent: [], answers: [], rated: [], spoken: [], audio: [] };
  // Таймеры «печатает» подменяем, чтобы проверить: индикатор выключается, а не висит до предохранителя.
  const timerLog = { intervals: [], cleared: [] };
  const nextScore = () => (scores.length > 1 ? scores.shift() : scores[0]);
  const storage = { isBanned: () => false, hasChat: () => true, updateChatName() {}, trackUser() {},
    isTopicMuted: () => false, getProfile: () => ({}), getChatProfile: () => ({ topic: 'test' }),
    getUserInstruction: () => '',
    loadHistory: () => [], saveHistory: () => {}, getChatMemories: () => [],
    addChatMemory: () => {}, countChatMemories: () => 0, clearChatMemories: () => {},
  };
  const ai = {
    getResponse: async (history, input, image, mime, instruction, profile, isSpontaneous) => {
      state.answers.push({ input, isSpontaneous, instruction, history: [...history] });
      return reply;
    },
    speak: async text => {
      state.spoken.push(text);
      return Buffer.from([1, 2, 3, 4]);
    },
    generateFlavorText: async (task, result) => `flavor:${result}`,
    rateInterjectionInterest: async contextText => {
      const score = nextScore();
      state.rated.push({ contextText, score });
      return score;
    },
    analyzeUserImmediate: async () => null,
    determineReaction: async () => null,
  };
  const sendRich = async (bot, chatId, content, opts) => {
    state.sent.push({ chatId, content, opts });
    return { messageId: state.sent.length };
  };
  const dependencies = {
    '../services/storage': storage,
    '../services/ai': ai,
    '../config': {
      adminId: 999, botId: 888, contextSize: 30,
      spontaneousChance: chance, spontaneousCooldownMs: cooldownMs,
      spontaneousMaxChars: 300, spontaneousThreshold: 8, reactionChance: 0,
      speechEnabled, speechMaxChars: 400,
      triggerRegex: /(?<![а-яёa-z])(сыч|sych)(?![а-яёa-z])/i,
    },
    axios: { get: async () => ({ data: Buffer.from('x') }) },
    child_process: {},
    '../utils/rich': { sendRich, escapeHtml: x => String(x), normalizeMd: x => x,
      formatVoiceMessage: x => ({ html: `VOICE CARD: ${x.text}` }), quoteFallback: () => null },
    '../utils/privacy': { isForgetMeRequest: () => false },
    '../utils/profile-query': {},
    '../utils/commands': {},
    '../services/documents': {},
    '../utils/reminders': require('../src/utils/reminders'),
    '../utils/interjection': require('../src/utils/interjection'),
    '../utils/chat-memory': require('../src/utils/chat-memory'),
    '../utils/spoilers': require('../src/utils/spoilers'),
    '../utils/identity': require('../src/utils/identity'),
    '../utils/side-taking': require('../src/utils/side-taking'),
    '../utils/voice-request': require('../src/utils/voice-request'),
    '../services/speech': { toVoiceNote: wav => ({ buffer: wav, filename: 'answer.wav', voice: false }) },
    '../core/prompts': { sideTaking: target => `[СПОР: ${target}]` },
  };
  const box = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/core/logic.js'), 'utf8'), {
    module: box,
    require: name => {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    Buffer, console: { log() {}, error() {} },
    setTimeout: () => 0, clearTimeout: () => {},
    setInterval: (fn, ms) => {
      const id = timerLog.intervals.length + 1;
      timerLog.intervals.push({ id, ms });
      return id;
    },
    clearInterval: id => { timerLog.cleared.push(id); },
    Math: { ...Math, random },
  });
  const bot = {
    getFileLink: async () => 'mock://file',
    sendChatAction: async () => {},
    setMessageReaction: async () => {},
    sendVoice: async (chatId, buffer, options) => { state.audio.push({ kind: 'voice', chatId, buffer, options }); },
    sendAudio: async (chatId, buffer, options) => { state.audio.push({ kind: 'audio', chatId, buffer, options }); },
  };
  return { state, timerLog, async message(text, overrides = {}) {
    const msg = {
      message_id: 500, from: { id: 555, first_name: 'Тест' },
      chat: { id: -100, type: 'supergroup' }, is_topic_message: true, message_thread_id: 184,
      text, ...overrides,
    };
    await box.exports.processMessage(bot, msg);
    // Вмешательство считается в отдельных асинхронных шагах — даём очереди задач дойти до конца,
    // иначе проверки увидят состояние до отправки реплики.
    await new Promise(resolve => setImmediate(resolve));
    return msg;
  } };
}

const LONG_TEXT = 'Сегодня обсудили новую гипотезу по заявкам, выглядит спорно';
test('без обращения бот вставляет короткую реплику от себя', async () => {
  const { state, message } = harness({ chance: 1, random: () => 0 });
  await message(LONG_TEXT);

  assert.equal(state.answers.length, 1, 'модель вызвана один раз');
  assert.equal(state.answers[0].isSpontaneous, true, 'ответ помечен как спонтанный');
  assert.equal(state.sent.length, 1, 'в чат ушло ровно одно сообщение');
  assert.equal(state.sent[0].content.markdown, 'Ну и затея, конечно.');
  assert.equal(state.sent[0].opts.threadId, 184, 'ответ остаётся в той же теме');
});

test('кулдаун не даёт влезать в один чат чаще заданного', async () => {
  const { state, message } = harness({ chance: 1, random: () => 0 });
  await message(LONG_TEXT);
  await message(LONG_TEXT);

  assert.equal(state.answers.length, 1, 'вторая реплика заблокирована кулдауном');
  assert.equal(state.sent.length, 1);
});

test('при нулевом шансе бот молчит', async () => {
  const { state, message } = harness({ chance: 0, random: () => 0 });
  await message(LONG_TEXT);

  assert.equal(state.answers.length, 0);
  assert.equal(state.sent.length, 0);
});

test('по обращению «Сыч» бот отвечает как обычно, а не вмешивается', async () => {
  const { state, message } = harness({ chance: 1, random: () => 0 });
  await message('Сыч, что думаешь про новую гипотезу по заявкам?');

  assert.equal(state.answers.length, 1);
  assert.equal(state.answers[0].isSpontaneous, false, 'обычный ответ, не вмешательство');
});

test('в business-переписках бот не влезает сам', async () => {
  const { state, message } = harness({ chance: 1, random: () => 0 });
  await message(LONG_TEXT, { business_connection_id: 'bc-1' });

  assert.equal(state.answers.length, 0);
  assert.equal(state.sent.length, 0);
});

test('на короткую реплику бот не реагирует', async () => {
  const { state, message } = harness({ chance: 1, random: () => 0 });
  await message('ок');

  assert.equal(state.answers.length, 0);
  assert.equal(state.sent.length, 0);
});

test('низкая оценка сообщения — бот молчит, хотя допуск выпал', async () => {
  const { state, message } = harness({ chance: 1, random: () => 0, scores: [3] });
  await message(LONG_TEXT);

  assert.equal(state.rated.length, 1, 'сообщение оценено');
  assert.equal(state.answers.length, 0, 'реплика не генерировалась');
  assert.equal(state.sent.length, 0, 'в чат ничего не ушло');
});

test('оценка на пороге и выше — бот влезает', async () => {
  const { state, message } = harness({ chance: 1, random: () => 0, scores: [8] });
  await message(LONG_TEXT);

  assert.equal(state.answers.length, 1);
  assert.equal(state.sent.length, 1);
});

test('неудачная оценка не расходует кулдаун', async () => {
  const { state, message } = harness({ chance: 1, random: () => 0, scores: [5, 9] });
  await message(LONG_TEXT);
  assert.equal(state.sent.length, 0, 'первое сообщение не прошло по оценке');

  await message(LONG_TEXT);
  assert.equal(state.rated.length, 2, 'второе сообщение снова оценено');
  assert.equal(state.sent.length, 1, 'второе сообщение прошло и бот ответил');
});

test('служебная метка и кавычки из ответа модели не уходят в чат', async () => {
  const { state, message } = harness({
    chance: 1, random: () => 0, scores: [10], reply: '"Сыч: Ну и затея, конечно."',
  });
  await message(LONG_TEXT);

  assert.equal(state.sent[0].content.markdown, 'Ну и затея, конечно.');
});

test('текст под спойлером не уходит в модель', async () => {
  const { state, message } = harness({ chance: 0 });
  const text = 'сыч, глянь: секретная цифра 42';
  await message(text, { entities: [{ type: 'spoiler', offset: 12, length: 15 }] });

  assert.equal(state.answers.length, 1, 'бот ответил по обращению');
  const sentToModel = state.answers[0].input.text;
  assert.ok(!sentToModel.includes('секретная цифра'), sentToModel);
  assert.ok(sentToModel.includes('[скрыто под спойлером]'), sentToModel);
});

test('на «ты же бот» уходит подсказка с отмазками', async () => {
  const { state, message } = harness({ chance: 0 });
  await message('Сыч, ты бот?');

  assert.equal(state.answers.length, 1);
  assert.ok(state.answers[0].instruction.includes('Не признавайся'), state.answers[0].instruction);
});

test('просьба встать на сторону превращается в режим спора', async () => {
  const { state, message } = harness({ chance: 0 });
  await message('Сыч, встань на сторону удалёнки');

  assert.equal(state.answers.length, 1);
  assert.ok(state.answers[0].instruction.includes('[СПОР: удалёнки]'), state.answers[0].instruction);
});

test('обычная просьба не включает режим спора', async () => {
  const { state, message } = harness({ chance: 0 });
  await message('Сыч, поддержи меня');

  assert.equal(state.answers.length, 1);
  assert.ok(!state.answers[0].instruction.includes('[СПОР:'), state.answers[0].instruction);
});

test('просьба озвучить отправляет аудио вместо текста', async () => {
  const { state, message } = harness({ chance: 0 });
  await message('Сыч, озвучь «привет мир»');

  assert.deepEqual(state.spoken, ['привет мир'], 'на озвучку ушёл именно текст');
  assert.equal(state.audio.length, 1, 'ушло одно аудио');
  assert.equal(state.answers.length, 0, 'обычного ответа нет');
  assert.equal(state.audio[0].kind, 'audio', 'без ffmpeg отправляем аудиофайл');
  assert.equal(state.audio[0].options.message_thread_id, 184, 'остаёмся в своей теме');
});

test('«озвучь» реплаем читает текст того сообщения', async () => {
  const { state, message } = harness({ chance: 0 });
  await message('сыч, озвучь', { reply_to_message: { from: { id: 777 }, text: 'Отчёт готов, ждём правки.' } });

  assert.deepEqual(state.spoken, ['Отчёт готов, ждём правки.']);
  assert.equal(state.audio.length, 1);
});

test('упоминание озвучки в обычной фразе не включает режим', async () => {
  const { state, message } = harness({ chance: 0 });
  await message('Сыч, озвучка в видео была плохая, что скажешь?');

  assert.equal(state.spoken.length, 0, 'озвучки не было');
  assert.equal(state.audio.length, 0);
  assert.equal(state.answers.length, 1, 'обычный ответ');
});

test('после «кинь монетку» индикатор «печатает» выключается', async () => {
  const { state, timerLog, message } = harness({ chance: 0 });
  await message('Сыч, кинь монетку');

  assert.equal(state.sent.length, 1, 'ответ ушёл');
  assert.ok(timerLog.intervals.length >= 1, 'печатание стартовало');
  assert.deepEqual(timerLog.cleared, timerLog.intervals.map(item => item.id), 'все таймеры печатания выключены');
});

test('отказ по размеру файла тоже выключает «печатает»', async () => {
  const { state, timerLog, message } = harness({ chance: 0 });
  await message('Сыч, глянь видео', { video: { file_id: 'v', file_size: 30 * 1024 * 1024 } });

  assert.equal(state.sent.length, 1, 'бот объяснил отказ');
  assert.deepEqual(timerLog.cleared, timerLog.intervals.map(item => item.id), 'все таймеры печатания выключены');
});

test('при выключенной озвучке просьба уходит в обычный текстовый ответ', async () => {
  const { state, message } = harness({ chance: 0, speechEnabled: false });
  await message('Сыч, озвучь «привет мир»');

  assert.equal(state.spoken.length, 0, 'в TTS не ходили');
  assert.equal(state.audio.length, 0, 'аудио не отправляли');
  assert.equal(state.answers.length, 1, 'обычный ответ');
});
