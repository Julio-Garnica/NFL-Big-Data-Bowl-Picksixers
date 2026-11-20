"""Construye la tabla de dropbacks (una fila por jugada de pase) a partir de data/.

Uso (genera un resumen precalculado de solo lectura, para que el servidor arranque rapido):
    .venv\\Scripts\\python.exe -m backend.features
Si el archivo precalculado no existe, `load_features()` lo calcula al vuelo (tarda ~1 min por el tracking).
"""
from __future__ import annotations

import re
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
DERIVED = Path(__file__).resolve().parent / "derived" / "dropbacks.csv.gz"

DL_POS = {"DRT", "DLT", "LEO", "REO", "LE", "RE", "NT", "NRT", "NLT", "DE", "DT"}
LB_POS = {"ROLB", "LOLB", "RILB", "LILB", "LLB", "RLB", "MLB", "OLB", "ILB"}
SNAP_EVENTS = {"ball_snap", "autoevent_ballsnap"}
END_EVENTS = {"pass_forward", "autoevent_passforward", "qb_sack", "qb_strip_sack", "run", "fumble"}


def _norm(s: str) -> str:
    return re.sub(r"[^a-z]", "", s.lower())


# ---------------------------------------------------------------- jugadas + PFF
def _play_table() -> pd.DataFrame:
    plays = pd.read_csv(DATA / "plays.csv", na_values=["NA"])
    games = pd.read_csv(DATA / "games.csv")
    plays = plays.merge(games[["gameId", "week", "homeTeamAbbr", "visitorTeamAbbr"]], on="gameId", how="left")
    plays = plays[plays.dropBackType.isin(["TRADITIONAL", "SCRAMBLE", "DESIGNED_ROLLOUT_RIGHT",
                                           "DESIGNED_ROLLOUT_LEFT", "SCRAMBLE_ROLLOUT_RIGHT",
                                           "SCRAMBLE_ROLLOUT_LEFT"])].copy()
    plays = plays[plays.passResult.isin(["C", "I", "S", "R", "IN"])]

    home = plays.possessionTeam == plays.homeTeamAbbr
    plays["scoreDiff"] = np.where(home, plays.preSnapHomeScore - plays.preSnapVisitorScore,
                                  plays.preSnapVisitorScore - plays.preSnapHomeScore)
    own_side = plays.yardlineSide == plays.possessionTeam
    plays["yardsToEndzone"] = np.where(own_side, 100 - plays.yardlineNumber, plays.yardlineNumber)

    # Accion que tomo el QB, leida de la descripcion + passResult.
    d = plays.playDescription.fillna("")
    depth = np.where(d.str.contains(r"\bdeep\b", case=False), "deep",
                     np.where(d.str.contains(r"\bshort\b", case=False), "short", "unknown"))
    action = np.select(
        [plays.passResult == "S", plays.passResult == "R", d.str.contains("thrown away", case=False)],
        ["sack", "scramble", "throwaway"], default="pass")
    plays["action"] = np.where(action == "pass", np.where(depth == "unknown", "pass_unknown", depth), action)
    plays["isInt"] = (plays.passResult == "IN").astype(int)
    plays["isComplete"] = (plays.passResult == "C").astype(int)
    plays["direction"] = np.select([d.str.contains(r"\bleft\b", case=False), d.str.contains(r"\bright\b", case=False),
                                    d.str.contains(r"\bmiddle\b", case=False)], ["left", "right", "middle"], "unknown")
    plays["targetKey"] = d.str.extract(r"(?:\bto|intended for) ([A-Z]\.[A-Z][A-Za-z'\-]*)")[0]
    plays["yards"] = plays.prePenaltyPlayResult.fillna(plays.playResult)
    plays["hasPenalty"] = plays.foulName1.notna().astype(int)

    # Personal defensivo "4 DL, 2 LB, 5 DB"
    for pos in ("DL", "LB", "DB"):
        plays[f"n{pos}"] = plays.personnelD.fillna("").str.extract(rf"(\d+) {pos}")[0].astype(float)
    plays["nRB"] = plays.personnelO.fillna("").str.extract(r"(\d+) RB")[0].astype(float).fillna(0)
    plays["nTE"] = plays.personnelO.fillna("").str.extract(r"(\d+) TE")[0].astype(float).fillna(0)
    plays["nWR"] = plays.personnelO.fillna("").str.extract(r"(\d+) WR")[0].astype(float).fillna(0)
    return plays


