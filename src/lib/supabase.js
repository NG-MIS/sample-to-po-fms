import { createClient } from '@supabase/supabase-js'

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
export const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Supabase settings are missing. Copy .env.example to .env.local and fill in both values.',
  )
}

// The one shared connection to the database. Every screen imports this.
export const supabase = createClient(supabaseUrl, supabaseKey)
