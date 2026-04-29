import { supabase } from './supabase';
import type { GroceryItem } from '../types';

interface GroceryRow {
  id: string;
  user_id: string;
  text: string;
  recipe_id: string | null;
  recipe_title: string | null;
  added_at: string;
}

function rowToItem(row: GroceryRow): GroceryItem {
  return {
    id: row.id,
    text: row.text,
    recipeId: row.recipe_id,
    recipeTitle: row.recipe_title,
    addedAt: row.added_at,
  };
}

export async function loadGroceryList(): Promise<GroceryItem[]> {
  const { data, error } = await supabase
    .from('grocery_items')
    .select('*')
    .order('added_at', { ascending: true });
  if (error) throw error;
  return (data as GroceryRow[]).map(rowToItem);
}

export async function addGroceryItem(
  text: string,
  recipeId: string | null,
  recipeTitle: string | null
): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error('Not signed in.');
  const { error } = await supabase.from('grocery_items').insert({
    user_id: user.id,
    text,
    recipe_id: recipeId,
    recipe_title: recipeTitle,
  });
  if (error) throw error;
}

/** Remove a specific (text, recipeId) pair from the list. */
export async function removeGroceryItem(
  text: string,
  recipeId: string | null
): Promise<void> {
  const query = supabase.from('grocery_items').delete().eq('text', text);
  // eq('recipe_id', null) matches NULLs incorrectly; use is() for null
  const finalQuery = recipeId === null ? query.is('recipe_id', null) : query.eq('recipe_id', recipeId);
  const { error } = await finalQuery;
  if (error) throw error;
}

export async function clearGroceryList(): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error('Not signed in.');
  const { error } = await supabase.from('grocery_items').delete().eq('user_id', user.id);
  if (error) throw error;
}
