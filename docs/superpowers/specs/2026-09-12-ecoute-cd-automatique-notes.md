# Écoute automatique des CD → MusicDex — notes d'exploration

**Statut : exploration interrompue, design non finalisé.** Séance du 2026-09-12.

## L'idée

Une prise connectée sur la chaîne stéréo. Quand un CD tourne, une machine écoute
quelques secondes, identifie le disque, et enregistre dans MusicDex la date
d'écoute et le nombre d'écoutes — l'équivalent musical de `last_watched` /
`watch_count` des films.

## Décisions prises

| Sujet | Décision |
|---|---|
| Captation | Micro d'un Mac situé dans la pièce d'écoute |
| Machine | Le MBP Datadog (apparaît sous ce nom dans HA). On accepte de rater les écoutes faites en son absence ou pendant sa veille |
| Reconnaissance | Service cloud accepté (aucun audio brut n'est envoyé, voir plus bas) |
| Déclencheur | Shelly Plug S avec mesure de consommation, seuil ~15 W pour distinguer l'ampli en veille de l'ampli qui joue |
| Liaison | WebSocket **sortant** du Mac vers HA (p-cloud). Aucun port à ouvrir sur le portable, pas d'automatisation à écrire dans HA, juste un token longue durée |
| Cadence | Un échantillon de ~5 s toutes les 10 min, tant que la prise consomme |
| Seuil de comptage | Une écoute par album et par session ; la session est identifiée par un UUID tiré par le démon, ce qui garde le backend ignorant de la prise électrique |
| Non reconnu | Journalisé dans une table dédiée, sur le modèle de `unmatched_movies`. Pas d'ajout automatique à la collection |
| Architecture | **Démon bête, intelligence dans DexVault** : le démon poste le résultat brut sur `POST /api/music/listens`, et c'est le backend qui rapproche avec `tracks` / `albums`. Le démon n'a aucun accès à la base |

## Vie privée

Point vérifié et important : **aucun audio ne quitte la machine**. Le protocole
Shazam calcule l'empreinte localement et n'envoie que des tuples
*(fréquence, amplitude, temps)* — non reconstructibles en son audible. Partent
tout de même : la signature, l'IP, un UUID d'appareil, un horodatage.

Garde-fous retenus pour le design :

- **Verrou réunion** — ne pas capturer si le micro est déjà pris par une autre
  application (CoreAudio, `kAudioDevicePropertyDeviceIsRunningSomewhere`).
  Non négociable sur un portable d'entreprise.
- Cycle de service ~1 % : 5 s toutes les 10 min, et uniquement quand l'ampli consomme.
- Tampon audio en mémoire, jamais sur disque.
- Indicateur orange de macOS : garantie au niveau de l'OS, non contournable.
- Interrupteur d'arrêt (`input_boolean` HA ou fichier `~/.cd-listener-off`).
- Jetons dans le Trousseau, pas dans un `.env`.

Réserve hors code : le MDM de Datadog peut journaliser les accès micro.

## Impasses explorées — ne pas y revenir

**Playlist « My Shazam Tracks » via Auto Shazam.** L'idée était de laisser
l'iPhone faire la reconnaissance et de lire la playlist Apple Music depuis le
Mac en AppleScript. Vérifié : aucune playlist de ce nom sur ce Mac, bibliothèque
Musique vide. Reposait sur trois suppositions non vérifiées, la première déjà
fausse.

**Action « Shazam It » via `shortcuts run`.** Techniquement excellent — la
commande s'exécute sans interface, écoute ~8 s, rend un résultat exploitable
(`Error: Shazam didn't recognize any media.` en cas de silence), et utilise la
reconnaissance première partie d'Apple. **Mais macOS affiche un HUD centré
« Shazam » à chaque exécution**, non désactivable (ce n'est pas une
notification : ni les Réglages > Notifications ni le raccourci n'y peuvent
rien). Rédhibitoire à raison d'une exécution toutes les 10 min. Reste valable
pour un usage manuel.

**WiiM comme source audio.** L'API HTTP officielle (v1.2) est une API de
contrôle : transport, EQ, presets, groupes. Aucune commande de capture,
d'enregistrement ou d'accès au flux line-in. Un WiiM est un *renderer*, pas une
source qu'on peut taper. À noter dans l'autre sens : quand la musique vient du
WiiM lui-même (streaming), `getPlayerStatus` et l'intégration HA donnent les
métadonnées gratuitement — mais un CD entrant par le line-in n'en produit aucune.

**LLM pour identifier le son.** Non. Le modèle local (`Qwen2.5-VL-7B` sur
p-cloud:8001) est vision, pas audio. Et même un LLM audio ne conviendrait pas :
identifier un enregistrement est une recherche dans un index d'empreintes, pas
une tâche de raisonnement. Un LLM produirait des faux positifs confiants, ce qui
est pire qu'un échec ici — le compteur du mauvais album serait incrémenté sans
que personne s'en aperçoive.

En revanche le LLM a deux places légitimes : **arbitrer les rapprochements
ambigus** (pressages multiples, live vs studio, « feat. ») en dernier recours, et
**lire une pochette photographiée** — `coverScanService.ts` parle déjà à un
modèle de vision via `llm_base_url` / `llm_model`.

## Reconnaissance retenue

`shazamio` (Python). Headless, aucune interface, pas de compilation, pas de
Xcode. Inconvénient assumé : rétro-ingénierie non officielle, susceptible de
casser.

Alternative documentée, non retenue car jugée trop lourde : un binaire Swift
d'environ 80 lignes utilisant **ShazamKit** (`SHManagedSession`). API publique
Apple, sans interface, compilable sur une autre machine puis copié — mais
autorisation micro à faire accepter par TCC, probablement via un `.app` minimal
déclarant `NSMicrophoneUsageDescription`. À ressortir si `shazamio` casse.

## Ce qui reste à faire

1. **Section données** — non rédigée. Migration en miroir de `009_add_watch_tracking.js` :
   `last_listened` + `listen_count` sur `albums`, plus une table d'historique des
   écoutes et une table des non-reconnus.
2. **Section rapprochement** — non rédigée. À concevoir **sans dépendre de l'ISRC**
   (l'action Shazam expose titre, artiste, album, lien Apple Music ; l'ISRC n'est pas garanti).
   Normalisation de titre d'abord, LLM local en dernier recours.
3. **Section démon, erreurs, tests** — non rédigée.
4. Acheter et installer la prise Shelly, calibrer le seuil de puissance.

## Découpage proposé

- **Étape 1** — MusicDex seul : colonnes, endpoint, affichage, bouton « marquer une
  écoute ». Petit, sans risque, utile immédiatement même en saisie manuelle.
- **Étape 2** — la prise et la reconnaissance automatique, seulement si l'étape 1 convainc.

## Repères dans le code

- Modèle à copier : `backend/migrations/009_add_watch_tracking.js`,
  `movieController.markAsWatched` / `clearWatched` / `updateWatchCount`
- Routes films : `backend/index.ts:187-189`
- Routes musique : `backend/index.ts:239-269` — noter que `listen-next` existe déjà
  (`PUT /api/music/albums/:id/listen-next`), pendant musical de `watch-next`
- Aucune colonne d'écoute n'existe encore sur `albums`
- `tracks` contient titre, durée, ISRC et MBID de recording — c'est la table qui
  permettra de remonter d'un morceau reconnu à un album de la collection
