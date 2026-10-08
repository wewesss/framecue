# framecue

A local web video player to pick frames, frame ranges or regions, comment on them, and hand them to a coding agent (Claude Code, Codex, any) as a prioritised review queue. After a re-render, each fix is checked against the new video.

Nothing leaves your machine: the server binds to 127.0.0.1 and there is no telemetry.

## Usage (planned)

```
framecue <video>
framecue mcp
```

## Requirements

- Bun
- ffmpeg and ffprobe on PATH

## Licence

Licensed under either of MIT or Apache-2.0 at your option.
