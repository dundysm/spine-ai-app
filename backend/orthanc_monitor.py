"""
Orthanc monitoring service: polls Orthanc for new lumbar spine studies,
downloads DICOMs into backend uploads, and records them in the database.
Run alongside the FastAPI server for automatic DICOM reception from PACS.
"""
import os
import time
import zipfile
import shutil
from pathlib import Path

import requests

from database import insert_study

# Orthanc connection (override with env if needed)
ORTHANC_URL = os.environ.get("ORTHANC_URL", "http://localhost:8042")
ORTHANC_USER = os.environ.get("ORTHANC_USERNAME", "admin")
ORTHANC_PASS = os.environ.get("ORTHANC_PASSWORD", "orthanc")

# Same uploads location as main.py so the API can serve images
UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"
UPLOADS_DIR.mkdir(exist_ok=True)


def get_orthanc_studies():
    """Return list of study IDs in Orthanc."""
    try:
        r = requests.get(
            f"{ORTHANC_URL}/studies",
            auth=(ORTHANC_USER, ORTHANC_PASS),
            timeout=5,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"Error connecting to Orthanc: {e}")
        return []


def get_study_info(study_id):
    """Return detailed info for a study."""
    try:
        r = requests.get(
            f"{ORTHANC_URL}/studies/{study_id}",
            auth=(ORTHANC_USER, ORTHANC_PASS),
            timeout=5,
        )
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"Error getting study info: {e}")
        return None


def is_lumbar_spine_study(study_info):
    """Return True if study looks like a lumbar spine MRI."""
    if os.environ.get("ORTHANC_ACCEPT_ALL_STUDIES", "").strip().lower() in ("1", "true", "yes"):
        return True  # for testing: accept every study
    main_tags = study_info.get("MainDicomTags", {})
    description = (main_tags.get("StudyDescription") or "").lower()
    keywords = ["lumbar", "l-spine", "ls spine", "lumbosacral", "spine"]
    if any(k in description for k in keywords):
        return True
    return False


def download_study_dicoms(study_id, output_dir):
    """
    Download study archive from Orthanc, extract, and normalize to 0.dcm, 1.dcm, ...
    Returns (True, image_count) on success, (False, 0) on failure.
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    zip_path = output_path / "study.zip"

    try:
        r = requests.get(
            f"{ORTHANC_URL}/studies/{study_id}/archive",
            auth=(ORTHANC_USER, ORTHANC_PASS),
            stream=True,
            timeout=60,
        )
        r.raise_for_status()

        with open(zip_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)

        extract_dir = output_path / "_extract"
        extract_dir.mkdir(exist_ok=True)
        with zipfile.ZipFile(zip_path, "r") as zf:
            zf.extractall(extract_dir)

        # Collect all DICOM files (.dcm or any file under extract dir - Orthanc uses UUIDs)
        dcm_files = sorted(extract_dir.rglob("*.dcm"))
        if not dcm_files:
            dcm_files = [p for p in sorted(extract_dir.rglob("*")) if p.is_file()]

        for i, src in enumerate(dcm_files):
            dst = output_path / f"{i}.dcm"
            shutil.copy2(src, dst)

        shutil.rmtree(extract_dir, ignore_errors=True)
        zip_path.unlink(missing_ok=True)

        return True, len(dcm_files)
    except Exception as e:
        print(f"Error downloading study: {e}")
        if zip_path.exists():
            zip_path.unlink(missing_ok=True)
        extract_dir = output_path / "_extract"
        if extract_dir.exists():
            shutil.rmtree(extract_dir, ignore_errors=True)
        return False, 0


def monitor_orthanc():
    """Main loop: poll Orthanc every 30s, ingest new lumbar spine studies."""
    print("Starting Orthanc monitor (poll every 30s)...")
    processed = set()

    while True:
        try:
            studies = get_orthanc_studies()
            for study_id in studies:
                if study_id in processed:
                    continue

                info = get_study_info(study_id)
                if not info:
                    continue

                if not is_lumbar_spine_study(info):
                    print(f"Study {study_id} is not lumbar spine, skipping")
                    processed.add(study_id)
                    continue

                print(f"New lumbar spine study: {study_id}")

                output_dir = UPLOADS_DIR / study_id
                ok, image_count = download_study_dicoms(study_id, str(output_dir))
                if not ok:
                    print(f"Failed to download study {study_id}")
                    continue

                main_tags = info.get("MainDicomTags", {})
                patient_tags = info.get("PatientMainDicomTags") or {}
                series = info.get("Series") or []

                study_data = {
                    "study_id": study_id,
                    "accession_number": main_tags.get("AccessionNumber"),
                    "patient_id": patient_tags.get("PatientID"),
                    "patient_name": patient_tags.get("PatientName"),
                    "study_date": main_tags.get("StudyDate"),
                    "study_description": main_tags.get("StudyDescription"),
                    "series_count": len(series),
                    "image_count": image_count,
                }
                insert_study(study_data)
                print(f"Study {study_id} saved (status=received, images={image_count})")
                processed.add(study_id)

        except Exception as e:
            print(f"Monitor error: {e}")

        time.sleep(30)


if __name__ == "__main__":
    monitor_orthanc()
