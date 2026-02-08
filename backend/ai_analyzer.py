"""
AI-powered spine MRI analysis using Anthropic Claude API.

Extracts key sagittal T2 slices from a DICOM study, converts them to PNG,
and generates a structured radiology report via Claude.
"""

import os
import base64
import json
import re
from typing import List, Dict, Any, Optional
from pathlib import Path

import pydicom
from PIL import Image
import numpy as np

# Lazy import anthropic so missing API key doesn't break app load
def _get_client():
    from anthropic import Anthropic
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key or api_key == "your_key_here":
        raise ValueError("ANTHROPIC_API_KEY is not set or is placeholder. Add it to .env")
    return Anthropic(api_key=api_key)


def get_sagittal_t2_slice_paths(study_dir: str) -> List[str]:
    """
    Find DICOM files that are sagittal T2-weighted and return paths ordered by slice.
    Prefer middle slices for a representative view.

    Args:
        study_dir: Path to directory containing DICOM files (e.g. uploads/{study_id})

    Returns:
        List of file paths, ordered by slice position (middle slices included).
    """
    study_path = Path(study_dir)
    if not study_path.exists():
        return []

    paths = []
    for p in sorted(study_path.iterdir()):
        if p.suffix.lower() in (".dcm", "") or p.name.endswith(".dcm"):
            paths.append(str(p))

    if not paths:
        return []

    # Load and filter to T2 sagittal
    candidates = []
    for path in paths:
        try:
            ds = pydicom.dcmread(path, stop_before_pixels=False)
        except Exception:
            continue
        desc = (getattr(ds, "SeriesDescription", None) or "") + " " + (getattr(ds, "SequenceName", None) or "")
        desc_upper = desc.upper()
        if "T2" not in desc_upper:
            continue
        # Sagittal: typically SAG in description or orientation
        orientation = getattr(ds, "ImageOrientationPatient", None)
        is_sagittal = "SAG" in desc_upper
        if not is_sagittal and orientation is not None and len(orientation) >= 6:
            # Rough sagittal check: first row of orientation ~ (0,0,±1) or similar
            try:
                o = [float(orientation[i]) for i in range(6)]
                if abs(o[0]) < 0.3 and abs(o[1]) < 0.3:
                    is_sagittal = True
            except (TypeError, ValueError):
                pass
        if not is_sagittal:
            continue
        slice_loc = None
        if hasattr(ds, "SliceLocation"):
            try:
                slice_loc = float(ds.SliceLocation)
            except (TypeError, ValueError):
                pass
        instance = getattr(ds, "InstanceNumber", len(candidates))
        try:
            instance = int(instance)
        except (TypeError, ValueError):
            instance = len(candidates)
        candidates.append((path, slice_loc if slice_loc is not None else instance, instance))
        ds = None

    if not candidates:
        # Fallback: use first few files as "sagittal" if no T2 SAG found
        for path in paths[:5]:
            candidates.append((path, 0, 0))

    # Sort by slice location (or instance)
    candidates.sort(key=lambda x: (x[1], x[2]))
    # Take up to 3 middle slices to keep payload small
    n = len(candidates)
    if n <= 3:
        indices = list(range(n))
    else:
        mid = n // 2
        indices = [mid - 1, mid, mid + 1] if n >= 3 else [mid]
    return [candidates[i][0] for i in indices]


def dicom_to_png_base64(dicom_path: str) -> str:
    """
    Convert a single DICOM image to PNG and return base64-encoded string.

    Args:
        dicom_path: Path to the DICOM file.

    Returns:
        Base64-encoded PNG string (with data URL prefix for Claude).
    """
    ds = pydicom.dcmread(dicom_path)
    pixels = ds.pixel_array

    if pixels.dtype == np.float32 or pixels.dtype == np.float64:
        pixels = np.clip(pixels, 0, None)
        if pixels.max() > 0:
            pixels = (pixels / pixels.max() * 255).astype(np.uint8)
        else:
            pixels = np.zeros_like(pixels, dtype=np.uint8)
    elif pixels.dtype != np.uint8:
        if pixels.max() > pixels.min():
            pixels = ((pixels - pixels.min()) / (pixels.max() - pixels.min()) * 255).astype(np.uint8)
        else:
            pixels = np.zeros_like(pixels, dtype=np.uint8)

    if len(pixels.shape) == 3:
        # Multi-frame: take middle frame
        frame = pixels.shape[0] // 2
        pixels = pixels[frame]

    img = Image.fromarray(pixels, mode="L")
    if img.width > 512 or img.height > 512:
        img.thumbnail((512, 512), Image.Resampling.LANCZOS)

    import io
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.standard_b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


