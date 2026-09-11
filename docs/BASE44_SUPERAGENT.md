# Internal Base44 Superagent

BuildMyBot.App includes an authenticated, server-side integration for the Base44 Superagent with agent id `6a515f4e071e32fc10378575`.

## Security model

The Base44 API key is never bundled into the Vite frontend. `/api/base44-agent` reads `BASE44_SUPERAGENT_API_KEY` only on the server, validates the caller's Supabase access token, and then checks the authenticated email against `BASE44_ALLOWED_EMAILS`. The endpoint fails closed when the allowlist is empty.

Any Base44 key that has appeared in chat, screenshots, logs, or source control must be rotated before production use.

## Required production variables

```text
BASE44_SUPERAGENT_API_KEY=<rotated server-side secret>
BASE44_SUPERAGENT_ID=6a515f4e071e32fc10378575
BASE44_SUPERAGENT_TIMEOUT_MS=45000
BASE44_ALLOWED_EMAILS=<comma-separated authorized Supabase account emails>
```

The API route also needs the existing Supabase URL and anon key so it can validate the browser session. It accepts `SUPABASE_URL` / `SUPABASE_ANON_KEY` or the app's existing public Supabase variable names.

## Calling it inside BuildMyBot

Use the reusable browser-side helper from authenticated admin/internal UI code:

```ts
import { callBase44Superagent } from './services/base44SuperagentService';

const result = await callBase44Superagent(
  'Audit this proposed feature and return the three highest-value improvements.',
);
console.log(result.content);
```

To continue the same Base44 thread, retain and pass `result.conversationId`:

```ts
const followup = await callBase44Superagent(
  'Now turn the strongest recommendation into an implementation plan.',
  { conversationId: result.conversationId },
);
```

The helper obtains the current Supabase session and sends only that access token to BuildMyBot's own API. The Base44 API credential never reaches the browser.
