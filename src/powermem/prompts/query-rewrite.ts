/**
 * Query rewrite prompts (stub — full implementation in Phase C).
 */

export const QUERY_REWRITE_PROMPT = `You are a query expansion assistant. Given a user query, expand it with synonyms and related terms to improve search recall.

Original query: {query}

Return JSON: {"rewritten_query": "expanded query text"}`;
