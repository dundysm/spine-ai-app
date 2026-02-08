import os
from pathlib import Path
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

from fastapi import FastAPI, File, UploadFile, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from typing import List, Optional
import uuid

from dicom_processor import process_dicom_files, extract_study_metadata
from ai_analyzer import run_analysis
from database import get_studies_by_status, update_study_status, get_report

app = FastAPI(title="Spine MRI Analysis API")

# Use path relative to this file so uploads are always in backend/uploads
UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)

# Configure CORS (include common Vite dev ports)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:5175",
        "http://localhost:5176",
        "http://localhost:5177",
        "http://localhost:5178",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:5176",
        "http://127.0.0.1:5177",
        "http://127.0.0.1:5178",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "message": "Spine MRI Analysis API is running"}


@app.post("/upload-dicom")
async def upload_dicom(files: List[UploadFile] = File(...)):
    """
    Upload and process DICOM files. Saves files under uploads/{study_id}/ and returns
    study_id and metadata. Use study_id for viewing images and running AI analysis.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    for file in files:
        if not file.filename.lower().endswith(".dcm"):
            raise HTTPException(
                status_code=400,
                detail=f"File {file.filename} is not a DICOM file (.dcm extension required)",
            )

    study_id = str(uuid.uuid4())
    study_path = UPLOADS_DIR / study_id
    study_path.mkdir(parents=True, exist_ok=True)
    temp_files = []

    try:
        for i, file in enumerate(files):
            content = await file.read()
            temp_path = study_path / f"{i}.dcm"
            temp_path.write_bytes(content)
            temp_files.append(str(temp_path))

        dicom_data = process_dicom_files(temp_files)
        metadata = extract_study_metadata(dicom_data)

        # Relative paths so the frontend can load images from same origin (e.g. via Vite proxy)
        image_ids = [f"/api/study/{study_id}/image/{i}" for i in range(len(files))]
        metadata["image_ids"] = image_ids
        metadata["study_id"] = study_id

        return {
            "status": "success",
            "study_id": study_id,
            "files_processed": len(files),
            "metadata": metadata,
        }
    except Exception as e:
        import shutil
        if study_path.exists():
            try:
                shutil.rmtree(study_path)
            except OSError:
                pass
        raise HTTPException(status_code=500, detail=f"Error processing DICOM files: {str(e)}")


def _safe_study_path(study_id: str) -> Path:
    """Resolve study path; reject path traversal."""
    if not study_id or ".." in study_id or "/" in study_id or "\\" in study_id:
        raise HTTPException(status_code=404, detail="Study not found")
    return UPLOADS_DIR / study_id


@app.get("/api/study/{study_id}/image/{image_index}")
async def serve_study_image(study_id: str, image_index: int):
    """Serve a single DICOM file for the viewer (by index 0, 1, 2, ...)."""
    study_path = _safe_study_path(study_id)
    if not study_path.is_dir():
        raise HTTPException(status_code=404, detail="Study not found")
    file_path = study_path / f"{image_index}.dcm"
    if not file_path.is_file():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(
        file_path,
        media_type="application/dicom",
        headers={"Content-Disposition": "inline"},
    )


@app.post("/api/analyze/{study_id}")
async def analyze_study(study_id: str):
    """Run AI analysis on the study. Loads DICOMs from uploads directory."""
    study_path = _safe_study_path(study_id)
    if not study_path.is_dir():
        raise HTTPException(status_code=404, detail="Study not found")
    result = run_analysis(str(study_path))
    if not result["success"]:
        update_study_status(study_id, "error", error_message=result.get("error"))
        raise HTTPException(status_code=500, detail=result.get("error", "Analysis failed"))
    try:
        update_study_status(study_id, "analyzed")
    except Exception:
        pass
    return {
        "status": "success",
        "report": result["report"],
        "structured": result["structured"],
    }


@app.get("/api/worklist")
async def get_worklist():
    """Get list of studies ready for review (status=analyzed)."""
    studies = get_studies_by_status("analyzed")
    return {"studies": studies}


@app.get("/api/pending")
async def get_pending():
    """Get list of studies waiting for analysis (status=received)."""
    studies = get_studies_by_status("received")
    return {"studies": studies}


@app.get("/api/study/{study_id}/report")
async def get_study_report(study_id: str):
    """Get saved report for a study (for worklist/desktop)."""
    _safe_study_path(study_id)  # validate study_id format
    report = get_report(study_id)
    if not report:
        raise HTTPException(status_code=404, detail="No report found for this study")
    return report


@app.post("/api/study/{study_id}/approve")
async def approve_study(study_id: str, body: Optional[dict] = Body(None)):
    """Mark study as approved. Optionally pass {"final_report": "..."} in body to save edited report."""
    update_study_status(study_id, "approved")
    return {"message": "Study approved", "study_id": study_id}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
