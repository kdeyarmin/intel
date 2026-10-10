import { describe, expect, it } from 'vitest';
import { createSseParser } from '../src/lib/sseParser.js';
import { formatSse } from '../server/lib/assistant/sse';

function parseAll(chunks) {
  const out = [];
  const p = createSseParser((e) => out.push(e));
  for (const c of chunks) p.push(c);
  p.end();
  return out;
}

describe('createSseParser', () => {
  it('reads events split anywhere, including between \\r and \\n', () => {
    const body = 'event: text\r\ndata: {"delta":"Hi"}\r\n\r\n: ping\r\n\r\nevent: done\r\ndata: {"status":"complete"}\r\n\r\n';
    for (let size = 1; size <= body.length; size += 3) {
      const chunks = body.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g'));
      expect(parseAll(chunks)).toEqual([
        { event: 'text', data: '{"delta":"Hi"}' },
        { event: 'done', data: '{"status":"complete"}' },
      ]);
    }
  });

  it('joins multi-line data, defaults the event name and skips comments', () => {
    expect(parseAll([': open\n\ndata: a\ndata: b\n\nevent:x\ndata\n\n'])).toEqual([
      { event: 'message', data: 'a\nb' },
      { event: 'x', data: '' },
    ]);
  });

  it('flushes a final event without a trailing blank line', () => {
    expect(parseAll(['event: done\ndata: {}'])).toEqual([{ event: 'done', data: '{}' }]);
  });

  it('round-trips what the server writes', () => {
    const data = { delta: 'line one\nline "two"' };
    const [e] = parseAll([formatSse('text', data)]);
    expect(e.event).toBe('text');
    expect(JSON.parse(e.data)).toEqual(data);
  });
});
