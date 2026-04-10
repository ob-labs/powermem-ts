/**
 * User profile extraction prompts.
 * Port of Python powermem/prompts/user_profile_prompts.py.
 */

const LANGUAGE_CODE_MAPPING: Record<string, string> = {
  zh: 'Chinese',
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  it: 'Italian',
  pt: 'Portuguese',
  ru: 'Russian',
  ar: 'Arabic',
  hi: 'Hindi',
  th: 'Thai',
  vi: 'Vietnamese',
};

export const USER_PROFILE_TOPICS = `
- Basic Information
  - User Name
  - User Age (integer)
  - Gender
  - Date of Birth
  - Nationality
  - Ethnicity
  - Language

- Contact Information
  - Email
  - Phone
  - City
  - Province

- Education Background
  - School
  - Degree
  - Major
  - Graduation Year

- Demographics
  - Marital Status
  - Number of Children
  - Household Income

- Employment
  - Company
  - Position
  - Work Location
  - Projects Involved In
  - Work Skills

- Interests and Hobbies
  - Books
  - Movies
  - Music
  - Food
  - Sports

- Lifestyle
  - Dietary Preferences (e.g., vegetarian, vegan)
  - Exercise Habits
  - Health Status
  - Sleep Patterns
  - Smoking
  - Alcohol Consumption

- Psychological Traits
  - Personality Traits
  - Values
  - Beliefs
  - Motivations
  - Goals

- Life Events
  - Marriage
  - Relocation
  - Retirement
`.trim();

export const USER_PROFILE_EXTRACTION_PROMPT = `You are a user profile extraction specialist. Your task is to analyze conversations and extract user profile information.

[Reference Topics]:
The following topics are for guidance only. Please selectively extract information based on the actual content of the conversation, without forcing all fields to be filled.:
${USER_PROFILE_TOPICS}

[Instructions]:
1. Review the current user profile if provided below
2. Analyze the new conversation carefully to identify any new or updated user-related information
3. Extract only factual information explicitly mentioned in the conversation
4. Update the profile by:
   - Adding new information that is not in the current profile
   - Updating existing information if the conversation provides more recent or different details
   - Keeping unchanged information that is still valid
5. Combine all information into a coherent, updated profile description
6. If no relevant profile information is found in the conversation, return the current profile as-is
7. Write the profile in natural language, not as structured data
8. Focus on current state and characteristics of the user
9. If no user profile information can be extracted from the conversation at all, return an empty string ""
10. The final extracted profile description must not exceed 1,000 characters. If it does, compress the content concisely without losing essential factual information.`;

function resolveTargetLanguage(nativeLanguage?: string): string | undefined {
  if (!nativeLanguage) return undefined;
  return LANGUAGE_CODE_MAPPING[nativeLanguage] ?? nativeLanguage;
}

export function getUserProfileExtractionPrompt(
  conversation: string,
  options: {
    existingProfile?: string;
    nativeLanguage?: string;
  } = {},
): string {
  const currentProfileSection = options.existingProfile
    ? `

[Current User Profile]:
\`\`\`
${options.existingProfile}
\`\`\``
    : '';

  const targetLanguage = resolveTargetLanguage(options.nativeLanguage);
  const languageInstruction = targetLanguage
    ? `

[Language Requirement]:
You MUST extract and write the profile content in ${targetLanguage}, regardless of what languages are used in the conversation.`
    : '';

  return `${USER_PROFILE_EXTRACTION_PROMPT}${currentProfileSection}${languageInstruction}

[Target]:
Extract and return the user profile information as a text description:

[Conversation]:
${conversation}`;
}

export function getUserProfileTopicsExtractionPrompt(
  conversation: string,
  options: {
    existingTopics?: Record<string, unknown>;
    customTopics?: string | Record<string, unknown>;
    strictMode?: boolean;
    nativeLanguage?: string;
  } = {},
): string {
  let formattedTopics = USER_PROFILE_TOPICS;
  let hasDescriptions = false;

  if (options.customTopics) {
    const topicsDict = typeof options.customTopics === 'string'
      ? JSON.parse(options.customTopics) as Record<string, unknown>
      : options.customTopics;
    if (!topicsDict || typeof topicsDict !== 'object' || Array.isArray(topicsDict)) {
      throw new Error('customTopics must be a JSON object (dictionary)');
    }
    formattedTopics = JSON.stringify(topicsDict, null, 2);
    hasDescriptions = true;
  }

  const strictInstruction = options.strictMode
    ? `
CRITICAL: You MUST only output topics that are listed in the [Available Topics] section above.
Do NOT create new topics or use different topic names. If information doesn't fit any listed topic,
you may omit it or place it under the most relevant existing topic.`
    : `
You may extend the topic structure if needed, but try to use the provided topics when possible.
If you add new topics, use snake_case format (lowercase with underscores).`;

  const descriptionWarning = options.customTopics && hasDescriptions
    ? `
IMPORTANT: The descriptions shown in [Available Topics] are for reference only to help you understand what each topic represents.
DO NOT use the descriptions as keys in your output. Only use the topic names (main_topic and sub_topic) as keys.
For example, if you see "user_name: The user's full name", use "user_name" as the key, NOT "The user's full name".`
    : '';

  const existingTopicsSection = options.existingTopics
    ? `

[Current User Topics]:
\`\`\`json
${JSON.stringify(options.existingTopics, null, 2)}
\`\`\``
    : '';

  const topicsSection = options.customTopics
    ? `[Available Topics]:
The following JSON structure defines the available topics for extraction:
\`\`\`json
${formattedTopics}
\`\`\``
    : `[Available Topics]:
The following topics are for reference. All topic keys in your output must be in snake_case format (lowercase with underscores):
${formattedTopics}`;

  const targetLanguage = resolveTargetLanguage(options.nativeLanguage);
  const languageInstruction = targetLanguage
    ? `

[Language Requirement]:
You MUST extract and write all topic values in ${targetLanguage}, regardless of what languages are used in the conversation. Keep the topic keys in snake_case English format, but write the values in ${targetLanguage}.`
    : '';

  return `You are a user profile topic extraction specialist. Your task is to analyze conversations and extract user profile information as structured topics.

${topicsSection}${descriptionWarning}

[Instructions]:
1. Review the current user topics if provided below
2. Analyze the new conversation carefully to identify any new or updated user-related information
3. Extract only factual information explicitly mentioned in the conversation
4. Update the topics by:
   - Adding new information that is not in the current topics
   - Updating existing information if the conversation provides more recent or different details
   - Keeping unchanged information that is still valid
5. Structure the output as a JSON object with hierarchical topics (main topics as keys, sub-topics as nested objects)
6. All keys must be in snake_case format (lowercase with underscores)
7. If no relevant profile information is found in the conversation, return the current topics as-is
8. If no user profile information can be extracted from the conversation at all, return an empty JSON object {}
9. Focus on current state and characteristics of the user
${strictInstruction}${existingTopicsSection}${languageInstruction}

[Output Format]:
Return a valid JSON object with the following structure:
{
  "main_topic_name": {
    "sub_topic_name": "value",
    "another_sub_topic": "value"
  },
  "another_main_topic": {
    "sub_topic": "value"
  }
}

All keys must be in snake_case (lowercase with underscores). Values can be strings, numbers, or nested objects as needed.
Remember: Use only the topic names as keys, NOT the descriptions.

[Conversation]:
${conversation}`;
}
