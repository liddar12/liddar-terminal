"""Model registry: versioned configs with their live scores. Promotion and
autonomy-level increases are manual gates (the loop proposes, Jimmy approves).

Bodies unlocked at Gate 3. Signatures fixed now.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional

from ..types import Score


class Registry(ABC):
    @abstractmethod
    def register(self, task: str, config: dict[str, Any]) -> str:
        """Register a candidate config; return its version id."""

    @abstractmethod
    def get(self, version: str) -> Optional[dict[str, Any]]:
        ...

    @abstractmethod
    def live_scores(self, task: str) -> list[Score]:
        """Current live scores per registered config for a task."""

    @abstractmethod
    def promote(self, version: str) -> None:
        """Manual gate: mark a candidate live."""

    @abstractmethod
    def rollback(self, task: str) -> None:
        """Manual gate: revert to the previous live config."""
