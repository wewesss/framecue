# framecue plugin for Claude Code

Review a video in the browser with [framecue](https://github.com/wewesss/framecue), then let Claude Code fix the review queue.

## Install

From a terminal:

```
claude plugin marketplace add wewesss/framecue
claude plugin install framecue@framecue
```

Requirements: Node.js 22 or later on PATH (the plugin runs its embedded framecue server with `node`) and `ffmpeg`.

## What it adds

- MCP server `framecue`: `list_items`, `next_item`, `get_item`, `mark_fixed`. It finds the `.framecue` workspace by searching upward from the current folder.
- `/framecue:review`: takes each waiting item by priority, fixes it, re-renders when the project has a render command, and marks it fixed with a note.
- `/framecue:help`: the commands and the review flow.

Only you verify or reopen an item, in the player. Nothing leaves your machine: the server binds to 127.0.0.1 and there is no telemetry.

## Licence

MIT OR Apache-2.0.
