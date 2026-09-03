from collections import deque

import numpy as np


def normalized_change(before, after):
    before = np.asarray(before, dtype=np.float32)
    after = np.asarray(after, dtype=np.float32)
    if before.shape != after.shape or before.ndim not in (2, 3):
        raise ValueError("before and after must be equal-shape 2D or band-first 3D arrays")
    if not np.isfinite(before).all() or not np.isfinite(after).all():
        raise ValueError("arrays must contain finite values")
    difference = np.abs(after - before)
    return difference.mean(axis=0) if difference.ndim == 3 else difference


def filter_components(mask, minimum_pixels=1):
    mask = np.asarray(mask, dtype=bool)
    if mask.ndim != 2:
        raise ValueError("mask must be 2D")
    output = np.zeros(mask.shape, dtype=np.uint8)
    visited = np.zeros(mask.shape, dtype=bool)
    height, width = mask.shape
    for y in range(height):
        for x in range(width):
            if visited[y, x] or not mask[y, x]:
                continue
            queue = deque([(y, x)])
            visited[y, x] = True
            component = []
            while queue:
                row, col = queue.popleft()
                component.append((row, col))
                for nr, nc in ((row - 1, col), (row + 1, col), (row, col - 1), (row, col + 1)):
                    if 0 <= nr < height and 0 <= nc < width and mask[nr, nc] and not visited[nr, nc]:
                        visited[nr, nc] = True
                        queue.append((nr, nc))
            if len(component) >= minimum_pixels:
                for row, col in component:
                    output[row, col] = 1
    return output


def change_statistics(before, after, threshold=0.2, minimum_pixels=1):
    score = normalized_change(before, after)
    mask = filter_components(score >= threshold, minimum_pixels)
    return {
        "changed_pixels": int(mask.sum()),
        "total_pixels": int(mask.size),
        "changed_fraction": float(mask.mean()),
        "mean_change_score": float(score.mean()),
        "mask": mask.tolist(),
    }
