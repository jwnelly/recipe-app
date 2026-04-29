import { supabase } from './supabase';
import type { Recipe, RecipeInput } from '../types';

// Internal DB row shape (snake_case)
interface RecipeRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  servings: number | null;
  prep_time: string | null;
  cook_time: string | null;
  tags: string[] | null;
  ingredients: string[] | null;
  instructions: string | null;
  notes: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    servings: row.servings,
    prepTime: row.prep_time,
    cookTime: row.cook_time,
    tags: row.tags ?? [],
    ingredients: row.ingredients ?? [],
    instructions: row.instructions,
    notes: row.notes,
    sourceUrl: row.source_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function recipeToRowInsert(r: RecipeInput, userId: string) {
  return {
    user_id: userId,
    title: r.title,
    description: r.description ?? null,
    servings: r.servings ?? null,
    prep_time: r.prepTime ?? null,
    cook_time: r.cookTime ?? null,
    tags: r.tags ?? [],
    ingredients: r.ingredients ?? [],
    instructions: r.instructions ?? null,
    notes: r.notes ?? null,
    source_url: r.sourceUrl ?? null,
  };
}

function recipeToRowUpdate(r: RecipeInput) {
  return {
    title: r.title,
    description: r.description ?? null,
    servings: r.servings ?? null,
    prep_time: r.prepTime ?? null,
    cook_time: r.cookTime ?? null,
    tags: r.tags ?? [],
    ingredients: r.ingredients ?? [],
    instructions: r.instructions ?? null,
    notes: r.notes ?? null,
    source_url: r.sourceUrl ?? null,
    updated_at: new Date().toISOString(),
  };
}

/** Load all recipes for the current user. Optional client-side text search. */
export async function loadRecipes(search?: string): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  let recipes = (data as RecipeRow[]).map(rowToRecipe);
  if (search) {
    const q = search.toLowerCase();
    recipes = recipes.filter(
      (r) =>
        r.title.toLowerCase().includes(q) ||
        (r.description ?? '').toLowerCase().includes(q) ||
        r.ingredients.some((i) => i.toLowerCase().includes(q))
    );
  }
  return recipes;
}

export async function createRecipe(input: RecipeInput): Promise<Recipe> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error('Not signed in.');
  const { data, error } = await supabase
    .from('recipes')
    .insert(recipeToRowInsert(input, user.id))
    .select()
    .single();
  if (error) throw error;
  return rowToRecipe(data as RecipeRow);
}

export async function updateRecipe(id: string, input: RecipeInput): Promise<Recipe> {
  const { data, error } = await supabase
    .from('recipes')
    .update(recipeToRowUpdate(input))
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return rowToRecipe(data as RecipeRow);
}

export async function deleteRecipe(id: string): Promise<void> {
  const { error } = await supabase.from('recipes').delete().eq('id', id);
  if (error) throw error;
}

/** Bulk-import recipes (used by the Import UI). Returns { imported, skipped }. */
export async function importRecipes(
  recipes: unknown[],
  mode: 'merge' | 'replace'
): Promise<{ imported: number; skipped: number }> {
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error('Not signed in.');

  if (mode === 'replace') {
    const { error } = await supabase.from('recipes').delete().eq('user_id', user.id);
    if (error) throw error;
  }

  // Fetch existing titles for de-dup in merge mode
  let existingTitles = new Set<string>();
  if (mode === 'merge') {
    const { data, error } = await supabase.from('recipes').select('title');
    if (error) throw error;
    existingTitles = new Set((data ?? []).map((r: { title: string }) => r.title.toLowerCase()));
  }

  let imported = 0;
  let skipped = 0;
  const rowsToInsert: ReturnType<typeof recipeToRowInsert>[] = [];

  for (const item of recipes) {
    if (!item || typeof item !== 'object') {
      skipped++;
      continue;
    }
    const r = item as Partial<Recipe> & { title?: string };
    if (!r.title) {
      skipped++;
      continue;
    }
    if (mode === 'merge' && existingTitles.has(r.title.toLowerCase())) {
      skipped++;
      continue;
    }
    rowsToInsert.push(
      recipeToRowInsert(
        {
          title: r.title,
          description: r.description ?? null,
          servings: r.servings ?? null,
          prepTime: r.prepTime ?? null,
          cookTime: r.cookTime ?? null,
          tags: r.tags ?? [],
          ingredients: r.ingredients ?? [],
          instructions: r.instructions ?? null,
          notes: r.notes ?? null,
          sourceUrl: r.sourceUrl ?? null,
        },
        user.id
      )
    );
    imported++;
  }

  if (rowsToInsert.length > 0) {
    const { error } = await supabase.from('recipes').insert(rowsToInsert);
    if (error) throw error;
  }

  return { imported, skipped };
}

/** Derive the unique sorted list of tags from a recipe set. */
export function getAllTags(recipes: Recipe[]): string[] {
  const set = new Set<string>();
  for (const r of recipes) for (const t of r.tags) set.add(t);
  return Array.from(set).sort();
}