def _scouting_features(plays: pd.DataFrame) -> pd.DataFrame:
    s = pd.read_csv(DATA / "pffScoutingData.csv", na_values=["NA"])
    players = pd.read_csv(DATA / "players.csv")
    key = ["gameId", "playId"]

    qb = s[s.pff_role == "Pass"][key + ["nflId"]].drop_duplicates(key).rename(columns={"nflId": "qbId"})

    rush = s[s.pff_role == "Pass Rush"].copy()
    for c in ("pff_hit", "pff_hurry", "pff_sack"):
        rush[c] = rush[c].fillna(0)
    rush["grp"] = np.where(rush.pff_positionLinedUp.isin(DL_POS), "DL",
                           np.where(rush.pff_positionLinedUp.isin(LB_POS), "LB", "DB"))
    agg = rush.groupby(key).agg(nRush=("nflId", "size"), hurries=("pff_hurry", "sum"),
                                hits=("pff_hit", "sum"), sacksPff=("pff_sack", "sum")).reset_index()
    grp = rush.pivot_table(index=key, columns="grp", values="nflId", aggfunc="size", fill_value=0)
    grp = grp.reindex(columns=["DL", "LB", "DB"], fill_value=0).add_prefix("rush").reset_index()

    block = s[s.pff_role == "Pass Block"].copy()
    for c in ("pff_beatenByDefender", "pff_hitAllowed", "pff_hurryAllowed", "pff_sackAllowed"):
        block[c] = block[c].fillna(0)
    bagg = block.groupby(key).agg(nBlock=("nflId", "size"), beaten=("pff_beatenByDefender", "sum")).reset_index()

    # Posicion del receptor objetivo: se cruza el nombre de la descripcion con los que corrieron ruta.
    routes = s[s.pff_role == "Pass Route"][key + ["nflId"]].merge(
        players[["nflId", "displayName", "officialPosition"]], on="nflId", how="left")
    parts = routes.displayName.fillna("").str.split(" ", n=1, expand=True)
    routes["pk"] = (parts[0].str[:1] + (parts[1] if parts.shape[1] > 1 else "")).map(_norm)
    tk = plays[key + ["targetKey"]].dropna()
    tk = tk.assign(tk=tk.targetKey.map(_norm)).merge(routes, on=key, how="left")
    tk = tk[[p.startswith(t) if isinstance(p, str) and isinstance(t, str) else False
             for p, t in zip(tk.pk, tk.tk)]]
    tk["targetPos"] = tk.officialPosition.replace({"FB": "RB", "HB": "RB"})
    tk = tk.drop_duplicates(key)[key + ["targetPos"]]

    out = plays.merge(qb, on=key, how="left").merge(agg, on=key, how="left").merge(grp, on=key, how="left") \
        .merge(bagg, on=key, how="left").merge(tk, on=key, how="left")
    out = out.merge(players[["nflId", "displayName"]].rename(columns={"nflId": "qbId", "displayName": "qbName"}),
                    on="qbId", how="left")
    out["pressure"] = ((out.hurries.fillna(0) + out.hits.fillna(0) + out.sacksPff.fillna(0)) > 0).astype(int)
    return out


