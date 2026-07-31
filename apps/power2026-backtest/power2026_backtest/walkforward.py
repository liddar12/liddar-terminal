"""Walk-forward split generation.

Pure logic, no I/O. This is implemented in full at Gate 2 (not deferred) because
it is the mechanism that enforces the core guardrail: no training window may
overlap the test window it is evaluated on (no lookahead, Section 6 of the
brief). Indices are integer time units (day indices or unix-second boundaries,
caller's choice); the splitter is agnostic to what the unit means.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Split:
    """A single walk-forward fold. All bounds are [start, end) half-open."""

    train_start: int
    train_end: int   # exclusive; fit uses [train_start, train_end)
    test_start: int  # predict over [test_start, test_end)
    test_end: int    # exclusive

    def __post_init__(self) -> None:
        # The invariant, asserted by construction: the test window never starts
        # before the training window ends. If this ever fails, a fold would be
        # peeking at its own answer.
        if self.test_start < self.train_end:
            raise ValueError(
                f"lookahead: test_start={self.test_start} < train_end={self.train_end}"
            )
        if self.train_start >= self.train_end:
            raise ValueError("empty or inverted training window")
        if self.test_start >= self.test_end:
            raise ValueError("empty or inverted test window")


def rolling_splits(
    start: int,
    end: int,
    train_size: int,
    test_size: int,
    step: Optional[int] = None,
    embargo: int = 0,
) -> list[Split]:
    """Rolling walk-forward folds over [start, end).

    train_size / test_size / step / embargo are in the same integer unit as
    start/end. ``step`` defaults to ``test_size`` (non-overlapping test windows).
    ``embargo`` inserts a gap between train_end and test_start (e.g. to avoid a
    prediction horizon leaking across the boundary).
    """
    if train_size <= 0 or test_size <= 0:
        raise ValueError("train_size and test_size must be positive")
    if embargo < 0:
        raise ValueError("embargo must be non-negative")
    step = test_size if step is None else step
    if step <= 0:
        raise ValueError("step must be positive")

    splits: list[Split] = []
    s = start
    while True:
        train_start = s
        train_end = s + train_size
        test_start = train_end + embargo
        test_end = test_start + test_size
        if test_end > end:
            break
        splits.append(Split(train_start, train_end, test_start, test_end))
        s += step
    return splits
