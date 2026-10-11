// The real model stream: the Anthropic SDK's beta message stream, created
// lazily so a server without credentials still boots (the assistant answers 503).
import Anthropic from "@anthropic-ai/sdk";
import { isAssistantConfigured } from "./config";
import type { StreamFactory } from "./loop";

let client: Anthropic | null = null;

export function anthropicStreamFactory(): StreamFactory | null {
  if (!isAssistantConfigured()) return null;
  client ??= new Anthropic();
  return (params, signal) => client!.beta.messages.stream(params, { signal });
}
