# -*- coding: utf-8 -*-
"""Chọn file markdown chính trong thư mục văn bản."""
import re
from pathlib import Path


def _score_md(path: Path, text: str) -> tuple:
    name = path.name.lower()
    if "_ocred" in name or "ocred" in name:
        return (-10**9, 0, 0, 0)
    penalty = 0
    if name.startswith("~") or name.endswith(".tmp.md"):
        penalty += 50
    if len(text.strip()) < 200:
        penalty += 80
    head = text.strip()[:80]
    if head.startswith("'Untitled'") or head.startswith("Untitled"):
        return (-10**9, 0, 0, 0)
    dieu = len(re.findall(r"(?m)^(?:#+\s*)?Điều\s+\d+", text, re.I))
    viet = len(re.findall(
        r"[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổộơờớởỡùúủũụưừứửữựỳýỷỹỵđ]",
        text,
    ))
    bad = 0
    for pat in (r"CHiNH", r"Nghi dinh", r"Ã¿Ã¾", r"DOC lip", r"^'Untitled'", r"QUC HQI", r"NGHI DINH"):
        if re.search(pat, text, re.I | re.M):
            bad += 1
    if bad >= 2 or (bad >= 1 and dieu < 5):
        return (-10**9, dieu, viet, 0)
    return (penalty - dieu * 10 - viet // 30, dieu, viet, 0)


def pick_primary_md(doc_dir: Path) -> Path | None:
    mds = sorted(doc_dir.glob("*.md"))
    if not mds:
        return None
    if len(mds) == 1:
        return mds[0]
    best = None
    best_key = None
    for p in mds:
        try:
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        key = _score_md(p, text)
        if best is None or key > best_key:
            best, best_key = p, key
    return best or mds[0]
