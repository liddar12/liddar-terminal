"""SQLite implementation of StorageBackend.

Implements the append-only prediction log, outcome attachment, and the resolved/
unresolved queries the scorer and resolver need. Values that are structured
(features, prediction, realized, meta) are stored as JSON text.
"""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path
from typing import Iterator, Optional

from ..types import Outcome, Prediction, ResolvedPrediction
from .base import StorageBackend

_SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def _row_to_prediction(r: sqlite3.Row) -> Prediction:
    return Prediction(
        id=r["id"],
        ts=r["ts"],
        model_version=r["model_version"],
        task=r["task"],
        features=json.loads(r["features"]),
        prediction=json.loads(r["prediction"]),
        horizon_s=r["horizon_s"],
        confidence=r["confidence"],
        cohort=r["cohort"],
        meta=json.loads(r["meta"]) if r["meta"] else {},
    )


class SqliteStore(StorageBackend):
    def __init__(self, path: str = "data/selflearn.sqlite") -> None:
        self.path = path

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        return conn

    def init_schema(self) -> None:
        """Create tables if absent. Idempotent."""
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(_SCHEMA_PATH.read_text())

    def append_prediction(self, p: Prediction) -> str:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO predictions "
                "(id, ts, model_version, task, features, prediction, confidence, "
                "horizon_s, cohort, meta) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    p.id, p.ts, p.model_version, p.task,
                    json.dumps(p.features), json.dumps(p.prediction),
                    p.confidence, p.horizon_s, p.cohort, json.dumps(p.meta),
                ),
            )
        return p.id

    def attach_outcome(self, o: Outcome) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO outcomes "
                "(prediction_id, resolved_ts, realized, meta) VALUES (?,?,?,?)",
                (o.prediction_id, o.resolved_ts, json.dumps(o.realized), json.dumps(o.meta)),
            )

    def unresolved(self, task: str, now_ts: int) -> Iterator[Prediction]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT p.* FROM predictions p "
                "LEFT JOIN outcomes o ON p.id = o.prediction_id "
                "WHERE p.task = ? AND o.prediction_id IS NULL "
                "AND (p.ts + p.horizon_s) <= ? ORDER BY p.ts",
                (task, now_ts),
            ).fetchall()
        return iter([_row_to_prediction(r) for r in rows])

    def resolved(
        self,
        task: str,
        since: Optional[int] = None,
        cohort: Optional[str] = None,
    ) -> Iterator[ResolvedPrediction]:
        q = (
            "SELECT p.*, o.resolved_ts AS o_ts, o.realized AS o_realized, "
            "o.meta AS o_meta FROM predictions p "
            "JOIN outcomes o ON p.id = o.prediction_id WHERE p.task = ?"
        )
        params: list = [task]
        if since is not None:
            q += " AND o.resolved_ts >= ?"
            params.append(since)
        if cohort is not None:
            q += " AND p.cohort = ?"
            params.append(cohort)
        q += " ORDER BY o.resolved_ts"
        with self._connect() as conn:
            rows = conn.execute(q, params).fetchall()
        out = []
        for r in rows:
            outcome = Outcome(
                prediction_id=r["id"],
                resolved_ts=r["o_ts"],
                realized=json.loads(r["o_realized"]),
                meta=json.loads(r["o_meta"]) if r["o_meta"] else {},
            )
            out.append(ResolvedPrediction(_row_to_prediction(r), outcome))
        return iter(out)

    def get_prediction(self, id: str) -> Optional[Prediction]:
        with self._connect() as conn:
            row = conn.execute("SELECT * FROM predictions WHERE id = ?", (id,)).fetchone()
        return _row_to_prediction(row) if row else None