RADIOLOGY_SYSTEM_PROMPT = """You are an expert musculoskeletal radiologist. Analyze this lumbar spine MRI and generate a report in standard PACS format.

REPORT STRUCTURE:

CLINICAL INDICATION: [If available, otherwise state 'Not provided']

TECHNIQUE: Multiplanar multi-weighted MRI of the lumbar spine was performed without intravenous contrast using the standard lumbar spine protocol.

COMPARISON: None available.

FINDINGS:

[Start with general observations]
The alignment of the lumbar spine is [normal/describe abnormality].
Vertebral bodies demonstrate [normal/abnormal] signal intensity on all sequences.
[Note any compression fractures]
The conus medullaris terminates at the level of [L1/L1-L2].
The distal spinal cord signal intensity is [normal/abnormal].

[Then level-by-level analysis]
L1-L2: [Describe disc, canal, foramina, facets]
L2-L3: [Describe disc, canal, foramina, facets]
L3-L4: [Describe disc, canal, foramina, facets]
L4-L5: [Describe disc, canal, foramina, facets]
L5-S1: [Describe disc, canal, foramina, facets]

[Additional findings]
Paraspinal soft tissues: [normal/abnormal]
Limited views of [adjacent structures]: [findings]

IMPRESSION:
1. [Most clinically significant finding]
2. [Secondary findings]
3. [Additional findings if relevant]

Use precise medical terminology. For disc herniations, use the updated nomenclature (protrusion, extrusion, sequestration). Specify location (central, paracentral, foraminal, extraforaminal) and laterality (left, right, bilateral). If the image quality or field of view does not allow assessment of a level, say so. Do not invent findings; describe only what can be reasonably inferred from the image."""


def analyze_with_claude(image_base64_list: List[str]) -> str:
    """
    Send one or more PNG images (base64) to Claude and return the raw text report.

    Args:
        image_base64_list: List of data URL strings (data:image/png;base64,...).

    Returns:
        Raw report text from Claude.
    """
    client = _get_client()
    content = []
    for i, data_url in enumerate(image_base64_list[:3]):
        content.append({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": data_url.split(",", 1)[-1],
            },
        })
    content.append({
        "type": "text",
        "text": "Generate the structured radiology report for this/these sagittal T2 lumbar spine MRI image(s).",
    })

    model = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-5")
    response = client.messages.create(
        model=model,
        max_tokens=2048,
        system=RADIOLOGY_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": content}],
    )

    text = ""
    for block in response.content:
        if hasattr(block, "text"):
            text += block.text
    return text.strip()


# Standard disc levels to check for in reports
DISC_LEVELS = ["L1-L2", "L2-L3", "L3-L4", "L4-L5", "L5-S1"]


def _extract_section(text: str, section_name: str, next_section_names: Optional[List[str]] = None) -> str:
    """Extract a section (e.g. FINDINGS, IMPRESSION) from report text. Handles various formats."""
    if not text or not isinstance(text, str):
        return ""
    pattern = rf"\b{re.escape(section_name)}\s*:?\s*\n?([\s\S]*?)"
    if next_section_names:
        next_pattern = "|".join(re.escape(n) for n in next_section_names)
        pattern += rf"(?=\n\s*(?:{next_pattern})|\Z)"
    else:
        pattern += r"(?=\n\s*\n|\Z)"
    match = re.search(pattern, text, re.IGNORECASE)
    if match:
        return match.group(1).strip()
    return ""


def _normalize_level_key(key: str) -> Optional[str]:
    """Map level text (e.g. L1-L2, L5-S1) to standard DISC_LEVELS entry."""
    k = (key or "").strip().upper().replace(" ", "")
    for std in DISC_LEVELS:
        if std.upper() == k or std.replace("-", "") == k.replace("-", ""):
            return std
    return None


