'use client'

import * as React from 'react'

const TOAST_LIMIT = 5
const TOAST_REMOVE_DELAY = 3000

type ToastVariant = 'default' | 'destructive' | 'success'

export type ToastProps = {
  id: string
  title?: string
  description?: string
  variant?: ToastVariant
  open: boolean
  onOpenChange: (open: boolean) => void
}

type Action =
  | { type: 'ADD_TOAST'; toast: Omit<ToastProps, 'open' | 'onOpenChange'> }
  | { type: 'UPDATE_TOAST'; toast: Partial<ToastProps> & { id: string } }
  | { type: 'DISMISS_TOAST'; toastId?: string }
  | { type: 'REMOVE_TOAST'; toastId?: string }

type State = { toasts: ToastProps[] }

let count = 0
const genId = (): string => {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string, dispatch: React.Dispatch<Action>): void => {
  if (toastTimeouts.has(toastId)) return
  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({ type: 'REMOVE_TOAST', toastId })
  }, TOAST_REMOVE_DELAY)
  toastTimeouts.set(toastId, timeout)
}

const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [
          { ...action.toast, open: true, onOpenChange: () => {} },
          ...state.toasts,
        ].slice(0, TOAST_LIMIT),
      }
    case 'UPDATE_TOAST':
      return {
        ...state,
        toasts: state.toasts.map((t) => (t.id === action.toast.id ? { ...t, ...action.toast } : t)),
      }
    case 'DISMISS_TOAST':
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toastId || action.toastId === undefined ? { ...t, open: false } : t,
        ),
      }
    case 'REMOVE_TOAST':
      if (action.toastId === undefined) return { ...state, toasts: [] }
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.toastId) }
  }
}

const listeners: Array<React.Dispatch<Action>> = []
let memoryState: State = { toasts: [] }

const dispatch = (action: Action): void => {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => listener(action))
}

type Toast = Omit<ToastProps, 'id' | 'open' | 'onOpenChange'>

export const toast = (props: Toast): { id: string; dismiss: () => void } => {
  const id = genId()
  dispatch({ type: 'ADD_TOAST', toast: { ...props, id } })
  const timeout = setTimeout(() => {
    dispatch({ type: 'DISMISS_TOAST', toastId: id })
    addToRemoveQueue(id, dispatch)
  }, TOAST_REMOVE_DELAY)
  toastTimeouts.set(`auto-${id}`, timeout)
  return { id, dismiss: () => dispatch({ type: 'DISMISS_TOAST', toastId: id }) }
}

export function useToast(): { toasts: ToastProps[]; toast: typeof toast; dismiss: (id?: string) => void } {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    const listener: React.Dispatch<Action> = () => {
      setState({ ...memoryState })
    }
    listeners.push(listener)
    return () => {
      const index = listeners.indexOf(listener)
      if (index > -1) listeners.splice(index, 1)
    }
  }, [])

  return {
    toasts: state.toasts,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: 'DISMISS_TOAST', toastId }),
  }
}
