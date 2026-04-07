/**
 * Graph tools prompts — for graph update and deletion operations.
 */

export const GRAPH_UPDATE_PROMPT = `You are a knowledge graph manager. Given existing graph data and new information, decide how to update the graph.

Existing entities: {existing_entities}
Existing relationships: {existing_relationships}
New information: {new_info}

Return JSON: {"add_entities": [...], "add_relationships": [...], "remove_entities": [...], "remove_relationships": [...]}`;

export const GRAPH_DELETE_PROMPT = `You are a knowledge graph manager. Given the following entities and relationships, identify which ones should be removed based on the deletion request.

Entities: {entities}
Relationships: {relationships}
Deletion request: {request}

Return JSON: {"remove_entities": [...], "remove_relationships": [...]}`;