def _extract_level_findings(findings_text: str) -> Dict[str, str]:
    """Extract level-by-level findings (L1-L2 through L5-S1) from the FINDINGS section."""
    level_findings: Dict[str, str] = {level: "" for level in DISC_LEVELS}
    if not findings_text:
        return level_findings
    # Match "L1-L2:", "L2-L3:", "L5-S1:", etc. – text until next level or end
    levels_alt = "|".join(re.escape(lev) for lev in DISC_LEVELS)
    level_pattern = rf"({levels_alt})\s*:?\s*[-–]?\s*([\s\S]*?)(?={levels_alt}\s*:?|\Z)"
    for match in re.finditer(level_pattern, findings_text, re.IGNORECASE):
        level_key = _normalize_level_key(match.group(1))
        if level_key:
            level_findings[level_key] = match.group(2).strip()
    # Fallback: line-by-line for any level we missed
    for level in DISC_LEVELS:
        if level_findings[level]:
            continue
        pat = rf"\b{re.escape(level)}\s*:?\s*[-–]?\s*(.+?)(?=\n\s*(?:L[1-5]-|L5-S1|\Z))"
        m = re.search(pat, findings_text, re.IGNORECASE | re.DOTALL)
        if m:
            level_findings[level] = m.group(1).strip()
    return level_findings


CONFIDENCE_SYSTEM_PROMPT = """You are an expert radiologist reviewing an AI-generated lumbar spine MRI report. Your task is to rate confidence in each finding based on image quality and clarity of pathology.

Return a single JSON object only, no other text. Use this exact structure:
{
  "overall_confidence": "high" or "medium" or "low",
  "level_confidence": {
    "L1-L2": "high" or "medium" or "low",
    "L2-L3": "high" or "medium" or "low",
    "L3-L4": "high" or "medium" or "low",
    "L4-L5": "high" or "medium" or "low",
    "L5-S1": "high" or "medium" or "low"
  },
  "low_confidence_notes": ["brief reason for any low/medium level", "optional second note"]
}

Rate "high" when the finding is clearly visible and unambiguous; "medium" when partially limited by technique or artifact; "low" when image quality or field of view significantly limits assessment. Include a short note in low_confidence_notes for each level rated medium or low."""


def get_confidence_scores(report_text: str) -> Dict[str, Any]:
    """
    Ask Claude to review the generated report and return confidence scores per level.
    Returns a dict with overall_confidence, level_confidence (L1-L2 through L5-S1), and low_confidence_notes.
    On failure returns empty dict so frontend can still show report.
    """
    if not report_text or not report_text.strip():
        return {}
    try:
        client = _get_client()
        model = os.environ.get("CLAUDE_MODEL", "claude-sonnet-4-5")
        response = client.messages.create(
            model=model,
            max_tokens=1024,
            system=CONFIDENCE_SYSTEM_PROMPT,
            messages=[{
                "role": "user",
                "content": f"Review the report you just generated. For each finding, rate your confidence level (high/medium/low) based on image quality and clarity of the pathology. Return as JSON.\n\nReport:\n{report_text[:12000]}",
            }],
        )
        text = ""
        for block in response.content:
            if hasattr(block, "text"):
                text += block.text
        text = text.strip()
        if text.startswith("```"):
            text = re.sub(r"^```(?:json)?\s*", "", text)
            text = re.sub(r"\s*```\s*$", "", text)
        data = json.loads(text)
        level_confidence = {}
        for level in DISC_LEVELS:
            level_confidence[level] = (data.get("level_confidence") or {}).get(level) or "medium"
            if level_confidence[level] not in ("high", "medium", "low"):
                level_confidence[level] = "medium"
        return {
            "overall_confidence": data.get("overall_confidence") or "medium",
            "level_confidence": level_confidence,
            "low_confidence_notes": data.get("low_confidence_notes") or [],
        }
    except Exception:
        return {}


