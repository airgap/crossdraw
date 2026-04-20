import { useState, useCallback, useEffect } from 'react'
import { ColorPicker } from '@/ui/color-picker'
import { getBrushSettings } from '@/tools/brush'
import { setPrimaryColor, setSecondaryColor } from '@/ui/tool-options-state'

export function ColorPickerPanel() {
  const [color, setColor] = useState(() => getBrushSettings().color)
  const [opacity, setOpacity] = useState(() => getBrushSettings().opacity)

  // Sync from external changes periodically (e.g. eyedropper picks)
  useEffect(() => {
    const id = setInterval(() => {
      const brush = getBrushSettings()
      setColor(brush.color)
      setOpacity(brush.opacity)
    }, 250)
    return () => clearInterval(id)
  }, [])

  const handleChange = useCallback((hex: string, a: number) => {
    setColor(hex)
    setOpacity(a)
    setPrimaryColor(hex, a)
  }, [])

  const handleSecondaryChange = useCallback((hex: string, a: number) => {
    setSecondaryColor(hex, a)
  }, [])

  return (
    <div style={{ padding: 4 }}>
      <ColorPicker
        color={color}
        opacity={opacity}
        onChange={handleChange}
        onSecondaryChange={handleSecondaryChange}
        embedded
      />
    </div>
  )
}
