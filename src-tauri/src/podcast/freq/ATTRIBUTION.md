# Word-frequency tables

The `*.tsv.gz` files in this directory are word-frequency tables derived from
[hermitdave/FrequencyWords](https://github.com/hermitdave/FrequencyWords)
(2018 lists), which are in turn generated from the
[OpenSubtitles](https://www.opensubtitles.org/) corpus
([OPUS OpenSubtitles2018](https://opus.nlpl.eu/OpenSubtitles2018.php)).

The lists are used under the Creative Commons Attribution-ShareAlike license that
applies to the FrequencyWords data. Each file was transformed by `convert.py`:
raw `word count` rows → lowercased `word<TAB>zipf` rows, where
`zipf = log10(count / corpus_total × 10⁹)`, punctuation-only tokens removed,
truncated to the top 50,000 entries.

Why subtitle data: these tables estimate how difficult a *podcast transcript* is,
and film/TV dialogue is the closest large corpus to spoken podcast language.

| file | source list | entries |
|---|---|---|
| en/fr/es/de/ru/tr/fa/ar `.tsv.gz` | `{lang}_50k.txt` | ~50,000 |
| hi.tsv.gz | `hi_full.txt` (no 50k list exists) | ~20,700 |

Chinese (`zh`) is deliberately absent: the analyzer's tokenizer cannot segment
unspaced Chinese text, so shipping a table would produce confident nonsense.
Chinese transcripts report "difficulty unavailable" instead.
