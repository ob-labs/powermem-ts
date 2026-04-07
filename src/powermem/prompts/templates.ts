/**
 * Base prompt template system.
 * Port of Python powermem/prompts/templates.py.
 */

export interface PromptTemplate {
  system: string;
  user: string;
}

export function formatTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}
