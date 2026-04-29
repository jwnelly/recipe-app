-- Recipe Box — Supabase schema
-- Run this once in the SQL editor of a fresh Supabase project.

create table recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text,
  servings int,
  prep_time text,
  cook_time text,
  tags text[] default array[]::text[],
  ingredients text[] default array[]::text[],
  instructions text,
  notes text,
  source_url text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table grocery_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  text text not null,
  recipe_id uuid references recipes(id) on delete set null,
  recipe_title text,
  added_at timestamptz default now()
);

-- Row Level Security: each user sees only their own data
alter table recipes enable row level security;
create policy "owner_all_recipes" on recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table grocery_items enable row level security;
create policy "owner_all_grocery" on grocery_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index recipes_user_idx on recipes(user_id);
create index grocery_user_idx on grocery_items(user_id);
