"""Convert Permaloc's product decision tree spreadsheet into knowledge/decision-tree.json.

Usage: python3 scripts/build_decision_tree.py [path/to/decision-tree.xlsx]
Re-run after editing the spreadsheet, then commit both files.

Spreadsheet layout: each row is one complete path. Columns A-L hold up to six
Question/Answer pairs, M the final recommendation, N the product URL and
O the explanation of why.
"""
import json
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
SRC = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "knowledge/source/decision-tree.xlsx"
OUT = ROOT / "knowledge/decision-tree.json"


def clean(text):
    """Tidy spreadsheet artifacts: CSV-style doubled quotes, stray quotes, typos."""
    if text is None:
        return None
    s = str(text).replace("\r\n", "\n").strip()
    s = s.replace('""', '"')
    s = re.sub(r'^"(?=[A-Za-z])', "", s)  # stray opening quote
    s = re.sub(r'(?<=[A-Za-z)])"(?=\s*$)', "", s, flags=re.M)  # stray closing quote after a word
    s = s.replace("..", ".")
    s = s.replace("commerical", "commercial")
    s = re.sub(r"\n{3,}", "\n\n", s)
    return s.strip()


def main():
    ws = openpyxl.load_workbook(SRC, data_only=True).active
    reasons, reason_ids = [], {}
    root = {}
    leaves = 0
    for row in ws.iter_rows(min_row=2, values_only=True):
        row = list(row[:15]) + [None] * max(0, 15 - len(row))
        if not any(v not in (None, "") for v in row):
            continue
        node = root
        for c in range(0, 12, 2):
            q, a = clean(row[c]), clean(row[c + 1])
            if not q:
                break
            if "question" in node and node["question"] != q:
                raise SystemExit(f"Conflicting questions at row {row}: {node['question']!r} vs {q!r}")
            node["question"] = q
            node = node.setdefault("options", {}).setdefault(a, {})
        reason = clean(row[14])
        if reason and reason not in reason_ids:
            reason_ids[reason] = len(reasons)
            reasons.append(reason)
        rec = clean(row[12]) or ""
        node["result"] = {
            "recommendation": rec,
            "url": clean(row[13]),
            "reason_id": reason_ids.get(reason),
            "transfer_to_specialist": rec.lower().startswith("transfer to product specialist"),
        }
        leaves += 1
    OUT.write_text(json.dumps({"source": SRC.name, "reasons": reasons, "tree": root}, indent=1, ensure_ascii=False) + "\n")
    print(f"Wrote {OUT.relative_to(ROOT)}: {leaves} paths, {len(reasons)} product descriptions")


if __name__ == "__main__":
    main()
