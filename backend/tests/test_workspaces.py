import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.main import app
from app.workspaces import safe_filename


client = TestClient(app)


def auth_headers(*groups: str):
    return {"X-Authentik-Username": "alice", "X-Authentik-Groups": "|".join(groups)}


def test_workspace_requires_exactly_one_workspace_group():
    assert client.get("/files", headers=auth_headers("noxer-users")).status_code == 403
    assert client.get("/files", headers=auth_headers("noxer-workspace-a", "noxer-workspace-b")).status_code == 403


def test_filename_rejects_path_traversal():
    with pytest.raises(HTTPException):
        safe_filename("../private.se")
    with pytest.raises(HTTPException):
        safe_filename("report.csv")


def test_group_isolation(tmp_path, monkeypatch):
    monkeypatch.setattr("app.workspaces.DATA_ROOT", tmp_path)
    first = client.post("/files", headers=auth_headers("noxer-workspace-a"), files={"file": ("shared.se", b"#FLAGGA 0")})
    second = client.get("/files", headers=auth_headers("noxer-workspace-b"))
    assert first.status_code == 200
    assert second.status_code == 200
    assert second.json()["files"] == []
