# Plugin DexVault pour Navidrome

Navidrome range les écoutes, les étoiles et les cœurs **par compte**, et son API ne donne à un compte
que les siens. Ce plugin, chargé par Navidrome, transmet à DexVault **tout ce que Navidrome lui dit,
tel quel**, pour tous les comptes qui lui sont assignés. Il ne décide de rien :

- chaque **écoute** (`scrobble`) : la piste avec tous ses champs, le compte, l'heure ;
- chaque **début de lecture** (`nowPlaying`) et chaque **rapport de lecture** (`playbackReport` :
  lecture, pause, arrêt, position, lecteur), pour les lecteurs qui en envoient ;
- toutes les heures, et une minute après le démarrage, la **bibliothèque de chaque compte** telle qu'il
  la voit : toutes les pistes, tous les albums et tous les artistes avec tous leurs champs (écoutes,
  étoiles, cœurs compris), et le compte lui-même.

DexVault garde tout (`navidrome_events`, `navidrome_library`) et en tire ce qu'il compte : une écoute
par `scrobble`, ajoutée à l'historique jour par jour, et, pour l'onglet Buy, les cœurs et 4-5 étoiles
des autres comptes. Les notes de `NAVIDROME_USER` restent lues directement par DexVault, sans attendre
l'heure. Aucun mot de passe d'un autre compte n'entre dans DexVault.

Si DexVault ne répond pas, Navidrome garde les écoutes dans sa base et les renvoie jusqu'à ce qu'il
réponde : aucune ne se perd. Les débuts et rapports de lecture, eux, Navidrome ne les garde pas. La page Digital signale un plugin muet depuis plus de trois heures.

## Construire

```sh
./build.sh        # Docker suffit : TinyGo tourne dans un conteneur
```

Donne `dexvault.ndp` (non versionné). Écrit pour Navidrome 0.64 (système de plugins WebAssembly).

## Installer sur p-cloud

1. **Jeton** : un secret partagé, par exemple `openssl rand -base64 32 | tr -d '/+='`. Dans Portainer,
   ajouter la variable `NAVIDROME_PLUGIN_TOKEN` à la stack DexVault, puis *Pull and redeploy*.
2. **Fichier** : déposer le plugin dans le dossier `plugins` du volume de Navidrome :
   ```sh
   scp dexvault.ndp p-cloud:/tmp/
   ssh p-cloud 'docker exec -i navidrome-navidrome-1 sh -c "mkdir -p /data/plugins && cat > /data/plugins/dexvault.ndp" < /tmp/dexvault.ndp'
   ```
3. **Navidrome**, en administrateur : *Settings › Plugins* (bouton *Rescan* si DexVault n'y est pas),
   ouvrir DexVault :
   - *DexVault address* : `http://dexvault:3001` (les deux stacks partagent le réseau `web`) ;
   - *Token* : le même secret qu'à l'étape 1 ;
   - *Users* : tous les comptes ;
   - activer le plugin.
4. Vérifier : une minute plus tard, le journal de Navidrome dit
   `DexVault plugin: library of <compte> reported`, et la page Digital nomme les autres comptes comptés.

Mettre à jour : reconstruire, refaire l'étape 2, puis désactiver et réactiver le plugin.
