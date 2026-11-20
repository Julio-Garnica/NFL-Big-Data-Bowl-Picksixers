"""API del asistente de decisiones para el head coach.

Ejecuta: .venv\\Scripts\\python.exe -m uvicorn backend.main:app --reload
"""
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles

from .model import Engine, Scenario

app = FastAPI(title="PickSixers - Decisiones bajo presión")
_engine: Engine | None = None


def engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = Engine()
    return _engine


@app.on_event("startup")
def _warm() -> None:
    engine()


def _need(x, msg="No encontrado"):
    if x is None:
        raise HTTPException(404, msg)
    return x


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/api/meta")
def meta() -> dict:
    return engine().meta()


# ---------------------------------------------------------------- revision de jugadas
@app.get("/api/games")
def games() -> list:
    return engine().games()


@app.get("/api/games/{game_id}/plays")
def plays(game_id: int) -> list:
    return engine().plays(game_id)


@app.get("/api/review/{game_id}/{play_id}")
def review(game_id: int, play_id: int) -> dict:
    return _need(engine().play_review(game_id, play_id), "Jugada no encontrada")


@app.get("/api/tracking/{game_id}/{play_id}")
def tracking(game_id: int, play_id: int) -> dict:
    return _need(engine().tracking(game_id, play_id), "Tracking no encontrado")


@app.get("/api/review-random")
def review_random(verdict: str | None = Query(None, pattern="^(exitosa|coincide|mejor|incierto|no_mejor)$"),
                  pressure: int | None = Query(None, ge=0, le=1), team: str | None = Query(None, max_length=3),
                  seed: int = 0) -> dict:
    return engine().random_play(verdict, pressure, team, seed)


# ---------------------------------------------------------------- simulador
@app.get("/api/scenario")
def scenario(
    down: int = Query(1, ge=1, le=4), ytg: int = Query(10, ge=1, le=40), yardsToEndzone: int = Query(60, ge=1, le=99),
    rushers: int = Query(4, ge=2, le=8), blockers: int = Query(5, ge=5, le=9),
    coverageType: str = Query("Zone", pattern="^(Man|Zone|Other)$"), formation: str = Query("SHOTGUN", max_length=12),
    playAction: bool = False, rollout: bool = False,
    offTeam: str | None = Query(None, max_length=3), defTeam: str | None = Query(None, max_length=3),
    qbId: int | None = None,
) -> dict:
    return engine().simulate(Scenario(down, ytg, yardsToEndzone, rushers, blockers, coverageType, formation,
                                      playAction, rollout, offTeam, defTeam, qbId))


# ---------------------------------------------------------------- equipos, defensivos, QBs, jugadores
@app.get("/api/teams")
def teams() -> list:
    return engine().team_cards()


@app.get("/api/defense/{team}")
def defense(team: str) -> dict:
    return _need(engine().defense_profile(team.upper()), "Equipo no encontrado")


@app.get("/api/defense/{team}/players")
def defense_players(team: str) -> list:
    return engine().defenders(team.upper())


@app.get("/api/offense-teams")
def offense_teams() -> list:
    return engine().offense_cards()


@app.get("/api/offense/{team}")
def offense(team: str) -> dict:
    return _need(engine().offense_profile(team.upper()), "Equipo no encontrado")


@app.get("/api/defender/{pid}")
def defender(pid: int) -> dict:
    return _need(engine().defender_profile(pid), "Jugador defensivo no encontrado")


@app.get("/api/qbs")
def qbs() -> list:
    return engine().qb_cards()


@app.get("/api/qb/{qb_id}")
def qb(qb_id: int) -> dict:
    return _need(engine().qb_profile(qb_id), "QB no encontrado")


@app.get("/api/players")
def players() -> list:
    return engine().players_table()


# El mismo servidor entrega el build del dashboard en la misma URL (va al final para no tapar la API).
_dist = Path(__file__).resolve().parent.parent / "dashboard" / "dist"
if _dist.exists():
    app.mount("/", StaticFiles(directory=_dist, html=True), name="dashboard")
