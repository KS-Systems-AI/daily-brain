import React from 'react'
import {
  Text,
  View,
  StyleSheet,
  Linking,
  type TextStyle,
  type ViewStyle,
} from 'react-native'

interface TiptapNode {
  type: string
  content?: TiptapNode[]
  attrs?: Record<string, any>
  text?: string
  marks?: { type: string; attrs?: Record<string, any> }[]
}

interface BlockRendererProps {
  content: TiptapNode
}

export function BlockRenderer({ content }: BlockRendererProps) {
  if (!content?.content) return null
  return (
    <View style={styles.container}>
      {content.content.map((node, i) => (
        <BlockNode key={i} node={node} />
      ))}
    </View>
  )
}

function BlockNode({ node }: { node: TiptapNode }) {
  switch (node.type) {
    case 'heading':
      return <HeadingBlock node={node} />
    case 'paragraph':
      return <ParagraphBlock node={node} />
    case 'bulletList':
      return <BulletListBlock node={node} />
    case 'orderedList':
      return <OrderedListBlock node={node} />
    case 'taskList':
      return <TaskListBlock node={node} />
    case 'blockquote':
      return <BlockquoteBlock node={node} />
    case 'codeBlock':
      return <CodeBlockBlock node={node} />
    case 'horizontalRule':
      return <View style={styles.hr} />
    default:
      return <ParagraphBlock node={node} />
  }
}

function HeadingBlock({ node }: { node: TiptapNode }) {
  const level = node.attrs?.level ?? 1
  const style: TextStyle =
    level === 1
      ? styles.h1
      : level === 2
        ? styles.h2
        : styles.h3

  return (
    <Text style={[styles.block, style]}>
      <InlineContent nodes={node.content} />
    </Text>
  )
}

function ParagraphBlock({ node }: { node: TiptapNode }) {
  if (!node.content?.length) {
    return <Text style={[styles.block, styles.paragraph]}>{'\n'}</Text>
  }
  return (
    <Text style={[styles.block, styles.paragraph]}>
      <InlineContent nodes={node.content} />
    </Text>
  )
}

function BulletListBlock({ node }: { node: TiptapNode }) {
  return (
    <View style={styles.list}>
      {node.content?.map((item, i) => (
        <View key={i} style={styles.listItemRow}>
          <Text style={styles.bullet}>{'•'}</Text>
          <View style={styles.listItemContent}>
            {item.content?.map((child, j) => (
              <BlockNode key={j} node={child} />
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

function OrderedListBlock({ node }: { node: TiptapNode }) {
  const start = node.attrs?.start ?? 1
  return (
    <View style={styles.list}>
      {node.content?.map((item, i) => (
        <View key={i} style={styles.listItemRow}>
          <Text style={styles.orderedBullet}>{`${start + i}.`}</Text>
          <View style={styles.listItemContent}>
            {item.content?.map((child, j) => (
              <BlockNode key={j} node={child} />
            ))}
          </View>
        </View>
      ))}
    </View>
  )
}

function TaskListBlock({ node }: { node: TiptapNode }) {
  return (
    <View style={styles.list}>
      {node.content?.map((item, i) => {
        const checked = item.attrs?.checked ?? false
        return (
          <View key={i} style={styles.listItemRow}>
            <View
              style={[
                styles.checkbox,
                checked && styles.checkboxChecked,
              ]}
            />
            <View style={styles.listItemContent}>
              {item.content?.map((child, j) => (
                <BlockNode key={j} node={child} />
              ))}
            </View>
          </View>
        )
      })}
    </View>
  )
}

function BlockquoteBlock({ node }: { node: TiptapNode }) {
  return (
    <View style={styles.blockquote}>
      {node.content?.map((child, i) => (
        <BlockNode key={i} node={child} />
      ))}
    </View>
  )
}

function CodeBlockBlock({ node }: { node: TiptapNode }) {
  const text = extractText(node)
  return (
    <View style={styles.codeBlock}>
      <Text style={styles.codeBlockText}>{text}</Text>
    </View>
  )
}

function extractText(node: TiptapNode): string {
  if (node.text) return node.text
  return node.content?.map(extractText).join('') ?? ''
}

function InlineContent({ nodes }: { nodes?: TiptapNode[] }) {
  if (!nodes?.length) return null
  return (
    <>
      {nodes.map((node, i) => (
        <InlineNode key={i} node={node} />
      ))}
    </>
  )
}

function InlineNode({ node }: { node: TiptapNode }) {
  if (node.type === 'hardBreak') return <Text>{'\n'}</Text>

  if (node.type !== 'text' || !node.text) return null

  const markStyles: TextStyle[] = []
  let isLink = false
  let href = ''

  node.marks?.forEach((mark) => {
    switch (mark.type) {
      case 'bold':
        markStyles.push({ fontWeight: '700' })
        break
      case 'italic':
        markStyles.push({ fontStyle: 'italic' })
        break
      case 'underline':
        markStyles.push({ textDecorationLine: 'underline' })
        break
      case 'strike':
        markStyles.push({ textDecorationLine: 'line-through' })
        break
      case 'code':
        markStyles.push(styles.inlineCode)
        break
      case 'link':
        isLink = true
        href = mark.attrs?.href ?? ''
        markStyles.push(styles.link)
        break
    }
  })

  if (isLink) {
    return (
      <Text style={markStyles} onPress={() => Linking.openURL(href)}>
        {node.text}
      </Text>
    )
  }

  if (markStyles.length > 0) {
    return <Text style={markStyles}>{node.text}</Text>
  }

  return <Text>{node.text}</Text>
}

const styles = StyleSheet.create({
  container: {
    gap: 2,
  },
  block: {
    marginBottom: 4,
  },
  h1: {
    fontSize: 26,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 34,
  },
  h2: {
    fontSize: 22,
    fontWeight: '700',
    color: '#111827',
    lineHeight: 30,
  },
  h3: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 26,
  },
  paragraph: {
    fontSize: 15,
    color: '#111827',
    lineHeight: 22,
  },
  list: {
    marginBottom: 4,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  bullet: {
    fontSize: 15,
    color: '#111827',
    width: 20,
    textAlign: 'center',
    lineHeight: 22,
  },
  orderedBullet: {
    fontSize: 15,
    color: '#111827',
    width: 24,
    lineHeight: 22,
  },
  listItemContent: {
    flex: 1,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderWidth: 2,
    borderColor: '#d1d5db',
    borderRadius: 3,
    marginRight: 8,
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: '#E8713A',
    borderColor: '#E8713A',
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: '#E8713A',
    paddingLeft: 12,
    marginBottom: 4,
  } as ViewStyle,
  codeBlock: {
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 4,
  },
  codeBlockText: {
    fontFamily: 'Menlo',
    fontSize: 13,
    color: '#111827',
    lineHeight: 20,
  },
  hr: {
    height: 1,
    backgroundColor: '#e5e7eb',
    marginVertical: 16,
  },
  inlineCode: {
    fontFamily: 'Menlo',
    fontSize: 13,
    backgroundColor: '#f3f4f6',
    color: '#111827',
  } as TextStyle,
  link: {
    color: '#2563eb',
    textDecorationLine: 'underline',
  } as TextStyle,
})
