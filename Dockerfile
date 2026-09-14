# storelift-mcp — stdio MCP server, a single file with no dependencies.
# Used by directories (Glama) to inspect the server. The API key is read
# from STORELIFT_API_KEY at call time; without it the server still starts
# and lists its tools, and tool calls return a missing_api_key error.
FROM node:22-alpine
WORKDIR /app
COPY package.json index.mjs ./
ENTRYPOINT ["node", "index.mjs"]
