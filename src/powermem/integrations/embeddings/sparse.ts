/**
 * Sparse embedding — BM25 implementation + interfaces.
 *
 * BM25 (Best Match 25) produces sparse vectors from term frequencies,
 * used for keyword-based retrieval and hybrid search (combined with dense vectors).
 */

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface SparseEmbedding {
  /** Non-zero dimension indices (term hashes). */
  indices: number[];
  /** TF-IDF / BM25 weights at those indices. */
  values: number[];
}

export interface SparseEmbedder {
  embedSparse(text: string): Promise<SparseEmbedding>;
  embedSparseBatch(texts: string[]): Promise<SparseEmbedding[]>;
  /** Fit the model on a corpus (for IDF calculation). */
  fit?(corpus: string[]): void;
}

// ─── Tokenizer ───────────────────────────────────────────────────────────────

/** Simple whitespace + punctuation tokenizer with optional stopword removal. */
export function tokenize(text: string, stopwords?: Set<string>): string[] {
  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (stopwords) return tokens.filter(t => !stopwords.has(t));
  return tokens;
}

/**
 * CJK-aware tokenizer — splits Chinese/Japanese/Korean text into individual characters
 * and Latin text into words. Works without native dependencies.
 *
 * For higher-quality Chinese segmentation, pass a custom tokenizer
 * (e.g. nodejieba) via BM25Config.tokenizer.
 */
export function tokenizeCJK(text: string, stopwords?: Set<string>): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];

  // Split CJK characters individually, Latin words by whitespace
  // CJK Unified Ideographs: U+4E00–U+9FFF
  // CJK Extension A: U+3400–U+4DBF
  // Hiragana: U+3040–U+309F, Katakana: U+30A0–U+30FF
  // Hangul: U+AC00–U+D7AF
  const CJK_REGEX = /[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/;

  let buf = '';
  for (const ch of lower) {
    if (CJK_REGEX.test(ch)) {
      // Flush Latin buffer
      if (buf.trim()) {
        for (const w of buf.trim().split(/\s+/).filter(Boolean)) tokens.push(w);
      }
      buf = '';
      tokens.push(ch);
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) {
    for (const w of buf.replace(/[^\p{L}\p{N}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean)) tokens.push(w);
  }

  if (stopwords) return tokens.filter(t => !stopwords.has(t));
  return tokens;
}

/** Default English stopwords. */
export const ENGLISH_STOPWORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
  'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
  'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
  'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
  'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both',
  'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
  'only', 'own', 'same', 'than', 'too', 'very', 'just', 'because',
  'if', 'when', 'where', 'how', 'what', 'which', 'who', 'whom',
  'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our',
  'you', 'your', 'he', 'him', 'his', 'she', 'her', 'it', 'its',
  'they', 'them', 'their', 'about', 'up', 'all', 'also',
]);

/** Common Chinese stopwords (的、了、在、是、我、有、和、就…). */
export const CHINESE_STOPWORDS = new Set([
  '的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一',
  '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
  '没有', '看', '好', '自己', '这', '他', '她', '它', '们', '那',
  '而', '但', '又', '还', '把', '被', '让', '给', '从', '向', '对',
  '已', '已经', '所以', '因为', '如果', '虽然', '然后', '可以', '这个',
  '那个', '什么', '怎么', '为什么', '哪', '吗', '呢', '吧', '啊',
  '了', '过', '着', '地', '得', '么',
]);

// ─── Hash function ───────────────────────────────────────────────────────────

/** FNV-1a hash → positive integer index in a fixed vocabulary space. */
function hashTerm(term: string, vocabSize = 2 ** 18): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < term.length; i++) {
    hash ^= term.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash % vocabSize;
}

// ─── BM25 Sparse Embedder ────────────────────────────────────────────────────

