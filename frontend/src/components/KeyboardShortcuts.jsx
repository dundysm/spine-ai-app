import { useEffect } from 'react'

const SHORTCUTS = [
  { keys: ['←', '→'], description: 'Previous / next DICOM slice (when viewer focused)' },
  { keys: ['J', 'K'], description: 'Previous / next slice (vim-style)' },
  { keys: ['U'], description: 'Toggle upload panel' },
  { keys: ['?'], description: 'Show this help' },
  { keys: ['Esc'], description: 'Close dialog' },
]

/**
 * Modal that lists keyboard shortcuts. Used with App-level state.
 */
function KeyboardShortcuts({ open, onClose }) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-md animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="bg-[var(--color-bg-elevated)] rounded-panel-lg shadow-modal border border-[var(--color-border)] max-w-md w-full p-6 animate-scale-in"
        style={{ animationDelay: '0.05s', animationFillMode: 'backwards' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="shortcuts-title" className="text-lg font-semibold text-[var(--color-text)]">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2.5 rounded-xl text-[var(--color-text-muted)] hover:bg-[var(--color-bg-subtle)] hover:text-[var(--color-text)] transition-all duration-200"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <ul className="space-y-3">
          {SHORTCUTS.map(({ keys, description }, i) => (
            <li key={i} className="flex items-center justify-between gap-4 text-sm">
              <span className="text-[var(--color-text)]">{description}</span>
              <span className="flex gap-1.5 shrink-0">
                {keys.map((k) => (
                  <kbd
                    key={k}
                    className="px-2.5 py-1 rounded-lg bg-[var(--color-bg-subtle)] border border-[var(--color-border)] text-[var(--color-text)] font-mono text-xs transition-colors duration-200"
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-[var(--color-text-muted)]">
          Focus the image viewer (click it) before using slice shortcuts so the report editor does not capture keys.
        </p>
      </div>
    </div>
  )
}

export default KeyboardShortcuts
