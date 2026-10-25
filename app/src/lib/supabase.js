import { createClient } from '@supabase/supabase-js'

// Connect to our Supabase project. The keys come from the .env file.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

// Call one of our edge functions
export async function callFunction(name, body) {
  const result = await supabase.functions.invoke(name, { body: body })
  if (result.error) {
    console.log('Error calling ' + name, result.error)
    return null
  }
  return result.data
}

// How many days until a date
export function daysUntil(dateString) {
  const diff = new Date(dateString) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

// 50000 -> $50,000
export function formatMoney(num) {
  if (!num) return 'Not listed'
  return '$' + Number(num).toLocaleString()
}
