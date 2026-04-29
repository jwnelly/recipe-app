// Frontend-facing camelCase shape used throughout the UI.
// The DB stores snake_case; mappers in src/lib/recipes.ts handle conversion.
export interface Recipe {
  id: string;
  title: string;
  description?: string | null;
  servings?: number | null;
  prepTime?: string | null;
  cookTime?: string | null;
  tags: string[];
  ingredients: string[];
  instructions?: string | null;
  notes?: string | null;
  sourceUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

// Input shape for create/update — id and timestamps are server-managed.
export type RecipeInput = Omit<Recipe, 'id' | 'createdAt' | 'updatedAt'>;

export interface GroceryItem {
  id: string;
  text: string;
  recipeId: string | null;
  recipeTitle: string | null;
  addedAt?: string;
}
