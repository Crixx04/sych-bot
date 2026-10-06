const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

// Проверяем долгую память чата на живом потоке сообщений: переполнение окна уходит
// в сжатую выжимку, окно не растёт бесконечно, память доезжает до модели,
// а при сбое сжатия переписка не теряется.
function harness({ contextSize = 5, chunk = 2, summary = 'обсуждали заявки и бюджет', summarizeThrows = false } = {}) {
  const state = { answers: [], memories: [], savedHistory: [], summaries: [] };

  const storage = {
    isBanned: () => false, hasChat: () => true, updateChatName() {}, trackUser() {},
    isTopicMuted: () => false, getProfile: () => ({}), getChatProfile: () => ({ topic: 'test' }),
    getUserInstruction: () => '',
    loadHistory: () => [],
    saveHistory: (chatId, entries) => { state.savedHistory.push(entries.map(e => e.text)); },
    getChatMemories: () => state.memories,
    addChatMemory: (chatId, entry) => { state.memories.push(entry); },
    countChatMemories: () => state.memories.length,
    clearChatMemories: () => {},
  };

  const ai = {
    getResponse: async (...args) => {
      state.answers.push({ memory: args[9], history: [...args[0]] });
      return 'готово';
    },
    summarizeChatChunk: async messages => {
      state.summaries.push(messages.map(m => m.text));
      if (summarizeThrows) return null;
      return summary;
    },
    analyzeUserImmediate: async () => null,
    determineReaction: async () => null,
    rateInterjectionInterest: async () => 0,
  };

  const dependencies = {
    '../services/storage': storage,
    '../services/ai': ai,
    '../config': {
      adminId: 999, botId: 888, contextSize,
      memoryChunkMessages: chunk, memoryRetentionDays: 180,
      memoryMaxBlocks: 40, memoryMaxChars: 4000,
      spontaneousChance: 0, reactionChance: 0, spontaneousMaxChars: 300,
      spontaneousThreshold: 8, spontaneousCooldownMs: 0,
      triggerRegex: /(?<![а-яёa-z])(сыч|sych)(?![а-яёa-z])/i,
    },
    axios: { get: async () => ({ data: Buffer.from('x') }) },
    child_process: {},
    '../utils/rich': {
      sendRich: async () => ({ messageId: 1 }), escapeHtml: x => String(x), normalizeMd: x => x,
      formatVoiceMessage: x => ({ html: x.text }), quoteFallback: () => null,
    },
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
    '../services/speech': { toVoiceNote: wav => ({ buffer: wav, filename: 'a.wav', voice: false }) },
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
    setInterval: () => 1, clearInterval: () => {},
    Math,
  });

  const bot = { sendChatAction: async () => {}, setMessageReaction: async () => {} };
  return {
    state,
    async message(text) {
      const msg = {
        message_id: 1, from: { id: 555, first_name: 'Тест' },
        chat: { id: -100, type: 'supergroup' }, is_topic_message: true, message_thread_id: 1,
        text,
      };
      await box.exports.processMessage(bot, msg);
      await new Promise(resolve => setImmediate(resolve));
      await new Promise(resolve => setImmediate(resolve));
    },
  };
}

test('переполнение окна уходит в сжатую память, а не выбрасывается', async () => {
  const { state, message } = harness({ contextSize: 5, chunk: 2 });
  for (let i = 1; i <= 12; i++) await message(`сыч, сообщение номер ${i}`);

  assert.ok(state.memories.length >= 2, `сжатие должно было сработать (выжимок: ${state.memories.length})`);
  assert.ok(state.summaries.length >= 2, 'модель вызывалась для сжатия');
  for (const entry of state.memories) {
    assert.ok(entry.summary && entry.summary.length > 0, 'в памяти лежит непустая выжимка');
    assert.ok(entry.messages >= 1, 'у выжимки посчитано число сообщений');
    assert.ok(Date.parse(entry.createdAt) > 0, 'у выжимки есть дата создания');
  }
});

test('живое окно не растёт выше настроенного размера', async () => {
  const { state, message } = harness({ contextSize: 5, chunk: 2 });
  for (let i = 1; i <= 12; i++) await message(`сыч, сообщение номер ${i}`);

  const biggest = Math.max(...state.savedHistory.map(list => list.length));
  // Без сжатия окно выросло бы до 24 записей (12 сообщений + 12 ответов бота).
  assert.ok(biggest <= 7, `окно разрослось до ${biggest} записей вместо ~6`);
  const lastSaved = state.savedHistory[state.savedHistory.length - 1];
  assert.ok(lastSaved.some(x => String(x).includes('сообщение номер 12')), 'последнее сообщение остаётся в окне');
});

test('сжатая память доезжает до модели вместе с историей', async () => {
  const { state, message } = harness({ contextSize: 5, chunk: 2 });
  for (let i = 1; i <= 8; i++) await message(`сыч, сообщение номер ${i}`);

  const last = state.answers[state.answers.length - 1];
  assert.ok(last, 'модель вызвана');
  assert.match(String(last.memory), /ПАМЯТЬ ЧАТА/, 'в промпт ушёл блок сжатой памяти');
  assert.match(String(last.memory), /обсуждали заявки и бюджет/, 'в блоке текст выжимки');
});

test('при сбое сжатия переписка не теряется', async () => {
  const { state, message } = harness({ contextSize: 5, chunk: 2, summarizeThrows: true });
  for (let i = 1; i <= 4; i++) await message(`сыч, сообщение номер ${i}`);

  assert.equal(state.memories.length, 0, 'выжимка не добавилась');
  const lastSaved = state.savedHistory[state.savedHistory.length - 1];
  assert.ok(lastSaved.some(x => String(x).includes('сообщение номер 1')), 'старые сообщения остались в истории');
});
