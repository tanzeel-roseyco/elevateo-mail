"""Independent task-owned finalization stages, including interrupt paths."""
from __future__ import annotations

from collections.abc import Callable


def finish_fixture(primary: BaseException | None,
                   stages: list[tuple[str, Callable[[], object]]],
                   record: Callable[[list[str]], object]) -> None:
    # AIDEV-NOTE: Neither secret-file removal nor evidence failure may skip fixture teardown or mask an interrupt.
    errors: list[str] = []
    for name, action in stages:
        try:
            result = action()
            if isinstance(result, list):
                errors.extend(str(error) for error in result)
        except BaseException as error:
            errors.append(f'{name}: {type(error).__name__}: {error}')
    try:
        record(errors)
    except BaseException as error:
        errors.append(f'cleanup evidence: {type(error).__name__}: {error}')
    if primary is not None:
        raise primary
    if errors:
        raise RuntimeError('fixture cleanup failed: ' + '; '.join(errors))
