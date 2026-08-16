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
  | "videoReview"
  | "imageScreen"
  | "repetition"
  | "repetitionPractice"
  | "sentenceBuilder";

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
  /** Speaker name for "Said by:" on this word in the learner app. */
  saidBy?: string;
  [k: string]: unknown;
};
export type AudioExposureContent = {
  title?: string;
  /**
   * @deprecated Prefer `words[].saidBy`. Kept for older lesson JSON until edited/saved.
   */
  saidBy?: string;
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
};

export type MatchPair = { left: string; right: string; [k: string]: unknown };
export type MatchContent = { title?: string; pairs: MatchPair[]; [k: string]: unknown };

/** `concept` screen — learner animates `targetWord` and up to three `bullets`. */
export type ConceptContent = { targetWord: string; bullets: string[] };

/** Standalone community chat. Same moderation as celebration discussion. */
export type CommunityBoardContent = {
  /** Shown to learners. Spell the target word exactly as they must type it. */
  prompt?: string;
  /** Extra context for moderation; not shown to learners. */
  topic?: string;
};

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
  /** When `image` is set: optional 1–2 sentence team note (not shown in learner app). */
  imageContext?: string;
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

/** Hero image URL + title + body copy. */
export type ImageScreenContent = {
  image: string;
  /** Admin-only: last Gemini prompt used to generate `image` (not shown to learners). */
  imagePrompt?: string;
  title?: string;
  body?: string;
};

/** One related example line on a Repetition screen (max 6). */
export type RepetitionExample = {
  oromo: string;
  english: string;
  /** Public audio URL when available. */
  audio?: string;
  /** Linked `public.words.id` when chosen from the word bank. */
  word_id?: string;
};

/** Pattern exposure: multiple related examples with speakers; tap for English. */
export type RepetitionContent = {
  title?: string;
  /** Pattern word/phrase to highlight inside each oromo line (e.g. "jiru"). */
  target?: string;
  examples: RepetitionExample[];
};

export type RepetitionPracticeWord = {
  oromo: string;
  english?: string;
  /** Optional while authoring; populated from the linked word-bank row after voice recording. */
  audio?: string;
  /** Linked `public.words.id`; missing typed words receive this when the series sync creates their recording row. */
  word_id?: string;
};

/** Exactly three pairs; the learner hears five words and speaks the final answer. */
export type RepetitionPracticeContent = {
  title?: string;
  instruction?: string;
  /** When true, learner sees one pair at a time with a bottom advance control. Default: stacked grid. */
  onePairAtATime?: boolean;
  pairs: [
    { base: RepetitionPracticeWord; answer: RepetitionPracticeWord; sharedStem?: string; addedPart?: string },
    { base: RepetitionPracticeWord; answer: RepetitionPracticeWord; sharedStem?: string; addedPart?: string },
    { base: RepetitionPracticeWord; answer: RepetitionPracticeWord; sharedStem?: string; addedPart?: string },
  ];
};

/** Shuffled chunks the learner taps into canonical Afaan Oromo sentence order. */
export type SentenceBuilderContent = {
  title?: string;
  instruction?: string;
  english: string;
  words: string[];
  audio?: string;
  tip?: string;
};

/** One phrase on a Speaking practice screen (max 10). */
export type SpeakingPracticePhrase = {
  word?: string;
  prompt?: string;
  tip?: string;
  word_id?: string;
  speakingDraftTokenId?: string;
};

/**
 * Sequential speaking drills. Prefer `phrases`; legacy single top-level word/prompt still loads.
 */
export type SpeakingPracticeContent = {
  phrases: SpeakingPracticePhrase[];
};

/** One row in `word-breakdown` — target-language token and gloss (not tied to a specific language name). */
export type WordBreakdownWordRow = {
  word: string;
  translation: string;
};

export type WordBreakdownContent = {
  original: string;
  tip?: string;
  words: WordBreakdownWordRow[];
  [k: string]: unknown;
};

