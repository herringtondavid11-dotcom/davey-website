import { useEffect, useLayoutEffect, useRef } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * A new screen starts at the top; Back and Forward return to where you were (QA #9, #10). The browser's own
 * restoration can't do it: screens render after their data loads, so the page is still short when it tries.
 * After moving to another screen, focus goes to its title so screen readers announce it (QA #11).
 */
export function ScrollManager() {
  const location = useLocation()
  const type = useNavigationType()
  const positions = useRef(new Map<string, number>())
  const current = useRef(location.key)
  const first = useRef(true)

  useEffect(() => {
    if (first.current) { first.current = false; return }
    // The new screen's title, once it has rendered (lazy screens and their data can take a moment).
    let frame = 0
    const started = performance.now()
    const tick = () => {
      const h1 = document.querySelector<HTMLElement>('main h1')
      if (h1 && !h1.closest('[aria-busy="true"]')) {
        if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1')
        h1.focus({ preventScroll: true })
        return
      }
      if (performance.now() - started < 3000) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [location.pathname])

  useEffect(() => {
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    const save = () => positions.current.set(current.current, scrollY)
    addEventListener('scroll', save, { passive: true })
    return () => removeEventListener('scroll', save)
  }, [])

  useLayoutEffect(() => {
    current.current = location.key
    if (type !== 'POP') {
      // A link to a section (#…) scrolls there itself.
      if (!location.hash) scrollTo(0, 0)
      return
    }
    const target = positions.current.get(location.key) ?? 0
    if (!target) { scrollTo(0, 0); return }
    // Wait for the screen to be tall enough (its data may still be loading), for up to 1.5 s.
    let frame = 0
    const started = performance.now()
    const tick = () => {
      if (document.documentElement.scrollHeight - innerHeight >= target || performance.now() - started > 1500) {
        scrollTo(0, target)
        return
      }
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [location.key, location.hash, type])

  return null
}
