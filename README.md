# framecue

A local web video player to pick frames, frame ranges or regions, comment on them, and hand them to a coding agent (Claude Code, Codex, any) as a prioritised review queue. After a re-render, each fix is checked against the new video.

Nothing leaves your machine: the server binds to 127.0.0.1 and there is no telemetry.

## Usage

```
framecue <video> [--dir <folder>] [--port <n>] [--no-open] [--dev]
framecue mcp
```

- `--dir <folder>`: workspace folder (default: `.framecue` next to the video)
- `--port <n>`: port to listen on (default 5730; the next 10 ports are tried if busy)
- `--no-open`: do not open the browser
- `--dev`: accept the Vite dev origin (`http://localhost:5173`)

Development: run `bun run dev:server -- <video>` for the API, and `bun run dev` for Vite (proxies `/api` to port 5730).

## Requirements

- Bun
- ffmpeg and ffprobe on PATH

## Licence

Licensed under either of MIT or Apache-2.0 at your option.
