# Ripper ses CD vers Navidrome avec DexVault

Chaque CD est rippé de nouveau en lossless (FLAC), tagué par Picard sur son pressage exact, puis envoyé sur p-cloud où Navidrome le sert. DexVault suit l'avancement et reprend des rips l'édition exacte de chaque CD.

```
XLD ──► ~/Music/Rips ──► Picard ──► ~/Music/Library ──► sync-music ──► p-cloud:/home/rjl/Music/FLAC ──► Navidrome ──► DexVault
```

## Une fois pour toutes

- **Portainer** : dans la stack DexVault, ajouter `NAVIDROME_USER` et `NAVIDROME_PASSWORD` (un compte Navidrome dédié, sans droits d'admin), puis redéployer. Ne pas renseigner `NAVIDROME_URL` : la valeur par défaut, `http://navidrome:4533`, passe par le réseau Docker `web` (par Traefik, le certificat mkcert n'est pas vérifiable par Node).
- **XLD** (dans `/Applications`) : au premier lancement, macOS le bloque car il n'est pas notarié. Aller dans **Réglages Système > Confidentialité et sécurité** et cliquer sur **Ouvrir quand même**. Puis, dans **XLD > Préférences** :
  - **Général** : format de sortie **FLAC**, dossier de sortie `~/Music/Rips`.
  - **File Naming** : **Custom** `%T/%n %t`, pour un sous-dossier par CD dans `~/Music/Rips`.
  - **Rip CD** : **XLD Secure Ripper**, **Query AccurateRip** coché, **Save log file** coché, **Test before copy** décoché, pre-gap **Include pre-gap except HTOA** (le défaut, celui d'AccurateRip). Détecter une fois le **read offset** de son lecteur (bouton **Detect** avec un CD courant).
  - Ne pas ajouter les rips à l'app Musique : ils seraient copiés en plus dans `~/Music/Music`.
- **`~/Music/Rips`** contient un fichier caché `.keep` : sans lui, Picard supprime le dossier dès qu'il est vide. Ne pas l'effacer.
- **Picard** : déjà réglé dans `~/.config/MusicBrainz/Picard.ini` (à refaire seulement si on le réinstalle) :
  - déplacer et renommer les fichiers à l'enregistrement, vers `~/Music/Library/Artiste/Album/` ;
  - emporter le journal XLD (`*.log *.cue`) avec l'album et supprimer les dossiers vidés ;
  - pochette intégrée aux fichiers **et** `cover.jpg` à côté (pour Navidrome) ;
  - pour garder aussi le dos (et le livret) : **Options > Cover Art**, laisser cochés *Embed only a single front image* **et** *Save only a single front image as separate file* (ils ne limitent que l'image avant : sans eux, une édition à deux images « front » donne `cover.jpg` et `cover (1).jpg`), cocher *Use the image type as filename* (`back.jpg`, `booklet.jpg` ; l'avant reste `cover.jpg`) ; puis **Cover Art Archive > Select types…**, ajouter *Back* (et *Booklet*). Le Cover Art Archive n'a souvent que la pochette avant ;
  - **Use release relationships** et **Use track relationships** cochés (compositeur, chef, interprètes dans les tags) ;
  - intégration navigateur active sur le port 8000 (pour le bouton « Picard » de DexVault).
- **`sync-music`** est dans `~/.local/bin`. Il envoie `~/Music/Library` vers `p-cloud:/home/rjl/Music/FLAC/` par rsync, puis supprime la copie locale. Un fichier local n'est supprimé qu'une fois arrivé intact, et rien n'est jamais supprimé sur p-cloud.

## CD déjà dans DexVault

1. **DexVault > MusicDex > Ripping.** Taper le titre dans « Find a CD… ». Le CD est en « Not ripped » ou « Not lossless ».
2. **XLD.** Insérer le CD, la liste des pistes s'ouvre. Cliquer sur **Rip** et attendre la fin. Dans le journal, vérifier « AccurateRip: OK » ou « No errors occurred ».
   **Ne pas éjecter le CD** : Picard en a besoin à l'étape suivante.
3. **Picard > Lookup CD** (bouton à disque de la barre d'outils).
   - **Disque trouvé** : l'album apparaît à droite. Si Picard propose plusieurs éditions, prendre celle du boîtier : label, numéro de catalogue, pays.
   - **Disque non trouvé** : Picard ouvre une page MusicBrainz « Disc ID not found ». La fermer, puis cliquer sur **« Picard »** sur la ligne du CD dans DexVault : Picard charge l'édition que DexVault connaît.
4. **Glisser le dossier du rip** depuis `~/Music/Rips` (Finder) sur la ligne de l'album, **dans le panneau de droite** de Picard. Déplier l'album : chaque piste montre son fichier, l'album indique 11/11 (par exemple), et le panneau de gauche est vide.
5. **Sélectionner l'album dans le panneau de droite**, puis **⌘S**. Picard tague les fichiers, puis les déplace dans `~/Music/Library/Artiste/Album/`.
   Enregistrer des fichiers restés dans le panneau de gauche les range sans tags MusicBrainz, dans `Artiste/Titre.flac`, sans dossier d'album ni numéro : les recharger dans Picard et recommencer.
6. Éjecter le CD. Dans le Terminal : **`sync-music`**, tout de suite ou après plusieurs CD.
7. Quelques minutes plus tard, **DexVault > Ripping > Refresh**. Le CD passe en « Lossless ». Si Picard a reconnu un autre pressage que celui qu'avait DexVault, un encart vert l'indique : DexVault a pris l'édition du rip, et pistes et crédits suivent ce pressage.

## CD pas encore dans DexVault

1. **XLD** : insérer le CD, **Rip**, **ne pas éjecter**.
2. **Picard > Lookup CD.** C'est ici le seul moyen d'identifier le pressage exact : DexVault n'a pas d'édition à proposer.
   - **Disque non trouvé** : utiliser le champ de recherche de Picard (en haut à droite, mode « Album »), chercher par titre et artiste, puis choisir l'édition du boîtier : code-barres, label, pays.
3. **Glisser le dossier** du rip sur l'album dans le panneau de droite, vérifier que tout est rattaché, sélectionner l'album, puis **⌘S**.
4. **`sync-music`**.
5. **DexVault > Ripping > Refresh.** Un encart indique « now added to your collection » : l'album est créé avec la pochette, les pistes et les crédits de l'édition rippée. Ses titres sont ceux de MusicBrainz, comme dans les tags.
6. Ouvrir la fiche dans DexVault pour vérifier, et compléter ce qui ne vient pas de MusicBrainz : état, prix, notes.

Si l'album attendait dans la **wish list**, il passe dans la collection avec l'édition rippée (encart « now in your collection »).

## Ce que DexVault fait des rips, et ses garde-fous

À l'ouverture de la page Ripping et à chaque **Refresh**, DexVault relit Navidrome. Pour chaque album **FLAC** dont l'édition MusicBrainz (écrite par Picard dans les tags) lui est inconnue, il cherche le même album (release group) :

| Dans DexVault | Ce qu'il fait |
|---|---|
| Le CD est dans la collection | Il remplace l'édition par celle du rip |
| L'album est dans la wish list | Il le passe dans la collection, avec cette édition |
| L'album est absent | Il l'ajoute à la collection depuis cette édition |

Puis il rafraîchit pistes et crédits depuis l'édition exacte.

- Seul un rip **FLAC** compte, celui de ce circuit : les anciens MP3 et les anciennes copies ALAC d'iTunes, même tagués, ne décident rien (ils sont pourtant comptés en « Lossless » pour l'ALAC).
- Seule une édition que MusicBrainz liste comme **CD** est ajoutée : un album acheté en téléchargement FLAC (Bandcamp…) n'est pas un CD de la collection.
- Si **deux albums** de DexVault ont le même release group, ou si l'édition appartient déjà à un autre album, DexVault ne touche à rien.
- Les **pochettes** de DexVault (avant et dos) ne sont jamais remplacées : DexVault ne lit aucune image dans Navidrome, et ni l'adoption d'une édition ni le rafraîchissement n'écrivent les pochettes. Elles ne sont téléchargées qu'à l'ajout d'un CD absent de DexVault.

## Mettre sa propre photo comme pochette

1. Dans Picard, avant ⌘S, glisser sa photo sur l'album (panneau de droite) : elle remplace l'image de MusicBrainz dans les tags et dans `cover.jpg`.
2. Après `sync-music`, dans DexVault : fiche de l'album > **Edit** > sous la pochette, **Use the cover from Navidrome**.

DexVault ne fait cet import que sur demande. Navidrome ne fournit que la pochette **avant** : le dos se change toujours avec **Change Back Cover** dans DexVault. Si Navidrome n'a aucune image pour l'album, il renvoie une image générique : vérifier le résultat, et recharger l'ancienne au besoin.

## États de la page Ripping

- **Not ripped** : absent de Navidrome.
- **Not lossless** : dans Navidrome, mais en MP3 ou AAC. À ripper de nouveau.
- **Lossless** : FLAC, ALAC, WAV ou AIFF. Quand l'ancien MP3 et le nouveau rip coexistent, la meilleure copie compte : l'ancien MP3 peut alors être supprimé de p-cloud.

Le filtre par défaut, **To rip**, réunit les deux premiers états.

## Limites et dépannage

- **CD absent de MusicBrainz** (Ellipse, Hydromel, Trellan, *Zoom*…) : ni Lookup CD ni l'ajout automatique ne fonctionnent. Le saisir dans DexVault comme avant ; le taguer à la main dans Picard ou attendre le circuit où DexVault tague lui-même.
- **Le bouton « Picard » ne fait rien** : Picard doit être ouvert sur le même Mac, et le navigateur doit autoriser les fenêtres popup pour DexVault. Le bouton n'apparaît que sur ordinateur, pour un album qui a une édition MusicBrainz.
- **« Could not read Navidrome »** sur la page Ripping : vérifier les identifiants dans Portainer ; si le nom `navidrome` ne se résout pas, essayer `NAVIDROME_URL=http://navidrome-navidrome-1:4533`.
- **Un CD rippé reste en « Not ripped »** : attendre quelques minutes que Navidrome le voie (surveillance des fichiers, et un scan complet chaque heure), puis **Refresh**. Un ancien MP3 sans tags MusicBrainz n'est reconnu que par titre et artiste, et peut ne pas l'être.
