"""Builds the small word-vector table the lighting search uses to match by meaning.

It keeps the most common English words from GloVe (Stanford NLP, Wikipedia + Gigaword, 50
dimensions), plus every word in the preset descriptions and some likely search words, squeezes
them to 32 dimensions and stores each as 32 signed bytes.

usage: python3 tools/build-vectors.py data/glove/glove50.gz <words used by presets> src/
"""

import gzip
import re
import sys

import numpy as np

glove_path, corpus_path, out_dir = sys.argv[1:4]
COMMON = 10000
DIMS = 32

# Words people type when looking for a mood that may not be among the most common ones.
EXTRA = """spooky halloween christmas xmas festive cosy cozy chill chilled vibe vibes aesthetic gamer
gaming rgb neon cyberpunk synthwave vaporwave retro kawaii cute pastel moody dreamy relaxing
calming soothing sleepy hypnotic trippy psychedelic rave disco party club techno edm lofi focus
study work office minimal subtle stealth dark bright vivid loud flashy funky groovy ocean sea beach
forest jungle desert snow winter summer spring autumn fall sunset sunrise dawn dusk twilight
midnight galaxy space nebula cosmic stars alien hacker matrix sakura cherry blossom candy
sweet unicorn rainbow pride lava volcano fire ice frost storm thunder lightning rain""".split()

words, vecs = [], []
needed = set(open(corpus_path).read().lower().split()) | set(EXTRA)
with gzip.open(glove_path, "rt", encoding="utf8") as f:
    next(f)  # header: count and dimensions
    for rank, line in enumerate(f):
        word, *values = line.rstrip().split(" ")
        if not re.fullmatch(r"[a-z]+(-[a-z]+)?", word):
            continue
        if rank < COMMON * 2 and len(words) < COMMON or word in needed:
            words.append(word)
            vecs.append(np.array(values, dtype=np.float32))
            needed.discard(word)

m = np.stack(vecs)
m -= m.mean(axis=0)
# Principal components keep most of the meaning in fewer numbers.
_, _, vt = np.linalg.svd(m, full_matrices=False)
reduced = m @ vt[:DIMS].T
reduced /= np.linalg.norm(reduced, axis=1, keepdims=True) + 1e-9
packed = np.clip(np.round(reduced * 127), -127, 127).astype(np.int8)

open(f"{out_dir}/search-words.txt", "w").write("\n".join(words))
packed.tofile(f"{out_dir}/search-vectors.bin")
print(f"{len(words)} words x {DIMS} dims, {packed.nbytes // 1024} KB; not in GloVe: {sorted(needed)[:20]}")
