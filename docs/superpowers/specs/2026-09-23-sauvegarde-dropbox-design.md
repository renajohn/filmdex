# Sauvegarde nocturne sur Dropbox

Date : 2026-09-23
Statut : conception validée, en attente de relecture

## Objectif

Ne pas perdre la collection si p-cloud tombe. Aujourd'hui, les sauvegardes de DexVault sont écrites
dans `/data/backups`, sur le même volume Docker que la base : un disque mort ou un volume supprimé les
emporte avec elle. Il faut une copie hors du serveur, faite sans y penser.

Critères de réussite :

- chaque nuit vers 3 h, heure de Zurich, une sauvegarde complète part sur Dropbox ;
- Dropbox garde les 7 sauvegardes réussies les plus récentes, jamais moins à cause d'une panne ;
- un échec se voit sur la page Backup, avec la cause ;
- un zip récupéré sur Dropbox se restaure par le formulaire « Restore from file » existant ;
- la copie de la base est cohérente même si l'app écrit pendant la sauvegarde.

Hors périmètre : notifications (Home Assistant, Homepage, e-mail), restauration directe depuis
Dropbox dans l'interface, chiffrement du zip, sauvegarde d'autres services de p-cloud.

## Choix d'emplacement

La sauvegarde vit dans le backend de DexVault, plutôt que dans un conteneur rclone à côté. Raison
principale : un conteneur échoue en silence, alors que DexVault peut afficher l'état de la dernière
exécution là où on gère déjà les sauvegardes. Le zip est aussi celui que la restauration comprend déjà.

## Contenu de la sauvegarde

Le zip produit par `BackupService.createBackup()` : `db.sqlite`, `images/`, `ebooks/`. Les jaquettes
ajoutées à la main ne se retéléchargent pas, d'où l'inclusion des images (63 Mo en local à ce jour).

### Copie cohérente de la base

`createBackup` zippe actuellement `db.sqlite` tel quel, pendant que le serveur tourne. Une écriture
concurrente peut produire une copie incohérente. Désormais :

1. `VACUUM INTO '<data>/backups/.snapshot-<horodatage>.sqlite'` via la connexion de `getDatabase()` ;
2. ce fichier est ajouté au zip sous le nom `db.sqlite` ;
3. il est supprimé une fois l'archive fermée, en cas de succès comme d'échec.

Ce changement vaut pour toutes les sauvegardes, manuelles comprises. Le format du zip ne change pas.

## Dropbox

### Accès

Une app Dropbox créée par l'utilisateur dans la console développeur :

- type d'accès **App folder** : DexVault ne voit que `/Apps/<nom de l'app>/`, rien d'autre ;
- permissions : `files.content.write`, `files.content.read`, `files.metadata.read`.

Configuration par variables d'environnement, ajoutées au `docker-compose.yml` avec la même forme que
les autres clés (`${VAR:-}`) :

| Variable | Rôle |
|---|---|
| `DROPBOX_APP_KEY` | identifiant de l'app |
| `DROPBOX_APP_SECRET` | secret de l'app |
| `DROPBOX_REFRESH_TOKEN` | jeton longue durée, obtenu une fois |
| `TZ=Europe/Zurich` | fixe l'heure locale du conteneur, pour que « 3 h » soit 3 h à Zurich |

Si l'une des trois variables Dropbox manque, `dropboxService.isConfigured()` renvoie faux, rien n'est
planifié et la page affiche « non configuré », comme pour DoesTheDogDie.

### Obtenir le refresh token

`scripts/dropbox-auth.js`, lancé une fois sur un poste avec navigateur :

1. lit la clé et le secret dans l'environnement ou en arguments ;
2. affiche l'URL `https://www.dropbox.com/oauth2/authorize?client_id=…&response_type=code&token_access_type=offline` ;
3. attend le code collé par l'utilisateur ;
4. l'échange contre un refresh token (`POST https://api.dropboxapi.com/oauth2/token`, `grant_type=authorization_code`) et l'affiche.

La procédure est décrite dans le README.

### Client `dropboxService.ts`

Module sans SDK, par `fetch` :

- `getAccessToken()` : `grant_type=refresh_token`, jeton gardé en mémoire jusqu'à son expiration moins
  une minute ;
- `uploadFile(localPath, remotePath)` : upload session par morceaux de 8 Mo
  (`upload_session/start`, `append_v2`, `finish` avec `mode: overwrite`), ce qui évite la limite de
  150 Mo d'un envoi simple quand les images grossiront ;
- `listFiles(folder)` : `files/list_folder`, avec suivi de `cursor` si `has_more` ;
- `deleteFile(path)` : `files/delete_v2`.

Une réponse non 2xx lève une erreur portant le statut et le `error_summary` de Dropbox, pour que le
message affiché soit exploitable (« 401 expired_access_token », « 409 insufficient_space »…).

