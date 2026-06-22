import { useEffect, useRef, useState } from 'react'
import { X, ZoomIn, ZoomOut, ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * Fullscreen image viewer with zoom + pan.
 * Zoom via wheel, +/- buttons or double-click; pan by dragging while zoomed.
 * Optional prev/next navigation when multiple images are supplied.
 */
export function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose
}: {
  images: string[]
  index: number
  onIndexChange?: (i: number) => void
  onClose: () => void
}) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const dragging = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  const reset = () => { setScale(1); setOffset({ x: 0, y: 0 }) }

  // Reset zoom whenever the displayed image changes
  useEffect(() => { reset() }, [index])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft' && images.length > 1) onIndexChange?.((index - 1 + images.length) % images.length)
      else if (e.key === 'ArrowRight' && images.length > 1) onIndexChange?.((index + 1) % images.length)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, images.length, onClose, onIndexChange])

  const clampScale = (s: number) => Math.min(5, Math.max(1, s))

  const zoomBy = (delta: number) => {
    setScale(s => {
      const next = clampScale(s + delta)
      if (next === 1) setOffset({ x: 0, y: 0 })
      return next
    })
  }

  const onWheel = (e: React.WheelEvent) => { zoomBy(e.deltaY < 0 ? 0.3 : -0.3) }

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale === 1) return
    dragging.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    setOffset({ x: dragging.current.ox + (e.clientX - dragging.current.x), y: dragging.current.oy + (e.clientY - dragging.current.y) })
  }
  const onPointerUp = () => { dragging.current = null }

  const src = `/uploads/${images[index]?.split('/').pop()}`
  const multi = images.length > 1

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.92)', display: 'flex', alignItems: 'center', justifyContent: 'center', touchAction: 'none', overscrollBehavior: 'contain' }}
    >
      <img
        src={src}
        alt=""
        onClick={e => e.stopPropagation()}
        onWheel={onWheel}
        onDoubleClick={() => (scale === 1 ? setScale(2.5) : reset())}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          maxWidth: '96vw',
          maxHeight: '92vh',
          objectFit: 'contain',
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transition: dragging.current ? 'none' : 'transform 0.12s ease-out',
          cursor: scale > 1 ? 'grab' : 'zoom-in',
          userSelect: 'none',
          touchAction: 'none'
        }}
        draggable={false}
      />

      {/* Controls */}
      <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', top: 'env(safe-area-inset-top, 12px)', right: 12, display: 'flex', gap: 8 }}>
        <button className="btn btn-secondary" style={ctrlStyle} onClick={() => zoomBy(0.5)} aria-label="Zoom in"><ZoomIn size={18} /></button>
        <button className="btn btn-secondary" style={ctrlStyle} onClick={() => zoomBy(-0.5)} aria-label="Zoom out"><ZoomOut size={18} /></button>
        <button className="btn btn-secondary" style={ctrlStyle} onClick={onClose} aria-label="Close"><X size={18} /></button>
      </div>

      {multi && (
        <>
          <button className="btn btn-secondary" style={{ ...ctrlStyle, position: 'fixed', left: 12, top: '50%', transform: 'translateY(-50%)' }} aria-label="Previous"
            onClick={e => { e.stopPropagation(); onIndexChange?.((index - 1 + images.length) % images.length) }}><ChevronLeft size={20} /></button>
          <button className="btn btn-secondary" style={{ ...ctrlStyle, position: 'fixed', right: 12, top: '50%', transform: 'translateY(-50%)' }} aria-label="Next"
            onClick={e => { e.stopPropagation(); onIndexChange?.((index + 1) % images.length) }}><ChevronRight size={20} /></button>
          <div onClick={e => e.stopPropagation()} style={{ position: 'fixed', bottom: 16, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: 999, padding: '4px 12px', fontSize: 'var(--font-size-xs)', fontWeight: 600 }}>
            {index + 1} / {images.length}
          </div>
        </>
      )}
    </div>
  )
}

const ctrlStyle: React.CSSProperties = { borderRadius: 999, padding: '8px', minWidth: 0 }
