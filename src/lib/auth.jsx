import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'

const AuthContext = createContext(null)

// Holds who is signed in (session) and their row in the user master (profile).
// `undefined` means "still finding out"; `null` means "no".
export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined)
  const [profileState, setProfileState] = useState({ userId: undefined, profile: undefined })
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const userId = session === undefined ? undefined : (session?.user?.id ?? null)

  const loadProfile = useCallback(async (id) => {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('auth_user_id', id)
      .maybeSingle()
    return error ? null : data
  }, [])

  useEffect(() => {
    if (!userId) return undefined
    let cancelled = false
    loadProfile(userId).then((profile) => {
      if (!cancelled) setProfileState({ userId, profile })
    })
    return () => {
      cancelled = true
    }
  }, [userId, loadProfile])

  const value = useMemo(() => {
    const profile = !userId ? null : profileState.userId === userId ? profileState.profile : undefined
    return {
      session,
      profile,
      loading: session === undefined || profile === undefined,
      isAdmin: profile?.authority === 'all',
      recovery,
      finishRecovery: () => setRecovery(false),
      signOut: () => supabase.auth.signOut(),
      reloadProfile: async () => {
        if (!userId) return
        const next = await loadProfile(userId)
        setProfileState({ userId, profile: next })
      },
    }
  }, [session, userId, profileState, recovery, loadProfile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext)
}
