import { useState, useEffect, useRef, useCallback } from 'react'
import { initCornerstone, cornerstone } from '../cornerstoneInit'

const DISC_LEVELS = ['L1-L2', 'L2-L3', 'L3-L4', 'L4-L5', 'L5-S1']

function getSeriesBadgeClass(seriesDescription) {
  const d = (seriesDescription || '').toUpperCase()
  if (d.includes('T1')) return 'bg-blue-500/90 text-white'
  if (d.includes('T2')) return 'bg-emerald-600 text-white'
  if (d.includes('STIR')) return 'bg-violet-600 text-white'
  return 'bg-gray-500/90 text-white'
}

function MedicalCrossSpinner() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 animate-fade-in" aria-live="polite">
      <svg
        className="w-12 h-12 text-white animate-medical-spin drop-shadow-sm"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
      <span className="text-sm text-white/90 animate-pulse-soft">Loading image…</span>
    </div>
  )
}

function DICOMViewer({ imageIds = [], seriesDescription = 'Series', className = '' }) {
  const elementRef = useRef(null)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [enabled, setEnabled] = useState(false)
  const [initFailed, setInitFailed] = useState(null)

  const totalSlices = Array.isArray(imageIds) ? imageIds.length : 0

  useEffect(() => {
    const result = initCornerstone()
    if (!result.ok) setInitFailed(result.error || 'Viewer failed to initialize')
  }, [])

  const enableElement = useCallback(() => {
    if (!elementRef.current || !cornerstone || enabled) return
    try {
      cornerstone.enable(elementRef.current)
      setEnabled(true)
    } catch (e) {
      setError(e?.message || 'Failed to enable viewer')
    }
  }, [enabled])

  useEffect(() => {
    if (!elementRef.current || !totalSlices || !enabled || !cornerstone) return
    const el = elementRef.current
    const url = imageIds[currentIndex]
    if (url == null || typeof url !== 'string') return
    const imageId = `wadouri:${url}`
    setLoading(true)
    setError(null)
    let cancelled = false
    cornerstone
      .loadImage(imageId)
      .then((image) => {
        if (cancelled) return
        try {
          cornerstone.displayImage(el, image)
          cornerstone.resize(el)
        } catch (e) {
          setError(e?.message || 'Failed to display image')
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to load image')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [currentIndex, imageIds, totalSlices, enabled])

  useEffect(() => {
    if (!elementRef.current || !enabled || !cornerstone) return
    const el = elementRef.current
    const handleResize = () => {
      try { cornerstone.resize(el) } catch (_) {}
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [enabled])

  useEffect(() => {
    if (totalSlices > 0 && elementRef.current) enableElement()
    return () => {
      if (elementRef.current && enabled) {
        try { cornerstone.disable(elementRef.current) } catch (_) {}
        setEnabled(false)
      }
    }
  }, [totalSlices, enableElement, enabled])

  const goPrev = () => setCurrentIndex((i) => (i <= 0 ? totalSlices - 1 : i - 1))
  const goNext = () => setCurrentIndex((i) => (i >= totalSlices - 1 ? 0 : i + 1))

  useEffect(() => {
    if (totalSlices <= 1) return
    const handleKey = (e) => {
      const t = e.target
      if (t && t.closest && t.closest('input, textarea, [contenteditable="true"]')) return
      if (e.key === 'ArrowLeft' || e.key === 'j' || e.key === 'J') {
        goPrev()
        e.preventDefault()
      } else if (e.key === 'ArrowRight' || e.key === 'k' || e.key === 'K') {
        goNext()
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [totalSlices])

  const contentBg = 'bg-[#0f172a]'

  if (initFailed) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-panel-soft)] p-10 text-[var(--color-text-muted)] h-full min-h-[320px] ${className}`}
        role="alert"
      >
        <p className="font-semibold text-[var(--color-text)]">Viewer unavailable</p>
        <p className="text-sm mt-2">{initFailed}</p>
        <p className="text-xs mt-2 text-[var(--color-text-muted)]">Report panel and AI analysis remain available.</p>
      </div>
    )
  }

  if (!imageIds || imageIds.length === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-panel-soft)] h-full min-h-[320px] ${className}`}
      >
        <div className="w-20 h-20 rounded-2xl bg-[var(--color-bg-subtle)] flex items-center justify-center mb-5">
          <svg
            className="w-10 h-10 text-[var(--color-text-muted)] opacity-60"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.25"
            aria-hidden
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14" />
          </svg>
        </div>
        <p className="text-[var(--color-text)] font-medium">No images loaded</p>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">Upload a DICOM study above to view slices here.</p>
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-panel-soft)] overflow-hidden h-full min-h-0 ${className}`}
      aria-label="DICOM image viewer"
    >
      {/* Image area: black letterboxing, max height for controls */}
      <div className={`flex-1 min-h-0 flex items-center justify-center overflow-hidden ${contentBg} transition-colors duration-300`} style={{ maxHeight: 'calc(100% - 60px)' }}>
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-[2px] z-10 animate-fade-in">
            <MedicalCrossSpinner />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 z-10 p-4 animate-fade-in">
            <div className="bg-red-900/90 text-red-100 rounded-xl p-4 max-w-sm flex items-start gap-3 shadow-modal animate-scale-in">
              <span className="text-red-300 shrink-0" aria-hidden>⚠</span>
              <p className="text-sm">{error}</p>
            </div>
          </div>
        )}
        <div
          ref={elementRef}
          className="w-full h-full min-h-[200px] flex items-center justify-center"
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      <div
        className="shrink-0 h-14 flex items-center justify-between px-4 bg-black/90 backdrop-blur-sm text-white rounded-b-2xl border-t border-white/10"
        role="toolbar"
        aria-label="Image navigation"
      >
        <span
          className={`inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-medium ${getSeriesBadgeClass(seriesDescription)}`}
          title={seriesDescription}
        >
          {seriesDescription.length > 24 ? seriesDescription.slice(0, 24) + '…' : seriesDescription || 'Series'}
        </span>
        <div className="flex items-center gap-4">
          <span className="text-sm tabular-nums text-white/90 font-medium">
            Slice {currentIndex + 1} / {totalSlices}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={totalSlices <= 1}
              className="px-4 py-2 rounded-xl bg-white/12 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
              aria-label="Previous slice"
              title="Previous slice (← or J)"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={totalSlices <= 1}
              className="px-4 py-2 rounded-xl bg-white/12 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium transition-colors"
              aria-label="Next slice"
              title="Next slice (→ or K)"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default DICOMViewer
