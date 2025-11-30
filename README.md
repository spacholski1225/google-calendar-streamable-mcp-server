# Google Calendar MCP Server

Streamable HTTP MCP server for Google Calendar — manage events, check availability, and schedule meetings.

Author: [overment](https://x.com/_overment)

> [!WARNING]
> You connect this server to your MCP client at your own responsibility. Language models can make mistakes, misinterpret instructions, or perform unintended actions. Review tool outputs, verify changes (e.g., with `search_events`), and prefer small, incremental writes.
>
> The HTTP/OAuth layer is designed for convenience during development, not production-grade security. If deploying remotely, harden it: proper token validation, secure storage, TLS termination, strict CORS/origin checks, rate limiting, audit logging, and compliance with Google's terms.

## Notice

This repo works in two ways:
- As a **Node/Hono server** for local workflows
- As a **Cloudflare Worker** for remote interactions

For production Cloudflare deployments, see [Remote Model Context Protocol servers (MCP)](https://blog.cloudflare.com/remote-model-context-protocol-servers-mcp).

## Features

- ✅ **Events** — List, search, create, update, delete calendar events
- ✅ **Calendars** — Discover available calendars
- ✅ **Availability** — Check free/busy status before scheduling
- ✅ **Natural Language** — Create events with text like "Lunch tomorrow at noon"
- ✅ **Google Meet** — Auto-create Meet links for events
- ✅ **OAuth 2.1** — Secure PKCE flow with RS token mapping
- ✅ **Dual Runtime** — Node.js/Bun or Cloudflare Workers

### Design Principles

- **LLM-friendly**: Tools are simplified and unified, not 1:1 API mirrors
- **Smart defaults**: Primary calendar, no notification spam, recurring expansion
- **Discovery-first**: `list_calendars` returns all IDs needed for subsequent calls
- **Clear feedback**: Every response includes human-readable summaries
- **Limited features**: Due to the model's hallucinations, tools for managing calendars are not included. Ensure that you use the client that allows you to confirm dangerous actions, such as event deletion or updating.

---

## Installation

Prerequisites: [Bun](https://bun.sh/), [Node.js 20+](https://nodejs.org), [Google Cloud](https://console.cloud.google.com) project. For remote: a [Cloudflare](https://dash.cloudflare.com) account.

### Ways to Run (Pick One)

1. **Local + OAuth** — Standard setup with Google OAuth
2. **Cloudflare Worker (wrangler dev)** — Local Worker testing
3. **Cloudflare Worker (deploy)** — Remote production

---

### 1. Local + OAuth — Quick Start

1. Set up Google Cloud Console:

   **Create Project & Enable API:**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project (or select existing)
   - Navigate to **APIs & Services > Library**
   - Search for "Google Calendar API" and click **Enable**

   **Configure OAuth Consent Screen** (required before credentials):
   - Go to **APIs & Services > OAuth consent screen**
   - Select **External** (or Internal for Workspace)
   - Fill in app name, user support email, developer email
   - Add scopes: `../auth/calendar.events`, `../auth/calendar.readonly`
   - Add your email as a **Test user** (required while app is in "Testing" mode)
   - Save

   **Create Credentials:**
   - Go to **APIs & Services > Credentials**
   - Click **Create Credentials > OAuth client ID**
   - Application type: **Web application**
   - Name: anything (e.g., "Google Calendar MCP")
   - Authorized redirect URIs: `http://127.0.0.1:3001/oauth/callback`
   - Click **Create** and copy **Client ID** and **Client Secret**

2. Configure environment:

```bash
git clone <repo>
cd google-calendar-mcp
bun install
cp env.example .env
```

Edit `.env`:

```env
PORT=3000
AUTH_ENABLED=true

PROVIDER_CLIENT_ID=your_client_id
PROVIDER_CLIENT_SECRET=your_client_secret

OAUTH_SCOPES=https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly
OAUTH_REDIRECT_URI=http://127.0.0.1:3001/oauth/callback
OAUTH_REDIRECT_ALLOWLIST=alice://oauth/callback,http://127.0.0.1:3001/oauth/callback
```

3. Run:

```bash
bun dev
# MCP: http://127.0.0.1:3000/mcp
# OAuth: http://127.0.0.1:3001
```

> **Tip:** The Authorization Server runs on PORT+1 (3001 by default).

**Claude Desktop / Cursor:**

```json
{
  "mcpServers": {
    "google-calendar": {
      "command": "bunx",
      "args": ["mcp-remote", "http://localhost:3000/mcp", "--transport", "http-only"],
      "env": { "NO_PROXY": "127.0.0.1,localhost" }
    }
  }
}
```

#### Token Encryption (Recommended)

Generate an encryption key for secure token storage:

```bash
openssl rand -base64 32
```

Add to `.env`:

```env
RS_TOKENS_ENC_KEY=your-32-byte-base64-key
```

---

### 2. Cloudflare Worker (Local Dev)

```bash
bun x wrangler dev --local | cat
```

With OAuth:

```bash
bun x wrangler secret put PROVIDER_CLIENT_ID
bun x wrangler secret put PROVIDER_CLIENT_SECRET
bun x wrangler dev --local | cat
```

Endpoint: `http://127.0.0.1:8787/mcp`

---

### 3. Cloudflare Worker (Deploy)

1. Create KV namespace for token storage:

```bash
bun x wrangler kv:namespace create TOKENS
```

Output will show:
```
Add the following to your wrangler.toml:
[[kv_namespaces]]
binding = "TOKENS"
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

2. Update `wrangler.toml` with your KV namespace ID:

```toml
[[kv_namespaces]]
binding = "TOKENS"
id = "your-kv-namespace-id-from-step-1"
```

3. Set secrets:

```bash
bun x wrangler secret put PROVIDER_CLIENT_ID
bun x wrangler secret put PROVIDER_CLIENT_SECRET

# Generate encryption key (32-byte base64url):
openssl rand -base64 32 | tr -d '=' | tr '+/' '-_'
bun x wrangler secret put TOKENS_ENC_KEY
```

> **Note:** `TOKENS_ENC_KEY` encrypts OAuth tokens stored in KV (AES-256-GCM). Without it, tokens are stored unencrypted!

4. Update redirect URI in `wrangler.toml`:

```toml
OAUTH_REDIRECT_URI = "https://your-worker.your-subdomain.workers.dev/oauth/callback"
OAUTH_REDIRECT_ALLOWLIST = "alice://oauth/callback,https://your-worker.your-subdomain.workers.dev/oauth/callback"
```

5. Add Workers URL to your Google Cloud OAuth app's redirect URIs

6. Deploy:

```bash
bun x wrangler deploy
```

Endpoint: `https://<worker-name>.<account>.workers.dev/mcp`

---

## Client Configuration

### Pre-authenticate (Recommended)

Claude Desktop has short timeouts that can kill the OAuth flow mid-process. **Pre-authenticate manually first:**

```bash

# Authenticate (complete Google sign-in when browser opens)
npx mcp-remote https://your-worker.workers.dev/mcp --transport http-only
```

Once you see "Authentication successful!", tokens are cached and Claude Desktop will use them.

### Claude Desktop / Cursor (Local Server)

```json
{
  "mcpServers": {
    "google-calendar": {
      "command": "npx",
      "args": ["mcp-remote", "http://127.0.0.1:3000/mcp", "--transport", "http-only"],
      "env": { "NO_PROXY": "127.0.0.1,localhost" }
    }
  }
}
```

### Claude Desktop / Cursor (Cloudflare Worker)

```json
{
  "mcpServers": {
    "google-calendar": {
      "command": "npx",
      "args": ["mcp-remote", "https://your-worker.workers.dev/mcp", "--transport", "http-only"]
    }
  }
}
```

### Node Version Issues (nvm users)

If you get `ReadableStream is not defined` or similar errors, Claude Desktop may be using an old Node version. Fix by specifying the full path:

```json
{
  "mcpServers": {
    "google-calendar": {
      "command": "/Users/YOUR_USER/.nvm/versions/node/v22.0.0/bin/npx",
      "args": ["mcp-remote", "https://your-worker.workers.dev/mcp", "--transport", "http-only"],
      "env": {
        "PATH": "/Users/YOUR_USER/.nvm/versions/node/v22.0.0/bin:/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

Find your node path with: `which node`

### MCP Inspector (Quick Test)

```bash
bunx @modelcontextprotocol/inspector
# Connect to: http://localhost:3000/mcp (local) or https://your-worker.workers.dev/mcp (remote)
```

---

## Tools

### `list_calendars`

Discover available calendars and their IDs. **Call this first** when you don't know calendar IDs.

```ts
// Input
{}

// Output
{
  items: Array<{
    id, summary, primary?, backgroundColor?,
    accessRole, timeZone, description?
  }>;
}
```

### `search_events`

Search and filter events with powerful options.

```ts
// Input
{
  calendarId?: string;       // Default: "primary"
  timeMin?: string;          // ISO 8601
  timeMax?: string;          // ISO 8601
  query?: string;            // Text search
  maxResults?: number;       // Default: 50
  eventTypes?: string[];     // default, birthday, focusTime, outOfOffice
  orderBy?: "startTime" | "updated";
  fields?: string[];         // Control output verbosity
  pageToken?: string;        // Pagination
}

// Output
{
  items: Array<{
    id, summary, start, end, location?,
    htmlLink, status, attendees?, hangoutLink?
  }>;
  nextPageToken?: string;
}
```

### `check_availability`

Check free/busy status before scheduling.

```ts
// Input
{
  timeMin: string;           // ISO 8601 (required)
  timeMax: string;           // ISO 8601 (required)
  calendarIds?: string[];    // Default: ["primary"]
}

// Output
{
  calendars: {
    [calendarId]: {
      busy: Array<{ start, end }>;
    }
  }
}
```

### `create_event`

Create events using natural language OR structured input.

```ts
// Natural language mode
{
  text: "Lunch with Anna tomorrow at noon for 1 hour";
  calendarId?: string;
  sendUpdates?: "all" | "externalOnly" | "none";
}

// Structured mode
{
  summary: string;           // Required
  start: string;             // ISO 8601 or YYYY-MM-DD
  end: string;               // ISO 8601 or YYYY-MM-DD
  calendarId?: string;
  description?: string;
  location?: string;
  attendees?: string[];      // Email addresses
  addGoogleMeet?: boolean;   // Auto-create Meet link
  recurrence?: string[];     // RRULE array
  visibility?: "default" | "public" | "private";
  sendUpdates?: "all" | "externalOnly" | "none";
}
```

### `update_event`

Update or move existing events (PATCH semantics).

```ts
{
  eventId: string;           // Required
  calendarId?: string;
  targetCalendarId?: string; // Move to different calendar
  summary?: string;
  start?: string;
  end?: string;
  description?: string;
  location?: string;
  attendees?: string[];
  addGoogleMeet?: boolean;
  sendUpdates?: "all" | "externalOnly" | "none";
}
```

### `delete_event`

Remove an event from calendar.

```ts
{
  eventId: string;           // Required
  calendarId?: string;
  sendUpdates?: "all" | "externalOnly" | "none";
}
```

---

## Examples

### 1. List today's events

```json
{ "name": "list_calendars", "arguments": {} }

{
  "name": "search_events",
  "arguments": {
    "timeMin": "2025-01-15T00:00:00Z",
    "timeMax": "2025-01-15T23:59:59Z"
  }
}
```

### 2. Create event with Google Meet

```json
{
  "name": "create_event",
  "arguments": {
    "summary": "Team Standup",
    "start": "2025-01-16T09:00:00+01:00",
    "end": "2025-01-16T09:30:00+01:00",
    "addGoogleMeet": true,
    "attendees": ["alice@example.com", "bob@example.com"]
  }
}
```

### 3. Natural language event

```json
{
  "name": "create_event",
  "arguments": {
    "text": "Coffee with Sarah next Monday at 3pm for 30 minutes"
  }
}
```

### 4. Check availability before scheduling

```json
{
  "name": "check_availability",
  "arguments": {
    "timeMin": "2025-01-16T09:00:00Z",
    "timeMax": "2025-01-16T18:00:00Z"
  }
}
```

---

## HTTP Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/mcp` | POST | MCP JSON-RPC 2.0 |
| `/mcp` | GET | SSE stream (Node.js only) |
| `/health` | GET | Health check |
| `/.well-known/oauth-authorization-server` | GET | OAuth AS metadata |
| `/.well-known/oauth-protected-resource` | GET | OAuth RS metadata |

OAuth (PORT+1):
- `GET /authorize` — Start OAuth flow
- `GET /oauth/callback` — Google callback
- `POST /token` — Token exchange
- `POST /revoke` — Revoke tokens

---

## Development

```bash
bun dev           # Start with hot reload
bun run typecheck # TypeScript check
bun run lint      # Lint code
bun run build     # Production build
bun start         # Run production
```

---

## Architecture

```
src/
├── shared/
│   ├── tools/
│   │   ├── list-calendars.ts
│   │   ├── search-events.ts
│   │   ├── check-availability.ts
│   │   ├── create-event.ts
│   │   ├── update-event.ts
│   │   └── delete-event.ts
│   ├── oauth/              # OAuth flow (PKCE, discovery)
│   └── storage/            # Token storage (file, KV, memory)
├── services/
│   └── google-calendar.ts  # Google Calendar API client
├── config/
│   └── metadata.ts         # Server & tool descriptions
├── index.ts                # Node.js entry
└── worker.ts               # Workers entry
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Authentication required" | Complete OAuth flow. Run `rm -rf ~/.mcp-auth` and re-authenticate. |
| "redirect_uri_mismatch" | Google treats `localhost` and `127.0.0.1` as different. Use `127.0.0.1` consistently in both .env and Google Cloud Console. |
| "unknown_txn" error | Stale mcp-remote processes. Run `pkill -9 -f mcp-remote && rm -rf ~/.mcp-auth` then retry. |
| "ReadableStream is not defined" | Node.js version too old (needs 18+). Use full path to newer node in config. |
| "spawn bunx ENOENT" | Claude Desktop can't find `bunx`. Use `npx` instead, or specify full path. |
| "Another instance handling auth" | Kill zombie processes: `pkill -9 -f mcp-remote && rm -rf ~/.mcp-auth` |
| OAuth timeout in Claude | Claude kills auth flow too quickly. Pre-authenticate manually (see Client Configuration). |
| Token expired | Google tokens expire after 1 hour. Refresh tokens are used automatically if `access_type=offline` was set. |
| OAuth doesn't start (Worker) | `curl -i -X POST https://<worker>/mcp` should return `401` with `WWW-Authenticate`. |
| KV namespace error | Run `wrangler kv:namespace create TOKENS` and update `wrangler.toml` with the ID. |
| Tools empty in Claude | Ensure Worker returns JSON Schema for `tools/list`; use `mcp-remote`. |

### Debugging

Enable detailed logs with `--debug`:

```bash
npx mcp-remote https://your-worker.workers.dev/mcp --transport http-only --debug
```

Logs are written to `~/.mcp-auth/{hash}_debug.log`.

Test auth flow independently:

```bash
npx -p mcp-remote@latest mcp-remote-client https://your-worker.workers.dev/mcp --transport http-only --debug
```

---

## Environment Variables

### Node.js (.env)

| Variable | Required | Description |
|----------|----------|-------------|
| `PROVIDER_CLIENT_ID` | ✓ | Google OAuth Client ID |
| `PROVIDER_CLIENT_SECRET` | ✓ | Google OAuth Client Secret |
| `RS_TOKENS_ENC_KEY` | Prod | 32-byte base64 key for token encryption |
| `PORT` | | MCP server port (default: 3000) |
| `HOST` | | Server host (default: 127.0.0.1) |
| `LOG_LEVEL` | | debug, info, warning, error |
| `OAUTH_REDIRECT_URI` | | Callback URL for OAuth |
| `OAUTH_REDIRECT_ALLOWLIST` | | Comma-separated allowed redirect URIs |

### Cloudflare Workers (wrangler.toml + secrets)

**wrangler.toml vars:**
```toml
AUTH_ENABLED = "true"
AUTH_STRATEGY = "oauth"
OAUTH_SCOPES = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly"
OAUTH_REDIRECT_URI = "https://your-worker.workers.dev/oauth/callback"
```

**Secrets (set via `wrangler secret put`):**
- `PROVIDER_CLIENT_ID` — Google OAuth Client ID
- `PROVIDER_CLIENT_SECRET` — Google OAuth Client Secret  
- `TOKENS_ENC_KEY` — 32-byte base64url encryption key

**KV Namespace:**
```toml
[[kv_namespaces]]
binding = "TOKENS"
id = "your-kv-namespace-id"
```

---

## License

MIT
