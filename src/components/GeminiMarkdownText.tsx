import { StyleSheet, Text, View } from 'react-native'

type Block =
  | { type: 'heading'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'paragraph'; text: string }

function stripHeadingMarks(line: string): string {
  return line.replace(/^#{1,6}\s+/, '').trim()
}

function parseBlocks(markdown: string): Block[] {
  const blocks: Block[] = []
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')

  for (const rawLine of lines) {
    const line = rawLine.trimEnd()
    const trimmed = line.trim()
    if (!trimmed) continue

    if (/^#{1,6}\s+/.test(trimmed)) {
      blocks.push({ type: 'heading', text: stripHeadingMarks(trimmed) })
      continue
    }
    if (/^[-*]\s+/.test(trimmed)) {
      blocks.push({ type: 'bullet', text: trimmed.replace(/^[-*]\s+/, '') })
      continue
    }
    blocks.push({ type: 'paragraph', text: trimmed })
  }
  return blocks
}

/** Split on **bold** and `code` spans for inline styling. */
function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).filter(Boolean)
  return parts.map((part, index) => {
    const key = `${keyPrefix}-${index}`
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <Text key={key} style={styles.bold}>
          {part.slice(2, -2)}
        </Text>
      )
    }
    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <Text key={key} style={styles.code}>
          {part.slice(1, -1)}
        </Text>
      )
    }
    return <Text key={key}>{part}</Text>
  })
}

type Props = {
  text: string
}

export default function GeminiMarkdownText({ text }: Props) {
  const blocks = parseBlocks(text)
  if (blocks.length === 0) return null

  return (
    <View style={styles.wrap}>
      {blocks.map((block, index) => {
        const key = `block-${index}`
        if (block.type === 'heading') {
          return (
            <Text key={key} style={styles.heading}>
              {renderInline(block.text, key)}
            </Text>
          )
        }
        if (block.type === 'bullet') {
          return (
            <View key={key} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.body}>{renderInline(block.text, key)}</Text>
            </View>
          )
        }
        return (
          <Text key={key} style={styles.body}>
            {renderInline(block.text, key)}
          </Text>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  heading: {
    color: '#f3f4f6',
    fontSize: 15,
    fontWeight: '700',
    lineHeight: 22,
    marginTop: 4,
  },
  body: {
    color: '#d1d5db',
    fontSize: 14,
    lineHeight: 22,
    flex: 1,
  },
  bold: {
    color: '#f9fafb',
    fontWeight: '700',
  },
  code: {
    color: '#fde68a',
    fontFamily: 'Menlo',
    fontSize: 13,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingLeft: 2,
  },
  bulletDot: {
    color: '#9ca3af',
    fontSize: 14,
    lineHeight: 22,
    width: 12,
  },
})
