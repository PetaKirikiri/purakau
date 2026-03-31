#!/usr/bin/env python3
"""Emit JSON lines {"rank": int, "word": str} from an Apple Numbers .numbers file (stdout).

Requires: pip install numbers-parser
(first sheet, first table — rank+word columns or single word column with implicit 1-based row rank)
"""
from __future__ import annotations

import json
import sys

try:
    from numbers_parser import Document
except ImportError:
    print(
        "Missing dependency: pip install numbers-parser",
        file=sys.stderr,
    )
    sys.exit(2)


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: read-numbers-frequency.py <file.numbers>", file=sys.stderr)
        sys.exit(1)
    path = sys.argv[1]
    doc = Document(path)
    if not doc.sheets or not doc.sheets[0].tables:
        sys.exit(0)
    table = doc.sheets[0].tables[0]
    raw_rows = list(table.rows(values_only=True))

    headerish = frozenset(
        {
            "word",
            "lemma",
            "kupu",
            "orth",
            "headword",
            "rank",
            "frequency",
            "#",
            "no",
            "no.",
        }
    )

    data_rows: list[list[object]] = []
    for row in raw_rows:
        cells = [c for c in row if c is not None and str(c).strip() != ""]
        if not cells:
            continue
        if not data_rows:
            h = str(cells[0]).lower().strip()
            if h in headerish or h.startswith("rank"):
                continue
        data_rows.append(cells)

    for i, cells in enumerate(data_rows, start=1):
        rank: int | None = None
        word: str | None = None
        if len(cells) >= 2:
            a, b = cells[0], cells[1]
            try:
                r = int(str(a).replace(",", "").replace("_", "").strip())
                if r >= 1:
                    rank, word = r, str(b).strip()
            except (TypeError, ValueError):
                pass
            if word is None or not str(word):
                try:
                    r = int(str(b).replace(",", "").replace("_", "").strip())
                    if r >= 1:
                        rank, word = r, str(a).strip()
                except (TypeError, ValueError):
                    pass
        if word is None and len(cells) >= 1:
            word = str(cells[0]).strip()
            rank = i
        if rank is not None and word:
            print(json.dumps({"rank": int(rank), "word": word}, ensure_ascii=False))


if __name__ == "__main__":
    main()
