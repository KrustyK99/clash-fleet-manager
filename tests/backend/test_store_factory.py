import pytest

from backend.store_factory import create_store
from backend.stores.json_file_store import JsonFileStore


def test_create_store_defaults_to_json(monkeypatch):
    monkeypatch.delenv("FLEET_STORE_BACKEND", raising=False)

    assert isinstance(create_store(), JsonFileStore)


def test_create_store_allows_explicit_json(monkeypatch):
    monkeypatch.setenv("FLEET_STORE_BACKEND", "json")

    assert isinstance(create_store(), JsonFileStore)


def test_create_store_rejects_unknown_backend(monkeypatch):
    monkeypatch.setenv("FLEET_STORE_BACKEND", "sqlite")

    with pytest.raises(RuntimeError, match="Unknown FLEET_STORE_BACKEND"):
        create_store()
