// usage: node tools/db-query.mjs src/kbdb.json.gz "keychron q1" "gmmk"
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
const db = JSON.parse(gunzipSync(readFileSync(process.argv[2])).toString());
for (const q of process.argv.slice(3)) {
  const re = new RegExp(q, "i");
  const hits = db.boards.filter((b) => re.test(b[1]));
  console.log(
    q,
    hits.length,
    hits
      .slice(0, 4)
      .map(
        (b) =>
          `${(b[0] >>> 16).toString(16)}:${(b[0] & 0xffff).toString(16)} ${b[1]} keys=${db.layouts[b[3]].length} flags=${b[4]} labels=${db.layouts[b[3]].some((k) => typeof k[6] === "string")}`,
      )
      .join(" | "),
  );
}
