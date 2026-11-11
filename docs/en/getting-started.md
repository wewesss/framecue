# Getting started

📖 English · [Français](../fr/getting-started.md)

[← Back to the README](../../README.md)

---

## Requirements

- Node.js 22 or later, or Bun 1.4 or later
- ffmpeg 5.1 or later, with ffprobe, on `PATH`
- A recent Chromium, Firefox or Safari

Install the tools:

- **Windows:** `winget install Gyan.FFmpeg`, then `winget install OpenJS.NodeJS.LTS`. For Bun instead of Node: `powershell -c "irm bun.sh/install.ps1 | iex"`.
- **macOS:** `brew install ffmpeg node`, or `brew install oven-sh/bun/bun` for Bun.
- **Debian / Ubuntu:** `sudo apt install ffmpeg`, plus Node.js (NodeSource or nvm) or Bun (`curl -fsSL https://bun.sh/install | bash`).

Check that both ffmpeg tools are found:

```sh
ffmpeg -version
ffprobe -version
```

If framecue cannot start one of them, it stops with a message that names the tool and suggests an install command for your platform.

---

## Install

No install is needed:

```sh
npx framecue <video>
bunx framecue <video>
```

Or install it globally:

```sh
npm i -g framecue
bun add -g framecue
```

### From source

```sh
git clone https://github.com/wewesss/framecue.git
cd framecue
bun install
bun run build
node dist/cli.js <video>
```

`bun src/cli.ts <video>` also works without building the CLI. The web UI still has to be built once with `bun run build:web`, otherwise the server answers "Web UI not built".

---

## First run

```sh
framecue my-video.mp4
```

framecue probes the video, starts the server and prints a summary:

```text
Video:      my-video.mp4
Resolution: 1920x1080
FPS:        30
Frames:     300
Workspace:  /path/to/.framecue
URL:        http://127.0.0.1:5730
```

Your browser opens on that URL. Press `Ctrl+C` in the terminal to stop the server.

If the video has a variable frame rate, framecue also prints a warning and the player shows a `VFR` badge. See the known limits in the [README](../../README.md).

While the server runs, each new render of the video prints a line like this:

```text
Render:     new render detected (3fa9c1d2), 2 fixed item(s) to verify
```

Items that cannot be captured on the new render are listed as `Skipped <id>: <reason>`. If the frame rate or frame count changed, a `Timing changed: …` line says so.

Then follow the loop: [the player](./player.md), [handing the queue to an agent](./agents.md).

---

## Command line

```text
framecue <video> [--dir <folder>] [--port <n>] [--no-open] [--dev]
framecue mcp [<video|folder>] [--dir <workspace>]
```

| Option | Default | What it does |
|---|---|---|
| `--dir <folder>` | `.framecue` next to the video | Workspace folder. |
| `--port <n>` | `5730` | Port to listen on. If it is busy, the next 10 ports are tried (5730 to 5740 by default). `0` asks the OS for a free port, with a single attempt. |
| `--no-open` | off | Do not open the browser. |
| `--dev` | off | Also accept requests from the Vite dev origin, `http://localhost:5173`. |
| `-h`, `--help` | | Show the usage text. |

`framecue mcp` is for agents. It talks over stdio instead of starting the player: see [agents](./agents.md#mcp-server).

Bad arguments print the usage text and exit with code 1. A video file that does not exist prints `File not found: <path>` and exits with code 1. An invalid `--port` (not an integer between 0 and 65535) exits with code 1 too.

The server only listens on `127.0.0.1`. Requests whose `Host` header is not `127.0.0.1:<port>` or `localhost:<port>` get a 403.

---

## Where the workspace goes

By default, framecue creates a `.framecue` folder next to the video and keeps everything there: the queue, the captured frames, a cache of the audio waveform. Use `--dir` to put it somewhere else. The layout is in [queue format](./queue-format.md#workspace-layout).

The queue is not split by video. Two videos in the same folder share `.framecue` unless you pass a different `--dir` to each.

---

## Development mode

Bun only. Run the API and the Vite dev server side by side:

```sh
bun run dev:server -- <video>   # bun src/cli.ts --no-open --dev <video>
bun run dev                     # Vite, proxies /api to http://127.0.0.1:5730
```

`dev:server` passes `--no-open --dev`, so the API accepts the Vite origin. The other scripts (`check`, `typecheck`, `test`, `build`) are listed in the [README](../../README.md).
