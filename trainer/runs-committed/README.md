# runs-committed/

Trimmed copies of the runs the write-up quotes — config snapshot, metadata and
the checkpoints named in FINDINGS.md — so a stranger can reproduce an
evaluation without training (SPEC §12: "two commands"). TensorBoard events and
the other checkpoints stay local to the machine that trained them.

| dir | source run | checkpoints | what it is |
|---|---|---|---|
| `e7` | `e7-gamma0995-20m` | 8M (competence, generalist), 13M (specialist) | γ 0.995, SPEC car, Track A only, 20M steps |
| `e8a-lowdrag` | `e8a-lowdrag-s0` | 5.01M | γ 0.995, low-drag preset (0.05/s): the one that brakes |

```
cd trainer && uv sync
uv run evaluate runs-committed/e7 --checkpoint 8000000 --track track_b --episodes 10 --jitter
```
