# Prise en main

📖 [English](../en/getting-started.md) · Français

[← Retour au README](../../README.fr.md)

---

## Prérequis

- Node.js 22 ou supérieur, ou Bun 1.4 ou supérieur
- ffmpeg 5.1 ou supérieur, avec ffprobe, dans le `PATH`
- Un Chromium, Firefox ou Safari récent

Installer les outils :

- **Windows :** `winget install Gyan.FFmpeg`, puis `winget install OpenJS.NodeJS.LTS`. Pour Bun à la place de Node : `powershell -c "irm bun.sh/install.ps1 | iex"`.
- **macOS :** `brew install ffmpeg node`, ou `brew install oven-sh/bun/bun` pour Bun.
- **Debian / Ubuntu :** `sudo apt install ffmpeg`, plus Node.js (NodeSource ou nvm) ou Bun (`curl -fsSL https://bun.sh/install | bash`).

Vérifiez que les deux outils ffmpeg sont trouvés :

```sh
ffmpeg -version
ffprobe -version
```

Si framecue ne parvient pas à lancer l'un des deux, il s'arrête avec un message qui nomme l'outil et propose une commande d'installation pour votre plateforme.

---

## Installation

Aucune installation n'est nécessaire :

```sh
npx framecue <video>
bunx framecue <video>
```

Ou en global :

```sh
npm i -g framecue
bun add -g framecue
```

### Depuis les sources

```sh
git clone https://github.com/wewesss/framecue.git
cd framecue
bun install
bun run build
node dist/cli.js <video>
```

`bun src/cli.ts <video>` fonctionne aussi sans compiler la CLI. L'interface web doit quand même être compilée une fois avec `bun run build:web`, sinon le serveur répond « Web UI not built ».

---

## Premier lancement

```sh
framecue ma-video.mp4
```

framecue analyse la vidéo, démarre le serveur et affiche un récapitulatif :

```text
Video:      ma-video.mp4
Resolution: 1920x1080
FPS:        30
Frames:     300
Workspace:  /chemin/vers/.framecue
URL:        http://127.0.0.1:5730
```

Votre navigateur s'ouvre sur cette URL. Appuyez sur `Ctrl+C` dans le terminal pour arrêter le serveur.

Si la vidéo a une fréquence d'image variable, framecue affiche aussi un avertissement et le lecteur montre un badge `VFR`. Voir les limites connues dans le [README](../../README.fr.md).

Tant que le serveur tourne, chaque nouveau rendu de la vidéo écrit une ligne comme celle-ci :

```text
Render:     new render detected (3fa9c1d2), 2 fixed item(s) to verify
```

Les éléments qui ne peuvent pas être capturés sur le nouveau rendu sont listés sous la forme `Skipped <id>: <raison>`. Si la fréquence d'image ou le nombre d'images a changé, une ligne `Timing changed: …` le dit. Ces messages restent en anglais.

Suivez ensuite la boucle : [le lecteur](./player.md), [confier la file à un agent](./agents.md).

---

## Ligne de commande

```text
framecue <video> [--dir <folder>] [--port <n>] [--no-open] [--dev]
framecue mcp [<video|folder>] [--dir <workspace>]
```

| Option | Défaut | Effet |
|---|---|---|
| `--dir <folder>` | `.framecue` à côté de la vidéo | Dossier de travail. |
| `--port <n>` | `5730` | Port d'écoute. S'il est occupé, les 10 ports suivants sont essayés (de 5730 à 5740 par défaut). `0` demande un port libre à l'OS, en un seul essai. |
| `--no-open` | désactivé | N'ouvre pas le navigateur. |
| `--dev` | désactivé | Accepte aussi les requêtes de l'origine de développement Vite, `http://localhost:5173`. |
| `-h`, `--help` | | Affiche l'aide d'utilisation. |

`framecue mcp` s'adresse aux agents. Il parle en stdio au lieu de lancer le lecteur : voir [agents](./agents.md#serveur-mcp).

Des arguments invalides affichent l'aide et quittent avec le code 1. Un fichier vidéo qui n'existe pas écrit `File not found: <chemin>` et quitte aussi avec le code 1. Un `--port` invalide (pas un entier entre 0 et 65535) quitte aussi avec le code 1.

Le serveur n'écoute que sur `127.0.0.1`. Les requêtes dont l'en-tête `Host` n'est pas `127.0.0.1:<port>` ou `localhost:<port>` reçoivent un 403.

---

## Où va le dossier de travail

Par défaut, framecue crée un dossier `.framecue` à côté de la vidéo et y range tout : la file, les images capturées, un cache de la forme d'onde audio. Utilisez `--dir` pour le mettre ailleurs. La structure est décrite dans [format de la file](./queue-format.md#structure-du-dossier-de-travail).

La file n'est pas séparée par vidéo. Deux vidéos dans le même dossier partagent `.framecue`, sauf si vous passez un `--dir` différent à chacune.

---

## Mode développement

Bun uniquement. Lancez l'API et le serveur de développement Vite côte à côte :

```sh
bun run dev:server -- <video>   # bun src/cli.ts --no-open --dev <video>
bun run dev                     # Vite, redirige /api vers http://127.0.0.1:5730
```

`dev:server` passe `--no-open --dev`, donc l'API accepte l'origine de Vite. Les autres scripts (`check`, `typecheck`, `test`, `build`) sont listés dans le [README](../../README.fr.md).
