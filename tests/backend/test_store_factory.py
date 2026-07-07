import pytest

from backend.store_factory import create_store
from backend.stores.json_file_store import JsonFileStore
from backend.stores.mariadb_store import MariaDbStore


def test_create_store_defaults_to_json(monkeypatch):
    monkeypatch.delenv("FLEET_STORE_BACKEND", raising=False)

    assert isinstance(create_store(), JsonFileStore)


def test_create_store_allows_explicit_json(monkeypatch):
    monkeypatch.setenv("FLEET_STORE_BACKEND", "json")

    assert isinstance(create_store(), JsonFileStore)


def test_create_store_allows_explicit_mariadb_without_connecting(monkeypatch):
    monkeypatch.setenv("FLEET_STORE_BACKEND", "mariadb")
    monkeypatch.setenv("FLEET_MARIADB_HOST", "127.0.0.1")
    monkeypatch.setenv("FLEET_MARIADB_PORT", "3306")
    monkeypatch.setenv("FLEET_MARIADB_DATABASE", "clash_fleet_manager_test")
    monkeypatch.setenv("FLEET_MARIADB_USER", "fleet_test_user")
    monkeypatch.setenv("FLEET_MARIADB_PASSWORD", "not-used-by-this-test")

    assert isinstance(create_store(), MariaDbStore)


def test_create_store_rejects_unknown_backend(monkeypatch):
    monkeypatch.setenv("FLEET_STORE_BACKEND", "sqlite")

    with pytest.raises(RuntimeError, match="Unknown FLEET_STORE_BACKEND"):
        create_store()
