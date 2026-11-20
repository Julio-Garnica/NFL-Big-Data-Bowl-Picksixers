"""Descarga (una vez) fotos y logos de fuentes publicas de nflverse y los deja en el proyecto.

Uso: .venv\\Scripts\\python.exe -m backend.assets

- backend/derived/headshots.csv : nflId -> URL de la foto oficial (nfl.com), cruzado por nfl_id de nflverse.
- backend/derived/teams.csv     : nombre, apodo, conferencia, division y colores de cada equipo.
- dashboard/public/teams/<ABBR>.png : logos (ESPN) servidos localmente.
La app funciona sin estos archivos (muestra iniciales y abreviaturas).
"""
from __future__ import annotations

import io
import re
import urllib.request
from pathlib import Path

import pandas as pd

from .features import DATA, ROOT

DERIVED = Path(__file__).resolve().parent / "derived"
LOGOS = ROOT / "dashboard" / "public" / "teams"
PLAYERS_URL = "https://github.com/nflverse/nflverse-data/releases/download/players/players.csv"
TEAMS_URL = "https://github.com/nflverse/nflverse-data/releases/download/teams/teams_colors_logos.csv"


def _get(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "picksixers-hackathon"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def main() -> None:
    DERIVED.mkdir(parents=True, exist_ok=True)
    LOGOS.mkdir(parents=True, exist_ok=True)

    ours = pd.read_csv(DATA / "players.csv")[["nflId"]]
    nv = pd.read_csv(io.BytesIO(_get(PLAYERS_URL)), low_memory=False, usecols=["nfl_id", "headshot"])
    nv["nflId"] = pd.to_numeric(nv.nfl_id, errors="coerce")
    nv = nv.dropna(subset=["nflId", "headshot"]).drop_duplicates("nflId")
    nv["headshot"] = nv.headshot.map(lambda u: re.sub(r"/f_auto,q_auto/", "/f_auto,q_auto,w_240/", u))
    hs = ours.merge(nv[["nflId", "headshot"]], on="nflId", how="inner")
    hs["nflId"] = hs.nflId.astype(int)
    hs.to_csv(DERIVED / "headshots.csv", index=False)
    print("fotos:", len(hs), "de", len(ours))

    teams_in_data = set(pd.read_csv(DATA / "games.csv")[["homeTeamAbbr", "visitorTeamAbbr"]].stack())
    t = pd.read_csv(io.BytesIO(_get(TEAMS_URL)))
    t = t[t.team_abbr.isin(teams_in_data)]
    t[["team_abbr", "team_name", "team_nick", "team_conf", "team_division", "team_color", "team_color2"]] \
        .rename(columns={"team_abbr": "abbr", "team_name": "name", "team_nick": "nick", "team_conf": "conf",
                         "team_division": "division", "team_color": "color", "team_color2": "color2"}) \
        .to_csv(DERIVED / "teams.csv", index=False)
    for r in t.itertuples():
        (LOGOS / f"{r.team_abbr}.png").write_bytes(_get(r.team_logo_espn))
    print("equipos:", len(t))


if __name__ == "__main__":
    main()
