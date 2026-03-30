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
  | "moduleComplete"
  | "situation"
  | "dialogue"
  | "concept"
  | "animatedConcept"
  | "comparison"
  | "patternPractice"
  | "audioRecognition"
  | "audioResponse"
  | "speakingPractice"
  | "audioExposure"
  | "audioDiscrimination"
  | "communityBoard"
  | "word-breakdown";

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
export type IntroContent = { goal?: string; heading?: string; body?: string; [k: string]: unknown };

export type AudioExposureWord = { audioRef?: string; oromo: string; english: string; [k: string]: unknown };
export type AudioExposureContent = {
  title?: string;
  subtitle?: string;
  words: AudioExposureWord[];
  autoPlayNext?: boolean;
  delayReveal?: number;
  [k: string]: unknown;
};

export type DialoguePerson = {
  name: string;
  lines: string[];
  translations?: Array<string | null>;
  [k: string]: unknown;
};
export type DialogueContent = {
  dialogueData: { people: DialoguePerson[]; [k: string]: unknown };
  showTranslations?: boolean;
  [k: string]: unknown;
};

export type MatchPair = { left: string; right: string; [k: string]: unknown };
export type MatchContent = { title?: string; pairs: MatchPair[]; [k: string]: unknown };

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

