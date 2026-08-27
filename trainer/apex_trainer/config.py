"""The one typed config module (CLAUDE.md trainer rule 2).

Every constant the trainer uses lives here, with its unit and a one-line reason.
No magic numbers anywhere else. Configs are frozen dataclasses so they can be
hashed, compared, and serialized into every run directory.

Grows per slice: physics (Slice 2), rays/observation/reward/episode (Slice 3),
PPO deviations from SB3 defaults (Slice 4).
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from typing import Any


@dataclass(frozen=True)
class PhysicsConfig:
    """Car model + traction circle (SPEC §3.1–3.2). Units: m, s, rad."""

    dt: float = 1.0 / 60.0
    """Fixed simulation timestep, s. SPEC §3.1: no variable dt anywhere."""

    traction_accel_max: float = 20.0
    """A, m/s²: the grip budget a_long² + a_lat² ≤ A². Matches the GA's lateral cap
    so speeds land in a familiar range (SPEC §3.2)."""

    throttle_accel_max: float = 12.0
    """m/s²: full-throttle longitudinal acceleration. Engine-limited below A, as in
    apex-evolve (approved Slice 2 decision) — keeps straight-line speeds comparable."""

    brake_accel_max: float = 20.0
    """m/s²: full-brake deceleration. Equal to A: brakes can saturate the grip circle,
    which is what makes trading braking for cornering (trail-braking) the optimal
    thing to discover (approved Slice 2 decision)."""

    v_max: float = 30.0
    """m/s: hard speed clamp, GA parity (approved). Terminal speed from drag alone
    (throttle_accel_max / drag = 40 m/s) is above this, so v_max is reachable."""

    drag: float = 0.3
    """1/s: linear drag, v *= (1 − drag·dt) each tick, GA parity (approved)."""

    steer_rate: float = 2.5
    """rad/s: commanded yaw rate at full steer and v = v_max, GA parity. The circle
    then limits lateral accel v·ω to ≤ A, so at speed the car understeers unless it
    slows: at v_max the raw command implies 75 m/s² lateral, far over A = 20."""

    start_speed: float = 2.0
    """m/s: initial speed on the start line, avoids a degenerate standing start
    (SPEC §3.4)."""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


DEFAULT_PHYSICS = PhysicsConfig()


@dataclass(frozen=True)
class RayConfig:
    """Raycast sensor fan (SPEC §4.1). Offsets are in geometry terms: CCW-positive,
    so +half_fan is the car's LEFT and −half_fan its RIGHT (see ``apex_trainer.sim``)."""

    count: int = 12
    """SPEC §4.1: 12 rays — more than the GA's 7 for better track vision."""

    half_fan: float = math.pi / 2
    """rad: rays span −half_fan … +half_fan inclusive (SPEC: −90° … +90°)."""

    max_length: float = 60.0
    """m: readings clamp here (≈ 2 s of look-ahead at v_max; Track A's longest
    straight is 80 m). Same value as apex-evolve so ray readings are comparable."""

    def offsets(self) -> tuple[float, ...]:
        """Evenly spaced offsets from −half_fan (right) to +half_fan (left)."""
        if self.count < 2:
            return (0.0,)
        step = 2 * self.half_fan / (self.count - 1)
        return tuple(-self.half_fan + i * step for i in range(self.count))

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


DEFAULT_RAYS = RayConfig()


@dataclass(frozen=True)
class SimConfig:
    """Everything the headless sim needs for one world (Slice 2). The Gymnasium env
    (Slice 3) adds observation/reward/episode configs around this."""

    physics: PhysicsConfig = DEFAULT_PHYSICS
    rays: RayConfig = DEFAULT_RAYS

    def to_dict(self) -> dict[str, Any]:
        return {"physics": self.physics.to_dict(), "rays": self.rays.to_dict()}


DEFAULT_SIM = SimConfig()


