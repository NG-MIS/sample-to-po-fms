import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase.js'

// Reads every row of one table, oldest first.
export async function fetchRows(table, orderBy = 'sl_no') {
  let query = supabase.from(table).select('*')
  if (orderBy) query = query.order(orderBy)
  const { data, error } = await query
  if (error) throw error
  return data
}

// Runs a loader when the screen opens and gives back { data, loading, error, reload }.
export function useLoad(loader) {
  const [state, setState] = useState({ data: null, loading: true, error: null })
  const loaderRef = useRef(loader)
  useEffect(() => {
    loaderRef.current = loader
  })

  const run = useCallback(async () => {
    try {
      const data = await loaderRef.current()
      setState({ data, loading: false, error: null })
    } catch (error) {
      setState((previous) => ({ ...previous, loading: false, error }))
    }
  }, [])

  const reload = useCallback(() => {
    setState((previous) => ({ ...previous, loading: true, error: null }))
    return run()
  }, [run])

  useEffect(() => {
    run()
  }, [run])

  return { ...state, reload }
}

// Lookup of id -> name, used to show names instead of ids.
export function nameMap(rows) {
  return new Map((rows || []).map((row) => [row.id, row.name]))
}
