/**
 * Message parsing utilities — extract text from multimodal message inputs.
 * Mirrors Python powermem's parse_vision_messages and message handling.
 */
import type { MemoryContent, ContentPart } from '../types/memory.js';

/**
 * Extract plain text from MemoryContent (string or messages array).
 * For multimodal messages, concatenates all text parts.
 * Image URLs are noted as [image] placeholders.
 * Audio URLs are noted as [audio] placeholders.
 */
export function extractTextFromContent(content: MemoryContent): string {
  if (typeof content === 'string') return content;

  const parts: string[] = [];
  for (const msg of content) {
    if (typeof msg.content === 'string') {
      parts.push(msg.content);
    } else if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'text' && part.text) {
          parts.push(part.text);
        } else if (part.type === 'image_url') {
          parts.push('[image]');
        } else if (part.type === 'audio') {
          parts.push('[audio]');
        }
      }
    }
  }
  return parts.join('\n');
}

/**
 * Check if content contains vision (image) parts.
 */
export function hasVisionContent(content: MemoryContent): boolean {
  if (typeof content === 'string') return false;
  return content.some(msg => {
    if (typeof msg.content === 'string') return false;
    return msg.content.some(part => part.type === 'image_url');
  });
}

/**
 * Check if content contains audio parts.
 */
export function hasAudioContent(content: MemoryContent): boolean {
  if (typeof content === 'string') return false;
  return content.some(msg => {
    if (typeof msg.content === 'string') return false;
    return msg.content.some(part => part.type === 'audio');
  });
}

/**
 * Extract image URLs from multimodal content.
 */
export function extractImageUrls(content: MemoryContent): string[] {
  if (typeof content === 'string') return [];
  const urls: string[] = [];
  for (const msg of content) {
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'image_url' && part.image_url?.url) {
          urls.push(part.image_url.url);
        }
      }
    }
  }
  return urls;
}

/**
 * Convert MemoryContent to LangChain message format for LLM processing.
 * Used when passing multimodal content through vision-capable LLMs.
 */
export function toLangChainMessages(content: MemoryContent): Array<{ role: string; content: string | ContentPart[] }> {
  if (typeof content === 'string') return [{ role: 'user', content }];
  return content.map(msg => ({ role: msg.role, content: msg.content }));
}

/**
 * Parse vision messages — use a vision-capable LLM to describe images,
 * then return the full text with image descriptions inlined.
 *
 * Mirrors Python powermem's parse_vision_messages.
 *
 * @param content Multimodal content that may contain image_url parts
 * @param llmInvoke Function that sends a prompt to a vision LLM and returns text
 * @returns Plain text with image descriptions replacing [image] placeholders
 */
export async function parseVisionMessages(
  content: MemoryContent,
  llmInvoke: (messages: Array<{ role: string; content: string | ContentPart[] }>) => Promise<string>,
): Promise<string> {
  if (typeof content === 'string') return content;
  if (!hasVisionContent(content)) return extractTextFromContent(content);

  const parts: string[] = [];

  for (const msg of content) {
    if (typeof msg.content === 'string') {
      parts.push(msg.content);
      continue;
    }

    // Collect text + image parts from this message
    const textParts: string[] = [];
    const imageParts: ContentPart[] = [];

    for (const part of msg.content) {
      if (part.type === 'text' && part.text) {
        textParts.push(part.text);
      } else if (part.type === 'image_url' && part.image_url?.url) {
        imageParts.push(part);
      } else if (part.type === 'audio') {
        parts.push('[audio]');
      }
    }

    if (textParts.length > 0) parts.push(textParts.join('\n'));

    // Describe each image via vision LLM
    for (const imgPart of imageParts) {
      try {
        const description = await llmInvoke([{
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this image concisely in one paragraph. Focus on the key information, objects, text, and context visible.' },
            imgPart,
          ],
        }]);
        parts.push(`[Image description: ${description.trim()}]`);
      } catch {
        // Vision LLM failed — fall back to placeholder
        parts.push('[image]');
      }
    }
  }

  return parts.join('\n');
}

/**
 * Parse audio content — use an ASR/transcription service to convert audio to text.
 *
 * Mirrors Python powermem's audio_llm integration.
 *
 * @param content Multimodal content that may contain audio parts
 * @param transcribe Function that takes an audio URL and returns transcribed text
 * @returns Plain text with audio transcriptions replacing [audio] placeholders
 */
export async function parseAudioMessages(
  content: MemoryContent,
  transcribe: (audioUrl: string) => Promise<string>,
): Promise<string> {
  if (typeof content === 'string') return content;
  if (!hasAudioContent(content)) return extractTextFromContent(content);

  const parts: string[] = [];

  for (const msg of content) {
    if (typeof msg.content === 'string') {
      parts.push(msg.content);
      continue;
    }

    for (const part of msg.content) {
      if (part.type === 'text' && part.text) {
        parts.push(part.text);
      } else if (part.type === 'image_url') {
        parts.push('[image]');
      } else if (part.type === 'audio' && part.audio_url) {
        try {
          const transcript = await transcribe(part.audio_url);
          parts.push(`[Transcript: ${transcript.trim()}]`);
        } catch {
          parts.push('[audio]');
        }
      }
    }
  }

  return parts.join('\n');
}
