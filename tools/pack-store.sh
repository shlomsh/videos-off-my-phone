#!/bin/sh
# Builds the Chrome Web Store zip from extension/, without the manifest "key"
# (the store refuses it and assigns its own ID), and with STORE_BUILD = true in config.js
# (hides what only the unpacked test copy shows). The local unpacked copy keeps both as they are.
# Usage: npm run pack   ->   dist/videos-off-my-phone-<version>-store.zip
# PACK_OUT=<dir> writes the zip there instead of dist/.
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
node -e '
const fs = require("fs");
const p = process.argv[1];
const s = fs.readFileSync(p, "utf8");
const flag = /^export const STORE_BUILD = false;$/m;
if (!flag.test(s)) { console.error("config.js: the line \"export const STORE_BUILD = false;\" was not found"); process.exit(1); }
fs.writeFileSync(p, s.replace(flag, "export const STORE_BUILD = true;"));
' "$tmp/ext/config.js"
version=$(cat "$tmp/version")
out_dir=${PACK_OUT:-dist}
mkdir -p "$out_dir"
out="$out_dir/videos-off-my-phone-$version-store.zip"
rm -f "$out"
(cd "$tmp/ext" && zip -qr -X "$tmp/store.zip" .)
mv "$tmp/store.zip" "$out"
if unzip -p "$out" manifest.json | grep -q '"key"'; then echo "key still present" >&2; rm -f "$out"; exit 1; fi
if ! unzip -p "$out" config.js | grep -qx 'export const STORE_BUILD = true;'; then echo "STORE_BUILD was not set to true" >&2; rm -f "$out"; exit 1; fi
if unzip -p "$out" config.js | grep -q 'STORE_BUILD = false'; then echo "STORE_BUILD = false still present" >&2; rm -f "$out"; exit 1; fi
echo "$out"
