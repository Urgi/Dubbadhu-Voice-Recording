/**
 * Copy into your admin app.
 *
 * Types for `lessons.content` (Supabase) used by Dubbadhu.
 * These mirror `features/LessonTab/LessonModules/screenRegistry.js`.
 */

export type ScreenType =
  | "intro"
  | "firstLook"
  | "match"
  | "quiz"
  | "CelebrateScreen"
  | "dialogue"
  | "concept"
  | "patternPractice"
  | "speakingPractice"
  | "audioExposure"
  | "discriminationDrill"
  | "communityBoard"
  | "word-breakdown"
  | "videoReview";

export type LessonContent = {
  id: `lesson${number}` | string;
  title: string;
  series?: string;
  nextLessonId?: (`lesson${number}` | string) | null;
  screens: Screen[];
  [k: string]: unknown;
};

export type Screen = {
  type: ScreenType;
  content: Record<string, unknown>;
  [k: string]: unknown;
};

// Narrow “safe” content types for the common screens.
export type IntroContent = { goal?: string };

export type AudioExposureWord = {
  /** When set to a real `public.words` id, JSON is usually lean (`word_id`, optional `word`); optional `translation` is kept for admin / Celebrate. */
  word_id?: string;
  /** Afaan display string kept in JSON for readability when `word_id` is set. */
  word?: string;
  audioRef?: string;
  fastAudioRef?: string;
  slowAudioRef?: string;
  oromo?: string;
  english?: string;
  translation?: string;
  text?: string;
  /** Optional; admin editor assigns for speaking-practice ↔ exposure links before `word_id` exists. */
  draftTokenId?: string;
  [k: string]: unknown;
};
export type AudioExposureContent = {
  title?: string;
  subtitle?: string;
  words: AudioExposureWord[];
  autoPlayNext?: boolean;
  delayReveal?: number;
  [k: string]: unknown;
};

/** One speaker in a two-person dialogue (Person 1 speaks first; lines alternate with Person 2). */
export type DialogueSide = {
  name: string;
  lines: string[];
  translations?: Array<string | null>;
  [k: string]: unknown;
};
/** Exactly two speakers (`person1`, `person2`). No additional speaker rows. */
export type DialogueContent = {
  dialogueData: { person1: DialogueSide; person2: DialogueSide; [k: string]: unknown };
  showTranslations?: boolean;
  [k: string]: unknown;
};

export type MatchPair = { left: string; right: string; [k: string]: unknown };
export type MatchContent = { title?: string; pairs: MatchPair[]; [k: string]: unknown };

/** `concept` screen — learner animates `targetWord` and up to three `bullets`. */
export type ConceptContent = { targetWord: string; bullets: string[] };

export type QuizOption = string | { text: string; audioRef: string; [k: string]: unknown };
export type QuizQuestion = {
  question: string;
  options: QuizOption[];
  correctAnswer?: number;
  answer?: number;
  explanation?: string;
  audioOptions?: boolean;
  [k: string]: unknown;
};
export type QuizContent = {
  heading?: string;
  audioOptions?: boolean;
  questions?: QuizQuestion[];
  // legacy single-question support:
  question?: string;
  options?: QuizOption[];
  correctAnswer?: number;
  answer?: number;
  [k: string]: unknown;
};

export type WordDiscriminationWordEntry = {
  text: string;
  definition?: string;
  word_id?: string;
  oromo?: string;
  [k: string]: unknown;
};

export type WordDiscriminationScene = {
  /** Public URL from bucket `word-comparison-images` when set. */
  image: string;
  /** When no `image` yet: description for a pending asset; shown in the learner app. */
  imageRequestDescription?: string;
  correctWordIndex: number;
  explanation: string;
  /** @deprecated use top-level `question` on quiz content */
  question?: string;
  /** @deprecated not used; omit from new content */
  caption?: string;
  title?: string;
  prompt?: string;
  /** @deprecated use correctWordIndex */
  correct?: "A" | "B";
  [k: string]: unknown;
};

export type WordDiscriminationQuizContent = {
  /** One question for every scene; shown above images in the learner app. */
  question: string;
  words: WordDiscriminationWordEntry[];
  scenes: WordDiscriminationScene[];
  /** Derived on save; learner uses words.length when `words` is present. */
  streakTarget?: number;
  /** @deprecated migrated to `words` */
  wordA?: string;
  wordB?: string;
  definitionA?: string;
  definitionB?: string;
  wordA_id?: string;
  wordB_id?: string;
  [k: string]: unknown;
};

/** Public video URL from bucket `Videos-Dubbadhu` (Series intro bucket). */
export type VideoReviewContent = {
  videoUrl: string;
  freezeAtSeconds?: number;
  lines?: unknown[];
  message?: string;
  [k: string]: unknown;
};

