# Format de la file

📖 [English](../en/queue-format.md) · Français

[← Retour au README](../../README.fr.md)

---

Tout ce que framecue sait d'une revue tient dans un seul dossier, le dossier de travail. Le lecteur, l'export vers le presse-papiers et le serveur MCP ne sont que des vues de ces fichiers, et n'importe quel agent peut les lire directement.

## Structure du dossier de travail

```text
.framecue/
├── queue.jsonl              la file, un élément par ligne
├── frames/
│   └── <id>/                un dossier par élément
│       ├── frame.png        un élément image seule
│       ├── first.png        une plage : première image
│       ├── middle.png       une plage : image du milieu
│       ├── last.png         une plage : dernière image
│       ├── sheet.png        une plage : planche contact
│       └── after-<sha8>/    les mêmes noms, capturés depuis un rendu plus récent
├── cache/
│   └── peaks-<sha256>-200.bin   cache de la forme d'onde audio
├── queue.lock               seulement pendant une écriture
└── queue.jsonl.tmp          seulement pendant une écriture
```

`queue.jsonl` et `frames/` sont la source de vérité. `cache/` peut être supprimé : la forme d'onde est recalculée.

- **Les noms d'images d'un élément dépendent de ses images, pas de son type.** Quand `frameStart` égale `frameEnd`, l'élément a `frame.png`. Sinon il a `first.png`, `middle.png`, `last.png` et `sheet.png`, quel que soit son type : une zone sur une plage les a aussi.
- `middle.png` est l'image numéro `floor((frameStart + frameEnd) / 2)`.
- `sheet.png` est une grille de 4 × 4 vignettes de 320 px de large. Une plage de 16 images ou moins montre chaque image, une plage plus longue montre 16 images régulièrement réparties entre la première et la dernière.
- Les autres images sont l'image entière, extraite par ffmpeg avec le numéro d'image exact.
- `after-<sha8>` reprend les 8 premiers caractères du SHA-256 du rendu d'où viennent les images. Pour chaque élément, seul le dossier du dernier rendu est conservé.
- Supprimer un élément supprime son dossier `frames/<id>/`.
- Les chemins d'images dans `queue.jsonl` sont relatifs au dossier de travail et utilisent toujours `/`.

---

## Champs d'un élément

`queue.jsonl` contient un objet JSON par ligne, trié par `priority` à la lecture. framecue réécrit le fichier entier à chaque modification.

| Champ | Type | Sens |
|---|---|---|
| `id` | string | `fc_` suivi d'un horodatage en base 36 et de 4 caractères aléatoires. C'est aussi le nom du dossier de l'élément dans `frames/`. |
| `video` | `{ path, sha256 }` | Chemin absolu de la vidéo, et SHA-256 du fichier à la création de l'élément. |
| `fps` | number | Fréquence d'image de la vidéo à la création de l'élément. |
| `kind` | `"frame"`, `"range"` ou `"region"` | Un élément `region` a au moins une zone. |
| `frameStart` | entier | Première image, comptée à partir de 0. |
| `frameEnd` | entier | Dernière image. Égale à `frameStart` pour une image seule. Elle ne peut pas dépasser la dernière image de la vidéo. |
| `timecode` | string | `HH:MM:SS:FF` de `frameStart`. `FF` compte les images jusqu'au nombre de fps arrondi, sans gestion du drop-frame. |
| `regions` | tableau de `{ x, y, w, h }` | Rectangles, en fractions de la largeur et de la hauteur de l'image, de 0 à 1. `x` et `y` sont les bords gauche et haut. Vide pour une image ou une plage. Leur ordre donne leur numéro et leur couleur. |
| `comment` | string | Votre remarque. |
| `priority` | number | Plus c'est bas, plus c'est urgent. Un nouvel élément reçoit le plus grand numéro plus un, et réordonner renumérote tous les éléments à partir de 0. |
| `status` | `"todo"`, `"fixed"`, `"verified"` ou `"reopened"` | Voir plus bas. |
| `images` | tableau de string | Chemins des images capturées à la création de l'élément. |
| `after` | `null` ou `{ sha256, capturedAt, images }` | Images des mêmes numéros d'image prises sur un rendu plus récent : son SHA-256, une date ISO 8601 et les chemins. `null` tant qu'il n'y en a pas. |
| `agentNote` | string ou `null` | Ce que l'agent a écrit avec `mark_fixed`. |
| `createdAt`, `updatedAt` | string | Dates ISO 8601. |
| `adapter` | objet, facultatif | Place libre pour qu'un outil y attache ses propres données. framecue ne le lit ni ne l'écrit. |

Une ligne avec un seul objet `region` au lieu de `regions` est lue comme une liste d'une zone, et la clé `region` disparaît à la prochaine écriture du fichier.

---

## Les statuts et qui peut les changer

| Qui | Changement | Comment |
|---|---|---|
| Vous | n'importe quel statut vers n'importe quel autre | Le sélecteur de statut, **Vérifié** (`V`) et **Rouvrir** (`X`) dans le lecteur, ou un `PATCH` sur l'API locale. |
| L'agent | `todo` ou `reopened` vers `fixed`, avec une note | `mark_fixed`. |

Rien d'autre n'est permis à l'agent : `mark_fixed` sur un élément qui n'est ni `todo` ni `reopened` renvoie une erreur qui précise que vous seul pouvez vérifier ou rouvrir un élément.

Un nouvel élément est `todo`. Quand un nouveau rendu est détecté, framecue ne capture les images `after` que pour les éléments `fixed`.

---

## Exemple

Un élément, écrit sur plusieurs lignes ici (dans le fichier, c'est une seule ligne). C'est une plage que l'agent a corrigée et qui a été capturée à nouveau après un nouveau rendu. Les chemins et les hashs sont raccourcis.

```json
{
  "id": "fc_mhx3k2ab9q1z",
  "video": { "path": "/chemin/vers/neon-hours.mp4", "sha256": "3fa9c1d2…" },
  "fps": 30,
  "kind": "range",
  "frameStart": 250,
  "frameEnd": 290,
  "timecode": "00:00:08:10",
  "regions": [],
  "comment": "EPISODE 04 is nearly invisible on the dark background",
  "priority": 2,
  "status": "fixed",
  "images": [
    "frames/fc_mhx3k2ab9q1z/first.png",
    "frames/fc_mhx3k2ab9q1z/middle.png",
    "frames/fc_mhx3k2ab9q1z/last.png",
    "frames/fc_mhx3k2ab9q1z/sheet.png"
  ],
  "after": {
    "sha256": "b71e04c8…",
    "capturedAt": "2026-11-11T10:42:07.512Z",
    "images": [
      "frames/fc_mhx3k2ab9q1z/after-b71e04c8/first.png",
      "frames/fc_mhx3k2ab9q1z/after-b71e04c8/middle.png",
      "frames/fc_mhx3k2ab9q1z/after-b71e04c8/last.png",
      "frames/fc_mhx3k2ab9q1z/after-b71e04c8/sheet.png"
    ]
  },
  "agentNote": "Raised the opacity of the EPISODE 04 label from 0.2 to 0.9.",
  "createdAt": "2026-11-11T10:31:45.120Z",
  "updatedAt": "2026-11-11T10:42:07.512Z"
}
```

Les écritures sont sérialisées par un verrou : voir [agents](./agents.md#concurrence).
