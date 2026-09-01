import json
from typing import List

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from app.agent.adk_adapter import adk_status
from app.agent.ollama_client import status as ollama_status
from app.agent.service import answer_chat
from app.agent.tools import (
    TOOL_DEFINITIONS,
    dataset,
    reset_request_dataset,
    reset_request_sie_dir,
    set_request_dataset,
    set_request_sie_dir,
)
from app.schemas import ChatRequest, ChatResponse
from app.workspaces import file_for_download, identity_from_request, safe_filename, workspace_files, write_file


app = FastAPI(title="Noxer Economy Agent", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    data = dataset()
    return {
        "status": "ok",
        "organization": data.organization_name,
        "files": data.files,
        "latest_voucher_date": data.latest_voucher_date,
        "tools": [tool["name"] for tool in TOOL_DEFINITIONS],
        "adk": adk_status(),
        "ollama": ollama_status(),
    }


@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: Request, payload: str = Form(...), files: List[UploadFile] = File(default=[])):
    identity = identity_from_request(request)
    request = ChatRequest.model_validate(json.loads(payload))
    uploaded = [(file.filename or "upload.se", await file.read()) for file in files]
    dataset_token = set_request_dataset(uploaded) if uploaded else None
    directory_token = set_request_sie_dir(identity.path)
    try:
        return answer_chat(request.message, request.history)
    finally:
        if dataset_token is not None:
            reset_request_dataset(dataset_token)
        reset_request_sie_dir(directory_token)


@app.get("/files")
def list_files(request: Request):
    identity = identity_from_request(request)
    return {"group": identity.group, "files": [{"name": path.name, "size": path.stat().st_size} for path in workspace_files(identity)]}


@app.get("/files/{filename}")
def download_file(filename: str, request: Request):
    identity = identity_from_request(request)
    path = file_for_download(identity, filename)
    return FileResponse(path, media_type="application/octet-stream", filename=path.name)


@app.post("/files")
async def upload_file(request: Request, file: UploadFile = File(...)):
    identity = identity_from_request(request)
    filename = safe_filename(file.filename or "")
    content = await file.read()
    path = write_file(identity, filename, content)
    return {"name": path.name, "size": path.stat().st_size}


@app.delete("/files/{filename}")
def delete_file(filename: str, request: Request):
    identity = identity_from_request(request)
    path = file_for_download(identity, filename)
    path.unlink()
    return {"deleted": path.name}
