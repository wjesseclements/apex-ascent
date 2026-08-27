"""apex_trainer.sim — the pure, headless simulation core.

Nothing in this package imports Gymnasium, Stable-Baselines3, numpy, matplotlib,
or anything that does IO. It is plain Python + ``math``: physics, geometry,
progress, raycasts — all unit- and property-tested on the real tracks.

Coordinate conventions (SPEC §3.3 — locked, stated once, here)
==============================================================

- **x right, y up.** World space, meters. The app's canvas layer owns the
  y-flip into screen space; the trainer never thinks about screens.
- **Heading** in radians, **counter-clockwise from +x**. Direction of travel
  for heading θ is ``(cos θ, sin θ)``.
- **Angles are wrapped to (-π, π]** by :func:`apex_trainer.sim.geometry.wrap_angle`.
  Exactly π is representable; exactly -π is not (it wraps to +π).
- For a unit direction ``d = (dx, dy)``: **left normal** = ``(-dy, dx)``
  (rotate +90°), **right normal** = ``(dy, -dx)``.
- **Track arc-length ``s``** in meters from the start line, increasing in the
  direction of travel (= centerline point order). Speeds in m/s.
- **Control-space signs** (SPEC §4.2): ``steer`` +1 = full right, -1 = full
  left; ``drive`` +1 = full throttle, -1 = full brake. Because geometry angles
  are counter-clockwise-positive, "right" is a *negative* heading rate; that
  sign flip happens exactly once, in :mod:`apex_trainer.sim.car`.
- **Ray fan offsets** are expressed in geometry terms: a positive offset is
  counter-clockwise from the heading, i.e. the car's *left*.
- **Fixed timestep** ``dt = 1/60 s``. No variable dt, no wall-clock, anywhere.
"""
