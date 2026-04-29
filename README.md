# 📦 Recipe Box

A personal recipe manager that runs in your browser, with data synced across your laptop and phone via Supabase. Multi-user — each account has its own private recipe collection.

**Live URL** (after deployment): `https://jwnelly.github.io/Recipe-App/`

---

## Architecture

- **Frontend**: TypeScript + Vite, vanilla DOM (no framework)
- **Backend**: Supabase (Postgres + Auth + Row Level Security)
- **Hosting**: GitHub Pages (static), deployed via GitHub Actions on every push to `main`
- **Data sync**: Phone and laptop both talk to the same Supabase project, so checking off a grocery item on your laptop appears on your phone after a refresh

---

## One-time Setup

### 1. Create the Supabase project

1. Sign in at [supabase.com](https://supabase.com) and create a new project.
2. Open **SQL Editor**, paste the contents of `supabase/schema.sql`, and run it. This creates the `recipes` and `grocery_items` tables with Row Level Security enabled.
3. Open **Authentication → Providers** and enable **Email**. For fastest setup, disable "Confirm email" (you can re-enable later).
4. Open **Project Settings → API**. Copy the **Project URL** and the **anon public** key — you'll need these next.

### 2. Configure local development

```bash
cp .env.example .env
```

Open `.env` and paste your Supabase URL and anon key:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

> The anon key is **safe to commit/expose** — Row Level Security is what protects the data, not the key. But `.env` is gitignored anyway as a habit.

### 3. Install dependencies

```bash
npm install
```

### 4. Configure GitHub Pages deployment

In your GitHub repo:

1. **Settings → Pages → Source: GitHub Actions**
2. **Settings → Secrets and variables → Actions → New repository secret** — add:
   - `VITE_SUPABASE_URL` (same value as your local `.env`)
   - `VITE_SUPABASE_ANON_KEY` (same value as your local `.env`)
3. Push to `main`. The workflow `.github/workflows/deploy.yml` will build and deploy automatically.

---

## Daily Use

### Run locally

```bash
npm run dev
```

Visit [http://localhost:5173](http://localhost:5173). Sign up the first time, then sign in normally.

### Deploy

Just push to `main`. GitHub Actions builds and publishes within ~30 seconds.

```bash
git add .
git commit -m "your changes"
git push
```

---

## Migrating Recipes from the Old Local App

If you have a `recipes.json` from the previous Python-server version, here's how to import it:

1. Open the deployed URL on your laptop.
2. Sign up for an account (your first time).
3. Click **Import** in the header.
4. Drop in `recipes.json`, choose **Merge**.
5. All your recipes appear under your new account.

---

## Features

### Recipes
- Add, edit, delete with title, description, servings, prep/cook times, tags, ingredients, instructions, notes, and an optional source URL
- Search by title, description, or ingredients
- Export as JSON, import from JSON

### Tag filtering
- Click **Tags ▾** in the header for the multi-select filter
- Per tag: **✓** to require it, **✕** to exclude it, both off to ignore it
- Stack multiple filters; they apply when the dropdown closes

### Sub-recipes
Add `@Recipe Name` on its own line in the ingredients to link another recipe (e.g., "Eggs Benedict" linking to your "Hollandaise Sauce" recipe). Click the resulting button to navigate; **← Back** in the header returns to the parent.

### Grocery list (synced!)
- Check off ingredients in any recipe → they appear in your master grocery list
- **+ Add all** / **− Remove all** for the whole recipe at once
- The 🛒 **Grocery List** button shows your full list, grouped by recipe
- Open the deployed URL on your phone (signed in as the same account) → list is there

### iPhone QR code
Still available in the Grocery List → QR Code tab. Useful when you want to print the list or you're without internet at the store.

---

## Project Structure

```
recipe-app/
├── index.html                      # Vite entry shell
├── package.json
├── tsconfig.json
├── vite.config.ts
├── .env.example                    # template — copy to .env locally
├── src/
│   ├── main.ts                     # entry: auth bootstrap + all UI logic
│   ├── styles.css                  # all styling
│   ├── types.ts                    # Recipe, GroceryItem types
│   ├── vite-env.d.ts               # Vite env var types
│   └── lib/
│       ├── supabase.ts             # Supabase client singleton
│       ├── auth.ts                 # signUp / signIn / signOut / onAuthChange
│       ├── recipes.ts              # recipes CRUD + camelCase↔snake_case mapping
│       └── grocery.ts              # grocery_items CRUD
├── supabase/
│   └── schema.sql                  # run once in Supabase SQL editor
├── .github/workflows/
│   └── deploy.yml                  # GitHub Actions: build + deploy to Pages
└── README.md
```

---

## Troubleshooting

**"Missing Supabase config" error on load**
You forgot to set the `.env` values (locally) or the GitHub secrets (in production).

**Can't sign in / "Invalid credentials"**
If you have email confirmation enabled in Supabase, check your email to confirm before signing in.

**Recipes don't appear after sign-up**
Each user has their own collection — a brand-new account starts empty. Use Import to migrate from `recipes.json`.

**GitHub Pages shows the README instead of the app**
Make sure **Settings → Pages → Source** is set to **GitHub Actions** (not "Deploy from a branch").
