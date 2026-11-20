"""Motor de analisis: modelo de presion, revision de jugadas, simulador y perfiles.

Metrica comun (ver review.py): cada jugada es Exitosa / Neutra / Negativa.
Puntaje de una opcion = P(exitosa) - P(negativa).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
import pandas as pd

from .features import DATA, DL_POS, LB_POS, load_features
from .review import (OPTION_KEYS, OPTION_LABELS, TIER_LABELS, Review, context, kernel_matrix, required, wilson)

DERIVED = Path(__file__).resolve().parent / "derived"
MIN_EFF = 8.0              # muestra efectiva minima para recomendar una opcion
MIN_QB_DROPBACKS = 60      # QBs con perfil
MIN_RUSH_SNAPS = 25        # defensivos con tasa de presion confiable
SCRAMBLE_MOBILE = 0.06     # un QB es "corredor" si hace scramble en al menos 6 % de sus dropbacks
POS_GROUP = {"DE": "DL", "DT": "DL", "NT": "DL", "OLB": "LB", "ILB": "LB", "MLB": "LB", "LB": "LB",
             "CB": "DB", "FS": "DB", "SS": "DB", "DB": "DB"}


def _f(x, nd: int = 4):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(x) or math.isinf(x) else round(x, nd)


@lru_cache(maxsize=4)
def _tracking_game(game_id: int) -> pd.DataFrame:
    """Tracking de un partido (se lee bajo demanda; se guardan los 4 ultimos en memoria)."""
    f = DATA / "tracking" / f"tracking_{game_id}.csv"
    return pd.read_csv(f, usecols=["playId", "nflId", "frameId", "jerseyNumber", "team", "playDirection", "x", "y", "s", "event"],
                       na_values=["NA"])


def _sigmoid(z):
    return 1.0 / (1.0 + np.exp(-np.clip(z, -30, 30)))


def _auc(y, p):
    order = np.argsort(p)
    ranks = np.empty(len(p))
    ranks[order] = np.arange(1, len(p) + 1)
    pos = y == 1
    n1, n0 = pos.sum(), (~pos).sum()
    return float((ranks[pos].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


# ------------------------------------------------------------------ modelo de presion
FEATURE_NAMES = [
    ("rushers", "Cada rusher extra (sobre 4)"),
    ("man", "Cobertura al hombre"),
    ("shotgun", "QB en shotgun / pistol / empty"),
    ("playAction", "Play action"),
    ("rollout", "Rollout diseñado"),
    ("down2", "2.º down (vs 1.º)"),
    ("down3", "3.er down (vs 1.º)"),
    ("down4", "4.º down (vs 1.º)"),
    ("logYtg", "Más yardas por avanzar"),
    ("extraBlockers", "Cada bloqueador extra (sobre 5)"),
    ("redzone", "Zona roja"),
]


def _design(d: pd.DataFrame) -> np.ndarray:
    cols = [
        d.nRush - 4,
        (d.pff_passCoverageType == "Man").astype(float),
        d.offenseFormation.isin(["SHOTGUN", "PISTOL", "EMPTY"]).astype(float),
        d.pff_playAction.astype(float),
        d.dropBackType.isin(["DESIGNED_ROLLOUT_RIGHT", "DESIGNED_ROLLOUT_LEFT"]).astype(float),
        (d.down == 2).astype(float), (d.down == 3).astype(float), (d.down == 4).astype(float),
        np.log(d.yardsToGo.clip(lower=1)) - 2.0,
        d.nBlock - 5,
        (d.yardsToEndzone <= 20).astype(float),
    ]
    return np.column_stack([np.ones(len(d))] + [np.asarray(c, dtype=float) for c in cols])


def _fit_logit(X, y, lam=1.0, iters=30):
    b = np.zeros(X.shape[1])
    pen = np.eye(X.shape[1]) * lam
    pen[0, 0] = 0
    for _ in range(iters):
        p = _sigmoid(X @ b)
        H = X.T @ (X * (p * (1 - p))[:, None]) + pen
        step = np.linalg.solve(H, X.T @ (y - p) - pen @ b)
        b += step
        if np.abs(step).max() < 1e-8:
            break
    return b


@dataclass
class Scenario:
    down: int = 1
    ytg: int = 10
    yardsToEndzone: int = 60
    rushers: int = 4
    blockers: int = 5
    coverageType: str = "Zone"
    formation: str = "SHOTGUN"
    playAction: bool = False
    rollout: bool = False
    offTeam: str | None = None
    defTeam: str | None = None
    qbId: int | None = None


class Engine:
    def __init__(self) -> None:
        d = load_features()
        d["nRush"] = d.nRush.fillna(4)
        d["pff_passCoverageType"] = d.pff_passCoverageType.fillna("Other")
        for c in ("hurries", "hits", "sacksPff"):
            d[c] = d[c].fillna(0)
        self.df = d.reset_index(drop=True)
        self.players = pd.read_csv(DATA / "players.csv")
        self.pinfo = self.players.set_index("nflId")
        self.scout = pd.read_csv(DATA / "pffScoutingData.csv", na_values=["NA"]) \
            .merge(self.df[["gameId", "playId"]], on=["gameId", "playId"])
        hs = DERIVED / "headshots.csv"
        self.headshots = dict(pd.read_csv(hs).values) if hs.exists() else {}
        tm = DERIVED / "teams.csv"
        self.teams = pd.read_csv(tm).set_index("abbr").to_dict("index") if tm.exists() else {}
        self._fit_pressure()
        self.mobile = {int(q): bool((g.action == "scramble").mean() >= SCRAMBLE_MOBILE)
                       for q, g in self.df.groupby("qbId") if len(g) >= MIN_QB_DROPBACKS}
        self.review = Review(self.df, MIN_EFF, self.mobile)
        self._player_team()
        self._defender_table = self._build_defenders()

    # ================================================================== presion
    def _fit_pressure(self) -> None:
        d = self.df
        X, y = _design(d), d.pressure.to_numpy(float)
        idx = np.random.default_rng(7).permutation(len(d))
        cut = int(len(d) * 0.8)
        b_tr = _fit_logit(X[idx[:cut]], y[idx[:cut]])
        self.auc = _auc(y[idx[cut:]], _sigmoid(X[idx[cut:]] @ b_tr))
        self.beta = _fit_logit(X, y)
        p = _sigmoid(X @ self.beta)
        self.league_pressure = float(y.mean())
        self.def_shift, self.off_shift = {}, {}
        for col, store in (("defensiveTeam", self.def_shift), ("possessionTeam", self.off_shift)):
            r = pd.DataFrame({"t": d[col], "res": y - p, "v": p * (1 - p)}).groupby("t").sum()
            for t, row in r.iterrows():
                store[t] = float(row.res / (row.v + 25.0))
        d["pPressure"] = _sigmoid(X @ self.beta + d.defensiveTeam.map(self.def_shift).fillna(0).to_numpy()
                                  + d.possessionTeam.map(self.off_shift).fillna(0).to_numpy())

    def p_pressure(self, row: pd.DataFrame, off: str | None, dfn: str | None) -> float:
        z = float((_design(row) @ self.beta)[0]) + self.def_shift.get(dfn, 0.0) + self.off_shift.get(off, 0.0)
        return float(_sigmoid(z))

    # ================================================================== utilidades de presentacion
    def person(self, pid) -> dict:
        pid = int(pid)
        r = self.pinfo.loc[pid] if pid in self.pinfo.index else None
        return {"id": pid, "name": None if r is None else r.displayName,
                "position": None if r is None else r.officialPosition,
                "headshot": self.headshots.get(pid), "team": self.team_of.get(pid)}

    def team_info(self, abbr: str | None) -> dict | None:
        if not abbr:
            return None
        t = self.teams.get(abbr, {})
        return {"abbr": abbr, "name": t.get("name", abbr), "nick": t.get("nick", abbr), "conf": t.get("conf"),
                "division": t.get("division"), "color": t.get("color", "#475569"), "color2": t.get("color2", "#94a3b8")}

    def _player_team(self) -> None:
        s = self.scout[["gameId", "playId", "nflId", "pff_role"]].merge(
            self.df[["gameId", "playId", "possessionTeam", "defensiveTeam"]], on=["gameId", "playId"])
        off = s.pff_role.isin(["Pass", "Pass Route", "Pass Block"])
        s["team"] = np.where(off, s.possessionTeam, s.defensiveTeam)
        self.team_of = s.groupby("nflId").team.agg(lambda x: x.value_counts().index[0]).to_dict()
        self.snaps_of = s.groupby("nflId").size().to_dict()

    def meta(self) -> dict:
        d = self.df
        drivers = [{"key": k, "label": lab, "oddsRatio": _f(math.exp(b))} for (k, lab), b in zip(FEATURE_NAMES, self.beta[1:])]
        teams = sorted(d.possessionTeam.unique().tolist())
        return {
            "plays": int(len(d)), "games": int(d.gameId.nunique()), "weeks": [int(d.week.min()), int(d.week.max())],
            "teams": [self.team_info(t) for t in teams],
            "formations": sorted(d.offenseFormation.dropna().unique().tolist()),
            "qbs": [{**self.person(q["id"]), "dropbacks": q["dropbacks"]} for q in self.qb_list()],
            "leaguePressureRate": _f(self.league_pressure),
            "model": {"auc": _f(self.auc), "drivers": drivers},
            "definitions": {"minEff": MIN_EFF, "mobile": SCRAMBLE_MOBILE},
            "review": self.review.summary(),
        }

    # ================================================================== revision de jugadas
    def games(self) -> list[dict]:
        g = self.df.groupby("gameId").agg(week=("week", "first"), home=("homeTeamAbbr", "first"),
                                          away=("visitorTeamAbbr", "first"), plays=("playId", "size")).reset_index()
        return [{"gameId": int(r.gameId), "week": int(r.week), "home": r.home, "away": r.away, "plays": int(r.plays)}
                for r in g.itertuples()]

    def plays(self, game_id: int) -> list[dict]:
        d = self.df[self.df.gameId == game_id]
        t = self.review.table.loc[d.index]
        out = []
        for (i, r), v in zip(d.iterrows(), t.itertuples()):
            out.append({"playId": int(r.playId), "quarter": int(r.quarter), "clock": r.gameClock, "down": int(r.down),
                        "ytg": int(r.yardsToGo), "team": r.possessionTeam, "qb": r.qbName, "desc": r.playDescription,
                        "pressure": int(r.pressure), "action": r.action, "yards": _f(r.yards), "tier": int(v.tier),
                        "verdict": v.verdict, "pBetter": _f(v.pB_rec)})
        return out

    def play_review(self, game_id: int, play_id: int) -> dict | None:
        i = self.review.row(game_id, play_id)
        if i is None:
            return None
        r = self.df.iloc[i]
        s = self.scout[(self.scout.gameId == game_id) & (self.scout.playId == play_id)]
        rush = s[s.pff_role == "Pass Rush"]
        pressers = []
        for x in rush.itertuples():
            kinds = [k for k, c in (("sack", x.pff_sack), ("golpe", x.pff_hit), ("apuro", x.pff_hurry)) if c == 1]
            if kinds:
                pressers.append({**self.person(x.nflId), "kinds": kinds, "lined": x.pff_positionLinedUp})
        beaten = []
        for x in s[(s.pff_role == "Pass Block") & (s.pff_beatenByDefender == 1)].itertuples():
            beaten.append({**self.person(x.nflId), "lined": x.pff_positionLinedUp})
        side = "propia" if r.yardsToEndzone > 50 else "rival"
        yl = int(r.yardsToEndzone - 50) if r.yardsToEndzone > 50 else int(r.yardsToEndzone)
        play = {
            "gameId": int(game_id), "playId": int(play_id), "week": int(r.week), "desc": r.playDescription,
            "offense": self.team_info(r.possessionTeam), "defense": self.team_info(r.defensiveTeam),
            "quarter": int(r.quarter), "clock": r.gameClock, "down": int(r.down), "ytg": int(r.yardsToGo),
            "yardsToEndzone": int(r.yardsToEndzone), "fieldText": f"{'Propia' if side == 'propia' else 'Rival'} {100 - int(r.yardsToEndzone) if side == 'propia' else yl}",
            "scoreDiff": int(r.scoreDiff), "formation": r.offenseFormation, "coverage": r.pff_passCoverage,
            "coverageType": r.pff_passCoverageType, "rushers": _f(r.nRush, 0), "blockers": int(r.nBlock),
            "playAction": bool(r.pff_playAction), "dropBackType": r.dropBackType,
            "pressure": bool(r.pressure), "hurries": int(r.hurries), "hits": int(r.hits), "sacks": int(r.sacksPff),
            "pPressure": _f(r.pPressure), "timeToEnd": _f(r.timeToEnd), "rusherMinDist": _f(r.rusherMinDist),
            "qbMoved": _f(r.qbDist), "action": r.action, "yards": _f(r.yards), "isInt": bool(r.isInt),
            "target": r.targetPos if isinstance(r.targetPos, str) else None,
            "qb": self.person(r.qbId) if pd.notna(r.qbId) else None, "pressers": pressers, "beatenBlockers": beaten,
        }
        return {"play": play, "analysis": self.review.detail(i)}

    def random_play(self, verdict: str | None, pressure: int | None, team: str | None, seed: int) -> dict:
        t = self.review.table
        m = np.ones(len(t), bool)
        if verdict:
            m &= t.verdict.to_numpy() == verdict
        if pressure is not None:
            m &= self.df.pressure.to_numpy() == pressure
        if team:
            m &= self.df.possessionTeam.to_numpy() == team
        idx = np.flatnonzero(m)
        if not len(idx):
            return {}
        j = idx[np.random.default_rng(seed).integers(len(idx))]
        return {"gameId": int(t.gameId.iat[j]), "playId": int(t.playId.iat[j])}

    # ================================================================== simulador "¿que pasaria si?"
    def simulate(self, s: Scenario) -> dict:
        d = self.df
        row = pd.DataFrame([{
            "nRush": s.rushers, "pff_passCoverageType": s.coverageType, "offenseFormation": s.formation,
            "pff_playAction": int(s.playAction), "dropBackType": "DESIGNED_ROLLOUT_RIGHT" if s.rollout else "TRADITIONAL",
            "down": s.down, "yardsToGo": s.ytg, "nBlock": s.blockers, "yardsToEndzone": s.yardsToEndzone}])
        p = self.p_pressure(row, s.offTeam, s.defTeam)
        ci = context([s.down], [s.ytg], [s.yardsToEndzone], [s.coverageType], [s.rushers])
        w0 = kernel_matrix(ci, self.review.ctx)[0]
        req = required([s.down], [s.ytg], [s.yardsToEndzone])
        tm = self.review._tiers_for(req)
        mobile = self.mobile.get(s.qbId) if s.qbId else None
        states = {}
        for st, val in (("pressure", 1), ("clean", 0)):
            w = (w0 * (self.review.pres == val))[None, :]
            probs = self.review.option_probs(w, tm)
            scr_ok = bool(mobile) and st == "pressure"
            rec = self.review.recommend(probs, np.array([scr_ok]))[0]
            opts = []
            for k in OPTION_KEYS:
                r = probs[k]
                opts.append({"key": k, "label": OPTION_LABELS[k], "pS": _f(r["pS"][0]), "pNeg": _f(r["pNeg"][0]),
                             "score": _f(r["score"][0]), "yards": _f(r["yards"][0]),
                             "neff": None if k == "throwaway" else _f(r["neff"][0], 1),
                             "lowSample": bool(k != "throwaway" and r["neff"][0] < MIN_EFF),
                             "allowed": bool(k != "scramble" or scr_ok)})
            m = w[0] > 0
            act = self.review.act
            sack = float((w[0] * (act == "sack")).sum() / w[0].sum())
            chosen = {k: _f((w[0] * (act == k)).sum() / w[0].sum()) for k in OPTION_KEYS + ["sack"]}
            ttt = d.timeToEnd.to_numpy(float)
            mm = m & ~np.isnan(ttt)
            o = np.argsort(ttt[mm]); cw = np.cumsum(w[0][mm][o])
            med = float(ttt[mm][o][np.searchsorted(cw, cw[-1] / 2)]) if mm.any() else None
            states[st] = {"options": opts, "rec": rec, "recLabel": OPTION_LABELS[rec], "sackRate": _f(sack),
                          "chosen": chosen, "timeToThrow": _f(med), "nEff": _f(w[0].sum() ** 2 / (w[0] ** 2).sum(), 0)}
        blend = []
        for a, b in zip(states["pressure"]["options"], states["clean"]["options"]):
            mix = lambda f: None if a[f] is None or b[f] is None else _f(p * a[f] + (1 - p) * b[f])
            blend.append({"key": a["key"], "label": a["label"], "pS": mix("pS"), "pNeg": mix("pNeg"),
                          "score": mix("score"), "yards": mix("yards"), "allowed": a["allowed"]})
        ok = [o for o in blend if o["allowed"] and o["score"] is not None and o["key"] in ("short", "deep")]
        plan = max(ok, key=lambda o: o["score"]) if ok else blend[0]
        return {"pPressure": _f(p), "leagueAvg": _f(self.league_pressure), "qbMobile": mobile,
                "pSack": _f(p * states["pressure"]["sackRate"] + (1 - p) * states["clean"]["sackRate"]),
                "states": states, "blend": blend, "plan": {"key": plan["key"], "label": plan["label"]},
                "required": _f(req[0], 1), "teamEffect": {"defense": _f(self.def_shift.get(s.defTeam, 0.0)),
                                                         "offense": _f(self.off_shift.get(s.offTeam, 0.0))}}

    # ================================================================== QBs
    def qb_list(self) -> list[dict]:
        g = self.df.groupby("qbId").size().reset_index(name="n")
        g = g[g.n >= MIN_QB_DROPBACKS].sort_values("n", ascending=False)
        return [{"id": int(r.qbId), "dropbacks": int(r.n)} for r in g.itertuples()]

    def _qb_state(self, d: pd.DataFrame, t: pd.DataFrame) -> dict:
        n = len(d)
        if n == 0:
            return {"n": 0}
        att = d[d.action.isin(["short", "deep", "pass_unknown"])]
        mix = d.action.value_counts(normalize=True)
        f = t[t.tier < 2]
        return {
            "n": n, "successRate": _f((t.tier == 2).mean()), "negativeRate": _f((t.tier == 0).mean()),
            "yardsPerDropback": _f(d.yards.mean()), "completion": _f(att.isComplete.mean()) if len(att) else None,
            "sackRate": _f(mix.get("sack", 0.0)), "scrambleRate": _f(mix.get("scramble", 0.0)),
            "throwawayRate": _f(mix.get("throwaway", 0.0)), "intRate": _f(d.isInt.mean()),
            "shortRate": _f(mix.get("short", 0.0)), "deepRate": _f(mix.get("deep", 0.0)),
            "timeToThrow": _f(d.timeToEnd[d.endEvent == "pass_forward"].median(), 2),
            "matchRate": _f(t.match.mean()),
            "betterRate": _f((f.verdict == "mejor").mean()) if len(f) else None,
        }

    def qb_profile(self, qb_id: int) -> dict | None:
        m = (self.df.qbId == qb_id).to_numpy()
        if not m.any():
            return None
        d, t = self.df[m], self.review.table[m]
        lg, lt = self.df, self.review.table
        pr, lpr = (d.pressure == 1).to_numpy(), (lg.pressure == 1).to_numpy()
        by_rush = []
        for lab, mm in (("4 o menos", d.nRush <= 4), ("5", d.nRush == 5), ("6 o más", d.nRush >= 6)):
            mm = mm.to_numpy()
            if mm.sum() >= 5:
                by_rush.append({"rushers": lab, "n": int(mm.sum()), "pressureRate": _f(d[mm].pressure.mean()),
                                "successRate": _f((t[mm].tier == 2).mean()), "sackRate": _f((d[mm].action == "sack").mean())})
        by_down = []
        for lab, mm in (("1.º down", d.down == 1), ("2.º down", d.down == 2), ("3.º/4.º down", d.down >= 3)):
            mm = mm.to_numpy()
            if mm.sum() >= 5:
                by_down.append({"down": lab, "n": int(mm.sum()), "pressureRate": _f(d[mm].pressure.mean()),
                                "successPressure": _f((t[mm & pr].tier == 2).mean()) if (mm & pr).any() else None,
                                "successClean": _f((t[mm & ~pr].tier == 2).mean()) if (mm & ~pr).any() else None})
        # Defensivos que mas lo presionaron
        s = self.scout[(self.scout.pff_role == "Pass Rush")].merge(d[["gameId", "playId"]], on=["gameId", "playId"])
        s["pres"] = (s[["pff_hit", "pff_hurry", "pff_sack"]].fillna(0).sum(1) > 0)
        top = s[s.pres].groupby("nflId").size().sort_values(ascending=False).head(5)
        fails = t[(t.tier < 2) & ~t.match]
        worst = fails.sort_values("pB_rec", ascending=False).head(5)
        return {
            **self.person(qb_id), "dropbacks": int(m.sum()), "mobile": self.mobile.get(qb_id),
            "teamInfo": self.team_info(d.possessionTeam.mode().iat[0]),
            "pressureRate": _f(d.pressure.mean()), "leaguePressureRate": _f(self.league_pressure),
            "blitzFaced": _f((d.nRush >= 5).mean()), "leagueBlitzFaced": _f((lg.nRush >= 5).mean()),
            "all": self._qb_state(d, t), "pressure": self._qb_state(d[pr], t[pr]), "clean": self._qb_state(d[~pr], t[~pr]),
            "league": {"pressure": self._qb_state(lg[lpr], lt[lpr]), "clean": self._qb_state(lg[~lpr], lt[~lpr]),
                       "all": self._qb_state(lg, lt)},
            "byRushers": by_rush, "byDown": by_down,
            "topPressers": [{**self.person(k), "pressures": int(v)} for k, v in top.items()],
            "missed": [{"gameId": int(r.gameId), "playId": int(r.playId), "pBetter": _f(r.pB_rec),
                        "rec": OPTION_LABELS[r.rec], "desc": self.df.playDescription.iat[ix]}
                       for ix, r in zip(worst.index, worst.itertuples())],
        }

    def qb_cards(self) -> list[dict]:
        out = []
        for q in self.qb_list():
            m = (self.df.qbId == q["id"]).to_numpy()
            d, t = self.df[m], self.review.table[m]
            pr = (d.pressure == 1).to_numpy()
            out.append({**self.person(q["id"]), "dropbacks": q["dropbacks"], "pressureRate": _f(d.pressure.mean()),
                        "successPressure": _f((t[pr].tier == 2).mean()), "successClean": _f((t[~pr].tier == 2).mean()),
                        "matchRate": _f(t.match.mean()), "mobile": self.mobile.get(q["id"]),
                        "teamInfo": self.team_info(d.possessionTeam.mode().iat[0])})
        return out

    # ================================================================== defensivos
    def _build_defenders(self) -> pd.DataFrame:
        s, d = self.scout, self.df
        key = ["gameId", "playId"]
        ctx = d[key + ["defensiveTeam", "down", "nRush", "yards", "qbId"]]
        rush = s[s.pff_role == "Pass Rush"].merge(ctx, on=key)
        for c in ("pff_hit", "pff_hurry", "pff_sack"):
            rush[c] = rush[c].fillna(0)
        rush["pres"] = ((rush.pff_hit + rush.pff_hurry + rush.pff_sack) > 0).astype(int)
        rush["third"] = rush.down >= 3
        rush["blitz"] = rush.nRush >= 5
        cov = s[s.pff_role == "Coverage"].merge(ctx, on=key)
        blk = s[s.pff_role == "Pass Block"].dropna(subset=["pff_nflIdBlockedPlayer"])
        blk = blk.assign(def_id=blk.pff_nflIdBlockedPlayer.astype(int), beat=blk.pff_beatenByDefender.fillna(0))
        faced = blk.groupby(["def_id", "gameId", "playId"]).size().rename("nb").reset_index()
        g = rush.groupby("nflId")
        out = pd.DataFrame({
            "rushSnaps": g.size(), "pressures": g.pres.sum(), "hurries": g.pff_hurry.sum(), "hits": g.pff_hit.sum(),
            "sacks": g.pff_sack.sum(),
            "pressThird": g.apply(lambda x: x.pres[x.third].mean() if x.third.any() else np.nan, include_groups=False),
            "rushThird": g.third.sum(),
            "pressBlitz": g.apply(lambda x: x.pres[x.blitz].mean() if x.blitz.any() else np.nan, include_groups=False),
            "pressBase": g.apply(lambda x: x.pres[~x.blitz].mean() if (~x.blitz).any() else np.nan, include_groups=False),
            "yardsWhenPressing": g.apply(lambda x: x.yards[x.pres == 1].mean() if x.pres.any() else np.nan, include_groups=False),
        })
        out["coverSnaps"] = cov.groupby("nflId").size()
        out["blockWins"] = blk.groupby("def_id").beat.sum()
        out["doubleTeam"] = faced.assign(dbl=faced.nb >= 2).groupby("def_id").dbl.mean()
        team = pd.concat([rush[["nflId", "defensiveTeam"]], cov[["nflId", "defensiveTeam"]]])
        out = out.reindex(team.nflId.unique())
        out["team"] = team.groupby("nflId").defensiveTeam.agg(lambda x: x.value_counts().index[0])
        out = out.fillna({"rushSnaps": 0, "pressures": 0, "hurries": 0, "hits": 0, "sacks": 0, "coverSnaps": 0,
                          "blockWins": 0, "rushThird": 0})
        out["snaps"] = out.rushSnaps + out.coverSnaps
        out["pressureRate"] = np.where(out.rushSnaps > 0, out.pressures / out.rushSnaps.where(out.rushSnaps > 0), np.nan)
        out["sackRate"] = np.where(out.rushSnaps > 0, out.sacks / out.rushSnaps.where(out.rushSnaps > 0), np.nan)
        out["rushShare"] = out.rushSnaps / out.snaps
        out["position"] = self.pinfo.reindex(out.index).officialPosition
        out["group"] = out.position.map(POS_GROUP).fillna("Otro")
        qual = out[out.rushSnaps >= MIN_RUSH_SNAPS]
        grp = qual.groupby("group").apply(lambda x: x.pressures.sum() / x.rushSnaps.sum(), include_groups=False)
        out["groupPressureRate"] = out.group.map(grp)
        out["pressurePct"] = np.nan
        for gname, x in qual.groupby("group"):
            out.loc[x.index, "pressurePct"] = x.pressureRate.rank(pct=True)
        self._rush_rows = rush
        return out

    def _def_row(self, pid: int, r: pd.Series) -> dict:
        return {**self.person(pid), "team": r.team, "group": r.group, "snaps": int(r.snaps),
                "rushSnaps": int(r.rushSnaps), "coverSnaps": int(r.coverSnaps), "rushShare": _f(r.rushShare),
                "pressures": int(r.pressures), "hurries": int(r.hurries), "hits": int(r.hits), "sacks": _f(r.sacks, 1),
                "pressureRate": _f(r.pressureRate) if r.rushSnaps >= MIN_RUSH_SNAPS else None,
                "rawPressureRate": _f(r.pressureRate), "groupPressureRate": _f(r.groupPressureRate),
                "pressurePct": _f(r.pressurePct), "blockWins": int(r.blockWins), "doubleTeam": _f(r.doubleTeam),
                "pressThird": _f(r.pressThird), "rushThird": int(r.rushThird), "pressBlitz": _f(r.pressBlitz),
                "pressBase": _f(r.pressBase), "yardsWhenPressing": _f(r.yardsWhenPressing),
                "reliable": bool(r.rushSnaps >= MIN_RUSH_SNAPS)}

    def defenders(self, team: str) -> list[dict]:
        t = self._defender_table
        t = t[t.team == team].sort_values(["pressures", "snaps"], ascending=False)
        return [self._def_row(int(i), r) for i, r in t.iterrows()]

    def defender_profile(self, pid: int) -> dict | None:
        t = self._defender_table
        if pid not in t.index:
            return None
        base = self._def_row(pid, t.loc[pid])
        rush = self._rush_rows[self._rush_rows.nflId == pid]
        lined = self.scout[self.scout.nflId == pid].pff_positionLinedUp.value_counts(normalize=True).head(4)
        by_down = []
        for lab, m in (("1.º down", rush.down == 1), ("2.º down", rush.down == 2), ("3.º/4.º down", rush.down >= 3)):
            if m.sum():
                by_down.append({"down": lab, "rushSnaps": int(m.sum()), "pressureRate": _f(rush.pres[m].mean())})
        victims = rush[rush.pres == 1].groupby("qbId").size().sort_values(ascending=False).head(5)
        weekly = rush.merge(self.df[["gameId", "playId", "week"]], on=["gameId", "playId"]) \
            .groupby("week").agg(rushSnaps=("pres", "size"), pressures=("pres", "sum")).reset_index()
        return {**base, "teamInfo": self.team_info(base["team"]),
                "info": self.bio(pid),
                "linedUp": [{"spot": k, "share": _f(v)} for k, v in lined.items()],
                "byDown": by_down,
                "weekly": [{"week": int(r.week), "rushSnaps": int(r.rushSnaps), "pressures": int(r.pressures)} for r in weekly.itertuples()],
                "victims": [{**self.person(k), "pressures": int(v)} for k, v in victims.items()]}

    # ================================================================== equipos
    def defense_profile(self, team: str) -> dict | None:
        m = (self.df.defensiveTeam == team).to_numpy()
        if not m.any():
            return None
        d, t, lg, lt = self.df[m], self.review.table[m], self.df, self.review.table
        by_ctx = []
        for lab, mm in (("1.º y 2.º down", d.down <= 2), ("3.º corto (≤4 yd)", (d.down >= 3) & (d.yardsToGo <= 4)),
                        ("3.º medio (5-7 yd)", (d.down >= 3) & d.yardsToGo.between(5, 7)),
                        ("3.º largo (≥8 yd)", (d.down >= 3) & (d.yardsToGo >= 8))):
            g = d[mm]
            if len(g) >= 5:
                by_ctx.append({"context": lab, "n": int(len(g)), "blitzRate": _f((g.nRush >= 5).mean()),
                               "pressureRate": _f(g.pressure.mean()), "manRate": _f((g.pff_passCoverageType == "Man").mean()),
                               "successAllowed": _f((t[mm.to_numpy()].tier == 2).mean())})
        by_rush = []
        for lab, mm in (("4 o menos", d.nRush <= 4), ("5", d.nRush == 5), ("6 o más", d.nRush >= 6)):
            g = d[mm]
            by_rush.append({"rushers": lab, "n": int(len(g)), "pressureRate": _f(g.pressure.mean()) if len(g) else None,
                            "successAllowed": _f((t[mm.to_numpy()].tier == 2).mean()) if len(g) else None})
        return {
            "team": self.team_info(team), "dropbacks": int(len(d)),
            "pressureRate": _f(d.pressure.mean()), "leaguePressureRate": _f(lg.pressure.mean()),
            "sackRate": _f((d.action == "sack").mean()), "leagueSackRate": _f((lg.action == "sack").mean()),
            "blitzRate": _f((d.nRush >= 5).mean()), "leagueBlitzRate": _f((lg.nRush >= 5).mean()),
            "manRate": _f((d.pff_passCoverageType == "Man").mean()), "leagueManRate": _f((lg.pff_passCoverageType == "Man").mean()),
            "successAllowed": _f((t.tier == 2).mean()), "leagueSuccess": _f((lt.tier == 2).mean()),
            "negativeForced": _f((t.tier == 0).mean()), "leagueNegative": _f((lt.tier == 0).mean()),
            "coverageMix": [{"coverage": k, "share": _f(v)} for k, v in d.pff_passCoverage.value_counts(normalize=True).head(6).items()],
            "byContext": by_ctx, "byRushers": by_rush, "adjustment": _f(self.def_shift.get(team, 0.0)),
        }

    def offense_profile(self, team: str) -> dict | None:
        m = (self.df.possessionTeam == team).to_numpy()
        if not m.any():
            return None
        d, t, lg, lt = self.df[m], self.review.table[m], self.df, self.review.table
        key = ["gameId", "playId"]
        s = self.scout[self.scout.pff_role == "Pass Block"].merge(d[key + ["nRush"]], on=key)
        for c in ("pff_hitAllowed", "pff_hurryAllowed", "pff_sackAllowed", "pff_beatenByDefender"):
            s[c] = s[c].fillna(0)
        s["pres"] = ((s.pff_hitAllowed + s.pff_hurryAllowed + s.pff_sackAllowed) > 0).astype(int)
        g = s.groupby("nflId").agg(snaps=("pres", "size"), pressures=("pres", "sum"), hurries=("pff_hurryAllowed", "sum"),
                                   hits=("pff_hitAllowed", "sum"), sacks=("pff_sackAllowed", "sum"),
                                   beaten=("pff_beatenByDefender", "sum"),
                                   spot=("pff_positionLinedUp", lambda x: x.value_counts().index[0])).reset_index()
        g = g[g.snaps >= 20].assign(rate=lambda x: x.pressures / x.snaps).sort_values(["snaps"], ascending=False)
        # Tasa de presion permitida por bloqueador en la liga (solo linieros con muestra), para comparar.
        allb = self.scout[self.scout.pff_role == "Pass Block"]
        allp = (allb[["pff_hitAllowed", "pff_hurryAllowed", "pff_sackAllowed"]].fillna(0).sum(1) > 0)
        league_block_rate = float(allp.mean())

        def blk(lab, mm):
            g2, t2 = d[mm], t[mm.to_numpy()]
            return {"label": lab, "n": int(len(g2)), "pressureRate": _f(g2.pressure.mean()) if len(g2) else None,
                    "sackRate": _f((g2.action == "sack").mean()) if len(g2) else None,
                    "successRate": _f((t2.tier == 2).mean()) if len(g2) else None,
                    "timeToThrow": _f(g2.timeToEnd[g2.endEvent == "pass_forward"].median(), 2) if len(g2) else None}

        by_rush = [blk(l, mm) for l, mm in (("4 o menos", d.nRush <= 4), ("5", d.nRush == 5), ("6 o más", d.nRush >= 6))]
        by_ctx = [blk(l, mm) for l, mm in (("1.º y 2.º down", d.down <= 2), ("3.º corto (≤4 yd)", (d.down >= 3) & (d.yardsToGo <= 4)),
                                           ("3.º medio (5-7 yd)", (d.down >= 3) & d.yardsToGo.between(5, 7)),
                                           ("3.º largo (≥8 yd)", (d.down >= 3) & (d.yardsToGo >= 8)))]
        by_blk = [blk(l, mm) for l, mm in (("5 bloqueadores", d.nBlock <= 5), ("6", d.nBlock == 6), ("7 o más", d.nBlock >= 7))]
        qbs = d.groupby("qbId").size().sort_values(ascending=False)
        # Defensivos rivales que mas presionaron a esta ofensiva
        r = self.scout[self.scout.pff_role == "Pass Rush"].merge(d[key], on=key)
        r["pres"] = r[["pff_hit", "pff_hurry", "pff_sack"]].fillna(0).sum(1) > 0
        top_rivals = r[r.pres].groupby("nflId").size().sort_values(ascending=False).head(6)
        return {
            "team": self.team_info(team), "dropbacks": int(len(d)),
            "pressureRate": _f(d.pressure.mean()), "leaguePressureRate": _f(lg.pressure.mean()),
            "sackRate": _f((d.action == "sack").mean()), "leagueSackRate": _f((lg.action == "sack").mean()),
            "beatenPerDropback": _f(d.beaten.mean()), "leagueBeatenPerDropback": _f(lg.beaten.mean()),
            "timeToThrow": _f(d.timeToEnd[d.endEvent == "pass_forward"].median(), 2),
            "leagueTimeToThrow": _f(lg.timeToEnd[lg.endEvent == "pass_forward"].median(), 2),
            "successRate": _f((t.tier == 2).mean()), "leagueSuccess": _f((lt.tier == 2).mean()),
            "negativeRate": _f((t.tier == 0).mean()), "leagueNegative": _f((lt.tier == 0).mean()),
            "blitzFaced": _f((d.nRush >= 5).mean()), "leagueBlitzFaced": _f((lg.nRush >= 5).mean()),
            "extraBlockers": _f((d.nBlock >= 6).mean()), "leagueExtraBlockers": _f((lg.nBlock >= 6).mean()),
            "byRushers": by_rush, "byContext": by_ctx, "byBlockers": by_blk,
            "leagueBlockerRate": _f(league_block_rate),
            "blockers": [{**self.person(x.nflId), "snaps": int(x.snaps), "pressures": int(x.pressures), "hurries": int(x.hurries),
                          "hits": int(x.hits), "sacks": int(x.sacks), "beaten": int(x.beaten), "spot": x.spot, "rate": _f(x.rate)}
                         for x in g.itertuples()],
            "qbs": [{**self.person(q), "dropbacks": int(n)} for q, n in qbs.items() if n >= 10],
            "topRivals": [{**self.person(k), "pressures": int(v)} for k, v in top_rivals.items()],
            "adjustment": _f(self.off_shift.get(team, 0.0)),
        }

    def offense_cards(self) -> list[dict]:
        d, t = self.df, self.review.table
        out = []
        for team in sorted(d.possessionTeam.unique()):
            m = (d.possessionTeam == team).to_numpy()
            out.append({**self.team_info(team), "pressureRate": _f(d[m].pressure.mean()),
                        "sackRate": _f((d[m].action == "sack").mean()), "successRate": _f((t[m].tier == 2).mean()),
                        "timeToThrow": _f(d[m].timeToEnd[d[m].endEvent == "pass_forward"].median(), 2),
                        "dropbacks": int(m.sum())})
        return out
    def team_cards(self) -> list[dict]:
        d, t = self.df, self.review.table
        out = []
        for team in sorted(d.defensiveTeam.unique()):
            m = (d.defensiveTeam == team).to_numpy()
            out.append({**self.team_info(team), "pressureRate": _f(d[m].pressure.mean()),
                        "blitzRate": _f((d[m].nRush >= 5).mean()), "successAllowed": _f((t[m].tier == 2).mean()),
                        "dropbacks": int(m.sum())})
        return out

    # ================================================================== desarrollo de la jugada (tracking)
    def tracking(self, game_id: int, play_id: int) -> dict | None:
        i = self.review.row(game_id, play_id)
        if i is None or not (DATA / "tracking" / f"tracking_{game_id}.csv").exists():
            return None
        r = self.df.iloc[i]
        t = _tracking_game(game_id)
        t = t[t.playId == play_id]
        if t.empty:
            return None
        flip = t.playDirection.iat[0] == "left"
        x = (120 - t.x if flip else t.x).round(2)
        y = (53.3 - t.y if flip else t.y).round(2)
        t = t.assign(x=x, y=y)
        frames = sorted(t.frameId.unique().tolist())
        ev = t[t.event.notna() & (t.event != "None")].groupby("frameId").event.first()
        events = [{"frame": int(f), "event": e} for f, e in ev.items()]
        snap = next((e["frame"] for e in events if e["event"] in ("ball_snap", "autoevent_ballsnap")), frames[0])
        ball = t[t.team == "football"].set_index("frameId")
        los = float(ball.x.get(snap, ball.x.iloc[0]))
        s = self.scout[(self.scout.gameId == game_id) & (self.scout.playId == play_id)].set_index("nflId")
        pressers = {int(k) for k in s.index[(s[["pff_hit", "pff_hurry", "pff_sack"]].fillna(0).sum(1) > 0)]}
        beaten = {int(k) for k in s.index[s.pff_beatenByDefender.fillna(0) > 0]}
        players = []
        pos = []
        for pid, g in t[t.team != "football"].groupby("nflId"):
            g = g.set_index("frameId").reindex(frames)
            pid = int(pid)
            role = s.pff_role.get(pid) if pid in s.index else None
            players.append({
                "id": pid, "name": self.pinfo.displayName.get(pid), "jersey": None if pd.isna(g.jerseyNumber.dropna().iat[0]) else int(g.jerseyNumber.dropna().iat[0]),
                "team": g.team.dropna().iat[0], "side": "off" if g.team.dropna().iat[0] == r.possessionTeam else "def",
                "role": role, "spot": s.pff_positionLinedUp.get(pid) if pid in s.index else None,
                "isQb": role == "Pass", "pressed": pid in pressers, "beaten": pid in beaten,
                "position": self.pinfo.officialPosition.get(pid), "headshot": self.headshots.get(pid),
            })
            pos.append([[None if pd.isna(a) else float(a), None if pd.isna(b) else float(b)] for a, b in zip(g.x, g.y)])
        b = ball.reindex(frames)
        return {
            "gameId": game_id, "playId": play_id, "frames": len(frames), "fps": 10, "snapIndex": frames.index(snap),
            "events": [{"index": frames.index(e["frame"]), "event": e["event"]} for e in events],
            "los": los, "firstDown": min(los + float(r.yardsToGo), 110.0),
            "offense": self.team_info(r.possessionTeam), "defense": self.team_info(r.defensiveTeam),
            "players": players, "positions": pos,
            "ball": [[None if pd.isna(a) else float(a), None if pd.isna(c) else float(c)] for a, c in zip(b.x, b.y)],
        }

    # ================================================================== directorio
    def bio(self, pid: int) -> dict:
        r = self.pinfo.loc[pid]
        ft = inch = None
        if isinstance(r.height, str) and "-" in r.height:
            a, b = r.height.split("-", 1)
            ft, inch = int(a), int(b)
        bd = pd.to_datetime(r.birthDate, errors="coerce")
        return {"heightFt": ft, "heightIn": inch, "weightLb": None if pd.isna(r.weight) else int(r.weight),
                "birthDate": None if pd.isna(bd) else bd.strftime("%Y-%m-%d"),
                "age": None if pd.isna(bd) else int((pd.Timestamp("2021-09-09") - bd).days // 365.25),
                "college": None if pd.isna(r.collegeName) else r.collegeName}

    def players_table(self) -> list[dict]:
        if getattr(self, "_players_cache", None) is None:
            dset = set(self._defender_table.index)
            self._players_cache = [{**self.person(int(r.nflId)), **self.bio(int(r.nflId)),
                                    "snaps": int(self.snaps_of.get(r.nflId, 0)),
                                    "hasDefProfile": int(r.nflId) in dset,
                                    "hasQbProfile": int(r.nflId) in self.mobile}
                                   for r in self.players.itertuples()]
        return self._players_cache

