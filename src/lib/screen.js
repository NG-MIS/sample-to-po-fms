import { useSyncExternalStore } from 'react'

// True on a phone-sized screen. Building blocks use this to switch to their
// phone layout (tables become cards, the menu becomes a drawer).
const PHONE = '(max-width: 720px)'
const query = window.matchMedia(PHONE)

function subscribe(onChange) {
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function useIsPhone() {
  return useSyncExternalStore(subscribe, () => query.matches)
}
