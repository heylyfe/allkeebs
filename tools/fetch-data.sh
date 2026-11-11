#!/bin/sh
# Downloads the keyboard data the database is built from. Only needed to refresh src/kbdb.json.gz.
set -e
mkdir -p data && cd data
[ -d via ] || git clone --depth 1 https://github.com/the-via/keyboards.git via
[ -d viamia ] || git clone --depth 1 https://github.com/ViaMia/ViaMia-Keyboards.git viamia
if [ ! -d qmk ]; then
  git clone --depth 1 --filter=blob:none --sparse https://github.com/qmk/qmk_firmware.git qmk
  (cd qmk && git sparse-checkout set --no-cone '/keyboards/**/info.json' '/keyboards/**/keyboard.json')
fi
if [ ! -d vial ]; then
  git clone --depth 1 --filter=blob:none --sparse https://github.com/vial-kb/vial-qmk.git vial
  (cd vial && git sparse-checkout set --no-cone '/keyboards/**/vial.json')
fi
echo "Data ready. Now run: npm run build:db && npm run build"