## Exécution nocturne : `nightlyBackupService.ts`

### Une exécution

1. si une exécution est déjà en cours, refuser (voir les routes) ;
2. `createBackup()` ;
3. renommer le zip en `dexvault_<AAAA-MM-JJ>.zip` et l'envoyer à la racine du dossier de l'app ; une
   seconde exécution le même jour écrase la première ;
4. **seulement après un envoi réussi** : lister le dossier, garder les 7 fichiers `dexvault_*.zip` les
   plus récents par nom, supprimer les autres ; les fichiers qui ne suivent pas ce motif ne sont jamais
   touchés ;
5. supprimer le zip local, en cas de succès comme d'échec : sur le même volume, il ne protège de rien ;
6. écrire l'état.

La rotation se fait par **nombre** et non par âge : après une semaine d'échecs, les 7 dernières bonnes
sauvegardes sont toujours là.

Un échec de la rotation (étape 4) après un envoi réussi est consigné comme avertissement, et
l'exécution compte comme réussie : la sauvegarde du jour est en sécurité.

### État

Fichier `<data>/backups/dropbox-status.json`, réécrit à la fin de chaque exécution :

```json
{
  "lastSuccessAt": "2026-09-24T01:00:12.000Z",
  "lastSuccessFile": "dexvault_2026-09-24.zip",
  "lastSuccessSize": 68157440,
  "lastErrorAt": null,
  "lastError": null,
  "lastWarning": null
}
```

Une réussite efface `lastError`. Le fichier n'est pas un `.zip`, donc la liste des sauvegardes locales
l'ignore déjà.

### Planification

- `startNightlyBackup()` est appelé au démarrage dans `backend/index.ts`, à côté de
  `warningsService.startDailyRefresh()`, et ne fait rien si `NODE_ENV === 'test'` ou si Dropbox n'est
  pas configuré ;
- `msUntilNext(hour, now)` calcule le délai jusqu'au prochain 3 h local ; un `setTimeout` (`unref`)
  lance l'exécution puis se reprogramme. Pas de `setInterval` de 24 h, qui dériverait selon l'heure de
  redémarrage et les changements d'heure ;
- rattrapage : au démarrage, si `lastSuccessAt` est absent ou date de plus de 24 h, une exécution part
  5 minutes plus tard, en plus de celle de 3 h.

## Routes

| Route | Effet |
|---|---|
| `GET /api/backup/dropbox/status` | `{ configured, running, nextRunAt, ...état }` |
| `POST /api/backup/dropbox/run` | lance une exécution et attend son résultat ; 409 si une exécution est en cours ; 400 si non configuré |

Elles sont déclarées avant `DELETE /api/backup/:filename`, sans conflit puisque les méthodes diffèrent.

## Interface : page Backup

Un encart « Dropbox backup » en tête de page, en anglais comme le reste de la page :

- non configuré : une ligne expliquant les trois variables à définir ;
- sinon :
  - « Last backup: <date relative> (<taille>) » ;
  - la dernière erreur, avec sa date, si elle est plus récente que la dernière réussite ;
  - un avertissement visible si la dernière réussite date de plus de 48 h ou n'existe pas ;
  - la prochaine exécution prévue ;
  - un bouton « Back up now », désactivé pendant une exécution, qui recharge l'état à la fin.

Méthodes ajoutées à `backupService.ts` côté frontend : `getDropboxStatus()`, `runDropboxBackup()`.

## Restauration

Aucun code nouveau : télécharger le zip depuis Dropbox, puis « Restore from file » sur la page Backup.
Le README décrit la marche à suivre, y compris sur un serveur neuf.

## Tests

Backend, `fetch` simulé :

- `dropboxService` : rafraîchissement et réutilisation du jeton ; envoi d'un fichier de 20 Mo en trois
  morceaux avec les bons décalages ; message d'erreur construit depuis `error_summary` ;
  pagination de `listFiles` ;
- rotation : sur 9 fichiers `dexvault_*` et un fichier étranger, supprime les 2 plus anciens et laisse
  l'étranger ; ne supprime rien si l'envoi échoue ;
- exécution : état écrit en cas de succès et d'échec, zip local supprimé dans les deux cas, 409 sur
  exécution concurrente ;
- `msUntilNext` : avant et après 3 h, et les nuits des changements d'heure de mars et d'octobre sous
  `TZ=Europe/Zurich` ;
- `createBackup` : le `db.sqlite` du zip s'ouvre et contient les données, le fichier temporaire du
  snapshot a disparu.

Frontend, Vitest : l'encart dans ses quatre états (non configuré, à jour, en erreur, plus de 48 h) et
le bouton désactivé pendant l'exécution.
