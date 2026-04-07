/**
 * Graph extraction prompts.
 * Port of Python powermem/prompts/graph/graph_prompts.py.
 */

export const GRAPH_EXTRACTION_PROMPT = `You are a knowledge graph extraction system. Extract entities and relationships from the given text.

For each entity, identify:
- name: The entity name
- type: The entity type (person, place, organization, concept, etc.)

For each relationship, identify:
- source: Source entity name
- target: Target entity name
- relation: The relationship type

Text: {text}

Return JSON: {"entities": [{"name": "...", "type": "..."}], "relationships": [{"source": "...", "target": "...", "relation": "..."}]}`;

export function buildGraphExtractionPrompt(text: string): string {
  return GRAPH_EXTRACTION_PROMPT.replace('{text}', text);
}
