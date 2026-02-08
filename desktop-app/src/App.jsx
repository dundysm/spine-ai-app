import { useState, useCallback, useEffect } from 'react'
import axios from 'axios'
import DICOMViewer from './components/DICOMViewer'
import ReportViewer from './components/ReportViewer'
import KeyboardShortcuts from './components/KeyboardShortcuts'
import { htmlToPlainText } from './utils/reportFormat'
import './App.css'

const isElectron = typeof window !== 'undefined' && window.electronAPI
const API_BASE_URL = isElectron ? 'http://127.0.0.1:8001' : ''

function isEditableTarget(target) {
  if (!target?.closest) return false
  return !!target.closest('input, textarea, [contenteditable="true"]')
}

const AppLogo = ({ className = 'w-8 h-8', white = false }) => (
  <img
    src="./logo.png"
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
  const [view, setView] = useState('worklist')
  const [worklist, setWorklist] = useState([])
  const [worklistLoading, setWorklistLoading] = useState(true)
  const [worklistError, setWorklistError] = useState(null)
  const [selectedStudy, setSelectedStudy] = useState(null)
  const [metadata, setMetadata] = useState(null)
  const [studyId, setStudyId] = useState(null)
  const [report, setReport] = useState('')
  const [structured, setStructured] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState(null)
  const [reportLoading, setReportLoading] = useState(false)
  const [uploadSectionOpen, setUploadSectionOpen] = useState(false)
  const [files, setFiles] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [error, setError] = useState(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const fetchWorklist = useCallback(async () => {
    setWorklistLoading(true)
    setWorklistError(null)
    try {
      const res = await axios.get(`${API_BASE_URL}/api/worklist`)
      setWorklist(res.data?.studies || [])
    } catch (err) {
      setWorklistError(err.message || 'Failed to load worklist. Is the backend running on port 8001?')
      setWorklist([])
    } finally {
      setWorklistLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchWorklist()
    const t = setInterval(fetchWorklist, 30000)
    return () => clearInterval(t)
  }, [fetchWorklist])

  const loadStudy = useCallback(async (study) => {
    if (!study?.study_id) return
    const sid = study.study_id
    setSelectedStudy(study)
    setStudyId(sid)
    setReport('')
    setStructured(null)
    setAnalysisError(null)
    const imageCount = study.image_count || 0
    const imageIds = Array.from({ length: imageCount }, (_, i) => `${API_BASE_URL}/api/study/${sid}/image/${i}`)
    setMetadata({
      study_id: sid,
      patient_name: study.patient_name ?? '—',
      study_date: study.study_date ?? '—',
      image_ids: imageIds,
      series: [{ description: study.study_description || 'Series', sequence_type: 'MRI' }],
    })
    setReportLoading(true)
    try {
      const res = await axios.get(`${API_BASE_URL}/api/study/${sid}/report`)
      setReport(res.data?.report || res.data?.ai_report_text || '')
      setStructured(res.data?.structured || null)
    } catch (_) {
      setReport('')
      setStructured(null)
    } finally {
      setReportLoading(false)
    }
    setView('study')
  }, [])

  const handleAnalyze = async () => {
    if (!studyId) return
    setAnalyzing(true)
    setAnalysisError(null)
    try {
      const res = await axios.post(`${API_BASE_URL}/api/analyze/${studyId}`)
      setReport(res.data.report || '')
      setStructured(res.data.structured || null)
      fetchWorklist()
    } catch (err) {
      setAnalysisError(err.response?.data?.detail || err.message || 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleApprove = async () => {
    if (!studyId) return
    try {
      await axios.post(`${API_BASE_URL}/api/study/${studyId}/approve`)
      setSelectedStudy(null)
      setStudyId(null)
      setMetadata(null)
      setReport('')
      setStructured(null)
      setView('worklist')
      fetchWorklist()
    } catch (err) {
      setAnalysisError(err.response?.data?.detail || err.message || 'Approve failed')
    }
  }

  const handleBackToWorklist = () => {
    setSelectedStudy(null)
    setStudyId(null)
    setMetadata(null)
    setReport('')
    setStructured(null)
    setView('worklist')
  }

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files).filter((f) => f.name.toLowerCase().endsWith('.dcm'))
    setFiles(selected)
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
    try {
      const formData = new FormData()
      files.forEach((f) => formData.append('files', f))
      const res = await axios.post(`${API_BASE_URL}/upload-dicom`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      setStudyId(res.data.study_id)
      setMetadata({
        ...res.data.metadata,
        study_id: res.data.study_id,
        image_ids: (res.data.metadata?.image_ids || []).map((id) => (id.startsWith('http') ? id : `${API_BASE_URL}${id}`)),
      })
      setUploadSuccess(true)
      setUploadSectionOpen(false)
      setView('study')
      fetchWorklist()
    } catch (err) {
      const detail = err.response?.data?.detail
      const msg = Array.isArray(detail) ? detail.map((d) => d.msg || d).join(', ') : detail || err.message
      setError(msg || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  useEffect(() => {
    const handleKey = (e) => {
      if (isEditableTarget(e.target)) return
      if (e.key === '?' && !e.ctrlKey && !e.metaKey) {
        setShortcutsOpen((o) => !o)
        e.preventDefault()
      }
      if (e.key === 'u' || e.key === 'U') {
        setUploadSectionOpen((o) => !o)
        e.preventDefault()
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'C' && report) {
        e.preventDefault()
        if (window.electronAPI?.copyToClipboard) {
          const text = typeof report === 'string' && report.trim().startsWith('<') ? htmlToPlainText(report) : String(report)
          if (text.trim()) window.electronAPI.copyToClipboard(text)
        }
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [report])

  const imageIds = Array.isArray(metadata?.image_ids) ? metadata.image_ids : []
  const seriesDescription =
    typeof metadata?.series?.[0]?.description === 'string'
      ? metadata.series[0].description
      : typeof metadata?.series?.[0]?.sequence_type === 'string'
        ? metadata.series[0].sequence_type
        : 'Series'

  const EmptyWorklistIcon = () => (
    <svg className="w-16 h-16 text-slate-300 mx-auto mb-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.25" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
    </svg>
  )

  return (
    <>
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <div className={`bg-[var(--color-bg)] flex flex-col transition-colors duration-300 ${metadata || view === 'study' ? 'h-screen overflow-hidden' : 'min-h-screen'}`}>
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
            <div>
              <span className="text-xl font-semibold text-white tracking-tight">Spine AI</span>
              {isElectron && (
                <span className="ml-2 text-[11px] font-medium text-white/60 uppercase tracking-wider">Desktop</span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {metadata && (
              <div className="hidden sm:flex items-center gap-3 text-sm text-white/90 mr-2">
                <span className="text-white/70 font-medium">Patient</span>
                <span className="text-white truncate max-w-[140px]" title={metadata.patient_name}>{metadata.patient_name}</span>
                <span className="text-white/40">·</span>
                <span className="text-white/70 font-medium">Date</span>
                <span>{metadata.study_date}</span>
              </div>
            )}
            <button type="button" onClick={() => setShortcutsOpen(true)} className="p-2.5 rounded-xl text-white/85 hover:bg-white/12 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-nav-end)]" aria-label="Keyboard shortcuts" title="Keyboard shortcuts">
              <KeyboardIcon />
            </button>
          </div>
        </header>

        <KeyboardShortcuts open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

        <main id="main-content" className="flex-1 flex flex-col min-h-0 overflow-hidden p-5 gap-5">
          {view === 'worklist' && (
            <>
              <section className="shrink-0 overflow-hidden">
                <div className="bg-[var(--color-bg-elevated)] rounded-2xl shadow-[var(--shadow-panel-soft)] border border-[var(--color-border)] overflow-hidden">
                  <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-[var(--color-text)] tracking-tight">Worklist</h2>
                    <button type="button" onClick={fetchWorklist} disabled={worklistLoading} className="btn-lift px-4 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] text-sm font-medium disabled:opacity-50 transition-colors">
                      {worklistLoading ? 'Loading…' : 'Refresh'}
                    </button>
                  </div>
                  <div className="p-5">
                    {worklistError && (
                      <div className="p-4 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-800 text-sm mb-4 flex items-start gap-3">
                        <span className="text-amber-500 mt-0.5 font-semibold" aria-hidden>!</span>
                        <span>{worklistError}</span>
                      </div>
                    )}
                    {worklistLoading && worklist.length === 0 ? (
                      <div className="space-y-3">
                        {[1, 2, 3].map((i) => (
                          <div key={i} className="flex items-center gap-4 p-4 rounded-xl border border-[var(--color-border)]">
                            <div className="h-10 w-10 rounded-xl skeleton-shimmer flex-shrink-0" />
                            <div className="flex-1 min-w-0 space-y-2">
                              <div className="h-4 w-2/5 rounded skeleton-shimmer" />
                              <div className="h-3 w-1/4 rounded skeleton-shimmer" />
                            </div>
                            <div className="h-8 w-16 rounded-lg skeleton-shimmer flex-shrink-0" />
                          </div>
                        ))}
                      </div>
                    ) : worklist.length === 0 ? (
                      <div className="py-16 px-6 text-center">
                        <EmptyWorklistIcon />
                        <h3 className="text-base font-semibold text-[var(--color-text)] mb-1">No studies ready for review</h3>
                        <p className="text-sm text-[var(--color-text-muted)] max-w-sm mx-auto leading-relaxed">
                          Studies will appear here after automatic or manual AI analysis. Ensure the backend and auto-analyzer are running.
                        </p>
                      </div>
                    ) : (
                      <ul className="worklist-list space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                        {worklist.map((s, idx) => (
                          <li key={s.study_id} className="animate-fade-in" style={{ animationDelay: `${idx * 0.04}s`, animationFillMode: 'backwards' }}>
                            <button
                              type="button"
                              onClick={() => loadStudy(s)}
                              className="btn-lift w-full text-left px-5 py-4 rounded-xl border border-[var(--color-border)] hover:border-blue-200 hover:bg-blue-50/50 hover:shadow-sm transition-all flex items-center justify-between gap-4 group"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="font-semibold text-[var(--color-text)] truncate">{s.patient_name ?? 'Unknown'}</p>
                                <p className="text-sm text-[var(--color-text-muted)] mt-0.5">ID: {s.patient_id ?? '—'} · {s.image_count ?? 0} image(s)</p>
                              </div>
                              <div className="text-sm text-[var(--color-text-muted)] flex-shrink-0">{s.study_date ?? '—'}</div>
                              <span className="flex-shrink-0 inline-flex items-center gap-1 text-[var(--color-primary)] font-medium group-hover:gap-2 transition-[gap]">
                                Open
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </section>

              <section className={`shrink-0 overflow-hidden transition-all duration-300 ease-out ${uploadSectionOpen ? 'max-h-[420px] opacity-100' : 'max-h-0 opacity-0'}`}>
                <div className="bg-[var(--color-bg-elevated)] rounded-2xl shadow-[var(--shadow-panel-soft)] border border-[var(--color-border)] overflow-hidden">
                  <button type="button" onClick={() => setUploadSectionOpen((o) => !o)} className="w-full flex items-center justify-between px-5 py-4 text-left text-[var(--color-primary)] font-medium hover:bg-[var(--color-bg-subtle)] transition-colors rounded-t-2xl" aria-expanded={uploadSectionOpen} title="Toggle upload (U)">
                    <span>Upload study (manual)</span>
                    <span className="text-[var(--color-text-muted)] text-sm font-normal">{uploadSectionOpen ? 'Collapse' : 'Expand'}</span>
                  </button>
                  {uploadSectionOpen && (
                    <div className="px-5 pb-5 pt-0 border-t border-[var(--color-border)]">
                      <div onDrop={handleDrop} onDragOver={handleDragOver} className="mt-4 border-2 border-dashed border-[var(--color-border)] rounded-xl p-8 text-center hover:border-[var(--color-primary)] hover:bg-blue-50/30 cursor-pointer transition-colors">
                        <input type="file" multiple accept=".dcm" onChange={handleFileChange} className="absolute w-0 h-0 opacity-0" id="dicom-upload" aria-label="Select DICOM files" />
                        <label htmlFor="dicom-upload" className="cursor-pointer block">
                          <span className="text-[var(--color-text-muted)] block mb-2">Drag and drop DICOM files or click to browse</span>
                          <span className="text-sm text-[var(--color-primary)] font-medium">.dcm files only</span>
                        </label>
                      </div>
                      {files.length > 0 && (
                        <div className="mt-4 flex items-center gap-3">
                          <span className="text-sm font-medium text-[var(--color-text)]">{files.length} file(s)</span>
                          <button type="button" onClick={handleUpload} disabled={uploading || files.length === 0} className="btn-lift px-5 py-2.5 rounded-xl font-medium text-white bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-dark)] hover:shadow-md disabled:opacity-50 transition-all">
                            {uploading ? 'Uploading…' : uploadSuccess ? 'Done' : 'Upload study'}
                          </button>
                        </div>
                      )}
                      {error && (
                        <div className="mt-3 p-4 rounded-xl bg-red-50 border border-red-200/80 text-red-800 text-sm flex items-start gap-2">
                          <span className="text-red-500 flex-shrink-0" aria-hidden>!</span>
                          <span>{error}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}

          {view === 'study' && metadata && (
            <>
              <div className="shrink-0 flex items-center gap-3">
                <button type="button" onClick={handleBackToWorklist} className="btn-lift inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] font-medium text-sm transition-colors">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                  Worklist
                </button>
                {selectedStudy?.status === 'analyzed' && (
                  <button type="button" onClick={handleApprove} className="btn-lift inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-sm text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm hover:shadow transition-all">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    Approve study
                  </button>
                )}
              </div>
              <div className="flex-1 min-h-0 overflow-hidden flex flex-col lg:flex-row gap-4">
                <section className="flex-1 min-h-0 lg:min-w-0 lg:w-1/2 flex flex-col overflow-hidden" aria-label="DICOM viewer">
                  <DICOMViewer imageIds={imageIds} seriesDescription={seriesDescription} className="h-full" />
                </section>
                <section className="flex-1 min-h-0 lg:min-w-0 lg:w-1/2 flex flex-col overflow-hidden" aria-label="Radiology report">
                  <ReportViewer
                    report={report}
                    structured={structured}
                    onReportChange={setReport}
                    analyzing={analyzing}
                    onAnalyze={handleAnalyze}
                    hasStudy={!!studyId}
                    analysisError={analysisError}
                    showCopyToPowerScribe={true}
                    className="h-full"
                  />
                </section>
              </div>
            </>
          )}
        </main>
      </div>
    </>
  )
}

export default App
