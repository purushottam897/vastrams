import React, { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'
import { Link } from 'react-router-dom'

export function DropdownSelect({ 
  value, 
  onChange, 
  options = [], 
  placeholder = "Select...", 
  className = "", 
  actionLabel = null, 
  onAction = null,
  dropUp = false,
  size = "md"
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, shouldOpenUp: false })
  const containerRef = useRef(null)

  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        // Also check if click was inside portal dropdown
        const portalEl = document.getElementById('dropdown-portal-root')
        if (portalEl && portalEl.contains(event.target)) return
        setIsOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const updatePosition = () => {
        if (!containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        const spaceBelow = window.innerHeight - rect.bottom
        const spaceAbove = rect.top
        const shouldOpenUp = dropUp ? (spaceAbove >= 160 || spaceAbove > spaceBelow) : (spaceBelow < 200 && spaceAbove > spaceBelow)
        const minMenuWidth = Math.max(rect.width, 110)
        const clampedLeft = Math.max(8, Math.min(rect.left, window.innerWidth - minMenuWidth - 8))

        setCoords({
          top: rect.bottom,
          bottomTop: rect.top,
          left: clampedLeft,
          width: rect.width,
          shouldOpenUp
        })
      }

      updatePosition()
      window.addEventListener('resize', updatePosition)
      window.addEventListener('scroll', updatePosition, true)
      return () => {
        window.removeEventListener('resize', updatePosition)
        window.removeEventListener('scroll', updatePosition, true)
      }
    }
  }, [isOpen, dropUp])

  const normalizedOptions = (options || []).map(opt => {
    if (typeof opt === 'object' && opt !== null) {
      return opt
    }
    return { value: opt, label: opt }
  })

  const hasOptions = normalizedOptions.length > 0
  const phLower = placeholder.toLowerCase()
  
  let emptyMessage = "No options available"
  let addPath = null
  if (phLower.includes('party') || phLower.includes('vendor')) {
    emptyMessage = "No vendors added yet"
    addPath = "/vendors"
  } else if (phLower.includes('financier')) {
    emptyMessage = "No financiers added yet"
    addPath = "/financiers"
  } else if (phLower.includes('loan')) {
    emptyMessage = "No loans found"
  } else if (phLower.includes('bank')) {
    emptyMessage = "No banks configured"
    addPath = "/settings"
  } else if (phLower.includes('mode')) {
    emptyMessage = "No payment modes set up"
  }

  const btnPlaceholder = hasOptions ? placeholder : emptyMessage
  const selectedOption = normalizedOptions.find(o => String(o.value) === String(value))
  const isButtonDisabled = !hasOptions && !onAction

  const isSmall = size === 'sm'
  const paddingClasses = isSmall ? 'h-8 px-2.5 text-xs' : 'h-10 px-3 text-sm'

  return (
    <div className="inline-flex items-center space-x-2 flex-wrap gap-y-1 w-full">
      <div className={`relative w-full ${className}`} ref={containerRef}>
        <button
          type="button"
          disabled={isButtonDisabled}
          onClick={() => setIsOpen(!isOpen)}
          className={`w-full flex items-center justify-between ${paddingClasses} rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all font-medium`}
          style={{
            color: selectedOption ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
            opacity: isButtonDisabled ? 0.5 : 1,
            cursor: isButtonDisabled ? 'not-allowed' : 'pointer',
          }}
        >
          <span className="truncate font-medium whitespace-nowrap mr-1 text-left flex-1">
            {selectedOption ? selectedOption.label : btnPlaceholder}
          </span>
          <ChevronDown size={isSmall ? 14 : 16} className="shrink-0 ml-1 text-slate-400" />
        </button>

        {isOpen && (hasOptions || onAction) && createPortal(
          <div
            id="dropdown-portal-root"
            className="fixed z-[99999] rounded-lg py-1 max-h-60 overflow-y-auto focus:outline-none"
            style={{
              top: coords.shouldOpenUp ? 'auto' : `${coords.top + 4}px`,
              bottom: coords.shouldOpenUp ? `${window.innerHeight - coords.bottomTop + 4}px` : 'auto',
              left: `${coords.left}px`,
              minWidth: `${Math.max(coords.width, 110)}px`,
              background: 'var(--color-bg-elevated)',
              border: `1px solid var(--color-border-strong)`,
              boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5), 0 4px 16px rgba(0, 0, 0, 0.3)',
            }}
          >
            {normalizedOptions.map((opt) => {
              const isSelected = String(opt.value) === String(value)
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    onChange(opt.value)
                    setIsOpen(false)
                  }}
                  className={`w-full flex items-center justify-between ${isSmall ? 'px-2.5 py-1 text-xs' : 'px-3 py-2 text-sm'} text-left transition-colors whitespace-nowrap`}
                  style={{
                    color: isSelected ? 'var(--color-primary)' : 'var(--color-text-primary)',
                    background: isSelected ? 'var(--color-primary-muted)' : 'transparent',
                  }}
                  onMouseEnter={e => {
                    if (!isSelected) e.currentTarget.style.background = 'var(--color-bg-hover)'
                  }}
                  onMouseLeave={e => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent'
                  }}
                >
                  <span className={isSelected ? 'font-semibold' : ''}>{opt.label}</span>
                  {isSelected && <Check size={isSmall ? 12 : 14} style={{ color: 'var(--color-primary)' }} className="shrink-0 ml-2" />}
                </button>
              )
            })}

            {actionLabel && onAction && (
              <div className="sticky bottom-0 bg-[var(--color-bg-elevated)] p-1 border-t border-[var(--color-border)]">
                <button
                  type="button"
                  onClick={() => {
                    onAction()
                    setIsOpen(false)
                  }}
                  className="w-full py-1.5 px-3 rounded-md text-xs font-semibold text-white text-center hover:opacity-95 transition-opacity"
                  style={{ background: 'var(--gradient-primary)' }}
                >
                  {actionLabel}
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
      </div>
      {addPath && !hasOptions && (
        <Link 
          to={addPath}
          className="text-xs font-semibold hover:opacity-80 shrink-0 px-1 transition-all"
          style={{ color: 'var(--color-primary)', whiteSpace: 'nowrap' }}
        >
          + Add one
        </Link>
      )}
    </div>
  )
}

export default DropdownSelect
