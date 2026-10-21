"""FrequencyWords 'word count' lists -> compact 'word\tzipf' tables for embedding.

zipf = log10(freq per billion tokens). Total tokens is approximated by the sum of
the list's own counts — the head of a subtitle corpus carries >95% of tokens, so
the error is < 0.05 zipf, far under the 1.0-wide CEFR buckets.
"""
import glob, gzip, math, os, re, sys

def is_word(tok: str) -> bool:
    # At least one letter in any script; kills "،", "-", "1234", "..." rows.
    return any(ch.isalpha() for ch in tok)

os.makedirs("out", exist_ok=True)
for path in sorted(glob.glob("*_50k.txt")) + ["hi_full.txt"]:
    lang = os.path.basename(path).split("_")[0]
    rows = []
    for line in open(path, encoding="utf-8"):
        parts = line.rstrip("\n").split(" ")
        if len(parts) != 2:
            continue
        w, c = parts[0], parts[1]
        if not c.isdigit() or not is_word(w):
            continue
        rows.append((w.lower(), int(c)))
    total = sum(c for _, c in rows)
    rows = rows[:50000]
    out = []
    for w, c in rows:
        zipf = math.log10(c / total * 1e9)
        out.append(f"{w}\t{zipf:.1f}")
    data = ("\n".join(out) + "\n").encode("utf-8")
    with gzip.open(f"out/{lang}.tsv.gz", "wb", compresslevel=9) as f:
        f.write(data)
    print(f"  {lang}: {len(rows)} words, raw {len(data)//1024}K, gz {os.path.getsize(f'out/{lang}.tsv.gz')//1024}K, "
          f"zipf range {out[0].split(chr(9))[1]}..{out[-1].split(chr(9))[1]}")
