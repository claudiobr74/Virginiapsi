#!/usr/bin/env python3
"""Convert only the edge-connected off-white matte of the VirgíniaPsi lockup to alpha.

The artwork (symbol, wordmark, colors, dimensions) is not redrawn, recolored,
cropped, resized or sharpened. Interior pixels keep their original RGB.
"""
from __future__ import annotations

import hashlib
import shutil
import sys
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ORIGINAL = ROOT / "public/brand/virginia-psi-mark.png"
ARCHIVE = ROOT / "public/brand/source/virginia-psi-lockup-original.png"
OUTPUT = ROOT / "public/brand/virginia-psi-lockup-transparent.png"
EXPECTED_ORIGINAL_SHA256 = (
    "d23c0e4095b37c4cd7c6cc2695fbc376bd13ace939c7b5e75d651c6dc1575184"
)

# Hard flood-fill: off-white connected to the border.
FILL_TOLERANCE = 22.0
# Fringe desmatte: slightly wider so cream anti-alias does not remain opaque.
FRINGE_TOLERANCE = 42.0


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def dist2(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return float((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2)


def median_rgb(samples: list[tuple[int, int, int]]) -> tuple[int, int, int]:
    n = len(samples)
    rs = sorted(s[0] for s in samples)
    gs = sorted(s[1] for s in samples)
    bs = sorted(s[2] for s in samples)
    mid = n // 2
    return (rs[mid], gs[mid], bs[mid])


def color_to_alpha(
    rgb: tuple[int, int, int], bg: tuple[int, int, int]
) -> tuple[int, int, int, int]:
    """Remove bg contribution from a mixed fringe pixel; keep apparent foreground hue."""
    alpha = 0.0
    for channel, base in zip(rgb, bg):
        if channel == base:
            continue
        if channel > base:
            denom = 255.0 - base
            candidate = (channel - base) / denom if denom else 0.0
        else:
            candidate = (base - channel) / base if base else 0.0
        if candidate > alpha:
            alpha = candidate
    alpha = min(1.0, max(0.0, alpha))
    if alpha < 1.0 / 255.0:
        return (0, 0, 0, 0)
    out: list[int] = []
    for channel, base in zip(rgb, bg):
        fg = (channel - (1.0 - alpha) * base) / alpha
        out.append(int(round(min(255.0, max(0.0, fg)))))
    return (out[0], out[1], out[2], int(round(alpha * 255.0)))


def foreground_bbox(pixels: list[list[tuple[int, int, int, int]]]) -> tuple[int, int, int, int]:
    h = len(pixels)
    w = len(pixels[0])
    min_x, min_y, max_x, max_y = w, h, -1, -1
    for y in range(h):
        row = pixels[y]
        for x in range(w):
            if row[x][3] > 8:
                if x < min_x:
                    min_x = x
                if y < min_y:
                    min_y = y
                if x > max_x:
                    max_x = x
                if y > max_y:
                    max_y = y
    return (min_x, min_y, max_x, max_y)


def process(src: Image.Image) -> tuple[Image.Image, dict[str, object]]:
    rgba = src.convert("RGBA")
    w, h = rgba.size
    src_px = rgba.load()
    rgb_grid = [[src_px[x, y][:3] for x in range(w)] for y in range(h)]

    border: list[tuple[int, int, int]] = []
    for x in range(w):
        border.append(rgb_grid[0][x])
        border.append(rgb_grid[h - 1][x])
    for y in range(h):
        border.append(rgb_grid[y][0])
        border.append(rgb_grid[y][w - 1])
    bg = median_rgb(border)
    fill2 = FILL_TOLERANCE * FILL_TOLERANCE
    fringe2 = FRINGE_TOLERANCE * FRINGE_TOLERANCE

    background = [[False] * w for _ in range(h)]
    queue: deque[tuple[int, int]] = deque()

    def try_seed(x: int, y: int) -> None:
        if dist2(rgb_grid[y][x], bg) <= fill2 and not background[y][x]:
            background[y][x] = True
            queue.append((x, y))

    for x in range(w):
        try_seed(x, 0)
        try_seed(x, h - 1)
    for y in range(h):
        try_seed(0, y)
        try_seed(w - 1, y)

    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if nx < 0 or ny < 0 or nx >= w or ny >= h:
                continue
            if background[ny][nx]:
                continue
            if dist2(rgb_grid[ny][nx], bg) <= fill2:
                background[ny][nx] = True
                queue.append((nx, ny))

    out_grid: list[list[tuple[int, int, int, int]]] = [
        [(0, 0, 0, 0) for _ in range(w)] for _ in range(h)
    ]
    neighbors = (
        (-1, 0),
        (1, 0),
        (0, -1),
        (0, 1),
        (-1, -1),
        (1, -1),
        (-1, 1),
        (1, 1),
    )
    fringe_count = 0
    opaque_count = 0
    transparent_count = 0
    recolored = 0

    for y in range(h):
        for x in range(w):
            rgb = rgb_grid[y][x]
            if background[y][x]:
                out_grid[y][x] = (0, 0, 0, 0)
                transparent_count += 1
                continue
            adjacent_bg = False
            for dx, dy in neighbors:
                nx, ny = x + dx, y + dy
                if 0 <= nx < w and 0 <= ny < h and background[ny][nx]:
                    adjacent_bg = True
                    break
            if adjacent_bg and dist2(rgb, bg) <= fringe2:
                converted = color_to_alpha(rgb, bg)
                out_grid[y][x] = converted
                fringe_count += 1
                if converted[3] == 0:
                    transparent_count += 1
                else:
                    opaque_count += 1
                    if converted[:3] != rgb:
                        recolored += 1
            else:
                out_grid[y][x] = (rgb[0], rgb[1], rgb[2], 255)
                opaque_count += 1

    out = Image.new("RGBA", (w, h))
    out_px = out.load()
    for y in range(h):
        for x in range(w):
            out_px[x, y] = out_grid[y][x]

    # Original foreground bbox (pixels far from the matte, before alpha).
    orig_xs: list[int] = []
    orig_ys: list[int] = []
    solid2 = 40.0 * 40.0
    for y in range(h):
        for x in range(w):
            if dist2(rgb_grid[y][x], bg) > solid2:
                orig_xs.append(x)
                orig_ys.append(y)
    orig_bbox = (
        min(orig_xs),
        min(orig_ys),
        max(orig_xs),
        max(orig_ys),
    )
    new_bbox = foreground_bbox(out_grid)

    edge_alpha_nonzero = 0
    for x in range(w):
        if out_grid[0][x][3] != 0:
            edge_alpha_nonzero += 1
        if out_grid[h - 1][x][3] != 0:
            edge_alpha_nonzero += 1
    for y in range(h):
        if out_grid[y][0][3] != 0:
            edge_alpha_nonzero += 1
        if out_grid[y][w - 1][3] != 0:
            edge_alpha_nonzero += 1

    stats = {
        "size": (w, h),
        "bg": bg,
        "transparent_count": transparent_count,
        "opaque_count": opaque_count,
        "fringe_count": fringe_count,
        "fringe_recolored": recolored,
        "orig_bbox": orig_bbox,
        "new_bbox": new_bbox,
        "edge_alpha_nonzero": edge_alpha_nonzero,
    }
    return out, stats


def archive_original() -> None:
    ARCHIVE.parent.mkdir(parents=True, exist_ok=True)
    original_hash = sha256(ORIGINAL)
    if original_hash != EXPECTED_ORIGINAL_SHA256:
        raise SystemExit(
            f"original lockup hash mismatch: {original_hash}"
        )
    shutil.copyfile(ORIGINAL, ARCHIVE)
    archived_hash = sha256(ARCHIVE)
    if archived_hash != original_hash:
        raise SystemExit("archived lockup is not byte-identical to the original")


def main() -> int:
    archive_original()
    src = Image.open(ORIGINAL)
    out, stats = process(src)
    if stats["size"] != src.size:
        raise SystemExit("output dimensions changed")
    orig_bbox = stats["orig_bbox"]
    new_bbox = stats["new_bbox"]
    # Allow 2px slack for anti-aliased fringe becoming fully transparent.
    for a, b in zip(orig_bbox, new_bbox):
        if abs(int(a) - int(b)) > 2:
            raise SystemExit(f"foreground bbox drifted: {orig_bbox} -> {new_bbox}")
    if int(stats["edge_alpha_nonzero"]) != 0:
        raise SystemExit(
            f"border still opaque: {stats['edge_alpha_nonzero']} pixels"
        )
    out.save(OUTPUT, format="PNG", optimize=True)
    print("archive", ARCHIVE.relative_to(ROOT), sha256(ARCHIVE))
    print("output", OUTPUT.relative_to(ROOT), sha256(OUTPUT))
    print("stats", stats)
    return 0


if __name__ == "__main__":
    sys.exit(main())
