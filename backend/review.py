"""Revision de jugadas reales: ¿habria salido mejor con la decision que recomiendan los datos?

Cada jugada se clasifica en tres niveles de resultado:
  2 = exitosa : gana las yardas requeridas (40 % de la distancia en 1.er down, 60 % en 2.o, 100 % en 3.o/4.o)
                 sin intercepcion. Un touchdown siempre es exitoso.
  1 = neutra  : no es exitosa ni negativa (incompleto, tirar el balon, ganancia corta).
  0 = negativa: sack, intercepcion o perdida de yardas.

Para cada dropback i:
1. Se toma la presion que realmente sufrio el QB y el contexto (down, distancia, zona roja, cobertura, rushers).
2. Se buscan jugadas parecidas j (pesos de similitud, sin la propia jugada) en el mismo estado de presion.
3. Para cada opcion del QB se estiman P(exitosa) y P(negativa) con esas jugadas, medidas con la situacion de i.
4. Puntaje = P(exitosa) - P(negativa). La recomendada es la de mayor puntaje con muestra suficiente.
5. P(mejor) = probabilidad (ponderada) de que la opcion recomendada diera un nivel mayor que el real.
   Se reporta con un intervalo de Wilson al 90 % calculado con la muestra efectiva.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

OPTION_KEYS = ["short", "deep", "throwaway", "scramble"]
OPTION_LABELS = {"short": "Pase corto", "deep": "Pase profundo", "throwaway": "Tirar el balón",
                 "scramble": "Correr (scramble)", "sack": "Sostuvo el balón (sack)", "pass_unknown": "Pase"}
TIER_LABELS = {2: "Exitosa", 1: "Neutra", 0: "Negativa"}
Z90 = 1.645
N_CAP = 400.0  # tope de muestra efectiva para el intervalo (las jugadas parecidas no son independientes)


def wilson(p: float, n: float, z: float = Z90) -> tuple[float, float]:
    if n is None or not np.isfinite(n) or n <= 0 or not np.isfinite(p):
        return (float("nan"), float("nan"))
    n = min(n, N_CAP)
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(max(p * (1 - p), 0) / n + z * z / (4 * n * n)) / den
    return (max(0.0, c - h), min(1.0, c + h))


def required(down, ytg, yte):
    down = np.asarray(down, float)
    frac = np.where(down == 1, 0.4, np.where(down == 2, 0.6, 1.0))
    return np.minimum(frac * np.asarray(ytg, float), np.asarray(yte, float))


def tiers(yards, req, is_int, is_sack):
    yards = np.asarray(yards, float)
    is_int = np.asarray(is_int, bool)
    is_sack = np.asarray(is_sack, bool)
    neg = is_int | is_sack | (yards < 0)
    succ = (yards >= req) & ~is_int & ~is_sack
    return np.where(succ, 2, np.where(neg, 0, 1))


def kernel_matrix(ci: dict, cj: dict) -> np.ndarray:
    """Pesos de similitud entre jugadas i (filas) y j (columnas)."""
    dd = np.abs(ci["down"][:, None] - cj["down"][None, :])
    w = np.where(dd == 0, 1.0, np.where(dd == 1, 0.6, 0.35))
    w = w * np.exp(-np.abs(ci["ytg"][:, None] - cj["ytg"][None, :]) / 3.0)
    w *= np.where(ci["rz"][:, None] == cj["rz"][None, :], 1.0, 0.6)
    w *= np.where(ci["cov"][:, None] == cj["cov"][None, :], 1.0, 0.55)
    rg = np.abs(ci["rush"][:, None] - cj["rush"][None, :])
    w *= np.where(rg == 0, 1.0, np.where(rg == 1, 0.6, 0.3))
    return w


def context(down, ytg, yte, cov, rush) -> dict:
    return {"down": np.atleast_1d(np.asarray(down, float)), "ytg": np.atleast_1d(np.asarray(ytg, float)),
            "rz": np.atleast_1d(np.asarray(yte) <= 20), "cov": np.atleast_1d(np.asarray(cov)),
            "rush": np.clip(np.atleast_1d(np.asarray(rush, float)), 3, 6)}


class Review:
    def __init__(self, df: pd.DataFrame, min_eff: float, mobile: dict):
        self.df = df.reset_index(drop=True)
        self.min_eff = min_eff
        d = self.df
        self.yards = d.yards.to_numpy(float)
        self.is_int = d.isInt.to_numpy(bool)
        self.is_sack = (d.action == "sack").to_numpy()
        self.act = d.action.to_numpy()
        self.pres = d.pressure.to_numpy()
        self.req = required(d.down, d.yardsToGo, d.yardsToEndzone)
        self.tier = tiers(self.yards, self.req, self.is_int, self.is_sack)
        self.ctx = context(d.down, d.yardsToGo, d.yardsToEndzone, d.pff_passCoverageType, d.nRush)
        self.mobile_map = mobile
        # Scramble solo se recomienda a QBs corredores y bajo presion (ver limites: sesgo de seleccion).
        self.mobile = d.qbId.map(lambda q: mobile.get(q, False)).to_numpy(bool)
        self.scr_ok = self.mobile & (self.pres == 1)
        self.table = self._compute()

    # ------------------------------------------------------------------ niveles de j medidos con la situacion de i
    def _tiers_for(self, req_i: np.ndarray) -> np.ndarray:
        """Matriz (len(req_i) x n) de niveles de cada jugada j si se hubiera necesitado req_i."""
        y = self.yards[None, :]
        neg = (self.is_int | self.is_sack | (self.yards < 0))[None, :]
        succ = (y >= req_i[:, None]) & ~self.is_int[None, :] & ~self.is_sack[None, :]
        return np.where(succ, 2, np.where(neg, 0, 1))

    def option_probs(self, w: np.ndarray, tiers_m: np.ndarray, actual_tier: np.ndarray | None = None) -> dict:
        """Probabilidades por opcion. w y tiers_m son matrices (m x n)."""
        out = {}
        for k in OPTION_KEYS:
            if k == "throwaway":  # resultado conocido: neutra
                m = w.shape[0]
                r = {"pS": np.zeros(m), "pN": np.ones(m), "pNeg": np.zeros(m), "neff": np.full(m, np.inf),
                     "yards": np.zeros(m)}
                if actual_tier is not None:
                    r["pB"] = (actual_tier < 1).astype(float)
                    r["pW"] = (actual_tier > 1).astype(float)
                out[k] = r
                continue
            wk = w * (self.act == k)[None, :]
            s = wk.sum(1)
            with np.errstate(invalid="ignore", divide="ignore"):
                r = {"pS": (wk * (tiers_m == 2)).sum(1) / s, "pN": (wk * (tiers_m == 1)).sum(1) / s,
                     "pNeg": (wk * (tiers_m == 0)).sum(1) / s, "neff": s * s / (wk * wk).sum(1),
                     "yards": (wk * self.yards[None, :]).sum(1) / s}
                if actual_tier is not None:
                    r["pB"] = (wk * (tiers_m > actual_tier[:, None])).sum(1) / s
                    r["pW"] = (wk * (tiers_m < actual_tier[:, None])).sum(1) / s
            r["neff"] = np.nan_to_num(r["neff"], nan=0.0)
            out[k] = r
        for r in out.values():
            r["score"] = r["pS"] - r["pNeg"]
        return out

    def recommend(self, probs: dict, mobile: np.ndarray) -> np.ndarray:
        score = np.column_stack([probs[k]["score"] for k in OPTION_KEYS])
        yards = np.column_stack([probs[k]["yards"] for k in OPTION_KEYS])
        ok = np.column_stack([probs[k]["neff"] >= self.min_eff for k in OPTION_KEYS])
        ok[:, OPTION_KEYS.index("scramble")] &= mobile
        key = np.where(ok, np.nan_to_num(score, nan=-9) + 1e-3 * np.nan_to_num(yards, nan=0), -np.inf)
        return np.array(OPTION_KEYS)[np.argmax(key, axis=1)]

    # ------------------------------------------------------------------ calculo masivo
    def _compute(self, chunk: int = 400) -> pd.DataFrame:
        d = self.df
        n = len(d)
        cols: dict[str, np.ndarray] = {}
        for a in range(0, n, chunk):
            ii = np.arange(a, min(a + chunk, n))
            ci = {k: v[ii] for k, v in self.ctx.items()}
            w = kernel_matrix(ci, self.ctx)
            w[np.arange(len(ii)), ii] = 0.0
            w *= (self.pres[ii][:, None] == self.pres[None, :])
            probs = self.option_probs(w, self._tiers_for(self.req[ii]), self.tier[ii])
            rec = self.recommend(probs, self.scr_ok[ii])
            block = {"rec": rec}
            for k in OPTION_KEYS:
                for f in ("pS", "pNeg", "score", "neff", "pB", "pW", "yards"):
                    block[f"{f}_{k}"] = probs[k][f]
            for c, v in block.items():
                cols.setdefault(c, np.empty(n, dtype=v.dtype if c == "rec" else float))
                cols[c][ii] = v
        t = pd.DataFrame(cols)
        idx = np.arange(n)
        pick = lambda f, keys: np.array([t[f"{f}_{k}"].to_numpy()[j] if k in OPTION_KEYS else np.nan
                                         for j, k in zip(idx, keys)])
        chosen = np.where(self.act == "pass_unknown", "short", self.act)
        t["chosen"] = chosen
        t["tier"] = self.tier
        for f in ("pS", "pNeg", "score", "neff", "pB", "pW"):
            t[f"{f}_rec"] = pick(f, t.rec)
        t["score_chosen"] = pick("score", chosen)
        t["match"] = t.rec.to_numpy() == chosen
        ci = [wilson(p, nf) if k != "throwaway" else (p, p) for p, nf, k in zip(t.pB_rec, t.neff_rec, t.rec)]
        t["pB_lo"], t["pB_hi"] = [c[0] for c in ci], [c[1] for c in ci]
        t["verdict"] = np.select(
            [t.tier == 2, t.match, t.pB_lo > 0.5, t.pB_hi < 0.5],
            ["exitosa", "coincide", "mejor", "no_mejor"], "incierto")
        return pd.concat([d[["gameId", "playId"]], t], axis=1)

    # ------------------------------------------------------------------ resumen global
    def summary(self, mask: np.ndarray | None = None) -> dict:
        t = self.table if mask is None else self.table[mask]
        p = self.pres if mask is None else self.pres[mask]
        failed = t.tier < 2
        diff = t[failed & ~t.match]

        def block(tt, pp):
            f = tt[tt.tier < 2]
            dd = f[~f.match]
            return {
                "plays": int(len(tt)), "successRate": _r((tt.tier == 2).mean()), "negativeRate": _r((tt.tier == 0).mean()),
                "failed": int(len(f)), "matchRate": _r(tt.match.mean()),
                "betterRate": _r((f.verdict == "mejor").mean()) if len(f) else None,
                "avgPBetter": _r(dd.pB_rec.mean()) if len(dd) else None,
                "scoreGain": _r((dd.score_rec - dd.score_chosen).mean()) if len(dd) else None,
            }
        return {
            **block(t, p),
            "verdicts": {k: _r((t.verdict == k).mean()) for k in ("exitosa", "coincide", "mejor", "incierto", "no_mejor")},
            "byPressure": [{"state": lab, **block(t[m], p[m])} for lab, m in
                           (("Con presión", p == 1), ("Bolsillo limpio", p == 0))],
            "recMix": {k: _r((t.rec == k).mean()) for k in OPTION_KEYS},
            "recMixFailedPressure": {k: _r((t[(p == 1) & failed.to_numpy()].rec == k).mean()) for k in OPTION_KEYS},
            "failedDifferent": int(len(diff)),
        }

    def row(self, game_id: int, play_id: int) -> int | None:
        m = np.flatnonzero((self.df.gameId.to_numpy() == game_id) & (self.df.playId.to_numpy() == play_id))
        return int(m[0]) if len(m) else None

    # ------------------------------------------------------------------ detalle de una jugada
    def detail(self, i: int) -> dict:
        d, t = self.df, self.table
        ci = {k: v[[i]] for k, v in self.ctx.items()}
        w = kernel_matrix(ci, self.ctx)
        w[0, i] = 0.0
        w *= (self.pres == self.pres[i])[None, :]
        tm = self._tiers_for(self.req[[i]])
        probs = self.option_probs(w, tm, self.tier[[i]])
        options = []
        for k in OPTION_KEYS:
            r = {f: _r(v[0]) for f, v in probs[k].items()}
            det = k == "throwaway"
            lo, hi = (r["pB"], r["pB"]) if det else wilson(probs[k]["pB"][0], probs[k]["neff"][0])
            options.append({"key": k, "label": OPTION_LABELS[k], **r, "neff": None if det else r["neff"],
                            "ci": [_r(lo), _r(hi)], "deterministic": det,
                            "lowSample": bool(not det and probs[k]["neff"][0] < self.min_eff),
                            "allowed": bool(k != "scramble" or self.scr_ok[i])})
        rec = t.rec.iat[i]
        mrec = (self.act == rec) & (w[0] > 0)
        top = np.flatnonzero(mrec)
        top = top[np.argsort(-w[0][top])[:6]]
        similar = [{"gameId": int(d.gameId.iat[j]), "playId": int(d.playId.iat[j]), "desc": d.playDescription.iat[j],
                    "team": d.possessionTeam.iat[j], "down": int(d.down.iat[j]), "ytg": int(d.yardsToGo.iat[j]),
                    "yards": float(self.yards[j]), "tier": int(tm[0, j]), "similarity": _r(w[0, j])} for j in top]
        return {
            "required": _r(self.req[i]), "tier": int(self.tier[i]), "tierLabel": TIER_LABELS[int(self.tier[i])],
            "rec": rec, "recLabel": OPTION_LABELS[rec], "chosen": t.chosen.iat[i],
            "chosenLabel": OPTION_LABELS.get(d.action.iat[i], d.action.iat[i]),
            "pBetter": _r(t.pB_rec.iat[i]), "pWorse": _r(t.pW_rec.iat[i]), "ci": [_r(t.pB_lo.iat[i]), _r(t.pB_hi.iat[i])],
            "nEff": None if rec == "throwaway" else _r(t.neff_rec.iat[i]),
            "verdict": t.verdict.iat[i], "match": bool(t.match.iat[i]), "qbMobile": bool(self.mobile[i]),
            "options": options, "similar": similar, "similarTotal": _r(float(w[0].sum())),
        }


def _r(x, nd: int = 4):
    try:
        x = float(x)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(x) or math.isinf(x) else round(x, nd)

