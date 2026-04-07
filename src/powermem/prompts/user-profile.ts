/**
 * User profile prompts (stub — full implementation in Phase C).
 */

export const USER_PROFILE_EXTRACTION_PROMPT = `You are a user profile extractor. Analyze the conversation and extract user profile information.

Conversation:
{conversation}

Return JSON with profile fields: name, preferences, occupation, location, etc.`;
