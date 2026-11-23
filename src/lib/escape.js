import { useEffect, useRef } from 'react'

// One Esc key listener for the whole app. Whatever opened last (a pick-list
// inside a form inside a popup) is the only thing that reacts to Esc.
const stack = []

function onKeyDown(event) {
  if (event.key !== 'Escape' || stack.length === 0) return
  event.preventDefault()
  event.stopPropagation()
  stack[stack.length - 1].current?.()
}

export function useEscape(handler, active = true) {
  const ref = useRef(handler)
  useEffect(() => {
    ref.current = handler
  })

  useEffect(() => {
    if (!active) return undefined
    stack.push(ref)
    if (stack.length === 1) document.addEventListener('keydown', onKeyDown)
    return () => {
      const index = stack.lastIndexOf(ref)
      if (index >= 0) stack.splice(index, 1)
      if (stack.length === 0) document.removeEventListener('keydown', onKeyDown)
    }
  }, [active])
}
