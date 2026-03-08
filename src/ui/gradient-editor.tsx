import { v4 as uuid } from 'uuid'
import { useState } from 'react'
import type { Gradient, GradientStop } from '@/types'

const rowStyle: React.CSSProperties = {
  display: 'flex',
  gap: 4,
  marginBottom: 4,
  alignItems: 'center',
}

const inputStyle: React.CSSProperties = {
  background: '#1a1a1a',
  border: '1px solid #444',
  borderRadius: 3,
  color: '#ddd',
  fontSize: 11,
  padding: '2px 4px',
  width: '100%',
}

const smallInputStyle: React.CSSProperties = {
  ...inputStyle,
  width: 52,
}

const btnStyle: React.CSSProperties = {
  background: '#3a3a3a',
  border: '1px solid #555',
  borderRadius: 3,
  color: '#ccc',
  fontSize: 10,
  padding: '3px 8px',
  cursor: 'pointer',
}

const gradientTypes = ['linear', 'radial', 'conical', 'box'] as const

export function GradientEditor({ gradient, onChange }: { gradient: Gradient; onChange: (g: Gradient) => void }) {
  const [selectedStop, setSelectedStop] = useState(0)

  const cssGradient = buildCSSPreview(gradient)

  function updateStop(index: number, updates: Partial<GradientStop>) {
    const stops = gradient.stops.map((s, i) => (i === index ? { ...s, ...updates } : s))
    onChange({ ...gradient, stops })
  }

  function addStop() {
    const newOffset = 0.5
    const newStop: GradientStop = { offset: newOffset, color: '#888888', opacity: 1 }
    const stops = [...gradient.stops, newStop].sort((a, b) => a.offset - b.offset)
    onChange({ ...gradient, stops })
    setSelectedStop(stops.findIndex((s) => s === newStop))
  }

  function removeStop(index: number) {
    if (gradient.stops.length <= 2) return
    const stops = gradient.stops.filter((_, i) => i !== index)
    onChange({ ...gradient, stops })
    if (selectedStop >= stops.length) setSelectedStop(stops.length - 1)
  }

  return (
    <div>
      {/* Type selector */}
      <div style={rowStyle}>
        <span style={{ fontSize: 10, color: '#888', width: 30 }}>Type</span>
        <select
          style={{ ...inputStyle, width: 'auto', flex: 1 }}
          value={gradient.type}
          onChange={(e) => onChange({ ...gradient, type: e.target.value as Gradient['type'] })}
        >
          {gradientTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* Gradient preview bar */}
      <div
        style={{
          height: 20,
          borderRadius: 3,
          border: '1px solid #555',
          background: cssGradient,
          marginBottom: 4,
          position: 'relative',
          cursor: 'pointer',
        }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const offset = (e.clientX - rect.left) / rect.width
          // Click to add a stop
          const newStop: GradientStop = { offset, color: '#888888', opacity: 1 }
          const stops = [...gradient.stops, newStop].sort((a, b) => a.offset - b.offset)
          onChange({ ...gradient, stops })
          setSelectedStop(stops.findIndex((s) => s.offset === offset))
        }}
      >
        {/* Stop markers */}
        {gradient.stops.map((stop, i) => (
          <div
            key={i}
            onClick={(e) => {
              e.stopPropagation()
              setSelectedStop(i)
            }}
            style={{
              position: 'absolute',
              left: `${stop.offset * 100}%`,
              top: -2,
              width: 10,
              height: 24,
              marginLeft: -5,
              background: stop.color,
              border: i === selectedStop ? '2px solid #4a7dff' : '2px solid #fff',
              borderRadius: 2,
              cursor: 'grab',
            }}
            draggable
            onDrag={(e) => {
              if (e.clientX === 0) return // drag end fires with 0
              const rect = e.currentTarget.parentElement!.getBoundingClientRect()
              const newOffset = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
              updateStop(i, { offset: Math.round(newOffset * 100) / 100 })
            }}
          />
        ))}
      </div>

      {/* Stop controls */}
      {gradient.stops[selectedStop] && (
        <div style={{ padding: 4, background: '#222', borderRadius: 3, marginBottom: 4 }}>
          <div style={rowStyle}>
            <div
              style={{
                width: 20,
                height: 20,
                borderRadius: 2,
                border: '1px solid #555',
                background: gradient.stops[selectedStop]!.color,
                position: 'relative',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <input
                type="color"
                value={gradient.stops[selectedStop]!.color}
                onChange={(e) => updateStop(selectedStop, { color: e.target.value })}
                style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer' }}
              />
            </div>
            <input
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11 }}
              value={gradient.stops[selectedStop]!.color}
              onChange={(e) => {
                if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) {
                  updateStop(selectedStop, { color: e.target.value })
                }
              }}
            />
            <button
              style={{ ...btnStyle, fontSize: 9, padding: '1px 4px' }}
              onClick={() => removeStop(selectedStop)}
              disabled={gradient.stops.length <= 2}
            >
              ×
            </button>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: '#888', width: 30 }}>Pos</span>
            <input
              type="range"
              min="0"
              max="100"
              style={{ flex: 1 }}
              value={Math.round(gradient.stops[selectedStop]!.offset * 100)}
              onChange={(e) => updateStop(selectedStop, { offset: Number(e.target.value) / 100 })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
              {Math.round(gradient.stops[selectedStop]!.offset * 100)}%
            </span>
          </div>
          <div style={rowStyle}>
            <span style={{ fontSize: 10, color: '#888', width: 30 }}>Alpha</span>
            <input
              type="range"
              min="0"
              max="100"
              style={{ flex: 1 }}
              value={Math.round(gradient.stops[selectedStop]!.opacity * 100)}
              onChange={(e) => updateStop(selectedStop, { opacity: Number(e.target.value) / 100 })}
            />
            <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
              {Math.round(gradient.stops[selectedStop]!.opacity * 100)}%
            </span>
          </div>
        </div>
      )}

      <button style={{ ...btnStyle, marginBottom: 4 }} onClick={addStop}>
        + Add Stop
      </button>

      {/* Angle (linear/conical) */}
      {(gradient.type === 'linear' || gradient.type === 'conical') && (
        <div style={rowStyle}>
          <span style={{ fontSize: 10, color: '#888', width: 30 }}>Angle</span>
          <input
            type="range"
            min="0"
            max="360"
            style={{ flex: 1 }}
            value={gradient.angle ?? 0}
            onChange={(e) => onChange({ ...gradient, angle: Number(e.target.value) })}
          />
          <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>{gradient.angle ?? 0}°</span>
        </div>
      )}

      {/* Radius (radial/box) */}
      {(gradient.type === 'radial' || gradient.type === 'box') && (
        <div style={rowStyle}>
          <span style={{ fontSize: 10, color: '#888', width: 30 }}>Radius</span>
          <input
            type="range"
            min="10"
            max="200"
            style={{ flex: 1 }}
            value={Math.round((gradient.radius ?? 0.5) * 100)}
            onChange={(e) => onChange({ ...gradient, radius: Number(e.target.value) / 100 })}
          />
          <span style={{ fontSize: 10, color: '#aaa', width: 28, textAlign: 'right' }}>
            {Math.round((gradient.radius ?? 0.5) * 100)}%
          </span>
        </div>
      )}

      {/* Center position */}
      <div style={rowStyle}>
        <span style={{ fontSize: 10, color: '#888', width: 14 }}>X</span>
        <input
          type="number"
          step="0.05"
          style={smallInputStyle}
          value={Math.round(gradient.x * 100) / 100}
          onChange={(e) => onChange({ ...gradient, x: Number(e.target.value) })}
        />
        <span style={{ fontSize: 10, color: '#888', width: 14 }}>Y</span>
        <input
          type="number"
          step="0.05"
          style={smallInputStyle}
          value={Math.round(gradient.y * 100) / 100}
          onChange={(e) => onChange({ ...gradient, y: Number(e.target.value) })}
        />
      </div>
    </div>
  )
}

function buildCSSPreview(grad: Gradient): string {
  const stops = grad.stops.map((s) => `${s.color} ${Math.round(s.offset * 100)}%`).join(', ')

  switch (grad.type) {
    case 'linear':
      return `linear-gradient(${grad.angle ?? 0}deg, ${stops})`
    case 'radial':
      return `radial-gradient(circle at ${grad.x * 100}% ${grad.y * 100}%, ${stops})`
    case 'conical':
      return `conic-gradient(from ${grad.angle ?? 0}deg at ${grad.x * 100}% ${grad.y * 100}%, ${stops})`
    case 'box':
      // No CSS equivalent; approximate with radial
      return `radial-gradient(circle at ${grad.x * 100}% ${grad.y * 100}%, ${stops})`
  }
}

export function createDefaultGradient(): Gradient {
  return {
    id: uuid(),
    name: 'Gradient',
    type: 'linear',
    angle: 0,
    x: 0.5,
    y: 0.5,
    radius: 0.5,
    stops: [
      { offset: 0, color: '#000000', opacity: 1 },
      { offset: 1, color: '#ffffff', opacity: 1 },
    ],
    dithering: {
      enabled: false,
      algorithm: 'none',
      strength: 0,
      seed: 0,
    },
  }
}
