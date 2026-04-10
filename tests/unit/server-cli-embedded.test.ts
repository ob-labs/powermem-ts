import { describe, expect, it } from 'vitest';
import { isEmbeddedStorage } from '../../src/server/cli/embedded-storage.js';

describe('server embedded storage detection', () => {
  it('treats sqlite as embedded', () => {
    expect(isEmbeddedStorage({
      vectorStore: {
        provider: 'sqlite',
        config: { path: './data.db' },
      },
    })).toBe(true);
  });

  it('treats seekdb provider as embedded equivalent', () => {
    expect(isEmbeddedStorage({
      vectorStore: {
        provider: 'seekdb',
        config: { path: './seekdb_data' },
      },
    })).toBe(true);
  });

  it('treats oceanbase without host as embedded seekdb', () => {
    expect(isEmbeddedStorage({
      vectorStore: {
        provider: 'oceanbase',
        config: { host: '', obPath: './seekdb_data', dbName: 'test' },
      },
    })).toBe(true);
  });

  it('treats oceanbase with host as non-embedded', () => {
    expect(isEmbeddedStorage({
      vectorStore: {
        provider: 'oceanbase',
        config: { host: '127.0.0.1', dbName: 'test' },
      },
    })).toBe(false);
  });
});
