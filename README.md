# storelift-mcp

App Store & Google Play ranking data as an MCP server. Ask your assistant which
keywords you dropped on, who outranks you, and whether AI assistants mention
your app at all — without opening a dashboard.

Backed by [Storelift](https://storelift.net), which measures keyword
ranks, rivals and AI visibility nightly. **No store credentials required** —
ranks are read from the public storefront.

## Requirements

- A **Studio** plan (the Public API is enabled on that plan)
- An API key: Storelift → Settings → API keys → **Generate key**

## Install

Claude Code:

```bash
claude mcp add storelift -e STORELIFT_API_KEY=sl_live_... -- npx -y storelift-mcp
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "storelift": {
      "command": "npx",
      "args": ["-y", "storelift-mcp"],
      "env": { "STORELIFT_API_KEY": "sl_live_..." }
    }
  }
}
```

## Tools

| Tool | Returns |
|---|---|
| `list_apps` | tracked apps (id, name, countries, keywords) |
| `get_keywords` | keyword ranks for one app in one country |
| `get_rivals` | apps ranking **above** you, with their rank and yours |
| `get_ai_visibility` | whether assistants name your app, per engine (Claude / ChatGPT / Gemini) |
| `get_history` | rank history, `[day, rank]` points |

## Reading the data

Keyword results carry **three distinct states**, and they are not the same thing:

- `measured: false` — the query **could not be measured**
- `rank: null` (with `measured: true`) — measured, but **absent** from the top results
- `rank: <number>` — the rank

Counting an unmeasured day as zero produces a false chart. The tool descriptions
repeat this so the model does not flatten the three into one.

AI visibility is an **observation, not a ranking**: a model's knowledge is frozen
at a date and the answer is not identical every time. Read the trend, not a
single measurement.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `STORELIFT_API_KEY` | — | required; the server exits with a message if unset |
| `STORELIFT_API` | `https://storelift.net` | override the API base |

No dependencies — a single file speaking JSON-RPC over stdio. Runs with
`node index.mjs` just as well as through `npx`.

## License

MIT
