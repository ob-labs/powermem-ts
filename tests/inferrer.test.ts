import { describe, it, expect } from 'vitest';
import { Inferrer } from '../src/provider/native/inferrer.js';
import { MockLLM } from './mocks.js';

describe('Inferrer', () => {
  describe('extractFacts', () => {
    it('extracts facts from JSON response', async () => {
      const llm = new MockLLM(['{"facts": ["fact1", "fact2"]}']);
      const inferrer = new Inferrer(llm);
      const facts = await inferrer.extractFacts('some content');
      expect(facts).toEqual(['fact1', 'fact2']);
    });

    it('handles code-block-wrapped JSON', async () => {
      const llm = new MockLLM(['```json\n{"facts": ["f1"]}\n```']);
      const inferrer = new Inferrer(llm);
      const facts = await inferrer.extractFacts('content');
      expect(facts).toEqual(['f1']);
    });

    it('returns empty array when no facts', async () => {
      const llm = new MockLLM(['{"facts": []}']);
      const inferrer = new Inferrer(llm);
      const facts = await inferrer.extractFacts('Hi.');
      expect(facts).toEqual([]);
    });

    it('includes today date in system prompt', async () => {
      const llm = new MockLLM(['{"facts": []}']);
      const inferrer = new Inferrer(llm);
      await inferrer.extractFacts('test');

      const systemMsg = llm.calls[0][0];
      const today = new Date().toISOString().split('T')[0];
      expect(typeof systemMsg.content === 'string' && systemMsg.content.includes(today)).toBe(
        true
      );
    });
  });

  describe('decideActions', () => {
    it('returns ADD action', async () => {
      const response = JSON.stringify({
        memory: [{ id: '1', text: 'new fact', event: 'ADD' }],
      });
      const llm = new MockLLM([response]);
      const inferrer = new Inferrer(llm);

      const actions = await inferrer.decideActions(
        ['new fact'],
        [],
        new Map()
      );

      expect(actions).toHaveLength(1);
      expect(actions[0].event).toBe('ADD');
      expect(actions[0].text).toBe('new fact');
    });

    it('returns UPDATE action with correct ID', async () => {
      const response = JSON.stringify({
        memory: [
          {
            id: '0',
            text: 'updated content',
            event: 'UPDATE',
            old_memory: 'old content',
          },
        ],
      });
      const llm = new MockLLM([response]);
      const inferrer = new Inferrer(llm);

      const idMapping = new Map([['0', 'real-snowflake-id']]);
      const actions = await inferrer.decideActions(
        ['updated content'],
        [{ id: '0', text: 'old content' }],
        idMapping
      );

      expect(actions).toHaveLength(1);
      expect(actions[0].event).toBe('UPDATE');
      expect(actions[0].id).toBe('0'); // temp ID — caller maps back
      expect(actions[0].oldMemory).toBe('old content');
    });

    it('returns DELETE action', async () => {
      const response = JSON.stringify({
        memory: [{ id: '0', text: '', event: 'DELETE' }],
      });
      const llm = new MockLLM([response]);
      const inferrer = new Inferrer(llm);

      const actions = await inferrer.decideActions(
        ['contradicting fact'],
        [{ id: '0', text: 'old' }],
        new Map([['0', 'real-id']])
      );

      expect(actions[0].event).toBe('DELETE');
    });

    it('returns NONE action', async () => {
      const response = JSON.stringify({
        memory: [{ id: '0', text: 'same content', event: 'NONE' }],
      });
      const llm = new MockLLM([response]);
      const inferrer = new Inferrer(llm);

      const actions = await inferrer.decideActions(
        ['same content'],
        [{ id: '0', text: 'same content' }],
        new Map([['0', 'real-id']])
      );

      expect(actions[0].event).toBe('NONE');
    });

    it('maps existing memories to temp sequential IDs', async () => {
      const response = JSON.stringify({ memory: [] });
      const llm = new MockLLM([response]);
      const inferrer = new Inferrer(llm);

      await inferrer.decideActions(
        ['fact'],
        [
          { id: '0', text: 'mem A' },
          { id: '1', text: 'mem B' },
        ],
        new Map([
          ['0', 'snowflake-A'],
          ['1', 'snowflake-B'],
        ])
      );

      // Verify the prompt sent to LLM contains temp IDs
      const promptText = llm.calls[0][0].content as string;
      expect(promptText).toContain('"id":"0"');
      expect(promptText).toContain('"id":"1"');
      expect(promptText).not.toContain('snowflake');
    });
  });

  describe('custom prompts', () => {
    it('uses custom fact extraction prompt', async () => {
      const llm = new MockLLM(['{"facts": ["custom"]}']);
      const inferrer = new Inferrer(llm);
      inferrer.setCustomPrompts('CUSTOM FACT PROMPT', undefined);

      await inferrer.extractFacts('test');
      const systemMsg = llm.calls[0][0].content as string;
      expect(systemMsg).toBe('CUSTOM FACT PROMPT');
    });

    it('uses custom update memory prompt', async () => {
      const llm = new MockLLM([JSON.stringify({ memory: [] })]);
      const inferrer = new Inferrer(llm);
      inferrer.setCustomPrompts(undefined, 'CUSTOM UPDATE PROMPT');

      await inferrer.decideActions(['fact'], [], new Map());
      const prompt = llm.calls[0][0].content as string;
      expect(prompt).toContain('CUSTOM UPDATE PROMPT');
    });
  });
});
