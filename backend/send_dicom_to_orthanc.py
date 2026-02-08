"""
Send DICOM files from a folder to Orthanc (for testing the automatic Orthanc pipeline).
Usage:
  python send_dicom_to_orthanc.py [path_to_folder_with_dcm_files]
  If no path given, uses the first folder under backend/uploads/.
"""
import os
import sys
from pathlib import Path

import requests

ORTHANC_URL = os.environ.get("ORTHANC_URL", "http://localhost:8042")
ORTHANC_USER = os.environ.get("ORTHANC_USERNAME", "admin")
ORTHANC_PASS = os.environ.get("ORTHANC_PASSWORD", "orthanc")
UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"


def send_folder_to_orthanc(folder_path: Path) -> tuple[list[str], str | None]:
    """POST each .dcm file in folder to Orthanc. Returns (instance_ids, study_id)."""
    folder_path = Path(folder_path)
    if not folder_path.is_dir():
        raise FileNotFoundError(f"Not a directory: {folder_path}")

    dcm_files = sorted(folder_path.glob("*.dcm"))
    if not dcm_files:
        raise FileNotFoundError(f"No .dcm files in {folder_path}")

    instance_ids = []
    study_id = None
    for p in dcm_files:
        with open(p, "rb") as f:
            data = f.read()
        r = requests.post(
            f"{ORTHANC_URL}/instances",
            auth=(ORTHANC_USER, ORTHANC_PASS),
            data=data,
            headers={"Content-Type": "application/dicom"},
            timeout=30,
        )
        r.raise_for_status()
        j = r.json()
        instance_ids.append(j.get("ID", ""))
        study_id = study_id or j.get("ParentStudy")
        print(f"  Uploaded {p.name} -> instance {j.get('ID', '')}")

    return instance_ids, study_id


def get_study_id_from_instance(instance_id: str) -> str | None:
    """Get parent study ID for an instance (fallback if not in POST response)."""
    r = requests.get(
        f"{ORTHANC_URL}/instances/{instance_id}",
        auth=(ORTHANC_USER, ORTHANC_PASS),
        timeout=5,
    )
    r.raise_for_status()
    return r.json().get("ParentStudy")


def main():
    if len(sys.argv) >= 2:
        folder = Path(sys.argv[1])
    else:
        # Use first folder in uploads that has .dcm files
        if not UPLOADS_DIR.is_dir():
            print("No uploads directory. Usage: python send_dicom_to_orthanc.py <path_to_dicom_folder>")
            sys.exit(1)
        subdirs = [p for p in UPLOADS_DIR.iterdir() if p.is_dir()]
        if not subdirs:
            print("No study folders in uploads. Upload DICOMs via the app first, or pass a folder path.")
            sys.exit(1)
        folder = subdirs[0]
        print(f"Using first upload folder: {folder}")

    print(f"Sending DICOMs from {folder} to Orthanc at {ORTHANC_URL} ...")
    try:
        instance_ids, study_id = send_folder_to_orthanc(folder)
        if instance_ids and not study_id:
            study_id = get_study_id_from_instance(instance_ids[0])
        if instance_ids:
            print(f"\nDone. Uploaded {len(instance_ids)} instance(s). Orthanc Study ID: {study_id}")
            print("Run the Orthanc monitor (python orthanc_monitor.py) to pull this study into Spine AI.")
        else:
            print("No instances uploaded.")
    except requests.exceptions.ConnectionError:
        print("Cannot reach Orthanc. Is it running? (docker-compose up -d in orthanc/)")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
