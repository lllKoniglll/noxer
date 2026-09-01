import os
import re
import tempfile
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, Request


GROUP_PREFIX = os.getenv("NOXER_WORKSPACE_GROUP_PREFIX", "noxer-workspace-")
DATA_ROOT = Path(os.getenv("NOXER_DATA_DIR", "/data/noxer")).resolve()
MAX_FILE_BYTES = int(os.getenv("NOXER_MAX_FILE_BYTES", str(25 * 1024 * 1024)))
ALLOWED_SUFFIXES = {".se", ".sie", ".se4"}
_SAFE_NAME = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._ -]{0,180}$")


@dataclass(frozen=True)
class WorkspaceIdentity:
    username: str
    group: str
    path: Path


def _header(request: Request, name: str) -> str:
    return request.headers.get(name, "").strip()


def _groups(request: Request) -> set[str]:
    raw = _header(request, "x-authentik-groups")
    # Authentik emits pipe-separated groups. Commas are accepted too for
    # compatibility with alternate proxy/header formatting.
    return {part.strip().strip('"\'[]') for part in re.split(r"[|,]", raw) if part.strip().strip('"\'[]')}


def identity_from_request(request: Request) -> WorkspaceIdentity:
    username = _header(request, "x-authentik-username")
    if not username:
        raise HTTPException(status_code=401, detail="Authentik-identitet saknas")

    matching = sorted(group for group in _groups(request) if group.startswith(GROUP_PREFIX))
    if len(matching) != 1:
        detail = "Användaren saknar en workspace-grupp" if not matching else "Användaren tillhör flera workspace-grupper"
        raise HTTPException(status_code=403, detail=detail)

    group = matching[0]
    suffix = group[len(GROUP_PREFIX):]
    if not suffix or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", suffix):
        raise HTTPException(status_code=403, detail="Ogiltig workspace-grupp")
    return WorkspaceIdentity(username=username, group=group, path=(DATA_ROOT / "groups" / suffix).resolve())


def safe_filename(filename: str) -> str:
    name = Path(filename).name
    if name != filename or not _SAFE_NAME.fullmatch(name) or Path(name).suffix.lower() not in ALLOWED_SUFFIXES:
        raise HTTPException(status_code=400, detail="Ogiltigt SIE-filnamn")
    return name


def workspace_files(identity: WorkspaceIdentity) -> list[Path]:
    if not identity.path.is_relative_to(DATA_ROOT / "groups"):
        raise HTTPException(status_code=500, detail="Ogiltig workspace-sökväg")
    identity.path.mkdir(parents=True, exist_ok=True)
    return sorted(path for path in identity.path.iterdir() if path.is_file() and path.suffix.lower() in ALLOWED_SUFFIXES)


def write_file(identity: WorkspaceIdentity, filename: str, content: bytes) -> Path:
    target = identity.path / safe_filename(filename)
    if len(content) > MAX_FILE_BYTES:
        raise HTTPException(status_code=413, detail=f"Filen är större än {MAX_FILE_BYTES} byte")
    identity.path.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(dir=identity.path, prefix=".upload-", delete=False) as temporary:
        temporary.write(content)
        temporary.flush()
        os.fsync(temporary.fileno())
        temporary_path = Path(temporary.name)
    os.replace(temporary_path, target)
    return target


def file_for_download(identity: WorkspaceIdentity, filename: str) -> Path:
    target = (identity.path / safe_filename(filename)).resolve()
    if not target.is_relative_to(identity.path) or not target.is_file():
        raise HTTPException(status_code=404, detail="Filen finns inte")
    return target
