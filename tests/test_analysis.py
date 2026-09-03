import numpy as np

from agentic_earth.analysis import change_statistics


def test_change_statistics_filter_is_deterministic():
    before = np.zeros((3, 8, 8), dtype=np.float32)
    after = before.copy()
    after[:, 2:5, 3:6] = 0.8
    after[:, 0, 0] = 1
    result = change_statistics(before, after, threshold=0.2, minimum_pixels=4)
    assert result["changed_pixels"] == 9
    assert result["total_pixels"] == 64
    assert len(result["mask"]) == 8
