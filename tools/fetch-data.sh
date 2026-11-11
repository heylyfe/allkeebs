#!/bin/sh
# Downloads everything the keyboard database is built from into data/.
# Only needed to refresh src/kbdb.json.gz. Then run: npm run build:db && npm run build
set -e
mkdir -p data/ids && cd data

# Only the keyboard definition files of a firmware tree, not the whole repository.
sparse() { # <folder> <repo> [branch] [patterns...]
  dir=$1 repo=$2 branch=$3
  shift 3
  [ -d "$dir" ] && return
  git clone -q --depth 1 ${branch:+-b "$branch"} --filter=blob:none --sparse "https://github.com/$repo.git" "$dir"
  (cd "$dir" && git sparse-checkout set --no-cone "$@")
}
qmk_tree() { sparse "$1" "$2" "$3" '/keyboards/**/info.json' '/keyboards/**/keyboard.json' '/keyboards/**/*.json'; }

# Layouts: VIA, Vial, QMK and makers' own QMK forks
[ -d via ] || git clone -q --depth 1 https://github.com/the-via/keyboards.git via
[ -d viamia ] || git clone -q --depth 1 https://github.com/ViaMia/ViaMia-Keyboards.git viamia
sparse qmk qmk/qmk_firmware "" '/keyboards/**/info.json' '/keyboards/**/keyboard.json'
sparse vial vial-kb/vial-qmk "" '/keyboards/**/vial.json'
qmk_tree keychron Keychron/qmk_firmware 2025q3
qmk_tree nuphy nuphy-src/qmk_firmware nuphy-keyboards
qmk_tree sonix SonixQMK/qmk_firmware ""
qmk_tree epomaker Epomaker/qmk_firmware ""
qmk_tree monsgeek MonsGeek/qmk_firmware ""
qmk_tree cipulot Cipulot/qmk_firmware ""
qmk_tree zsa zsa/qmk_firmware ""

# Names for keyboards without a layout file
raw=https://raw.githubusercontent.com
[ -f ids/usb.ids ] || curl -sSfo ids/usb.ids $raw/systemd/systemd/main/hwdb.d/usb.ids
[ -f ids/hid-ids.h ] || curl -sSfo ids/hid-ids.h $raw/torvalds/linux/master/drivers/hid/hid-ids.h
[ -f ids/ckb-usb.h ] || curl -sSfo ids/ckb-usb.h $raw/ckb-next/ckb-next/master/src/daemon/usb.h
[ -d sinowealth ] || git clone -q --depth 1 https://github.com/carlossless/sinowealth-kb-tool.git sinowealth
[ -d openrazer ] || git clone -q --depth 1 https://github.com/openrazer/openrazer.git openrazer
sparse openrgb CalcProgrammer1/OpenRGB "" '/Controllers/**'

echo "Data ready. Now run: npm run build:db && npm run build"
