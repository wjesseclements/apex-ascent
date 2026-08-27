"""CLI stubs name the slice that implements them (replaced as slices land)."""

import pytest

from apex_trainer import cli


def test_cli_stubs_report_their_slice(capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.train() == 2
    assert cli.evaluate() == 2
    assert cli.tensorboard() == 2
    err = capsys.readouterr().err
    assert "train: not implemented until Slice 4" in err
    assert "evaluate: not implemented until Slice 3" in err
