import { useState, useCallback, useEffect } from 'react'
import ReactQuill from 'react-quill'
import 'react-quill/dist/quill.snow.css'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { jsPDF } from 'jspdf'
import {
  markdownToHtmlAsync,
  enhanceReportHtml,
  htmlToPlainText,
  htmlToFormattedText,
} from '../utils/reportFormat'

const DISC_LEVELS = ['L1-L2', 'L2-L3', 'L3-L4', 'L4-L5', 'L5-S1']

marked.setOptions({ gfm: false, breaks: true, headerIds: false, mangle: false })

function ReportViewer({
  report = '',
  structured = null,
  onReportChange,
  analyzing = false,
  onAnalyze,
  hasStudy = false,
  analysisError = null,
  className = '',
  showCopyToPowerScribe = true,
}) {
  const confidence = structured?.confidence || {}
  const levelConfidence = confidence.level_confidence || {}
  const lowNotes = confidence.low_confidence_notes || []
  const hasLowConfidence =
    DISC_LEVELS.some((l) => (levelConfidence[l] || 'medium') === 'low') ||
    DISC_LEVELS.some((l) => (levelConfidence[l] || 'medium') === 'medium')

  const [displayHtml, setDisplayHtml] = useState('')
  const [editedHtml, setEditedHtml] = useState(null)
  const [viewMode, setViewMode] = useState(true)
  const [editValue, setEditValue] = useState('')
  const [exportOpen, setExportOpen] = useState(false)

  useEffect(() => {
    if (report == null || typeof report !== 'string' || !report.trim()) {
      setDisplayHtml('')
      setEditedHtml(null)
      setViewMode(true)
      return
    }
    const trimmed = report.trim()
    if (trimmed.startsWith('<')) {
      const safe = DOMPurify.sanitize(trimmed, {
        ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li', 'span', 'div', 'blockquote', 'hr'],
        ALLOWED_ATTR: ['class'],
      })
      setDisplayHtml(enhanceReportHtml(safe))
      setEditedHtml(null)
      setViewMode(true)
      return
    }
    let cancelled = false
    markdownToHtmlAsync(trimmed).then((html) => {
      if (!cancelled) {
        setDisplayHtml(html)
        setEditedHtml(null)
        setViewMode(true)
      }
    })
    return () => { cancelled = true }
  }, [report])

  const currentViewHtml = editedHtml != null ? editedHtml : displayHtml

  const switchToEdit = useCallback(() => {
    setEditValue(currentViewHtml)
    setViewMode(false)
  }, [currentViewHtml])

  const saveEdit = useCallback(() => {
    const sanitized = DOMPurify.sanitize(editValue, {
      ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li', 'span', 'div', 'blockquote', 'hr'],
      ALLOWED_ATTR: ['class'],
    })
    setEditedHtml(sanitized)
    setViewMode(true)
    onReportChange?.(sanitized)
  }, [editValue, onReportChange])

  const handleEditChange = useCallback((value) => setEditValue(value), [])

  const modules = {
    toolbar: [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['clean'],
    ],
  }

  const copyToPowerScribe = useCallback(() => {
    const text = htmlToPlainText(currentViewHtml)
    if (!text.trim()) {
      alert('No report content to copy.')
      return
    }
    if (typeof window !== 'undefined' && window.electronAPI?.copyToClipboard) {
      window.electronAPI.copyToClipboard(text)
      alert('Report copied to clipboard! Paste into PowerScribe with Ctrl+V')
    } else if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
      alert('Report copied to clipboard!')
    } else {
      alert('Clipboard not available.')
    }
  }, [currentViewHtml])

  const exportPlainText = useCallback(() => {
    const text = htmlToPlainText(currentViewHtml)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `spine-report-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
    setExportOpen(false)
  }, [currentViewHtml])

  const exportFormattedText = useCallback(() => {
    const text = htmlToFormattedText(currentViewHtml)
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `spine-report-formatted-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
    setExportOpen(false)
  }, [currentViewHtml])

  const exportHtml = useCallback(() => {
    const blob = new Blob([`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Spine MRI Report</title></head><body class="medical-report">${currentViewHtml}</body></html>`], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `spine-report-${new Date().toISOString().slice(0, 10)}.html`
    a.click()
    URL.revokeObjectURL(url)
    setExportOpen(false)
  }, [currentViewHtml])

  const exportPdf = useCallback(() => {
    const text = htmlToPlainText(currentViewHtml)
    const doc = new jsPDF({ format: 'a4', unit: 'mm' })
    const margin = 20
    const lineHeight = 6
    const pageHeight = doc.internal.pageSize.height
    let y = margin
    const lines = doc.splitTextToSize(text, doc.internal.pageSize.width - 2 * margin)
    for (const line of lines) {
      if (y + lineHeight > pageHeight - margin) {
        doc.addPage()
        y = margin
      }
      doc.text(line, margin, y)
      y += lineHeight
    }
    doc.save(`spine-report-${new Date().toISOString().slice(0, 10)}.pdf`)
    setExportOpen(false)
  }, [currentViewHtml])

  const statusBadge = analyzing
    ? { label: 'Analyzing…', class: 'bg-amber-100 text-amber-800 border-amber-200 animate-pulse-soft' }
    : report
      ? { label: 'Ready for review', class: 'bg-medical-success/10 text-medical-success border-medical-success/30' }
      : { label: 'Ready to analyze', class: 'bg-blue-50 text-[var(--color-primary)] border-[var(--color-border)]' }

  return (
    <div
      className={`flex flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-panel-soft)] overflow-hidden h-full min-h-0 ${className}`}
      aria-label="Radiology report"
    >
      <div className="shrink-0 flex items-center justify-between gap-4 px-5 py-3.5 border-b border-[var(--color-border)] flex-wrap">
        <h2 className="text-lg font-semibold text-[var(--color-text)] tracking-tight">Radiology Report</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border transition-all duration-200 ${statusBadge.class}`}>
            {statusBadge.label}
          </span>
          {report && showCopyToPowerScribe && (
            <button
              type="button"
              onClick={copyToPowerScribe}
              className="btn-lift inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm hover:shadow transition-all"
              title="Copy report to clipboard for PowerScribe (Ctrl+V to paste)"
            >
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h2a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy to PowerScribe
            </button>
          )}
          {report && viewMode && (
            <button type="button" onClick={switchToEdit} className="px-3 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] font-medium text-sm transition-all duration-200" title="Edit report">
              Edit Report
            </button>
          )}
          {report && !viewMode && (
            <button type="button" onClick={saveEdit} className="px-3 py-2 rounded-xl font-medium text-sm text-white bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] transition-all duration-200" title="Save and return to view">
              Save Changes
            </button>
          )}
          <button
            type="button"
            onClick={onAnalyze}
            disabled={!hasStudy || analyzing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-white bg-gradient-to-r from-[var(--color-primary)] to-[var(--color-primary-dark)] hover:shadow-panel-soft disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-250"
            title={hasStudy && !analyzing ? 'Run AI analysis' : undefined}
          >
            {analyzing ? (
              <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-medical-spin" aria-hidden />Analyzing…</>
            ) : (
              'Analyze with AI'
            )}
          </button>
          {report && (
            <div className="relative">
              <button type="button" onClick={() => setExportOpen((o) => !o)} className="px-4 py-2 rounded-xl border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] font-medium transition-all duration-200 text-sm" title="Export report">
                Export ▾
              </button>
              {exportOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setExportOpen(false)} aria-hidden />
                  <div className="absolute right-0 top-full mt-2 z-20 py-1.5 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-xl shadow-modal min-w-[200px] animate-scale-in">
                    <p className="px-4 py-2 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider border-b border-[var(--color-border)] mb-1">Export as</p>
                    <button type="button" onClick={exportPlainText} className="w-full text-left px-4 py-2.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors">Plain text (.txt)</button>
                    <button type="button" onClick={exportFormattedText} className="w-full text-left px-4 py-2.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors">Formatted text (.txt)</button>
                    <button type="button" onClick={exportHtml} className="w-full text-left px-4 py-2.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors">HTML (.html)</button>
                    <button type="button" onClick={exportPdf} className="w-full text-left px-4 py-2.5 text-sm text-[var(--color-text)] hover:bg-[var(--color-bg-subtle)] transition-colors">PDF (.pdf)</button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {analysisError && (
        <div className="mx-4 mt-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm flex items-center gap-2 shrink-0 animate-fade-in">
          <span className="text-red-500" aria-hidden>⚠</span>
          {analysisError}
        </div>
      )}

      {report && Object.keys(levelConfidence).length > 0 && (
        <div className="mx-4 mt-2 p-3 rounded-panel bg-[var(--color-bg-subtle)] border border-[var(--color-border)] shrink-0 animate-fade-in">
          <div className="text-xs font-medium text-[var(--color-text-muted)] mb-2">AI confidence by level</div>
          <div className="flex flex-wrap gap-2">
            {DISC_LEVELS.map((level) => {
              const conf = (levelConfidence[level] || 'medium').toLowerCase()
              const isLow = conf === 'low'
              const isMedium = conf === 'medium'
              const bg = isLow ? 'bg-amber-200 border-amber-400' : isMedium ? 'bg-yellow-100 border-yellow-400' : 'bg-green-100 border-green-400'
              const label = isLow ? 'Low' : isMedium ? 'Medium' : 'High'
              return (
                <span key={level} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-medium ${bg} ${isLow || isMedium ? 'text-amber-900' : 'text-green-900'}`} title={isLow || isMedium ? 'Verify carefully' : 'High confidence'}>
                  <span className="font-mono">{level}</span>
                  <span>{label}</span>
                </span>
              )
            })}
          </div>
          {lowNotes.length > 0 && (
            <ul className="mt-2 text-xs text-[var(--color-text-muted)] list-disc list-inside space-y-0.5">
              {lowNotes.slice(0, 5).map((note, i) => (
                <li key={i}>{note}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {hasLowConfidence && report && (
        <div className="mx-4 mt-2 py-2 px-3 rounded-panel bg-amber-50 border border-amber-200 text-amber-900 text-sm shrink-0 animate-fade-in">
          <span className="font-medium">Please verify:</span> Findings marked Low or Medium confidence; review on images before signing.
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        {analyzing && !report ? (
          <div className="flex-1 p-6 space-y-4 animate-fade-in" aria-live="polite" aria-busy="true">
            <div className="h-4 rounded-lg w-3/4 skeleton-shimmer" />
            <div className="h-3 rounded w-full skeleton-shimmer" style={{ animationDelay: '0.1s' }} />
            <div className="h-3 rounded w-full skeleton-shimmer" style={{ animationDelay: '0.15s' }} />
            <div className="h-3 rounded w-5/6 skeleton-shimmer" style={{ animationDelay: '0.2s' }} />
          </div>
        ) : !report && !analyzing ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <svg className="w-20 h-20 text-[var(--color-text-muted)] opacity-60 mb-4 animate-pulse-soft" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-[var(--color-text-muted)] font-medium">Select a study from the worklist or run “Analyze with AI” to generate a report.</p>
          </div>
        ) : viewMode ? (
          <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-5 medical-report bg-[var(--color-bg-elevated)]" role="article" aria-label="Report content" dangerouslySetInnerHTML={{ __html: currentViewHtml }} />
        ) : (
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden report-editor-wrapper">
            <ReactQuill theme="snow" value={editValue} onChange={handleEditChange} modules={modules} className="flex-1 flex flex-col quill-report report-editor min-h-0" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }} />
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 py-2 border-t border-[var(--color-border)] text-[var(--color-text-muted)] text-xs bg-[var(--color-bg-subtle)]">
        {analyzing ? <span className="flex items-center gap-2"><span className="inline-block w-4 h-4 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" aria-hidden />AI analysis in progress…</span> : report ? <span>{viewMode ? 'View mode. Click “Edit Report” to modify.' : 'Edit mode. Click “Save Changes” when done.'} {Object.keys(levelConfidence).length > 0 && ' Confidence by level above.'}</span> : <span>Select a study or run analysis to generate a report.</span>}
      </div>
    </div>
  )
}

export default ReportViewer
