import { useState, useCallback, useEffect } from 'react'
import axios from 'axios'
import DICOMViewer from './components/DICOMViewer'
import ReportViewer from './components/ReportViewer'
import KeyboardShortcuts from './components/KeyboardShortcuts'
import './App.css'

function isEditableTarget(target) {
  if (!target || !target.closest) return false
  return !!target.closest('input, textarea, [contenteditable="true"]')
}

// Use relative URLs so Vite proxy sends API/image requests to backend (same origin = no CORS issues)
const API_BASE_URL = ''

const AppLogo = ({ className = 'w-8 h-8', white = false }) => (
  <img
    src="/logo.png"
    alt=""
    className={`object-contain ${className}`}
    style={white ? { filter: 'brightness(0) invert(1)' } : undefined}
  />
)

const KeyboardIcon = () => (
  <svg className="w-5 h-5 text-current" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2" y="5" width="20" height="14" rx="1.5" />
    <path d="M5 9h2M9 9h2M13 9h2M17 9h2M5 12h14M5 15h4M13 15h4" />
  </svg>
)

function App() {
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [metadata, setMetadata] = useState(null)
  const [studyId, setStudyId] = useState(null)
  const [error, setError] = useState(null)
  const [report, setReport] = useState('')
  const [structured, setStructured] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState(null)
  const [uploadSectionOpen, setUploadSectionOpen] = useState(true)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const handleFileChange = (e) => {
    const selectedFiles = Array.from(e.target.files).filter((f) => f.name.toLowerCase().endsWith('.dcm'))
    setFiles(selectedFiles)
    setError(null)
    setUploadSuccess(false)
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    const dropped = Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith('.dcm'))
    if (dropped.length) {
      setFiles(dropped)
      setError(null)
      setUploadSuccess(false)
    }
  }, [])

  const handleDragOver = useCallback((e) => e.preventDefault(), [])

  const handleUpload = async () => {
    if (files.length === 0) {
      setError('Please select at least one DICOM file')
      return
    }
    setUploading(true)
    setError(null)
    setMetadata(null)
    setStudyId(null)
    setReport('')
    setUploadSuccess(false)
    setAnalysisError(null)
    try {
      const formData = new FormData()
      files.forEach((file) => formData.append('files', file))
      const response = await axios.post(`${API_BASE_URL}/upload-dicom`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setStudyId(response.data.study_id)
      setMetadata(response.data.metadata)
      setUploadSuccess(true)
      setUploadSectionOpen(false)
    } catch (err) {
      const detail = err.response?.data?.detail
      const msg = Array.isArray(detail) ? detail.map((d) => d.msg || d).join(', ') : detail || err.message
      setError(msg || 'Failed to upload files')
    } finally {
      setUploading(false)
    }
  }

  const handleAnalyze = async () => {
    if (!studyId) return
    setAnalyzing(true)
    setAnalysisError(null)
    try {
      const response = await axios.post(`${API_BASE_URL}/api/analyze/${studyId}`)
      setReport(response.data.report || '')
      setStructured(response.data.structured || null)
    } catch (err) {
      setAnalysisError(err.response?.data?.detail || err.message || 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleClear = () => {
    setFiles([])
    setMetadata(null)
    setStudyId(null)
    setError(null)
    setReport('')
    setStructured(null)
    setUploadSuccess(false)
    setAnalysisError(null)
    setUploadSectionOpen(true)
  }

  useEffect(() => {
    const handleKey = (e) => {
      if (isEditableTarget(e.target)) return
      if (e.key === 'u' || e.key === 'U') {
        setUploadSectionOpen((o) => !o)
        e.preventDefault()
      }
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        setShortcutsOpen((o) => !o)
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const imageIds = Array.isArray(metadata?.image_ids) ? metadata.image_ids : []
  const seriesDescription =
    typeof metadata?.series?.[0]?.description === 'string'
      ? metadata.series[0].description
      : typeof metadata?.series?.[0]?.sequence_type === 'string'
        ? metadata.series[0].sequence_type
        : 'Series'

  const studyDate = metadata?.study_date || '—'
  const patientName = metadata?.patient_name || '—'

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      <div className={`bg-medical-bg flex flex-col transition-colors duration-300 ease-out ${metadata ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
        <header
          className="h-[4.25rem] shrink-0 flex items-center justify-between px-6 transition-all duration-300"
          style={{
            background: 'linear-gradient(152deg, var(--color-nav-start) 0%, var(--color-nav-end) 100%)',
            boxShadow: 'var(--shadow-nav)',
          }}
          role="banner"
        >
          <div className="flex items-center gap-3.5">
            <div className="flex items-center justify-center w-11 h-11 rounded-2xl" aria-hidden>
              <AppLogo className="w-8 h-8" white />
            </div>
            <span className="text-xl font-semibold text-white tracking-tight">Spine AI</span>
          </div>
          <div className="flex items-center gap-2">
            {metadata && (
              <div className="hidden sm:flex items-center gap-4 text-sm text-white/90 animate-fade-in">
                <span className="font-medium">Patient:</span>
                <span className="text-white truncate max-w-[120px]" title={patientName}>{patientName}</span>
                <span className="text-white/70">|</span>
                <span className="font-medium">Study date:</span>
                <span>{studyDate}</span>
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white/20 text-white">
                  Loaded
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={() => setShortcutsOpen(true)}
              className="p-2.5 rounded-xl text-white/90 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 transition-all duration-200"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts"
            >
              <KeyboardIcon />
            </button>
          </div>
        </header>

        <KeyboardShortcuts open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

        <main
          id="main-content"
          className="flex-1 flex flex-col min-h-0 overflow-hidden p-4 gap-4"
        >
          <section className="shrink-0" aria-label="Upload DICOM">
            <div className="bg-[var(--color-bg-elevated)] rounded-2xl shadow-[var(--shadow-panel-soft)] border border-[var(--color-border)] overflow-hidden">
              <button
                type="button"
                onClick={() => setUploadSectionOpen((o) => !o)}
                className="w-full flex items-center justify-between px-5 py-4 text-left text-[var(--color-primary)] font-medium hover:bg-[var(--color-bg-subtle)] transition-colors rounded-t-2xl"
                aria-expanded={uploadSectionOpen}
                title="Toggle upload panel (U)"
              >
                <span>Upload study</span>
                <span className="text-[var(--color-text-muted)] text-sm">{uploadSectionOpen ? 'Collapse' : 'Expand'}</span>
              </button>
              <div
                className={`overflow-hidden transition-all duration-300 ease-out-expo ${uploadSectionOpen ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'}`}
                aria-hidden={!uploadSectionOpen}
              >
                <div className="px-4 pb-4 pt-0 border-t border-[var(--color-border)] animate-fade-in [animation-fill-mode:backwards] [animation-delay:50ms]">
                  <div
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    className="mt-4 border-2 border-dashed border-medical-border rounded-panel p-6 text-center hover:border-medical-primary hover:bg-blue-50/40 active:scale-[0.995] transition-all duration-300 ease-out-expo cursor-pointer"
                  >
                    <input
                      type="file"
                      multiple
                      accept=".dcm"
                      onChange={handleFileChange}
                      className="absolute w-0 h-0 opacity-0"
                      id="dicom-upload"
                      aria-label="Select DICOM files"
                    />
                    <label htmlFor="dicom-upload" className="cursor-pointer block">
                      <span className="text-gray-500 block mb-2">Drag and drop lumbar spine DICOM series here, or click to browse</span>
                      <span className="text-sm text-medical-primary font-medium">.dcm files only · Multiple slices supported</span>
                    </label>
                  </div>
                  {files.length > 0 && (
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-gray-700">{files.length} file(s) selected</span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleUpload}
                            disabled={uploading || files.length === 0}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-white bg-gradient-to-r from-medical-primary to-medical-blue hover:shadow-panel-soft disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none transition-all duration-250 ease-out-expo"
                          >
                            {uploading ? (
                              <>
                                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-medical-spin" />
                                Uploading…
                              </>
                            ) : uploadSuccess ? (
                              'Upload complete'
                            ) : (
                              'Upload study'
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={handleClear}
                            className="px-4 py-2 rounded-xl border border-medical-border text-gray-700 hover:bg-slate-50 transition-all duration-200"
                          >
                            Clear
                          </button>
                        </div>
                      </div>
                      <ul className="max-h-32 overflow-auto rounded-panel border border-medical-border divide-y divide-medical-border text-sm">
                        {files.slice(0, 10).map((file, i) => (
                          <li key={i} className="px-3 py-2 flex items-center justify-between text-gray-600 transition-colors duration-150 hover:bg-slate-50/50">
                            <span className="truncate">{file.name}</span>
                            <span className="text-gray-400 shrink-0 ml-2">{(file.size / 1024).toFixed(1)} KB</span>
                          </li>
                        ))}
                        {files.length > 10 && (
                          <li className="px-3 py-2 text-gray-400">+{files.length - 10} more</li>
                        )}
                      </ul>
                      {uploading && (
                        <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div className="h-full w-2/3 bg-gradient-to-r from-medical-primary to-medical-blue rounded-full animate-pulse-soft transition-all duration-500" />
                        </div>
                      )}
                    </div>
                  )}
                  {error && (
                    <div className="mt-3 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-2 animate-fade-in">
                      <span className="text-red-500">!</span>
                      {error}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {metadata ? (
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col lg:flex-row gap-4 animate-fade-in-up">
              <section
                className="flex-1 min-h-0 lg:min-w-0 lg:w-1/2 flex flex-col overflow-hidden"
                aria-label="DICOM viewer"
              >
                <DICOMViewer
                  imageIds={imageIds}
                  seriesDescription={seriesDescription}
                  className="h-full"
                />
              </section>
              <section
                className="flex-1 min-h-0 lg:min-w-0 lg:w-1/2 flex flex-col overflow-hidden"
                aria-label="Radiology report"
              >
                <ReportViewer
                  report={report}
                  structured={structured}
                  onReportChange={setReport}
                  analyzing={analyzing}
                  onAnalyze={handleAnalyze}
                  hasStudy={!!studyId}
                  analysisError={analysisError}
                  className="h-full"
                />
              </section>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-[var(--color-bg-elevated)] rounded-2xl border border-[var(--color-border)] shadow-[var(--shadow-panel-soft)] p-12">
              <div className="flex items-center justify-center w-24 h-24 rounded-2xl bg-[var(--color-bg-subtle)]">
                <AppLogo className="w-14 h-14 opacity-90" />
              </div>
              <div className="text-center max-w-md space-y-2">
                <h2 className="text-xl font-semibold text-[var(--color-text)] tracking-tight">Spine AI</h2>
                <p className="text-[var(--color-text-muted)] text-sm leading-relaxed">
                  Upload a lumbar spine MRI DICOM study to view images and generate AI-powered radiology reports. Drag and drop or use the upload panel above.
                </p>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  )
}

export default App
