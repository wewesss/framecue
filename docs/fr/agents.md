# Confier la file à un agent

📖 [English](../en/agents.md) · Français

[← Retour au README](../../README.fr.md)

---

La file, ce sont des fichiers simples : `.framecue/queue.jsonl` et `.framecue/frames/<id>/*.png`, à côté de la vidéo ([format de la file](./queue-format.md)). Tout agent qui sait lire des fichiers peut s'en servir. framecue ajoute trois façons de lui transmettre la file, de la plus légère à la plus intégrée : le presse-papiers, un serveur MCP et un plugin Claude Code.

<p align="center">
  <img src="../../.github/assets/fix-loop.gif" alt="L'agent marque des éléments corrigés par MCP et le lecteur affiche une notification, puis un nouveau rendu est détecté et un élément est vérifié">
</p>

---

## Copier pour l'agent

Le pied du panneau de la file a un bouton **Copier pour l'agent** (`Maj+C`). Il copie en Markdown les éléments **À faire** ou **Rouvert**, par priorité. Le bouton est désactivé quand il n'y a rien à copier. Une notification le confirme : « Copié · 3 élément(s) · Markdown ».

Le chevron à côté du bouton, **Autres formats de copie**, propose :

- Markdown (à faire + rouverts)
- JSONL (à faire + rouverts)
- Tous les éléments affichés · Markdown
- Tous les éléments affichés · JSONL

« Tous les éléments affichés » suit le filtre de statut de la file. Pour copier un seul élément, ouvrez son menu **Plus d'actions** et choisissez **Copier pour l'agent (Markdown)** ou **Copier pour l'agent (JSONL)**.

### Markdown

Un prompt pour un agent de code, rédigé en anglais. Il commence par un en-tête : le chemin de la vidéo, la résolution, la fréquence d'image et le nombre d'images, le dossier de travail, et comment rendre compte (appeler `mark_fixed(id, note)`, ou vous le dire ; seul vous marquez un élément vérifié). Puis une section par élément :

```text
### #2 · region · frame 150 (00:00:05:00)
- id: fc_xxxxxxxxxxxx
- status: todo
- comment:
  > Name overlaps the DIRECTOR line
- regions:
  - region 1 (blue): normalised 0–1 x=0.1 y=0.2 w=0.3 h=0.1; in source pixels (1920x1080): x=192 y=216 w=576 h=108
- images (before):
  - frame 150: /chemin/vers/.framecue/frames/fc_xxxxxxxxxxxx/frame.png
```

Le titre porte la position dans l'ensemble de la file, le type, les images et le timecode. Un élément image s'écrit `frame 150`, une plage ou une zone sur plage s'écrit `frames 250–290`. Un élément liste aussi :

- chaque zone, numérotée à partir de 1, avec le nom de sa couleur, en coordonnées normalisées et en pixels de la source ;
- les images d'avant la correction, chacune avec un libellé (`frame N`, `in, frame N`, `middle, frame N`, `out, frame N`, `contact sheet`), en chemins absolus ;
- les images du dernier rendu (`images (after, render <8 caractères du hash>)`), quand elles existent ;
- la `agent note`, s'il y en a une.

### JSONL

Un élément enregistré par ligne, exactement comme dans `queue.jsonl`, avec quatre champs ajoutés : `regionsDetail` (numéro, couleur, rectangles normalisé et en pixels), `videoAbs`, `imagesAbs` et `afterImagesAbs`. Les trois derniers contiennent des chemins absolus.

---

## Export HTTP

Le serveur du lecteur fournit la même sortie :

```sh
curl "http://127.0.0.1:5730/api/export?format=md"
curl "http://127.0.0.1:5730/api/export?format=jsonl&ids=fc_aaa,fc_bbb"
```

- `format` vaut `md` (par défaut) ou `jsonl`. Toute autre valeur donne un 400.
- Sans `ids`, vous obtenez les éléments à faire et rouverts. Avec `ids`, vous obtenez ces éléments, et un id inconnu donne un 404. Dans les deux cas ils sortent par ordre de priorité.
- La réponse a un en-tête `X-Framecue-Count` avec le nombre d'éléments.
- Utilisez le port affiché au démarrage. Le serveur ne répond qu'aux requêtes dont le `Host` est `127.0.0.1:<port>` ou `localhost:<port>`.

---

## Serveur MCP

```text
framecue mcp [<video|folder>] [--dir <workspace>]
```

`framecue mcp` parle le Model Context Protocol en stdio : stdout est le protocole, donc rien d'autre n'y est écrit. La file est relue à chaque appel, et le lecteur se met à jour en direct quand l'agent marque un élément corrigé (une notification dit « L'agent a marqué #2 corrigé »).

### Comment il trouve le dossier de travail

