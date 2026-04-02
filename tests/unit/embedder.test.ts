import { describe, it, expect } from 'vitest';
import { Embedder } from '../../src/integrations/embeddings/embedder.js';
import { MockEmbeddings } from '../mocks.js';

describe('Embedder', () => {
  it('replaces newlines with spaces', async () => {
    const mock = new MockEmbeddings();
    const embedder = new Embedder(mock);

    await embedder.embed('hello\nworld\nfoo');
    expect(mock.calls[0]).toBe('hello world foo');
  });

  it('returns vector of correct dimension', async () => {
    const mock = new MockEmbeddings(16);
    const embedder = new Embedder(mock);

    const vec = await embedder.embed('test');
    expect(vec).toHaveLength(16);
    expect(vec.every((v) => typeof v === 'number')).toBe(true);
  });

  it('batch embed returns correct count', async () => {
    const mock = new MockEmbeddings();
    const embedder = new Embedder(mock);

    const vecs = await embedder.embedBatch(['a', 'b', 'c']);
    expect(vecs).toHaveLength(3);
    expect(vecs[0]).toHaveLength(8);
  });

  it('batch embed replaces newlines', async () => {
    const mock = new MockEmbeddings();
    const embedder = new Embedder(mock);

    await embedder.embedBatch(['hello\nworld', 'foo\nbar']);
    expect(mock.calls).toContain('hello world');
    expect(mock.calls).toContain('foo bar');
  });
});