@dataclass(frozen=True)
class ObservationConfig:
    """Observation vector v0 (SPEC §4.1). Any change to the vector is a VERSION BUMP
    of ``version``, not an edit — the string travels with every config snapshot and
    trajectory file so checkpoints can never be fed a vector they weren't trained on.

    Layout (16 floats, in order):
      [0:12]  ray distances / rays.max_length            ∈ [0, 1], right → left
      [12]    forward speed / physics.v_max              ∈ [0, 1]
      [13]    lateral acceleration / traction_accel_max  ∈ [−1, 1]  (+ = left)
      [14:16] previous applied action (steer, drive)     ∈ [−1, 1]
    """

    version: str = "v0"
    """Bump on any change to the layout above (approved: element 13 is a_lat / A —
    the slip signal trail-braking needs; SPEC §4.1's 'lateral speed' is superseded)."""

    def size(self, rays: RayConfig) -> int:
        return rays.count + 4

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class RewardConfig:
    """Reward v0 (SPEC §5): dense progress + terminal crash penalty. No explicit time
    term (discounting + progress-per-step already price time); no lap bonus (the GA
    found it redundant; revisit only with evidence)."""

    progress_scale: float = 1.0
    """Reward per metre of centerline progress. 1.0 ⇒ a competent lap ≈ +440, a step
    at 25 m/s ≈ +0.42 (SPEC §5 magnitude check)."""

    crash_penalty: float = 10.0
    """Subtracted on the crash step. Death must outweigh short-term greed: ~24 steps of
    full-speed progress."""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class EpisodeConfig:
    """Episode rules (SPEC §3.4): crash terminates, laps don't, a step limit truncates."""

    max_steps: int = 3600
    """60 simulated seconds at 60 Hz — enough for two competent laps; multi-lap
    episodes teach sustained pace."""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class EnvConfig:
    """Everything the Gymnasium env needs (Slice 3). PPO settings are separate (Slice 4)."""

    sim: SimConfig = DEFAULT_SIM
    observation: ObservationConfig = ObservationConfig()
    reward: RewardConfig = RewardConfig()
    episode: EpisodeConfig = EpisodeConfig()

    def to_dict(self) -> dict[str, Any]:
        return {
            "sim": self.sim.to_dict(),
            "observation": self.observation.to_dict(),
            "reward": self.reward.to_dict(),
            "episode": self.episode.to_dict(),
        }


DEFAULT_ENV = EnvConfig()


@dataclass(frozen=True)
class PPOConfig:
    """PPO hyperparameters (SPEC §6): Stable-Baselines3 defaults, with every
    deviation recorded here with its reason. Tuning is Slice 6 work with TensorBoard
    evidence. First Slice 6 hypothesis: gamma 0.99 at 60 Hz is a ~1.7 s horizon."""

    learning_rate: float = 3e-4
    """SB3 default."""
    n_steps: int = 2048
    """Rollout length per env before each update. SB3 default."""
    batch_size: int = 64
    """SB3 default."""
    n_epochs: int = 10
    """SB3 default."""
    gamma: float = 0.99
    """Discount. SB3 default; flagged for Slice 6 (short horizon at 60 Hz)."""
    gae_lambda: float = 0.95
    """SB3 default."""
    clip_range: float = 0.2
    """SB3 default."""
    ent_coef: float = 0.0
    """SB3 default."""
    vf_coef: float = 0.5
    """SB3 default."""
    max_grad_norm: float = 0.5
    """SB3 default."""
    net_arch: tuple[int, ...] = (64, 64)
    """Hidden layers for both policy and value nets. SB3 MlpPolicy default."""
    device: str = "cpu"
    """SPEC §6: CPU only. Networks are tiny."""
    torch_threads: int = 1
    """Fixed thread count for the SPEC §9 single-machine reproducibility claim."""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> PPOConfig:
        d = dict(d)
        d["net_arch"] = tuple(d["net_arch"])
        return cls(**d)


@dataclass(frozen=True)
class TrainConfig:
    """Training-loop plumbing (not hyperparameters)."""

    n_envs: int = 8
    """Parallel envs (SPEC §6: 8–16). Deviates from SB3's single env for throughput."""
    vec_env: str = "dummy"
    """'dummy' (in-process) or 'subproc'. Default chosen by the Slice 4 benchmark."""
    checkpoint_interval: int = 50_000
    """Env steps between checkpoints (SPEC §6 default 50k)."""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> TrainConfig:
        return cls(**d)


def env_config_from_dict(d: dict[str, Any]) -> EnvConfig:
    """Rebuild an EnvConfig from a config snapshot (inverse of EnvConfig.to_dict)."""
    sim = SimConfig(
        physics=PhysicsConfig(**d["sim"]["physics"]), rays=RayConfig(**d["sim"]["rays"])
    )
    return EnvConfig(
        sim=sim,
        observation=ObservationConfig(**d["observation"]),
        reward=RewardConfig(**d["reward"]),
        episode=EpisodeConfig(**d["episode"]),
    )


DEFAULT_PPO = PPOConfig()
DEFAULT_TRAIN = TrainConfig()
