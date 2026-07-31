"""Storage interface. Scoring never touches a concrete store, only this ABC."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Iterator, Optional

from ..types import Outcome, Prediction, ResolvedPrediction


class StorageBackend(ABC):
    """Persistence contract for the prediction/outcome spine.

    Implementations: ``SqliteStore`` (default), a Parquet backend for backtest
    series, or Supabase/Postgres when hosted. Keep scoring decoupled from any of
    them.
    """

    @abstractmethod
    def append_prediction(self, p: Prediction) -> str:
        """Append a prediction; return its id. Append-only, never updated."""

    @abstractmethod
    def attach_outcome(self, o: Outcome) -> None:
        """Attach a realized outcome to an existing prediction."""

    @abstractmethod
    def unresolved(self, task: str, now_ts: int) -> Iterator[Prediction]:
        """Predictions whose horizon has elapsed but have no outcome yet."""

    @abstractmethod
    def resolved(
        self,
        task: str,
        since: Optional[int] = None,
        cohort: Optional[str] = None,
    ) -> Iterator[ResolvedPrediction]:
        """Prediction+outcome joins the scorer consumes."""

    @abstractmethod
    def get_prediction(self, id: str) -> Optional[Prediction]:
        ...
