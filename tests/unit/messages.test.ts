import { describe, it, expect } from 'vitest';
import { extractTextFromContent, hasVisionContent, hasAudioContent, extractImageUrls, toLangChainMessages, parseVisionMessages, parseAudioMessages } from '../../src/utils/messages.js';
import type { MessageInput } from '../../src/types/memory.js';

describe('extractTextFromContent', () => {
  it('returns string as-is', () => {
    expect(extractTextFromContent('hello')).toBe('hello');
  });

  it('extracts text from messages array', () => {
    const msgs: MessageInput[] = [
      { role: 'user', content: 'first message' },
      { role: 'assistant', content: 'second message' },
    ];
    expect(extractTextFromContent(msgs)).toBe('first message\nsecond message');
  });

  it('extracts text parts from multimodal content', () => {
    const msgs: MessageInput[] = [
      { role: 'user', content: [
        { type: 'text', text: 'describe this' },
        { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
      ] },
    ];
    const text = extractTextFromContent(msgs);
    expect(text).toContain('describe this');
    expect(text).toContain('[image]');
  });

  it('handles audio parts', () => {
    const msgs: MessageInput[] = [
      { role: 'user', content: [
        { type: 'text', text: 'transcribe' },
        { type: 'audio', audio_url: 'https://example.com/audio.mp3' },
      ] },
    ];
    const text = extractTextFromContent(msgs);
    expect(text).toContain('[audio]');
  });
});

describe('hasVisionContent', () => {
  it('false for string', () => {
    expect(hasVisionContent('text')).toBe(false);
  });

  it('true when image_url present', () => {
    const msgs: MessageInput[] = [
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: 'https://img.com/1.png' } },
      ] },
    ];
    expect(hasVisionContent(msgs)).toBe(true);
  });

  it('false when no images', () => {
    const msgs: MessageInput[] = [{ role: 'user', content: 'just text' }];
    expect(hasVisionContent(msgs)).toBe(false);
  });
});

describe('hasAudioContent', () => {
  it('false for string', () => {
    expect(hasAudioContent('text')).toBe(false);
  });

  it('true when audio present', () => {
    const msgs: MessageInput[] = [
      { role: 'user', content: [{ type: 'audio', audio_url: 'x.mp3' }] },
    ];
    expect(hasAudioContent(msgs)).toBe(true);
  });
});

describe('extractImageUrls', () => {
  it('empty for string', () => {
    expect(extractImageUrls('text')).toEqual([]);
  });

  it('extracts URLs', () => {
    const msgs: MessageInput[] = [
      { role: 'user', content: [
        { type: 'image_url', image_url: { url: 'https://a.com/1.png' } },
        { type: 'text', text: 'hi' },
        { type: 'image_url', image_url: { url: 'https://b.com/2.png' } },
      ] },
    ];
    expect(extractImageUrls(msgs)).toEqual(['https://a.com/1.png', 'https://b.com/2.png']);
  });
});

describe('toLangChainMessages', () => {
  it('wraps string in user message', () => {
    const result = toLangChainMessages('hello');
    expect(result).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('passes messages through', () => {
    const msgs: MessageInput[] = [
      { role: 'system', content: 'you are helpful' },
      { role: 'user', content: 'hi' },
    ];
    expect(toLangChainMessages(msgs)).toHaveLength(2);
  });
});

describe('parseVisionMessages', () => {
  it('returns string as-is', async () => {
    const result = await parseVisionMessages('hello', async () => 'unused');
    expect(result).toBe('hello');
  });

  it('returns text-only messages without calling LLM', async () => {
    const msgs: MessageInput[] = [{ role: 'user', content: 'just text' }];
    const result = await parseVisionMessages(msgs, async () => { throw new Error('should not be called'); });
    expect(result).toBe('just text');
  });

  it('calls LLM for image parts and inlines description', async () => {
    const msgs: MessageInput[] = [{
      role: 'user',
      content: [
        { type: 'text', text: 'What is this?' },
        { type: 'image_url', image_url: { url: 'https://example.com/cat.png' } },
      ],
    }];
    const result = await parseVisionMessages(msgs, async () => 'A cat sitting on a chair');
    expect(result).toContain('What is this?');
    expect(result).toContain('[Image description: A cat sitting on a chair]');
  });

  it('falls back to [image] on LLM failure', async () => {
    const msgs: MessageInput[] = [{
      role: 'user',
      content: [{ type: 'image_url', image_url: { url: 'https://example.com/x.png' } }],
    }];
    const result = await parseVisionMessages(msgs, async () => { throw new Error('LLM down'); });
    expect(result).toContain('[image]');
  });
});

describe('parseAudioMessages', () => {
  it('returns string as-is', async () => {
    const result = await parseAudioMessages('hello', async () => 'unused');
    expect(result).toBe('hello');
  });

  it('transcribes audio parts', async () => {
    const msgs: MessageInput[] = [{
      role: 'user',
      content: [
        { type: 'text', text: 'Listen to this' },
        { type: 'audio', audio_url: 'https://example.com/speech.mp3' },
      ],
    }];
    const result = await parseAudioMessages(msgs, async () => 'Hello world spoken text');
    expect(result).toContain('Listen to this');
    expect(result).toContain('[Transcript: Hello world spoken text]');
  });

  it('falls back to [audio] on transcription failure', async () => {
    const msgs: MessageInput[] = [{
      role: 'user',
      content: [{ type: 'audio', audio_url: 'https://example.com/x.mp3' }],
    }];
    const result = await parseAudioMessages(msgs, async () => { throw new Error('ASR down'); });
    expect(result).toContain('[audio]');
  });
});