# ---------------------------------------------------------------- tracking
def _tracking_features(df: pd.DataFrame) -> pd.DataFrame:
    """Tiempo hasta el lanzamiento, movimiento del QB y cercania del rusher mas cercano al lanzar."""
    s = pd.read_csv(DATA / "pffScoutingData.csv", na_values=["NA"], usecols=["gameId", "playId", "nflId", "pff_role"])
    rushers = s[s.pff_role == "Pass Rush"][["gameId", "playId", "nflId"]].assign(isRusher=1)
    qbs = df[["gameId", "playId", "qbId"]].dropna()
    rows = []
    for gid in sorted(df.gameId.unique()):
        t = pd.read_csv(DATA / "tracking" / f"tracking_{gid}.csv", na_values=["NA"],
                        usecols=["gameId", "playId", "nflId", "frameId", "x", "y", "dis", "event"])
        ev = t[t.event.notna() & (t.event != "None")][["gameId", "playId", "frameId", "event"]].drop_duplicates()
        snap = ev[ev.event.isin(SNAP_EVENTS)].groupby(["gameId", "playId"]).frameId.min().rename("snap")
        ev = ev.join(snap, on=["gameId", "playId"])
        end = ev[ev.event.isin(END_EVENTS) & (ev.frameId > ev.snap)].sort_values("frameId") \
            .groupby(["gameId", "playId"]).first()[["frameId", "event"]].rename(columns={"frameId": "end", "event": "endEvent"})
        fr = pd.concat([snap, end], axis=1).dropna(subset=["snap", "end"]).reset_index()
        q = t.merge(qbs.rename(columns={"qbId": "nflId"}), on=["gameId", "playId", "nflId"]).merge(fr, on=["gameId", "playId"])
        inwin = q[(q.frameId > q.snap) & (q.frameId <= q.end)]
        mv = inwin.groupby(["gameId", "playId"]).dis.sum().rename("qbDist")
        at_end = q[q.frameId == q.end][["gameId", "playId", "x", "y"]].rename(columns={"x": "qx", "y": "qy"})
        r = t.merge(rushers, on=["gameId", "playId", "nflId"]).merge(fr[["gameId", "playId", "end"]], on=["gameId", "playId"])
        r = r[r.frameId == r.end].merge(at_end, on=["gameId", "playId"])
        r["d"] = np.hypot(r.x - r.qx, r.y - r.qy)
        md = r.groupby(["gameId", "playId"]).d.min().rename("rusherMinDist")
        res = fr.assign(timeToEnd=(fr.end - fr.snap) / 10.0).set_index(["gameId", "playId"])[["timeToEnd", "endEvent"]]
        rows.append(res.join(mv).join(md).reset_index())
    return pd.concat(rows, ignore_index=True)


def build() -> pd.DataFrame:
    df = _scouting_features(_play_table())
    df = df.merge(_tracking_features(df), on=["gameId", "playId"], how="left")
    keep = ["gameId", "playId", "week", "playDescription", "homeTeamAbbr", "visitorTeamAbbr", "gameClock", "quarter", "down", "yardsToGo", "possessionTeam", "defensiveTeam",
            "yardsToEndzone", "scoreDiff", "offenseFormation", "defendersInBox", "nDL", "nLB", "nDB",
            "nRB", "nTE", "nWR", "dropBackType", "pff_playAction", "pff_passCoverage", "pff_passCoverageType",
            "passResult", "action", "isInt", "isComplete", "direction", "targetPos", "yards", "hasPenalty",
            "qbId", "qbName", "nRush", "rushDL", "rushLB", "rushDB", "hurries", "hits", "sacksPff", "nBlock",
            "beaten", "pressure", "timeToEnd", "endEvent", "qbDist", "rusherMinDist"]
    return df[keep]


def load_features() -> pd.DataFrame:
    if DERIVED.exists():
        return pd.read_csv(DERIVED)
    return build()


if __name__ == "__main__":
    out = build()
    DERIVED.parent.mkdir(parents=True, exist_ok=True)
    out.to_csv(DERIVED, index=False, compression="gzip")
    print(out.shape)
    print(out.describe(include="all").T.head(60).to_string())

