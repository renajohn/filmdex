#!/usr/bin/env bash
# Prépare un worktree Orca de DexVault à partir du dépôt principal.
# Orca fournit ORCA_ROOT_PATH (dépôt principal), ORCA_WORKTREE_PATH et ORCA_WORKSPACE_NAME.
# Hors d'Orca : lancé depuis le worktree, le dépôt principal est trouvé par git.
set -euo pipefail

WT=${ORCA_WORKTREE_PATH:-$PWD}
cd "$WT"
MAIN=${ORCA_ROOT_PATH:-$(dirname "$(cd "$(git rev-parse --git-common-dir)" && pwd -P)")}
NAME=${ORCA_WORKSPACE_NAME:-$(basename "$WT")}

if [[ "$(pwd -P)" == "$(cd "$MAIN" && pwd -P)" ]]; then
  echo "orca-setup : à lancer dans un worktree, pas dans $MAIN" >&2
  exit 1
fi

# copie par clone (APFS sur macOS, reflink ailleurs), copie ordinaire sinon
clone() {
  cp -cR "$@" 2>/dev/null || cp -R --reflink=auto "$@" 2>/dev/null || cp -R "$@"
}

# node_modules clonés depuis le dépôt principal (instantané), puis remis d'accord avec le lockfile
for d in . frontend backend; do
  if [[ -d "$MAIN/$d/node_modules" && ! -e "$d/node_modules" ]]; then
    clone "$MAIN/$d/node_modules" "$d/"
  fi
done
npm run install:all

# secrets et réglages locaux, non suivis par git
for f in .env backend/.env .claude/settings.local.json; do
  if [[ -f "$MAIN/$f" && ! -e "$f" ]]; then
    mkdir -p "$(dirname "$f")"
    clone "$MAIN/$f" "$f"
  fi
done

# données : base copiée (chaque branche peut migrer sans risque), images partagées
mkdir -p data
[[ -f "$MAIN/data/db.sqlite" ]] && clone "$MAIN/data/db.sqlite" data/db.sqlite
[[ -e data/options.json || ! -f "$MAIN/data/options.json" ]] || clone "$MAIN/data/options.json" data/
for d in images thumbs ebooks; do
  [[ -d "$MAIN/data/$d" ]] && ln -sfn "$MAIN/data/$d" "data/$d"
done

echo "orca-setup : $NAME prêt dans $WT"
