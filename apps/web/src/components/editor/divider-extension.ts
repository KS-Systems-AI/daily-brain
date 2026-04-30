'use client'

import { Node, mergeAttributes } from '@tiptap/core'

export type DividerVariant = 'dashed' | 'dotted' | 'solid' | 'thick'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    divider: {
      insertDivider: (variant?: DividerVariant) => ReturnType
    }
  }
}

export const DividerExtension = Node.create({
  name: 'horizontalRule',
  group: 'block',
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      variant: {
        default: 'solid',
        parseHTML: (element: HTMLElement) => element.getAttribute('data-variant') ?? 'solid',
        renderHTML: (attributes: { variant?: DividerVariant }) => ({
          'data-variant': attributes.variant ?? 'solid',
        }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'hr' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['hr', mergeAttributes(HTMLAttributes)]
  },

  addCommands() {
    return {
      insertDivider:
        (variant: DividerVariant = 'solid') =>
        ({ commands }: any) =>
          commands.insertContent({
            type: this.name,
            attrs: { variant },
          }),
    }
  },
})
