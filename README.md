# framecue

A local web video player to pick frames, frame ranges or regions, comment on them, and hand them to a coding agent (Claude Code, Codex, any) as a prioritised review queue. After a re-render, each fix is checked against the new video.

Nothing leaves your machine: the server binds to 127.0.0.1 and there is no telemetry.

## Usage

```
framecue <video> [--dir <folder>] [--port <n>] [--no-open] [--dev]
framecue mcp [<video|folder>] [--dir <workspace>]
```

- `--dir <folder>`: workspace folder (default: `.framecue` next to the video)
- `--port <n>`: port to listen on (default 5730; the next 10 ports are tried if busy)
- `--no-open`: do not open the browser
- `--dev`: accept the Vite dev origin (`http://localhost:5173`)

Development: run `bun run dev:server -- <video>` for the API, and `bun run dev` for Vite (proxies `/api` to port 5730).

## Agent integration

The queue is plain files (`.framecue/queue.jsonl` and `.framecue/frames/<id>/*.png`), so any agent can read it. framecue also hands it over in two ways.

### Copy for agent

The queue footer has a "Copy for the agent" button (`Shift+C`). It copies the to-do and reopened items, by priority, with absolute image paths:

- **Markdown**: a prompt for a coding agent. A header (video, resolution, fps, frame count, workspace, how to report back), then one section per item with its frames, timecode, comment, region (normalised and in source pixels), before and after images, and agent note.
- **JSONL**: one stored item per line, plus `videoAbs`, `imagesAbs` and `afterImagesAbs`.

The chevron next to the button picks the format, or copies every item shown by the current filter. The item menu (the `...` button) copies one item. The same output is served at `GET /api/export?format=md|jsonl&ids=a,b`.

### MCP server

`framecue mcp` speaks the Model Context Protocol over stdio. It finds the workspace from a video file, a `.framecue` folder, a folder containing `.framecue`, `--dir <workspace>`, or by searching upward from the current folder. The queue is read fresh on every call, and the player updates live when the agent marks an item fixed.

Claude Code:

```
claude mcp add framecue -- bun /absolute/path/to/framecue/src/cli.ts mcp /path/to/video.mp4
```

Any other MCP client (command and args):

```json
{
  "mcpServers": {
    "framecue": {
      "command": "bun",
      "args": ["/absolute/path/to/framecue/src/cli.ts", "mcp", "/path/to/video.mp4"]
    }
  }
}
```

Tools:

- `list_items({ status? })`: the queue by priority, optionally filtered by status.
- `next_item()`: the highest-priority item that is `todo` or `reopened`, with its images.
- `get_item({ id })`: details as Markdown plus the before and after PNG images.
- `mark_fixed({ id, note })`: `todo` or `reopened` to `fixed`, with a note for the user.

Only the user sets `verified` (or reopens an item), in the player. No tool can verify, reopen, reorder or delete.

Both the player and the MCP process write `queue.jsonl`; writes are serialised across processes with a `queue.lock` file in the workspace.

## Requirements

- Bun
- ffmpeg and ffprobe on PATH

## Licence

Licensed under either of MIT or Apache-2.0 at your option.
