// Server-sent events over a POST response (the browser reads it with fetch).
// Heartbeat comments keep proxies from closing a quiet connection while the
// model thinks or a tool runs.
import type { Response } from "express";

export interface SseChannel {
  send(event: string, data: Record<string, unknown>): void;
  close(): void;
  readonly closed: boolean;
}

export function formatSse(event: string, data: unknown): string {
  // JSON never contains a raw newline, so one data line is enough.
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function openSse(res: Response, heartbeatMs: number): SseChannel {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  // Stop nginx-style proxies from buffering the stream.
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  let closed = false;
  const write = (chunk: string) => {
    if (closed || res.writableEnded) return;
    res.write(chunk);
  };
  const timer = setInterval(() => write(": ping\n\n"), heartbeatMs);
  timer.unref?.();
  res.on("close", () => {
    closed = true;
    clearInterval(timer);
  });
  write(": open\n\n");

  return {
    send(event, data) {
      write(formatSse(event, data));
    },
    close() {
      clearInterval(timer);
      if (!closed && !res.writableEnded) res.end();
      closed = true;
    },
    get closed() {
      return closed || res.writableEnded;
    },
  };
}
