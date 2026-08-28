"""Export a checkpoint gallery for the app (Slice 7): one run, several checkpoints,
several tracks, a manifest.

    uv run python -m apex_trainer.debug.export_gallery runs/e7-gamma0995-20m \\
        --checkpoints 50000,100000,250000,1000000,2000000,8000000,13000000,20000000 \\
        --tracks track_a --checkpoints-b 2000000,6000000,8000000,11000000,13000000,20000000 \\
        --hz 30 --out ../app/public/gallery/e7 --title "E7 — γ 0.995, Track A only, 20M steps"

Deterministic episodes (no jitter, seed 0). Files are decimated to ``--hz``
(``t[i] == i·dt`` preserved). The manifest validates against
``gallery.schema.json`` (generated from the app's Zod schema) in tests.
"""

from __future__ import annotations

import argparse
import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from apex_trainer.config import env_config_from_dict
from apex_trainer.env import ApexDriveEnv
from apex_trainer.policies import CheckpointPolicy
from apex_trainer.runs import RunPaths, checkpoint_path, open_run, read_config_snapshot
from apex_trainer.trajectory import physics_config_hash, record_episode, write_trajectory

GALLERY_SCHEMA_VERSION = 1


def _label(step: int, labels: dict[int, str]) -> str:
    if step in labels:
        return labels[step]
    return f"{step / 1e6:.2g}M" if step >= 1_000_000 else f"{step // 1000}k"


def export_gallery(
    paths: RunPaths,
    *,
    plan: dict[str, list[int]],
    out_dir: Path,
    hz: float,
    title: str,
    description: str,
    labels: dict[int, str],
    notes: dict[int, str],
    seed: int = 0,
) -> dict[str, Any]:
    """``plan`` maps track id → checkpoint steps to export on that track."""
    snap = read_config_snapshot(paths)
    env_cfg = env_config_from_dict(snap["env"])
    dt_sim = env_cfg.sim.physics.dt
    decimate = round(1.0 / (hz * dt_sim))
    if abs(decimate * hz * dt_sim - 1.0) > 1e-9 or decimate < 1:
        raise ValueError(f"--hz must divide the sim rate {1 / dt_sim:.0f} Hz")
    out_dir.mkdir(parents=True, exist_ok=True)

    steps = sorted({s for lst in plan.values() for s in lst})
    checkpoints: list[dict[str, Any]] = []
    for step in steps:
        ckpt = checkpoint_path(paths, step)
        if not ckpt.exists():
            raise FileNotFoundError(ckpt)
        policy = CheckpointPolicy(ckpt, name=f"ppo@{step}")
        entries = []
        for track, wanted in plan.items():
            if step not in wanted:
                continue
            env = ApexDriveEnv(track, env_cfg)
            doc = record_episode(
                env,
                policy,
                seed=seed,
                run_id=paths.run_id,
                checkpoint_step=step,
                decimate=decimate,
            )
            fname = f"{paths.run_id}-{step}-{track}.trajectory.json"
            write_trajectory(doc, out_dir / fname)
            lap_times = [lap["lapTimeSec"] for lap in doc["laps"]]
            entries.append(
                {
                    "trackId": track,
                    "file": fname,
                    "crashed": doc["meta"]["crashed"],
                    "laps": len(lap_times),
                    "bestLapSec": min(lap_times) if lap_times else None,
                    "lapTimesSec": lap_times,
                    "distanceM": float(env.world.progress.s),
                    "sampleHz": hz,
                }
            )
        checkpoints.append(
            {
                "step": step,
                "label": _label(step, labels),
                "note": notes.get(step, ""),
                "entries": entries,
            }
        )

    manifest = {
        "schemaVersion": GALLERY_SCHEMA_VERSION,
        "runId": paths.run_id,
        "title": title,
        "description": description,
        "physicsConfigHash": physics_config_hash(env_cfg),
        "config": {
            "gamma": snap["ppo"]["gamma"],
            "ent_coef": snap["ppo"]["ent_coef"],
            "tracks": ",".join(snap["train"]["tracks"]),
            "seed": snap["seed"],
            "n_envs": snap["train"]["n_envs"],
        },
        "tracks": list(plan.keys()),
        "checkpoints": checkpoints,
        "createdAt": datetime.now(UTC).isoformat(),
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=1) + "\n", encoding="utf-8")
    return manifest


def _parse_steps(text: str | None) -> list[int]:
    return [int(x) for x in text.split(",")] if text else []


def _parse_map(items: list[str]) -> dict[int, str]:
    out: dict[int, str] = {}
    for item in items:
        step, _, text = item.partition("=")
        out[int(step)] = text
    return out


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("run", type=Path)
    p.add_argument("--checkpoints", required=True, help="steps for the primary track")
    p.add_argument("--tracks", default="track_a", help="primary track(s), comma-separated")
    p.add_argument("--checkpoints-b", help="steps for track_b")
    p.add_argument("--checkpoints-mirror", help="steps for track_a_mirror")
    p.add_argument("--hz", type=float, default=30.0)
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--title", required=True)
    p.add_argument("--description", default="")
    p.add_argument("--label", action="append", default=[], metavar="STEP=TEXT")
    p.add_argument("--note", action="append", default=[], metavar="STEP=TEXT")
    args = p.parse_args(argv)

    plan: dict[str, list[int]] = {}
    for t in args.tracks.split(","):
        plan[t] = _parse_steps(args.checkpoints)
    if args.checkpoints_b:
        plan["track_b"] = _parse_steps(args.checkpoints_b)
    if args.checkpoints_mirror:
        plan["track_a_mirror"] = _parse_steps(args.checkpoints_mirror)
    manifest = export_gallery(
        open_run(args.run),
        plan=plan,
        out_dir=args.out,
        hz=args.hz,
        title=args.title,
        description=args.description,
        labels=_parse_map(args.label),
        notes=_parse_map(args.note),
    )
    n = sum(len(c["entries"]) for c in manifest["checkpoints"])
    print(
        f"wrote {args.out / 'manifest.json'}: {len(manifest['checkpoints'])} checkpoints, {n} files"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
