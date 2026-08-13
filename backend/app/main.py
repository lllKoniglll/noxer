import json
from typing import List

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from app.agent.adk_adapter import adk_status
from app.agent.ollama_client import status as ollama_status
from app.agent.service import answer_chat
from app.agent.tools import TOOL_DEFINITIONS, dataset, reset_request_dataset, set_request_dataset
from app.schemas import ChatRequest, ChatResponse


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
async def chat_endpoint(payload: str = Form(...), files: List[UploadFile] = File(default=[])):
    request = ChatRequest.model_validate(json.loads(payload))
    uploaded = [(file.filename or "upload.se", await file.read()) for file in files]
    token = set_request_dataset(uploaded)
    try:
        return answer_chat(request.message, request.history)
    finally:
        reset_request_dataset(token)
