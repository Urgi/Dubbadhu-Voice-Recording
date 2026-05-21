/**
 * Scene image slot for word-discrimination / discriminationDrill screens.
 * Keep in sync with learner `WordDiscriminationQuizScreen.js` (wide frame, ~265pt max height).
 */
export const WORD_DISCRIMINATION_SCENE_GEMINI_ASPECT = '4:3' as const

/** Learner preview + admin modal preview (`width: 100%`, `aspectRatio`). */
export const WORD_DISCRIMINATION_SCENE_PREVIEW_ASPECT = 4 / 3

export function wordDiscriminationScenePromptSuffix(): string {
  return [
    'Composition: landscape 4:3 frame (wider than tall), matching the mobile word-discrimination quiz image area.',
    'Center the main subject in the frame with generous headroom; the full face and top of the head must be visible — never crop foreheads or hair.',
    'One clear focal person or small group; simple uncluttered background.',
  ].join(' ')
}
