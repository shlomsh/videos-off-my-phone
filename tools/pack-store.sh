#!/bin/sh
# Builds the Chrome Web Store zip from extension/, without the manifest "key"
# (the store refuses it and assigns its own ID). The local unpacked copy keeps its key.
# Usage: npm run pack   ->   dist/videos-off-my-phone-<version>-store.zip
set -eu
cd "$(dirname "$0")/.."
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp -R extension "$tmp/ext"
find "$tmp/ext" -name '.DS_Store' -delete
node -e '
const fs = require("fs");
const p = process.argv[1];
const m = JSON.parse(fs.readFileSync(p, "utf8"));
delete m.key;
fs.writeFileSync(p, JSON.stringify(m, null, 2) + "\n");
console.log(m.version);
' "$tmp/ext/manifest.json" > "$tmp/version"
version=$(cat "$tmp/version")
mkdir -p dist
out="dist/videos-off-my-phone-$version-store.zip"
rm -f "$out"
(cd "$tmp/ext" && zip -qr -X "$OLDPWD/$out" .)
if unzip -p "$out" manifest.json | grep -q '"key"'; then echo "key still present" >&2; exit 1; fi
echo "$out"
