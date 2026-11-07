"""
Extrai a telemetria oficial (F1 Live Timing, via FastF1) da volta mais rápida
de uma sessão em Interlagos e grava research/raw/telemetry_<ano>_<sessao>.json.

Uso:  research/.venv/Scripts/python.exe scripts/telemetry/extract_telemetry.py 2025 Q
"""
import json
import sys
from pathlib import Path

import fastf1
import numpy as np

year = int(sys.argv[1]) if len(sys.argv) > 1 else 2025
sess_id = sys.argv[2] if len(sys.argv) > 2 else "Q"

cache = Path("research/f1cache")
cache.mkdir(parents=True, exist_ok=True)
fastf1.Cache.enable_cache(str(cache))

session = fastf1.get_session(year, "São Paulo", sess_id)
session.load(laps=True, telemetry=True, weather=False, messages=False)
lap = session.laps.pick_fastest()
tel = lap.get_telemetry().add_distance()

ci = session.get_circuit_info()
corners = [
    {
        "number": int(r.Number),
        "letter": str(r.Letter) if isinstance(r.Letter, str) else "",
        "x": float(r.X),
        "y": float(r.Y),
        "angle": float(r.Angle),
        "distance": float(r.Distance),
    }
    for r in ci.corners.itertuples()
]


def arr(col, nd=2):
    return [None if (v is None or (isinstance(v, float) and np.isnan(v))) else round(float(v), nd) for v in tel[col].tolist()]


out = {
    "year": year,
    "session": sess_id,
    "event": session.event["EventName"],
    "date": str(session.date),
    "driver": str(lap["Driver"]),
    "team": str(lap["Team"]),
    "lapTime": str(lap["LapTime"]),
    "lapNumber": int(lap["LapNumber"]),
    "compound": str(lap["Compound"]),
    "circuitRotation": float(ci.rotation),
    "corners": corners,
    "distance": arr("Distance", 1),
    "speed": arr("Speed", 1),
    "gear": arr("nGear", 0),
    "throttle": arr("Throttle", 0),
    "brake": [1 if bool(b) else 0 for b in tel["Brake"].tolist()],
    "drs": arr("DRS", 0),
    "x": arr("X", 0),
    "y": arr("Y", 0),
    "z": arr("Z", 0),
}
dst = Path(f"research/raw/telemetry_{year}_{sess_id}.json")
dst.write_text(json.dumps(out))
print("ok", dst, out["driver"], out["team"], out["lapTime"], "amostras", len(out["distance"]), "curvas", len(corners))
