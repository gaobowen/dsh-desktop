export const WIDTH_RESERVE = 0.95
export const DEFAULT_LINE_HEIGHT = 1.15

export function positive(value, fallback) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

export function recommendedTextCapacity(width, height, fontSize, lineHeight = DEFAULT_LINE_HEIGHT) {
  const size = positive(fontSize, 18)
  const spacing = positive(lineHeight, DEFAULT_LINE_HEIGHT)
  const charactersPerLine = Math.max(1, Math.floor(Math.max(0, width) * WIDTH_RESERVE / size))
  const lines = Math.max(1, Math.floor(Math.max(0, height) / (size * spacing)))
  return Math.max(1, Math.min(1000, Math.floor(charactersPerLine * lines * 0.9)))
}
