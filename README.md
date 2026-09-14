# storelift-mcp

App Store & Google Play ranking data as an MCP server. Ask your assistant which
keywords you dropped on, who outranks you, and whether AI assistants mention
your app at all — without opening a dashboard.

Backed by [Storelift](https://storelift.net), which measures keyword
ranks, rivals and AI visibility nightly. **No store credentials required** —
ranks are read from the public storefront.

## Requirements

- A **Pro** or **Studio** plan (the Public API is enabled on both)
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

Hosted, with nothing to install — `https://storelift.net/mcp` over Streamable
HTTP, same key in an `Authorization: Bearer` header (no OAuth sign-in yet, so
the client must let you set a header):

```bash
claude mcp add --transport http storelift https://storelift.net/mcp --header "Authorization: Bearer sl_live_..."
```

## Tools

| Tool | Returns |
|---|---|
| `list_apps` | tracked apps (id, name, countries, keywords) |
| `get_keywords` | keyword ranks for one app in one country |
| `get_rivals` | apps ranking **above** you, with their rank and yours |
| `get_ai_visibility` | whether assistants name your app, per engine (Claude / ChatGPT / Gemini) |
| `get_history` | rank history, `[day, rank]` points |
| `get_store_page` | your own listing signals + the Google Play page, with a dated change timeline |
| `get_reviews` | recent App Store and Google Play reviews, and how many are new since last measurement |
| `get_charts` | App Store chart position per list, with history |

## Reading the data

Keyword results carry **three distinct states**, and they are not the same thing:

- `measured: false` — the query **could not be measured**
- `rank: null` (with `measured: true`) — measured, but **absent** from the top results
- `rank: <number>` — the rank

Counting an unmeasured day as zero produces a false chart. The tool descriptions
repeat this so the model does not flatten the three into one.

A rank move usually has its explanation somewhere other than the rank: a version
that shipped that day, a wave of one-star reviews, a chart drop. `get_store_page`,
`get_reviews` and `get_charts` exist so the model can look there instead of
explaining everything with the one number it can see.

Google Play is absent from `get_charts` on purpose: Google publishes no chart
list, so there is nothing to read and a number here would be invented.

AI visibility is an **observation, not a ranking**: a model's knowledge is frozen
at a date and the answer is not identical every time. Read the trend, not a
single measurement.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `STORELIFT_API_KEY` | — | required for tool calls; without it the server still starts and lists its tools, and every call returns an error saying how to get a key |
| `STORELIFT_API` | `https://storelift.net` | override the API base |

No dependencies — a single file speaking JSON-RPC over stdio. Runs with
`node index.mjs` just as well as through `npx`.

## Registry

Published to the official MCP Registry as `net.storelift/storelift`.
The manifest is [`server.json`](./server.json) in this repo.

## Source

[github.com/vom-core/storelift-mcp](https://github.com/vom-core/storelift-mcp) —
one file, no dependencies. Read it before you run it.

## License

MIT