export interface BM25Config {
  /** BM25 k1 parameter — term frequency saturation (default: 1.5). */
  k1?: number;
  /** BM25 b parameter — document length normalization (default: 0.75). */
  b?: number;
  /** Hash vocabulary size (default: 2^18 = 262144). */
  vocabSize?: number;
  /** Custom stopwords set. Defaults to ENGLISH_STOPWORDS. */
  stopwords?: Set<string>;
  /** Custom tokenizer. Defaults to built-in whitespace tokenizer. */
  tokenizer?: (text: string) => string[];
}

export class BM25SparseEmbedder implements SparseEmbedder {
  private readonly k1: number;
  private readonly b: number;
  private readonly vocabSize: number;
  private readonly stopwords: Set<string>;
  private readonly tokenizer: (text: string) => string[];

  /** Document frequency: term hash → number of documents containing this term. */
  private df = new Map<number, number>();
  /** Total number of documents in the corpus. */
  private N = 0;
  /** Average document length (in tokens). */
  private avgDl = 0;

  constructor(config: BM25Config = {}) {
    this.k1 = config.k1 ?? 1.5;
    this.b = config.b ?? 0.75;
    this.vocabSize = config.vocabSize ?? 2 ** 18;
    this.stopwords = config.stopwords ?? ENGLISH_STOPWORDS;
    this.tokenizer = config.tokenizer ?? ((text: string) => tokenize(text, this.stopwords));
  }

  /** Fit on a corpus to compute IDF values. Can be called incrementally. */
  fit(corpus: string[]): void {
    let totalTokens = this.avgDl * this.N;

    for (const doc of corpus) {
      const tokens = this.tokenizer(doc);
      totalTokens += tokens.length;
      this.N++;

      // Count unique terms in this document
      const seen = new Set<number>();
      for (const token of tokens) {
        const h = hashTerm(token, this.vocabSize);
        if (!seen.has(h)) {
          seen.add(h);
          this.df.set(h, (this.df.get(h) ?? 0) + 1);
        }
      }
    }

    this.avgDl = this.N > 0 ? totalTokens / this.N : 0;
  }

  /** Add a single document to the IDF statistics. */
  addDocument(text: string): void {
    this.fit([text]);
  }

  async embedSparse(text: string): Promise<SparseEmbedding> {
    const tokens = this.tokenizer(text);
    if (tokens.length === 0) return { indices: [], values: [] };

    // Count term frequencies in this document
    const tf = new Map<number, number>();
    for (const token of tokens) {
      const h = hashTerm(token, this.vocabSize);
      tf.set(h, (tf.get(h) ?? 0) + 1);
    }

    const dl = tokens.length;
    const indices: number[] = [];
    const values: number[] = [];

    for (const [termHash, freq] of tf) {
      // IDF: log((N - df + 0.5) / (df + 0.5) + 1)
      const docFreq = this.df.get(termHash) ?? 0;
      const N = Math.max(this.N, 1);
      const idf = Math.log((N - docFreq + 0.5) / (docFreq + 0.5) + 1);

      // BM25 TF component: (f * (k1 + 1)) / (f + k1 * (1 - b + b * dl / avgDl))
      const avgDl = this.avgDl || dl; // fallback if not fitted
      const tfScore = (freq * (this.k1 + 1)) / (freq + this.k1 * (1 - this.b + this.b * dl / avgDl));

      const score = idf * tfScore;
      if (score > 0) {
        indices.push(termHash);
        values.push(score);
      }
    }

    return { indices, values };
  }

  async embedSparseBatch(texts: string[]): Promise<SparseEmbedding[]> {
    return Promise.all(texts.map(t => this.embedSparse(t)));
  }
}

// ─── Sparse similarity ──────────────────────────────────────────────────────

/** Dot product between two sparse vectors. */
export function sparseDotProduct(a: SparseEmbedding, b: SparseEmbedding): number {
  const bMap = new Map<number, number>();
  for (let i = 0; i < b.indices.length; i++) {
    bMap.set(b.indices[i], b.values[i]);
  }
  let dot = 0;
  for (let i = 0; i < a.indices.length; i++) {
    const bVal = bMap.get(a.indices[i]);
    if (bVal !== undefined) dot += a.values[i] * bVal;
  }
  return dot;
}
