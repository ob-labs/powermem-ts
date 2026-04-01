/**
 * Multi-language tests
 * Ported from Python's test_native_language.py
 *
 * Verifies correct storage and retrieval of:
 * - Chinese (CJK)
 * - Japanese
 * - Arabic (RTL)
 * - Emoji
 * - Mixed-language content
 * - Special characters and punctuation
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NativeProvider } from '../src/provider/native/index.js';
import { MockEmbeddings } from './mocks.js';

describe('multi-language support', () => {
  let provider: NativeProvider;

  beforeAll(async () => {
    provider = await NativeProvider.create({
      embeddings: new MockEmbeddings(),
      dbPath: ':memory:',
    });
  });

  afterAll(async () => {
    await provider.close();
  });

  it('stores and retrieves Chinese text', async () => {
    const content = '用户喜欢喝咖啡，住在上海浦东新区';
    const res = await provider.add({ content, infer: false });
    const mem = await provider.get(res.memories[0].id);
    expect(mem!.content).toBe(content);
  });

  it('stores and retrieves Japanese text', async () => {
    const content = 'ユーザーはコーヒーが好きで、東京に住んでいます';
    const res = await provider.add({ content, infer: false });
    const mem = await provider.get(res.memories[0].id);
    expect(mem!.content).toBe(content);
  });

  it('stores and retrieves Arabic text', async () => {
    const content = 'المستخدم يحب القهوة ويعيش في دبي';
    const res = await provider.add({ content, infer: false });
    const mem = await provider.get(res.memories[0].id);
    expect(mem!.content).toBe(content);
  });

  it('stores and retrieves emoji', async () => {
    const content = 'I love 🐱 cats and ☕ coffee! 🎉🚀💯';
    const res = await provider.add({ content, infer: false });
    const mem = await provider.get(res.memories[0].id);
    expect(mem!.content).toBe(content);
  });

  it('stores and retrieves mixed Chinese-English', async () => {
    const content = '我最喜欢的language是TypeScript，在Google工作';
    const res = await provider.add({ content, infer: false });
    const mem = await provider.get(res.memories[0].id);
    expect(mem!.content).toBe(content);
  });

  it('stores special punctuation and symbols', async () => {
    const content = '«guillemets» „quotes" 「brackets」 ¿question? ¡exclamation!';
    const res = await provider.add({ content, infer: false });
    const mem = await provider.get(res.memories[0].id);
    expect(mem!.content).toBe(content);
  });

  it('search finds Chinese content', async () => {
    await provider.add({ content: '北京是中国的首都', userId: 'lang', infer: false });
    await provider.add({ content: 'Tokyo is the capital of Japan', userId: 'lang', infer: false });

    const result = await provider.search({ query: '北京', userId: 'lang' });
    expect(result.results.length).toBeGreaterThan(0);
  });

  it('metadata with unicode keys and values', async () => {
    const res = await provider.add({
      content: 'metadata test',
      metadata: { '标签': '重要', 'カテゴリ': 'テスト', 'emoji': '🏷️' },
      infer: false,
    });
    const mem = await provider.get(res.memories[0].id);
    expect(mem!.metadata).toEqual({ '标签': '重要', 'カテゴリ': 'テスト', 'emoji': '🏷️' });
  });
});