1. `--dir <workspace>` l'emporte. Le dossier doit exister.
2. Un chemin en argument :
   - un **fichier vidéo** : le dossier `.framecue` à côté, qui doit exister (ouvrez d'abord la vidéo dans framecue) ;
   - un **dossier** nommé `.framecue`, ou qui contient un `queue.jsonl` : ce dossier ;
   - un **dossier qui contient** un dossier `.framecue` : celui-là.
3. Sans argument ni `--dir`, il cherche en remontant depuis le dossier courant un dossier `.framecue`, **à chaque appel**. Un appel d'outil échoue avec un message explicite s'il n'en trouve aucun.

Avec un chemin ou `--dir`, le dossier de travail est résolu une seule fois, au démarrage du serveur.

### Claude Code

```sh
claude mcp add --scope project framecue -- npx -y framecue mcp /chemin/vers/video.mp4
```

Depuis une compilation des sources :

```sh
claude mcp add --scope project framecue -- node /chemin/absolu/vers/framecue/dist/cli.js mcp /chemin/vers/video.mp4
```

### Claude Desktop

Modifiez `claude_desktop_config.json` : `%APPDATA%\Claude\claude_desktop_config.json` sous Windows, `~/Library/Application Support/Claude/claude_desktop_config.json` sous macOS.

```json
{
  "mcpServers": {
    "framecue": {
      "command": "npx",
      "args": ["-y", "framecue", "mcp", "/chemin/vers/video.mp4"]
    }
  }
}
```

Si l'application n'hérite pas de votre `PATH`, donnez le chemin absolu de `npx` comme `command` (ou de `node`, avec `dist/cli.js` pour une compilation des sources).

**Windows :** utilisez `npx.cmd` comme commande, ou `node.exe` avec le chemin absolu de `cli.js`.

### Autres clients MCP

Tout client qui lance un serveur stdio accepte la même commande et les mêmes arguments. Depuis une compilation des sources, utilisez `"command": "node"` et `"args": ["/chemin/absolu/vers/framecue/dist/cli.js", "mcp", "/chemin/vers/video.mp4"]`.

### Outils

| Outil | Arguments | Effet |
|---|---|---|
| `list_items` | `status?` : `todo`, `fixed`, `verified` ou `reopened` | Une ligne par élément, par priorité : `#<rang> <id> <type> frames <a>-<b> (<timecode>) [<statut>] <première ligne du commentaire>`. |
| `next_item` | aucun | L'élément `todo` ou `reopened` de plus haute priorité, avec ses détails et ses images (même sortie que `get_item`). Renvoie un message simple quand rien n'attend. |
| `get_item` | `id` | L'élément en Markdown (type, numéros d'image, timecode, commentaire, zones, statut, note de l'agent, chemins d'images absolus), puis les images en PNG : les captures d'avant la correction et, si elles existent, celles du dernier rendu. |
| `mark_fixed` | `id`, `note` | Passe un élément `todo` ou `reopened` à `fixed` et enregistre `note` pour vous. `note` ne doit pas être vide : dites ce qui a changé et où. |

Limites sur les images : la planche contact est ignorée au-delà de 2 Mo, et les images d'un même appel s'arrêtent à 8 Mo au total. Une image ignorée ou manquante est nommée dans le texte de la réponse.

`mark_fixed` refuse un élément déjà `fixed` ou `verified`. Aucun outil ne peut vérifier, rouvrir, réordonner ou supprimer un élément : vous seul le pouvez, dans le lecteur.

---

## Plugin Claude Code

Le plugin embarque le serveur MCP et un skill de revue, donc vous n'enregistrez rien à la main.

Installez-le une fois, depuis un terminal (pas dans une session Claude Code) :

```sh
claude plugin marketplace add wewesss/framecue
claude plugin install framecue@framecue
```

Mise à jour :

```sh
claude plugin marketplace update framecue
claude plugin update framecue@framecue
```

Le plugin fait tourner sa propre copie embarquée du serveur avec `node` (Node.js 22 ou supérieur dans le `PATH`), donc pas d'installation npm. Il lance `framecue mcp` sans chemin : le dossier de travail est cherché en remontant depuis le dossier courant, à chaque appel.

| Commande | Effet |
|---|---|
| `/framecue:review` | Traite la file. Pour chaque élément en attente, par priorité : lire le commentaire et regarder chaque image, trouver la cause dans le projet, la corriger par le plus petit changement possible, lancer la commande de rendu du projet s'il en a une, puis appeler `mark_fixed` avec une note. Un élément peu clair, ou qui demande une décision de votre part, est ignoré et signalé, pas marqué corrigé. Elle se termine par un résumé et ne vérifie ni ne rouvre jamais rien. |
| `/framecue:help` | Affiche les commandes, comment ouvrir une vidéo, les outils MCP et le déroulé de la revue. |

Lancez `/framecue:review` dans le dossier du projet quand votre revue est terminée.

### Installation locale, depuis un clone

```sh
bun install
bun run build
claude plugin marketplace add <chemin-du-clone>
claude plugin install framecue@framecue
```

Après avoir modifié les sources, lancez `bun run build:plugin`, puis `claude plugin update framecue@framecue`.

---

## Concurrence

Le lecteur et le processus MCP écrivent tous deux `queue.jsonl`. Chaque écriture passe par un verrou pour que deux écrivains ne s'écrasent jamais :

- Au sein d'un même processus, les écritures sont mises en file l'une après l'autre.
- Entre processus, un fichier `queue.lock` est créé de façon exclusive dans le dossier de travail. Il contient l'identifiant du processus et un horodatage.
- Un écrivain qui trouve le verrou pris réessaie pendant 5 secondes au plus, puis échoue avec « Timed out waiting for the queue lock ».
- Le détenteur rafraîchit le verrou toutes les 2 secondes. Un verrou qui n'a pas été touché depuis 10 secondes, ou dont le processus n'existe plus, est repris.
- Le fichier est écrit dans `queue.jsonl.tmp` puis renommé par-dessus `queue.jsonl`, donc un lecteur ne voit pas de fichier à moitié écrit.

Le lecteur surveille aussi `queue.jsonl` : quand un autre processus le modifie, la file se rafraîchit après un court délai (150 ms).