def parse_report_to_findings(report_text: str) -> Dict[str, Any]:
    """
    Parse Claude's report into structured data. Handles various report formats.

    Args:
        report_text: Raw report string (PACS-style or FINDINGS/IMPRESSION).

    Returns:
        Dict with keys: findings (str), impression (str), level_findings (dict),
        clinical_indication (str), technique (str), raw (str).
    """
    raw = report_text if isinstance(report_text, str) else ""
    findings = ""
    impression = ""

    # Try multiple patterns for IMPRESSION (often at end)
    for imp_pattern in [
        r"\bIMPRESSION\s*:?\s*\n([\s\S]*)",
        r"\bIMPRESSION\s*:?\s*([\s\S]*)",
        r"\bCONCLUSION\s*:?\s*\n([\s\S]*)",
    ]:
        imp_match = re.search(imp_pattern, raw, re.IGNORECASE)
        if imp_match:
            impression = imp_match.group(1).strip()
            break

    # FINDINGS: stop at IMPRESSION, CONCLUSION, or end
    for find_pattern in [
        r"\bFINDINGS\s*:?\s*\n([\s\S]*?)(?=\n\s*IMPRESSION\b|\n\s*CONCLUSION\b|\Z)",
        r"\bFINDINGS\s*:?\s*([\s\S]*?)(?=IMPRESSION|CONCLUSION|\Z)",
    ]:
        find_match = re.search(find_pattern, raw, re.IGNORECASE)
        if find_match:
            findings = find_match.group(1).strip()
            break

    if not findings and not impression:
        findings = raw

    # Optional sections
    clinical_indication = _extract_section(raw, "CLINICAL INDICATION", ["TECHNIQUE", "FINDINGS", "COMPARISON"])
    technique = _extract_section(raw, "TECHNIQUE", ["COMPARISON", "FINDINGS"])
    comparison = _extract_section(raw, "COMPARISON", ["FINDINGS"])

    level_findings = _extract_level_findings(findings)

    return {
        "findings": findings or raw,
        "impression": impression,
        "level_findings": level_findings,
        "clinical_indication": clinical_indication,
        "technique": technique,
        "comparison": comparison,
        "raw": raw,
    }


def validate_report(report_text: str, structured: Dict[str, Any]) -> Dict[str, Any]:
    """
    Validate report completeness. Check that all 5 disc levels are mentioned
    and IMPRESSION exists. Return validation result with warnings.

    Args:
        report_text: Raw report string.
        structured: Output from parse_report_to_findings().

    Returns:
        Dict with keys: valid (bool), level_checks (dict), has_impression (bool),
        warnings (list of str).
    """
    warnings: List[str] = []
    report_upper = (report_text or "").upper()
    level_checks: Dict[str, bool] = {}

    for level in DISC_LEVELS:
        # Check in raw text or in level_findings
        in_text = level.upper() in report_upper or level.replace("-", "/") in report_upper
        level_data = (structured.get("level_findings") or {}).get(level, "")
        level_checks[level] = in_text or bool(level_data and level_data.strip())
        if not level_checks[level]:
            warnings.append(f"Disc level {level} not explicitly mentioned.")

    has_impression = bool(
        re.search(r"\bIMPRESSION\b", report_text or "", re.IGNORECASE)
        and (structured.get("impression") or "").strip()
    )
    if not has_impression:
        warnings.append("IMPRESSION section missing or empty.")

    # Heuristic: report too short
    if report_text and len(report_text.strip()) < 200:
        warnings.append("Report appears unusually brief; consider reviewing completeness.")

    valid = len(warnings) == 0
    return {
        "valid": valid,
        "level_checks": level_checks,
        "has_impression": has_impression,
        "warnings": warnings,
    }


def run_analysis(study_dir: str) -> Dict[str, Any]:
    """
    Run full AI analysis for a study: extract T2 sagittal slices, convert to PNG,
    call Claude, and return structured result.

    Args:
        study_dir: Path to uploads/{study_id}.

    Returns:
        Dict with: success (bool), report (str), structured (dict), error (str if failed).
    """
    try:
        slice_paths = get_sagittal_t2_slice_paths(study_dir)
        if not slice_paths:
            return {
                "success": False,
                "report": "",
                "structured": {},
                "error": "No sagittal T2 slices found in study.",
            }

        images_b64 = []
        for path in slice_paths:
            try:
                images_b64.append(dicom_to_png_base64(path))
            except Exception as e:
                return {
                    "success": False,
                    "report": "",
                    "structured": {},
                    "error": f"Failed to convert DICOM to image: {e!s}",
                }

        report_text = analyze_with_claude(images_b64)
        structured = parse_report_to_findings(report_text)
        confidence = get_confidence_scores(report_text)
        structured["confidence"] = confidence
        validation = validate_report(report_text, structured)
        structured["validation"] = validation
        return {
            "success": True,
            "report": report_text,
            "structured": structured,
            "error": None,
        }
    except ValueError as e:
        return {"success": False, "report": "", "structured": {}, "error": str(e)}
    except Exception as e:
        return {
            "success": False,
            "report": "",
            "structured": {},
            "error": f"Analysis failed: {e!s}",
        }
