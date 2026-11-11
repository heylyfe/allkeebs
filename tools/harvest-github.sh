#!/bin/sh
# Finds VIA definition files people have published on GitHub for keyboards whose makers only
# share them on their own websites, and downloads them into data/github-via/.
# build-db.mjs checks each file and keeps the first good one for every USB id.
#
# Needs the GitHub CLI signed in (code search requires an account). Search is rate limited to
# about ten queries a minute, so this sleeps between queries.
set -e
out=data/github-via
mkdir -p "$out"
list=$(mktemp)

BRANDS="rainy wobkey aula epomaker monsgeek akko womier weikav lucky65 leobog yunzii ajazz cidoo
skyloong royal_kludge rk61 rk68 rk84 rk100 kiiboom attack_shark lofree feker zifriend varmilo
gamakay madlions mchose vgn irok drunkdeer nuphy keydous melgeek qwertykeys kbdfans tofu
redragon gmmk glorious ducky dareu durgod tecware fantech machenike darmoshark xinmeng zuoya
idobao womier kemove magegee newmen mathew_lab wuque owlab meletrix zoom75 neo65 neo70 qk65 qk75
cyberboard angry_miao keebmonkey lumi kzzi aflion ciy coolkiller gravastar inky75 elecfox"

for b in $BRANDS; do
  q=$(printf '%s' "$b" | tr '_' ' ')
  # Every VIA file has these three words; the brand narrows it down.
  gh api -X GET search/code -f q="vendorId productId keymap $q extension:json" -f per_page=100 \
    --jq '.items[] | [.repository.full_name, (.html_url | capture("/blob/(?<sha>[^/]+)/").sha), .path] | @tsv' \
    >>"$list" 2>/dev/null || echo "search failed for $b"
  sleep 7
done

sort -u "$list" | while IFS="$(printf '\t')" read -r repo sha path; do
  name=$(printf '%s__%s' "$repo" "$path" | tr '/ ' '__')
  [ -f "$out/$name" ] && continue
  enc=$(printf '%s' "$path" | sed 's/ /%20/g')
  curl -sSf "https://raw.githubusercontent.com/$repo/$sha/$enc" -o "$out/$name" 2>/dev/null || rm -f "$out/$name"
done
rm -f "$list"
echo "$(ls "$out" | wc -l) files in $out"
