# Plugin DexVault pour Navidrome

Navidrome range les écoutes, les étoiles et les cœurs **par compte**, et son API ne donne à un compte
que les siens. DexVault ne lit lui-même que `NAVIDROME_USER`. Ce plugin, chargé par Navidrome, lui
envoie le reste :

- **chaque écoute** de chaque compte, au moment où Navidrome la compte (moitié de la piste ou 4 min),
  avec le compte et l'heure ;
- **les étoiles et les cœurs** de chaque compte, toutes les heures, et une minute après le démarrage.

DexVault ajoute les écoutes des autres comptes à son historique jour par jour (celles de
`NAVIDROME_USER` restent comptées par ses compteurs, comme avant) et, pour l'onglet Buy, compte un
cœur ou 4-5 étoiles de n'importe quel compte. Aucun mot de passe d'un autre compte n'entre dans DexVault.

Si DexVault ne répond pas, Navidrome garde les écoutes dans sa base et les renvoie jusqu'à ce qu'il
réponde : rien ne se perd. La page Digital signale un plugin muet depuis plus de trois heures.

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
   `DexVault plugin: <compte>'s likes reported`, et la page Digital nomme les autres comptes comptés.

Mettre à jour : reconstruire, refaire l'étape 2, puis désactiver et réactiver le plugin.
