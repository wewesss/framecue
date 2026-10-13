# framecue

A local web video player to pick frames, frame ranges or regions, comment on them, and hand them to a coding agent (Claude Code, Codex, any) as a prioritised review queue. After a re-render, each fix is checked against the new video.

Nothing leaves your machine: the server binds to 127.0.0.1 and there is no telemetry.

## Install

```
npx framecue <video>
npm i -g framecue
bunx framecue <video>
bun add -g framecue
```

From source:

```
git clone https://github.com/wewesss/framecue.git
cd framecue
bun install
bun run build
node dist/cli.js <video>
```

`bun src/cli.ts <video>` also works without the CLI build (the web UI still needs `bun run build:web`).

## Usage

```
framecue <video> [--dir <folder>] [--port <n>] [--no-open] [--dev]
framecue mcp [<video|folder>] [--dir <workspace>]
```

- `--dir <folder>`: workspace folder (default: `.framecue` next to the video)
- `--port <n>`: port to listen on (default 5730; the next 10 ports are tried if busy)
- `--no-open`: do not open the browser
- `--dev`: accept the Vite dev origin (`http://localhost:5173`)

Development (Bun only): run `bun run dev:server -- <video>` for the API, and `bun run dev` for Vite (proxies `/api` to port 5730).

## Agent integration

The queue is plain files (`.framecue/queue.jsonl` and `.framecue/frames/<id>/*.png`), so any agent can read it. framecue also hands it over in two ways.

### Copy for agent

The queue footer has a "Copy for the agent" button (`Shift+C`). It copies the to-do and reopened items, by priority, with absolute image paths:

- **Markdown**: a prompt for a coding agent. A header (video, resolution, fps, frame count, workspace, how to report back), then one section per item with its frames, timecode, comment, every region (numbered, with its colour name, normalised and in source pixels), before and after images, and agent note.
- **JSONL**: one stored item per line, plus `videoAbs`, `imagesAbs` and `afterImagesAbs`.

The chevron next to the button picks the format, or copies every item shown by the current filter. The item menu (the `...` button) copies one item. The same output is served at `GET /api/export?format=md|jsonl&ids=a,b`.

### MCP server

`framecue mcp` speaks the Model Context Protocol over stdio. It finds the workspace from a video file, a `.framecue` folder, a folder containing `.framecue`, `--dir <workspace>`, or by searching upward from the current folder. The queue is read fresh on every call, and the player updates live when the agent marks an item fixed.

Claude Code:

```
claude mcp add --scope project framecue -- npx -y framecue mcp /path/to/video.mp4
```

From source: `claude mcp add --scope project framecue -- node /absolute/path/to/framecue/dist/cli.js mcp /path/to/video.mp4`.

Claude Desktop (`claude_desktop_config.json`: `%APPDATA%\Claude\claude_desktop_config.json` on Windows, `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "framecue": {
      "command": "npx",
      "args": ["-y", "framecue", "mcp", "/path/to/video.mp4"]
    }
  }
}
```

If the app does not inherit your `PATH`, give the absolute path of `npx` (or of `node`, with `dist/cli.js` from source) as `command`. On Windows, use `npx.cmd`, or `node.exe` with the absolute path of `cli.js`.

Any other MCP client takes the same command and args; from source use `"command": "node"` and `"args": ["/absolute/path/to/framecue/dist/cli.js", "mcp", "/path/to/video.mp4"]`.

Tools:

- `list_items({ status? })`: the queue by priority, optionally filtered by status.
- `next_item()`: the highest-priority item that is `todo` or `reopened`, with its images.
- `get_item({ id })`: details as Markdown plus the before and after PNG images.
- `mark_fixed({ id, note })`: `todo` or `reopened` to `fixed`, with a note for the user.

Only the user sets `verified` (or reopens an item), in the player. No tool can verify, reopen, reorder or delete.

Both the player and the MCP process write `queue.jsonl`; writes are serialised across processes with a `queue.lock` file in the workspace.

### Claude Code plugin

The plugin bundles the MCP server and a review skill. Install it once, from a terminal (not inside a Claude Code session):

```
claude plugin marketplace add wewesss/framecue
claude plugin install framecue@framecue
```

Update it with `claude plugin marketplace update framecue`, then `claude plugin update framecue@framecue`.

When the review is done, run `/framecue:review` in the project folder. Claude Code takes each waiting item, fixes it, re-renders when the project has a render command, and marks it fixed. The MCP server finds the workspace by searching upward from the current folder. Run `/framecue:help` for the commands and the review flow.

The plugin runs its own embedded copy of the server with Bun (`bun` must be on PATH), so it needs no npm install.

Local install, from a clone:

```
bun install
bun run build
claude plugin marketplace add <path-to-clone>
claude plugin install framecue@framecue
```

Rebuild with `bun run build:plugin` after changing the sources, then `claude plugin update framecue@framecue`.

## Requirements

- Node.js 22 or later, or Bun 1.4 or later
- ffmpeg 5.1 or later, with ffprobe, on PATH
- A recent Chromium, Firefox or Safari

Install the tools:

- Windows: `winget install Gyan.FFmpeg`, then `winget install OpenJS.NodeJS.LTS` (or Bun: `powershell -c "irm bun.sh/install.ps1 | iex"`)
- macOS: `brew install ffmpeg node` (or `brew install oven-sh/bun/bun`)
- Debian/Ubuntu: `sudo apt install ffmpeg`, plus Node.js (NodeSource or nvm) or Bun (`curl -fsSL https://bun.sh/install | bash`)

## Sponsor

framecue is free and open source. If it saves you time, you can support it on [GitHub Sponsors](https://github.com/sponsors/wewesss) or [Open Collective](https://opencollective.com/miralabs-tech).

## Licence

Licensed under either of MIT or Apache-2.0 at your option.
