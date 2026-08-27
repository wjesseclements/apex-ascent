"""Slice 1 placeholder: proves pytest is wired and the package imports.

Replaced by real sim tests in Slice 2.
"""

import apex_trainer
from apex_trainer import cli


def test_package_imports() -> None:
    assert apex_trainer.__version__ == "0.1.0"


def test_cli_stubs_report_their_slice(capsys) -> None:
    assert cli.train() == 2
    assert cli.evaluate() == 2
    assert cli.tensorboard() == 2
    err = capsys.readouterr().err
    assert "train: not implemented until Slice 4" in err
    assert "evaluate: not implemented until Slice 3" in err
