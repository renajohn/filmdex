#!/bin/sh
# Builds dexvault.ndp, the plugin Navidrome loads from its plugins folder,
# with TinyGo in Docker: nothing to install but Docker.
set -e
cd "$(dirname "$0")"
docker run --rm -v "$PWD":/src -w /src -e HOME=/tmp tinygo/tinygo:0.39.0 \
  sh -c 'go mod download && tinygo build -o plugin.wasm -target wasip1 -buildmode=c-shared -no-debug .'
rm -f dexvault.ndp
zip -j -q dexvault.ndp manifest.json plugin.wasm
rm -f plugin.wasm
echo "Built $(pwd)/dexvault.ndp"
