import { useEffect, useRef } from 'react'

/**
 * Back closes the open dialog or sheet instead of leaving the screen (QA #12; what phones expect). The dialog adds a
 * history entry for the same address while it's open; Back pops it and closes the dialog. Closing it any other way
 * removes that entry again, unless the user has already navigated somewhere else from inside it.
 */
export function useBackToClose(onClose: () => void) {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    const id = Math.random().toString(36).slice(2)
    history.pushState({ ...(history.state as object | null), daveyDialog: id }, '')
    let popped = false
    const onPop = () => { popped = true; close.current() }
    addEventListener('popstate', onPop)
    return () => {
      removeEventListener('popstate', onPop)
      if (!popped && (history.state as { daveyDialog?: string } | null)?.daveyDialog === id) history.back()
    }
  }, [])
}
