<p align="center">
  <img src="public/icon.svg" width="88" alt="Logo LightGym : un chronomètre ouvert autour d'un L">
</p>

<h1 align="center">LightGym</h1>

<p align="center">Un carnet d'entraînement qui lit tes notes telles que tu les écris.</p>

---

La plupart des apps de musculation demandent de choisir chaque exercice dans une bibliothèque. Si ton mouvement n'y est pas (une variante de front lever, un superset maison, une séance d'escalade improvisée), il faut tricher ou renoncer. À l'autre extrême, la note sur téléphone accepte tout mais ne t'aide ni pendant la séance (repos, chronos) ni après (progression, historique).

LightGym se place entre les deux. Tu écris comme dans un carnet :

```
Tractions +12kg 4x [5-6] : 6,5,4,4
```

L'app y retrouve le nom, la charge, le nombre de séries, l'objectif et tes résultats, et surligne les séries qui atteignent le haut de l'objectif. Elle ne refuse jamais une ligne : ce qu'elle ne comprend pas reste une note.

<p align="center">
  <img src="docs/screenshots/semaine.png" width="220" alt="Vue semaine : séances faites et prévues, kilomètres de vélo et de course">
  <img src="docs/screenshots/seance.png" width="220" alt="Séance en cours : supersets, séries saisies et minuteur de repos">
  <img src="docs/screenshots/chrono.png" width="220" alt="Chrono d'intervalles corde à sauter 60/20">
</p>
<p align="center">
  <img src="docs/screenshots/calendrier.png" width="220" alt="Calendrier mensuel des séances et activités">
  <img src="docs/screenshots/exercice.png" width="220" alt="Historique d'un exercice avec sa courbe de progression">
  <img src="docs/screenshots/import.png" width="220" alt="Import de notes : aperçu des journées reconnues">
</p>

## Ce que l'app fait

**Pendant la séance**
- Ton programme, écrit en texte, propose chaque jour sa séance : blocs, supersets, objectifs et repos.
- Valider une série lance le minuteur de repos, avec bips à 3, 2, 1 et vibration à la fin.
- Un chrono de hold mesure un gainage ou un front lever et remplit la valeur tout seul.
- Les blocs « bonus » se passent en un tap quand le temps manque.
- L'écran reste allumé pendant l'effort, plus besoin de déverrouiller le téléphone entre deux séries.

**À côté des séances**
- Intervalles : corde 60/20, tabata, HIIT, EMOM, réglages personnalisés et chronomètre.
- Les activités externes (vélo, running, rando, escalade, yoga…) s'ajoutent en deux taps, avec durée, distance et allure.

**Après**
- Un calendrier mensuel montre les séances, les activités et les kilomètres.
- Chaque exercice a son historique et sa courbe ; les supersets sont séparés en deux exercices.
- L'import de masse reprend des semaines de notes collées telles quelles, avec un aperçu avant d'enregistrer.
- La semaine s'exporte en Markdown (compatible Obsidian), ou en prompt de bilan prêt à coller dans un assistant IA, avec ton contexte, ton programme et ta progression.

## Tes données restent chez toi

Il n'y a ni compte, ni serveur, ni suivi. Tout est stocké dans le navigateur de ton appareil. Une sauvegarde JSON s'exporte et se restaure depuis Outils → Sauvegarde, ce qui sert aussi à passer d'un appareil à l'autre.

Sur iPhone ou iPad, ouvre l'app dans Safari puis Partager → Sur l'écran d'accueil. Elle s'ouvre alors en plein écran, fonctionne hors connexion, et Safari ne peut plus effacer ses données au bout de 7 jours sans visite.

## Écrire ses notes

L'app ne demande pas de syntaxe stricte, seulement quelques repères :

```
# Semaine du 05/10

## Lun 05/10 — Haut du corps
* Tractions +12kg 4x [5-6] : 6,5,4,4
* Front lever one-leg 5x [8-12s] : G 12s, D 12s, G 11s, D 11s
* Pistol / Goblet squat 20kg 4x [5-6 / 8-10] : 6/10, 6/10, 5/10
Autre :
- Vélo 7 km
Note : un peu fatigué.

## Mar 06/10 — Cardio
- Running 3 km en 19 min
```

| Repère | Sens |
|---|---|
| `4x` | nombre de séries |
| `[5-6]`, `[8-12s]` | objectif (répétitions ou secondes) |
| `+12kg`, `20kg` | charge |
| `6,5,4,4` | résultat de chaque série |
| `D 12s`, `G 11s` | côté droit ou gauche |
| `6/10` | superset : exercice 1 / exercice 2 |
| `Autre :` | activités hors séance |
| `Note :` | texte libre |

L'import comprend aussi `Lun 05/10 :`, `Lundi 14` (quand la semaine est indiquée) et le format `4x Tractions 12kg : Objectif 4-6` suivi de `- 6,5,5,4`. L'export Markdown de l'app se réimporte tel quel.

## Écrire son programme

```
## Lundi — Pull
Bloc 1 · skill | repos 2:30
- Front lever one-leg 5x [8-12s]
Superset A · noyau | 4 tours | repos 1:30
- Tractions strictes [8-10]
- Swing KB 20 kg [15]
Superset B · bonus | 3 tours | repos 1:30
- Rowing [10-12]
- Gorilla row KB [8-10 / bras]

## Mardi — Cardio
- Running : 3-4 km facile
```

Un titre qui commence par un jour propose la séance ce jour-là ; sans jour, le gabarit reste disponible à tout moment. Un programme d'exemple se charge au premier lancement.

## Lancer le projet

Il faut Node.js 20 ou plus.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests de lecture des notes et du programme
npm run build    # vérification des types et build dans dist/
```

Stack : Vite, React et TypeScript, avec vite-plugin-pwa pour l'installation et le hors-ligne. Il n'y a aucun backend. La logique de lecture est dans `src/lib`, les écrans dans `src/views`.

## Déployer

Le site est statique et n'a besoin d'aucun serveur. Sur [Vercel](https://vercel.com), il suffit d'importer le dépôt : le préréglage Vite est détecté, avec le build `npm run build` et la sortie `dist`. Netlify, Cloudflare Pages ou GitHub Pages conviennent aussi.

## Limites actuelles

- Il n'y a pas de synchronisation automatique entre appareils. On passe de l'un à l'autre par la sauvegarde JSON.
- L'interface n'existe qu'en français.
- La courbe de progression ne compte que les valeurs simples ; une valeur par côté comme `4/4` s'affiche mais n'entre pas dans la courbe.
