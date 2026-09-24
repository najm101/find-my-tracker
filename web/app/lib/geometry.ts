/** Points along lines of [longitude, latitude]; flat-earth, fine over a city or a trip. */

export type LngLat = [number, number]

const METRES_PER_DEGREE = 111_320

/** Metres along the line at each vertex. */
export function measure(line: LngLat[]): number[] {
  const out = [0]
  for (let i = 1; i < line.length; i++) {
    const [x1, y1] = line[i - 1]
    const [x2, y2] = line[i]
    const k = Math.cos((((y1 + y2) / 2) * Math.PI) / 180)
    out.push(
      out[i - 1] + Math.hypot((x2 - x1) * k, y2 - y1) * METRES_PER_DEGREE
    )
  }
  return out
}

/** The point `f` (0..1) of the way along the line. */
export function pointAlong(line: LngLat[], along: number[], f: number): LngLat {
  const total = along[along.length - 1]
  if (total === 0) return line[0]
  const target = total * Math.min(1, Math.max(0, f))
  let i = 1
  while (i < along.length - 1 && along[i] < target) i++
  const span = along[i] - along[i - 1]
  const g = span ? (target - along[i - 1]) / span : 0
  const [x1, y1] = line[i - 1]
  const [x2, y2] = line[i]
  return [x1 + (x2 - x1) * g, y1 + (y2 - y1) * g]
}

/** The vertices passed `f` of the way along (the point at `f` itself not included). */
export function upTo(line: LngLat[], along: number[], f: number): LngLat[] {
  const target = along[along.length - 1] * f
  return line.filter((_, i) => along[i] <= target)
}

/** The part of the line between two distances along it, ends included. */
export function slice(
  line: LngLat[],
  along: number[],
  from: number,
  to: number
): LngLat[] {
  const total = along[along.length - 1] || 1
  const start = pointAlong(line, along, from / total)
  const end = pointAlong(line, along, to / total)
  const inside = line.filter((_, i) => along[i] > from && along[i] < to)
  return [start, ...inside, end]
}
