"""`uv run tensorboard --logdir runs` must work: the TensorBoard package's console
script has to be present on the project venv's PATH. (Slice 4 found that a same-named
project entry point had shadowed it and, once removed, left the venv without either.)"""

from __future__ import annotations

import shutil
import subprocess


def test_tensorboard_console_script_is_on_path() -> None:
    exe = shutil.which("tensorboard")
    assert exe is not None, "tensorboard console script missing from the venv"
    out = subprocess.run([exe, "--version"], capture_output=True, text=True, timeout=60)
    assert out.returncode == 0
    assert out.stdout.strip().split(".")[0].isdigit()
