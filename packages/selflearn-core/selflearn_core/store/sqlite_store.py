"""SQLite implementation of StorageBackend.

Gate 1 implements ``init_schema`` (the schema is a Gate 1 deliverable and is
cheap to verify). The read/write data methods are unlocked at Gate 2, when the
first signal flows; they raise ``NotImplementedError`` naming that gate rather
than pretending to work.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Iterator, Optional

from ..types import Outcome, Prediction, ResolvedPrediction
from .base import StorageBackend

_SCHEMA_PATH = Path(__file__).with_name("schema.sql")


class SqliteStore(StorageBackend):
    def __init__(self, path: str = "data/selflearn.sqlite") -> None:
        self.path = path

    def init_schema(self) -> None:
        """Create tables if absent. Idempotent."""
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        ddl = _SCHEMA_PATH.read_text()
        with sqlite3.connect(self.path) as conn:
            conn.executescript(ddl)

    # --- data methods: Gate 2 ------------------------------------------------

    def append_prediction(self, p: Prediction) -> str:
        raise NotImplementedError("Gate 2: implement when the first signal flows.")

    def attach_outcome(self, o: Outcome) -> None:
        raise NotImplementedError("Gate 2: implement with the outcome resolver.")

    def unresolved(self, task: str, now_ts: int) -> Iterator[Prediction]:
        raise NotImplementedError("Gate 2: implement with the outcome resolver.")

    def resolved(
        self,
        task: str,
        since: Optional[int] = None,
        cohort: Optional[str] = None,
    ) -> Iterator[ResolvedPrediction]:
        raise NotImplementedError("Gate 3: implement with the scorer.")

    def get_prediction(self, id: str) -> Optional[Prediction]:
        raise NotImplementedError("Gate 2: implement when the first signal flows.")
