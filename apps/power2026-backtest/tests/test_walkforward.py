"""Tests for the walk-forward splitter. Pure logic, no network, no key.

The load-bearing property is no-lookahead: no fold's test window may start
before its training window ends. These tests hunt that failure case directly.
"""

import pytest

from power2026_backtest.walkforward import Split, rolling_splits
from power2026_backtest.hypotheses import H1Result


def test_no_lookahead_across_all_folds():
    splits = rolling_splits(start=0, end=100, train_size=30, test_size=10)
    assert splits, "expected at least one fold"
    for s in splits:
        assert s.test_start >= s.train_end          # the core invariant
        assert s.test_end <= 100                     # stays in bounds
        assert s.train_start < s.train_end


def test_non_overlapping_test_windows_by_default():
    splits = rolling_splits(start=0, end=100, train_size=30, test_size=10)
    for a, b in zip(splits, splits[1:]):
        assert b.test_start >= a.test_end


def test_embargo_inserts_gap():
    splits = rolling_splits(start=0, end=100, train_size=30, test_size=10, embargo=5)
    for s in splits:
        assert s.test_start == s.train_end + 5


def test_split_rejects_constructed_lookahead():
    # A fold that peeks (test starts before train ends) must be impossible.
    with pytest.raises(ValueError):
        Split(train_start=0, train_end=30, test_start=25, test_end=35)


def test_bad_params_rejected():
    with pytest.raises(ValueError):
        rolling_splits(0, 100, train_size=0, test_size=10)
    with pytest.raises(ValueError):
        rolling_splits(0, 100, train_size=30, test_size=10, embargo=-1)


def test_h1_acceptance_band():
    assert H1Result("ERCOT", slope=8.0, r_squared=0.9, n=500).passes()
    assert not H1Result("ERCOT", slope=2.0, r_squared=0.9, n=500).passes()
