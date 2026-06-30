// src/lib/supabase.js
// Initializes the Supabase client using environment variables.
// Used for direct-to-storage uploads from the React frontend.

import { createClient } from '@supabase/supabase-js';

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Supabase env vars missing – check your .env.local file.');
}

export const supabase = createClient(supabaseUrl, supabaseKey);

/** Public storage bucket name */
export const BUCKET = 'consignments';

/**
 * Build the Supabase public URL for a file path inside the bucket.
 * @param {string} path – e.g. "12345/cps.pdf"
 */
export function buildPublicUrl(path) {
  return `${supabaseUrl}/storage/v1/object/public/${BUCKET}/${path}`;
}
