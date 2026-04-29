import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export async function signUp(email: string, password: string) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getCurrentUser(): Promise<User | null> {
  const session = await getSession();
  return session?.user ?? null;
}

/** Subscribe to auth changes. Returns an unsubscribe fn.
 *
 * We only react to events that represent a real session change:
 *   INITIAL_SESSION  – page first loads
 *   SIGNED_IN        – user just authenticated
 *   SIGNED_OUT       – user signed out (or session expired/revoked)
 *
 * TOKEN_REFRESHED fires silently in the background (e.g. when you switch
 * back to this tab) and does NOT represent a new sign-in — ignoring it
 * prevents an unnecessary UI re-render every time you change tabs.
 */
export function onAuthChange(cb: (session: Session | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
      cb(session);
    }
  });
  return () => data.subscription.unsubscribe();
}
