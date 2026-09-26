import os
import re
import tempfile
import json
from dataclasses import dataclass
from pathlib import Path

from fastapi import HTTPException, Request


GROUP_PREFIX = os.getenv("NOXER_WORKSPACE_GROUP_PREFIX", "noxer-workspace-")
DATA_ROOT = Path(os.getenv("NOXER_DATA_DIR", "/data/noxer")).resolve()
MAX_FILE_BYTES = int(os.getenv("NOXER_MAX_FILE_BYTES", str(25 * 1024 * 1024)))
CATEGORIES_FILENAME = "categories.json"
ALLOWED_SUFFIXES = {".se", ".sie", ".se4", ".xls"}


@dataclass(frozen=True)
class WorkspaceIdentity:
    username: str
    group: str
    path: Path


DEFAULT_CATEGORIES = [
    {"id": "mens-representation", "label": "Herrrepresentation (A-lag och U-lag)", "accounts": ["4061", "7110", "7111", "7114", "7118"]},
    {"id": "womens-representation", "label": "Damrepresentation", "accounts": ["4062", "7113", "4611"]},
    {"id": "fees", "label": "Medlems- och träningsavgifter", "accounts": ["301", "305", "361"]},
    {"id": "grants", "label": "Bidrag och sponsring", "accounts": ["321", "371", "372", "3812"]},
    {"id": "sales", "label": "Kiosk, café och försäljning", "accounts": ["331", "332", "333", "351", "3814", "451"]},
    {"id": "events", "label": "Cuper och arrangemang", "accounts": ["3811", "3815", "4055", "415", "431", "432", "481"]},
    {"id": "facilities", "label": "Planer, lokal och arena", "accounts": ["4058", "501", "507", "582"]},
    {"id": "football", "label": "Domare, licenser och tävling", "accounts": ["4053", "4063", "4068"]},
    {"id": "people", "label": "Personal och arvoden", "accounts": ["641", "700", "701", "711", "741", "751", "753"]},
    {"id": "admin", "label": "Administration, IT och bank", "accounts": ["611", "621", "623", "653", "657", "831"]},
    {"id": "other", "label": "Övrigt", "accounts": []},
]


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
    if (
        not name
        or name != filename
        or len(name) > 181
        or any(ord(character) < 32 for character in name)
        or Path(name).suffix.lower() not in ALLOWED_SUFFIXES
    ):
        raise HTTPException(status_code=400, detail="Ogiltigt SIE-filnamn")
    return name


def workspace_files(identity: WorkspaceIdentity) -> list[Path]:
    if not identity.path.is_relative_to(DATA_ROOT / "groups"):
        raise HTTPException(status_code=500, detail="Ogiltig workspace-sökväg")
    identity.path.mkdir(parents=True, exist_ok=True)
    seed_categories(identity)
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


def categories_file(identity: WorkspaceIdentity) -> Path:
    if not identity.path.is_relative_to(DATA_ROOT / "groups"):
        raise HTTPException(status_code=500, detail="Ogiltig workspace-sökväg")
    identity.path.mkdir(parents=True, exist_ok=True)
    return identity.path / CATEGORIES_FILENAME


def validate_categories(payload: object) -> None:
    if not isinstance(payload, dict) or not isinstance(payload.get("categories"), list):
        raise ValueError("categories måste vara en lista")
    seen_ids: set[str] = set()
    seen_accounts: set[str] = set()
    for category in payload["categories"]:
        if not isinstance(category, dict):
            raise ValueError("Ogiltig kategori")
        category_id = category.get("id")
        label = category.get("label")
        accounts = category.get("accounts")
        if not isinstance(category_id, str) or not re.fullmatch(r"[a-z0-9][a-z0-9-]{0,63}", category_id) or category_id in seen_ids:
            raise ValueError("Ogiltigt eller duplicerat kategori-id")
        if not isinstance(label, str) or not label.strip() or len(label) > 120:
            raise ValueError("Ogiltigt kategorinamn")
        if not isinstance(accounts, list):
            raise ValueError("Kategori-konton måste vara en lista")
        seen_ids.add(category_id)
        for account in accounts:
            if not isinstance(account, str) or not re.fullmatch(r"[0-9]{1,10}", account) or account in seen_accounts:
                raise ValueError("Ogiltigt eller duplicerat konto")
            seen_accounts.add(account)
    if not payload["categories"] or "other" not in seen_ids:
        raise ValueError("Kategorierna måste innehålla Övrigt")


def read_categories(identity: WorkspaceIdentity) -> list[dict]:
    seed_categories(identity)
    path = categories_file(identity)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        validate_categories(payload)
        return payload["categories"]
    except (OSError, json.JSONDecodeError, ValueError) as error:
        raise HTTPException(status_code=500, detail="Kategori-filen är ogiltig") from error


def write_categories(identity: WorkspaceIdentity, payload: object) -> list[dict]:
    try:
        validate_categories(payload)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    target = categories_file(identity)
    temporary = target.with_suffix(".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, target)
    return payload["categories"]


def seed_categories(identity: WorkspaceIdentity) -> None:
    target = categories_file(identity)
    if target.exists():
        return
    target.write_text(json.dumps({"categories": DEFAULT_CATEGORIES}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def file_for_download(identity: WorkspaceIdentity, filename: str) -> Path:
    target = (identity.path / safe_filename(filename)).resolve()
    if not target.is_relative_to(identity.path) or not target.is_file():
        raise HTTPException(status_code=404, detail="Filen finns inte")
    return target
