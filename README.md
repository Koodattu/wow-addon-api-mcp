# WoW AddOn API MCP

Give your coding agent World of Warcraft AddOn API documentation for **Retail and Forever beta**. It can look up functions, events, widgets, and restrictions, or compare APIs between game versions while helping you build an addon.

## Connect your coding agent

Install [Node.js 20 or newer](https://nodejs.org/), then follow the instructions for your agent. No API key or repository clone is needed.

<details>
<summary><strong>Codex</strong></summary>

Run in a terminal:

```shell
codex mcp add wow-addon-api -- npx -y wow-addon-api-mcp@latest
```

On Windows, use:

```shell
codex mcp add wow-addon-api -- cmd /c npx -y wow-addon-api-mcp@latest
```

Restart your Codex session. Check the configuration with `codex mcp list`.

[Codex MCP documentation](https://learn.chatgpt.com/docs/developer-commands#codex-mcp)

</details>

<details>
<summary><strong>Claude Code</strong></summary>

Run in a terminal to make the server available across your projects:

```shell
claude mcp add --transport stdio --scope user wow-addon-api -- npx -y wow-addon-api-mcp@latest
```

On Windows, use:

```shell
claude mcp add --transport stdio --scope user wow-addon-api -- cmd /c npx -y wow-addon-api-mcp@latest
```

Open Claude Code and check the connection with `/mcp`.

[Claude Code MCP documentation](https://code.claude.com/docs/en/mcp)

</details>

<details>
<summary><strong>Cursor or VS Code (GitHub Copilot)</strong></summary>

Add this configuration to the file for your editor. If the file already exists, add the `wow-addon-api` entry to its `mcpServers` object.

| Editor | File in your project |
| --- | --- |
| Cursor | `.cursor/mcp.json` |
| VS Code | `.mcp.json` |

```json
{
  "mcpServers": {
    "wow-addon-api": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "wow-addon-api-mcp@latest"]
    }
  }
}
```

On Windows, set `"command": "cmd"` and `"args": ["/c", "npx", "-y", "wow-addon-api-mcp@latest"]`.

Enable the server in your editor's MCP settings, then use agent chat.

[Cursor MCP documentation](https://cursor.com/docs/mcp) · [VS Code MCP documentation](https://code.visualstudio.com/docs/agent-customization/mcp-servers)

</details>

**Another agent?** Add a local MCP server (stdio) with command `npx` and arguments `-y wow-addon-api-mcp@latest`. On Windows, use command `cmd` with arguments `/c npx -y wow-addon-api-mcp@latest`.

## Use it

Tell your agent which game and build you target. For example:

> Use the wow-addon-api MCP to help build my addon for Retail. List the available builds, use the latest bundled Retail build, and check the aura APIs and their restrictions before writing code.

For an addon targeting both Retail and Forever, ask it to check both games separately. One server covers both.

## About the project

This MCP server gives coding agents searchable, versioned documentation from Blizzard's UI source. It includes Retail snapshots from 10.0.0 onward and Forever beta from 1.60.1. Classic datasets are not included.

Documentation is bundled with each package release and queried locally. “Latest” means the newest bundled snapshot, not a live game query. The server helps check documented APIs; addons still need testing in the game.

- [Technical guide](https://github.com/Koodattu/wow-addon-api-mcp/blob/main/docs/TECHNICAL_GUIDE.md): tool reference, version selection, runtime snapshots, and data updates.
- [Contributing](https://github.com/Koodattu/wow-addon-api-mcp/blob/main/CONTRIBUTING.md) · [Releases](https://github.com/Koodattu/wow-addon-api-mcp/releases) · [Report an issue](https://github.com/Koodattu/wow-addon-api-mcp/issues)

Code is Apache-2.0; upstream and curated documentation have separate terms in [Third-party notices](THIRD_PARTY_NOTICES.md). Not affiliated with or endorsed by Blizzard Entertainment.
