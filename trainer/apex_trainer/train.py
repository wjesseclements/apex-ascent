"""PPO training on ApexDrive-v0 with reconstructible run directories.

``train(...)`` is the whole loop: build (or reopen) a run dir, seed everything,
make the vectorized envs, construct PPO (or load the latest checkpoint), learn
until the cumulative step target, checkpoint along the way, and record a
session in metadata. ``--steps`` is always a *total*: resuming a 500k run with
``--steps 2000000`` trains 1.5M more (approved: cumulative semantics).
"""

from __future__ import annotations

from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import gymnasium as gym
from stable_baselines3 import PPO
from stable_baselines3.common.callbacks import BaseCallback, CheckpointCallback
from stable_baselines3.common.logger import configure
from stable_baselines3.common.monitor import Monitor
from stable_baselines3.common.vec_env import DummyVecEnv, SubprocVecEnv, VecEnv

from apex_trainer.callbacks import LapMetricsCallback
from apex_trainer.config import (
    DEFAULT_ENV,
    DEFAULT_PPO,
    DEFAULT_TRAIN,
    EnvConfig,
    PPOConfig,
    TrainConfig,
    env_config_from_dict,
)
from apex_trainer.env import ApexDriveEnv
from apex_trainer.runs import (
    CHECKPOINT_PREFIX,
    DEFAULT_RUNS_DIR,
    RunPaths,
    checkpoint_path,
    create_run,
    latest_checkpoint,
    make_run_id,
    new_metadata,
    open_run,
    python_argv,
    read_config_snapshot,
    read_metadata,
    write_config_snapshot,
    write_metadata,
)
from apex_trainer.seeding import seed_everything

VEC_ENV_KINDS = ("dummy", "subproc")


def make_env_fn(
    tracks: Sequence[str], env_cfg: EnvConfig, seed: int, rank: int
) -> Callable[[], gym.Env[Any, Any]]:
    def _make() -> gym.Env[Any, Any]:
        env = ApexDriveEnv(tuple(tracks), env_cfg)
        env.reset(seed=seed + rank)
        return Monitor(env)

    return _make


def make_vec_env(
    tracks: Sequence[str], env_cfg: EnvConfig, n_envs: int, seed: int, kind: str
) -> VecEnv:
    fns = [make_env_fn(tracks, env_cfg, seed, rank) for rank in range(n_envs)]
    if kind == "dummy":
        return DummyVecEnv(fns)
    if kind == "subproc":
        return SubprocVecEnv(fns, start_method="spawn")
    raise ValueError(f"unknown vec_env kind {kind!r}; choose from {VEC_ENV_KINDS}")


def build_ppo(vec_env: VecEnv, ppo_cfg: PPOConfig, seed: int) -> PPO:
    return PPO(
        "MlpPolicy",
        vec_env,
        learning_rate=ppo_cfg.learning_rate,
        n_steps=ppo_cfg.n_steps,
        batch_size=ppo_cfg.batch_size,
        n_epochs=ppo_cfg.n_epochs,
        gamma=ppo_cfg.gamma,
        gae_lambda=ppo_cfg.gae_lambda,
        clip_range=ppo_cfg.clip_range,
        ent_coef=ppo_cfg.ent_coef,
        vf_coef=ppo_cfg.vf_coef,
        max_grad_norm=ppo_cfg.max_grad_norm,
        policy_kwargs={"net_arch": list(ppo_cfg.net_arch)},
        seed=seed,
        device=ppo_cfg.device,
        verbose=0,
    )


@dataclass(frozen=True)
class TrainArgs:
    steps: int
    """Cumulative total env steps to reach."""
    seed: int = 0
    track: str = "track_a"
    runs_dir: Path = DEFAULT_RUNS_DIR
    run_id: str | None = None
    resume: Path | None = None
    env_cfg: EnvConfig = DEFAULT_ENV
    ppo_cfg: PPOConfig = DEFAULT_PPO
    train_cfg: TrainConfig = DEFAULT_TRAIN
    log_stdout: bool = True


@dataclass(frozen=True)
class TrainResult:
    paths: RunPaths
    steps_before: int
    steps_after: int


def train(args: TrainArgs) -> TrainResult:
    if args.resume is not None:
        paths = open_run(args.resume)
        snap = read_config_snapshot(paths)
        track = str(snap["track"])
        seed = int(snap["seed"])
        env_cfg = env_config_from_dict(snap["env"])
        ppo_cfg = PPOConfig.from_dict(snap["ppo"])
        train_cfg = TrainConfig.from_dict(snap["train"])
        metadata = read_metadata(paths)
    else:
        track, seed = args.track, args.seed
        env_cfg, ppo_cfg, train_cfg = args.env_cfg, args.ppo_cfg, args.train_cfg
        run_id = args.run_id or make_run_id(track, seed)
        paths = create_run(args.runs_dir, run_id)
        write_config_snapshot(
            paths, env_cfg=env_cfg, ppo_cfg=ppo_cfg, train_cfg=train_cfg, seed=seed, track=track
        )
        metadata = new_metadata(paths, track=track, seed=seed, argv=python_argv())
        write_metadata(paths, metadata)

    seed_everything(seed, ppo_cfg.torch_threads)
    tracks = train_cfg.tracks if track in train_cfg.tracks else (track, *train_cfg.tracks)
    vec_env = make_vec_env(tracks, env_cfg, train_cfg.n_envs, seed, train_cfg.vec_env)
    try:
        resumed_from = 0
        if args.resume is not None:
            latest = latest_checkpoint(paths)
            if latest is None:
                raise FileNotFoundError(f"no checkpoint to resume from in {paths.checkpoints_dir}")
            resumed_from, ckpt = latest
            model = PPO.load(ckpt, env=vec_env, device=ppo_cfg.device, seed=seed)
        else:
            model = build_ppo(vec_env, ppo_cfg, seed)

        # SB3's csv format rewrites progress.csv; keep the previous session's copy so
        # the run stays fully reconstructible (TensorBoard events accumulate anyway).
        prev_csv = paths.tb_dir / "progress.csv"
        if prev_csv.exists():
            prev_csv.rename(paths.tb_dir / f"progress_until_{resumed_from}.csv")
        formats = ["tensorboard", "csv"] + (["stdout"] if args.log_stdout else [])
        model.set_logger(configure(str(paths.tb_dir), formats))

        steps_before = int(model.num_timesteps)
        remaining = args.steps - steps_before
        session = {
            "started_at": datetime.now(UTC).isoformat(),
            "resumed_from_steps": resumed_from if args.resume is not None else None,
            "target_steps": args.steps,
            "argv": python_argv(),
        }
        if remaining > 0:
            callbacks: list[BaseCallback] = [
                CheckpointCallback(
                    save_freq=max(1, train_cfg.checkpoint_interval // train_cfg.n_envs),
                    save_path=str(paths.checkpoints_dir),
                    name_prefix=CHECKPOINT_PREFIX,
                ),
                LapMetricsCallback(),
            ]
            model.learn(
                total_timesteps=remaining,
                callback=callbacks,
                reset_num_timesteps=args.resume is None,
            )
            model.save(checkpoint_path(paths, int(model.num_timesteps)))
        steps_after = int(model.num_timesteps)
        session["finished_at"] = datetime.now(UTC).isoformat()
        session["final_steps"] = steps_after
        metadata["sessions"].append(session)
        write_metadata(paths, metadata)
    finally:
        vec_env.close()
    return TrainResult(paths=paths, steps_before=steps_before, steps_after=steps_after)
