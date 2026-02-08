import pydicom
from typing import List, Dict, Any
from collections import defaultdict
import os

def process_dicom_files(file_paths: List[str]) -> List[pydicom.Dataset]:
    """
    Process multiple DICOM files and return a list of DICOM datasets
    
    Args:
        file_paths: List of paths to DICOM files
        
    Returns:
        List of pydicom Dataset objects
    """
    dicom_datasets = []
    
    for file_path in file_paths:
        try:
            if not os.path.exists(file_path):
                raise FileNotFoundError(f"DICOM file not found: {file_path}")
            
            ds = pydicom.dcmread(file_path)
            dicom_datasets.append(ds)
        except Exception as e:
            raise ValueError(f"Error reading DICOM file {file_path}: {str(e)}")
    
    return dicom_datasets

def extract_study_metadata(dicom_datasets: List[pydicom.Dataset]) -> Dict[str, Any]:
    """
    Extract and organize study metadata from DICOM datasets
    
    Args:
        dicom_datasets: List of pydicom Dataset objects
        
    Returns:
        Dictionary containing organized study metadata
    """
    if not dicom_datasets:
        return {
            "patient_name": "Unknown",
            "study_date": "Unknown",
            "total_images": 0,
            "series": []
        }
    
    # Get patient and study info from first dataset
    first_ds = dicom_datasets[0]
    
    # Extract patient name (handle both string and PersonName types)
    patient_name = "Unknown"
    if hasattr(first_ds, 'PatientName'):
        if hasattr(first_ds.PatientName, 'given_name') or hasattr(first_ds.PatientName, 'family_name'):
            # PersonName object
            try:
                patient_name = str(first_ds.PatientName)
            except:
                patient_name = "Unknown"
        else:
            patient_name = str(first_ds.PatientName)
    
    # Extract study date
    study_date = "Unknown"
    if hasattr(first_ds, 'StudyDate'):
        study_date = str(first_ds.StudyDate)
    
    # Extract study description
    study_description = "Unknown"
    if hasattr(first_ds, 'StudyDescription'):
        study_description = str(first_ds.StudyDescription)
    
    # Organize by sequence type
    series_dict = defaultdict(lambda: {
        "sequence_type": "Unknown",
        "description": "Unknown",
        "count": 0,
        "images": []
    })
    
    for idx, ds in enumerate(dicom_datasets):
        # Determine sequence type from SeriesDescription or SequenceName
        sequence_type = "Unknown"
        series_description = "Unknown"
        
        if hasattr(ds, 'SeriesDescription'):
            series_description = str(ds.SeriesDescription)
            # Try to identify sequence type
            desc_upper = series_description.upper()
            if 'T1' in desc_upper:
                sequence_type = "T1"
            elif 'T2' in desc_upper:
                sequence_type = "T2"
            elif 'STIR' in desc_upper:
                sequence_type = "STIR"
            elif 'FLAIR' in desc_upper:
                sequence_type = "FLAIR"
            else:
                sequence_type = "Other"
        
        if hasattr(ds, 'SequenceName'):
            seq_name = str(ds.SequenceName).upper()
            if 'T1' in seq_name:
                sequence_type = "T1"
            elif 'T2' in seq_name:
                sequence_type = "T2"
            elif 'STIR' in seq_name:
                sequence_type = "STIR"
        
        # Get series number for grouping
        series_number = 0
        if hasattr(ds, 'SeriesNumber'):
            try:
                series_number = int(ds.SeriesNumber)
            except:
                series_number = idx
        
        series_key = f"{sequence_type}_{series_number}"
        
        if series_key not in series_dict:
            series_dict[series_key] = {
                "sequence_type": sequence_type,
                "description": series_description,
                "count": 0,
                "images": []
            }
        
        # Extract image metadata
        image_info = {
            "instance_number": idx + 1,
            "slice_location": None,
            "image_position": None
        }
        
        if hasattr(ds, 'SliceLocation'):
            try:
                image_info["slice_location"] = float(ds.SliceLocation)
            except:
                pass
        
        if hasattr(ds, 'ImagePositionPatient'):
            try:
                image_info["image_position"] = [float(x) for x in ds.ImagePositionPatient]
            except:
                pass
        
        series_dict[series_key]["images"].append(image_info)
        series_dict[series_key]["count"] += 1
    
    # Convert to list format
    series_list = []
    for key, value in series_dict.items():
        series_list.append({
            "sequence_type": value["sequence_type"],
            "description": value["description"],
            "image_count": value["count"],
            "images": value["images"][:10]  # Limit to first 10 for response size
        })
    
    # Sort series by sequence type
    sequence_order = {"T1": 1, "T2": 2, "STIR": 3, "FLAIR": 4, "Other": 5, "Unknown": 6}
    series_list.sort(key=lambda x: sequence_order.get(x["sequence_type"], 99))
    
    return {
        "patient_name": patient_name,
        "study_date": study_date,
        "study_description": study_description,
        "total_images": len(dicom_datasets),
        "series": series_list
    }
