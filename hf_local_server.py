import os
from typing import Optional, Dict, Any

import torch
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM


class GenerateRequest(BaseModel):
    inputs: str
    parameters: Optional[Dict[str, Any]] = None


def create_app(model_path: str):
    app = FastAPI(title="HF Local Inference", version="0.1.0")

    tokenizer = AutoTokenizer.from_pretrained(model_path)
    model = AutoModelForSeq2SeqLM.from_pretrained(model_path)

    @app.post("/generate")
    def generate(req: GenerateRequest):
        if not req.inputs:
            raise HTTPException(status_code=400, detail="inputs is required")

        params = req.parameters or {}
        temperature = float(params.get("temperature", 0.2))
        max_new_tokens = int(params.get("max_new_tokens", 200))
        num_beams = int(params.get("num_beams", 1))

        inputs = tokenizer(req.inputs, return_tensors="pt")
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=max_new_tokens,
                temperature=temperature,
                num_beams=num_beams,
            )

        text = tokenizer.decode(outputs[0], skip_special_tokens=True)
        return {"generated_text": text}

    @app.get("/health")
    def health():
        return {"status": "ok"}

    return app


model_dir = os.environ.get("HF_MODEL_DIR", "./hfmodel")
app = create_app(model_dir)

