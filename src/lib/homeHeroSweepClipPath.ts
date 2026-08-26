/**
 * Learner Home continue-card photo clip (objectBoundingBox).
 * Keep in sync with Dubbadhu/components/home/heroSweepClipPath.js
 */
/** Keep in sync with learner heroSweepClipPath.js */
export const HERO_SWEEP_CLIP_PATH_OBJECT =
  'M0.284,0 C0.76,0.034 0.29,0.762 1,0.699 L1,0 Z'

/** Left edge of visible photo at top (objectBoundingBox x). */
export const HOME_SWEEP_HOLE_MIN_X_RATIO = 0.284

/** Scale objectBoundingBox path coords to pixel width/height. */
export function scaleHeroSweepPath(w: number, h: number): string {
  const width = Math.max(1, Number(w) || 1)
  const height = Math.max(1, Number(h) || 1)
  return HERO_SWEEP_CLIP_PATH_OBJECT.replace(
    /([MLCZmlcz])([^MLCZmlcz]*)/g,
    (_m, cmd: string, body: string) => {
      const nums = String(body)
        .trim()
        .split(/[\s,]+/)
        .filter(Boolean)
        .map(Number)
      if (!nums.length) return cmd
      const scaled = nums.map((n, i) => {
        const isX = i % 2 === 0
        const v = isX ? n * width : n * height
        return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : n
      })
      return `${cmd}${scaled.join(' ')}`
    },
  )
}
