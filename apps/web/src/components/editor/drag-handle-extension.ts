import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

export const DragHandleExtension = Extension.create({
  name: 'dragHandle',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('dragHandle'),
        props: {
          handleDOMEvents: {
            contextmenu: (view, event) => {
              const pos = view.posAtCoords({
                left: event.clientX,
                top: event.clientY,
              })

              if (!pos) return false

              const $pos = view.state.doc.resolve(pos.pos)
              if ($pos.depth !== 1) return false

              // Dispatch custom event with block position
              const customEvent = new CustomEvent('block:contextmenu', {
                detail: {
                  pos: $pos.before(),
                  clientX: event.clientX,
                  clientY: event.clientY,
                },
              })

              window.dispatchEvent(customEvent)
              event.preventDefault()
              return true
            },
          },
        },
      }),
    ]
  },
})
