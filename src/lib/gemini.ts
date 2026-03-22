import { GoogleGenerativeAI } from '@google/generative-ai'
import * as FileSystem from 'expo-file-system/legacy'
import { getExpoPublicGeminiKey } from './expoPublicEnv'

const GEMINI_API_KEY = getExpoPublicGeminiKey()
const MODEL_NAME = 'gemini-1.5-flash'

const EXTRACTION_PROMPT = `You are a language learning assistant. Extract all unique vocabulary words
from this document that would be useful for language learners.
Return ONLY a JSON array of strings with the words in their base/root form,
lowercase, deduplicated, and sorted alphabetically.
No explanation, no markdown, just the raw JSON array.`

const parseWordsFromResponse = (rawText: string): string[] => {
  const cleaned = rawText
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()

  const firstBracket = cleaned.indexOf('[')
  const lastBracket = cleaned.lastIndexOf(']')
  const candidate =
    firstBracket >= 0 && lastBracket > firstBracket
      ? cleaned.slice(firstBracket, lastBracket + 1)
      : cleaned

  const parsed = JSON.parse(candidate) as unknown
  if (!Array.isArray(parsed)) {
    throw new Error('Gemini response was not an array')
  }

  return parsed
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

export const extractWordsFromDocument = async (
  fileUri: string,
  mimeType: string,
): Promise<string[]> => {
  if (!GEMINI_API_KEY) {
    throw new Error('Missing EXPO_PUBLIC_GEMINI_API_KEY')
  }

  const base64Data = await FileSystem.readAsStringAsync(fileUri, {
    encoding: 'base64',
  })

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({ model: MODEL_NAME })

  const result = await model.generateContent([
    {
      inlineData: {
        data: base64Data,
        mimeType,
      },
    },
    { text: EXTRACTION_PROMPT },
  ])

  const responseText = result.response.text()
  return parseWordsFromResponse(responseText)
}
