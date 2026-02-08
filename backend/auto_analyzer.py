"""
Automatic AI analysis service: polls the database for studies with status="received",
runs AI analysis (ai_analyzer.run_analysis), saves the report, and sets status to "analyzed".

Run as a background service alongside the API and Orthanc monitor:
  python auto_analyzer.py

Poll interval: 30 seconds (configurable via AUTO_ANALYZER_INTERVAL_SEC).
"""

import os
import sys
import time
import logging
from pathlib import Path

# Ensure backend root is on path when run as script
_backend_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(_backend_dir))

# Load .env so ANTHROPIC_API_KEY is available when run as standalone script
try:
    from dotenv import load_dotenv
    load_dotenv()  # from cwd (e.g. when run as "cd backend && python auto_analyzer.py")
    load_dotenv(_backend_dir / ".env")  # from script dir when run from elsewhere
except ImportError:
    pass

from database import get_studies_by_status, update_study_status, save_report
from ai_analyzer import run_analysis

# Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("auto_analyzer")

UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"
POLL_INTERVAL_SEC = int(os.environ.get("AUTO_ANALYZER_INTERVAL_SEC", "30"))


def process_one_study(study_id: str) -> bool:
    """
    Run AI analysis for one study. Save report and set status to "analyzed" on success;
    set status to "error" with message on failure.
    Returns True if processed (success or recorded failure), False if study dir missing.
    """
    study_dir = UPLOADS_DIR / study_id
    if not study_dir.is_dir():
        logger.warning("Study directory missing for %s, skipping", study_id)
        return False

    logger.info("Analyzing study %s ...", study_id)
    try:
        result = run_analysis(str(study_dir))
    except Exception as e:
        logger.exception("Analysis raised for %s: %s", study_id, e)
        update_study_status(study_id, "error", error_message=str(e))
        return True

    if not result.get("success"):
        err = result.get("error") or "Unknown error"
        logger.error("Analysis failed for %s: %s", study_id, err)
        update_study_status(study_id, "error", error_message=err)
        return True

    report_text = result.get("report") or ""
    structured = result.get("structured") or {}
    confidence = structured.get("confidence")
    if isinstance(confidence, dict):
        confidence = confidence.get("overall") or confidence.get("score")
    try:
        save_report(study_id, report_text, ai_report_json=structured, confidence_score=confidence)
    except Exception as e:
        logger.exception("Failed to save report for %s: %s", study_id, e)
        update_study_status(study_id, "error", error_message=f"Save report: {e}")
        return True

    update_study_status(study_id, "analyzed")
    logger.info("Study %s analyzed and saved.", study_id)
    return True


def run_loop():
    """Poll for received studies and process them one at a time."""
    key_set = bool(os.environ.get("ANTHROPIC_API_KEY") and os.environ.get("ANTHROPIC_API_KEY", "").strip() not in ("", "your_key_here"))
    logger.info("Auto-analyzer started (interval=%ss). ANTHROPIC_API_KEY set=%s. Watching for status='received'.",
                POLL_INTERVAL_SEC, key_set)
    if not key_set:
        logger.warning("ANTHROPIC_API_KEY missing or placeholder. Analysis will fail until .env is configured.")
    while True:
        try:
            studies = get_studies_by_status("received")
            if studies:
                # Process one per cycle to avoid overloading API and allow other services to run
                row = studies[0]
                study_id = row.get("study_id")
                if study_id:
                    process_one_study(study_id)
            else:
                logger.debug("No studies with status=received.")
        except Exception as e:
            logger.exception("Poll/process error: %s", e)
        time.sleep(POLL_INTERVAL_SEC)


def main():
    if not UPLOADS_DIR.is_dir():
        logger.error("Uploads directory not found: %s", UPLOADS_DIR)
        sys.exit(1)
    run_loop()


if __name__ == "__main__":
    main()
