/**
 * Incremental parser for a text/event-stream body read with fetch (EventSource
 * can't POST). Feed it decoded text in any chunking; it calls `onEvent` with
 * `{ event, data }` for each complete event and skips comments (heartbeats).
 */
export function createSseParser(onEvent) {
  let buffer = '';
  let eventName = '';
  let data = [];

  const dispatch = () => {
    if (data.length) onEvent({ event: eventName || 'message', data: data.join('\n') });
    eventName = '';
    data = [];
  };

  const handleLine = (line) => {
    if (line === '') return dispatch();
    if (line.startsWith(':')) return;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') eventName = value;
    else if (field === 'data') data.push(value);
  };

  return {
    push(chunk) {
      buffer += chunk;
      for (;;) {
        const match = /\r\n|\r|\n/.exec(buffer);
        if (!match) break;
        // A chunk can end between "\r" and "\n"; wait for the next one.
        if (match[0] === '\r' && match.index === buffer.length - 1) break;
        handleLine(buffer.slice(0, match.index));
        buffer = buffer.slice(match.index + match[0].length);
      }
    },
    end() {
      if (buffer) handleLine(buffer.replace(/\r$/, ''));
      buffer = '';
      dispatch();
    },
  };
}
