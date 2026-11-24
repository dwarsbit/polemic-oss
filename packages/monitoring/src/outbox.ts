// For the compile service, which has no way out: Sentry's envelopes wait here, in memory, until
// the API collects them (GET /monitoring/outbox) and passes them on. The API calls the compile
// service, never the reverse, so this keeps it closed. When nobody collects, the oldest go.

import { createTransport } from "@sentry/node";

const MAX_ENVELOPES = 200;
const MAX_BYTES = 5_000_000;

const waiting: Buffer[] = [];
let bytes = 0;

/** A Sentry transport that keeps envelopes in the outbox instead of sending them. */
export function outboxTransport(
  options: Parameters<typeof createTransport>[0],
): ReturnType<typeof createTransport> {
  return createTransport(options, async ({ body }) => {
    const envelope = typeof body === "string" ? Buffer.from(body) : Buffer.from(body);
    waiting.push(envelope);
    bytes += envelope.length;
    while (waiting.length > MAX_ENVELOPES || bytes > MAX_BYTES) {
      bytes -= waiting.shift()!.length;
    }
    return { statusCode: 200 };
  });
}

/** The envelopes waiting, oldest first; the outbox is empty after. */
export function takeOutbox(): Buffer[] {
  bytes = 0;
  return waiting.splice(0);
}
