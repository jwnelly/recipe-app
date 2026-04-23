# 📦 Recipe Box

A personal recipe manager that runs locally on your computer. Store, search, and organize your recipes — with a built-in grocery list you can beam to your iPhone via QR code.

---

## Getting Started

### Requirements

- Python 3 (comes pre-installed on macOS)
- A modern web browser (Chrome, Firefox, Safari)
- An internet connection the first time you load the page (to fetch the QR code library from CDN)

### Starting the App

1. Open **Terminal**
2. Navigate to the app folder:
   ```bash
   cd "/Users/jnelly/Documents/Project Support Material/Claude_Apps/recipe-app"
   ```
3. Start the server:
   ```bash
   python3 server.py
   ```
4. Open your browser and go to:
   ```
   http://localhost:3000
   ```

To stop the server, press **Ctrl + C** in the Terminal window.

> The app saves all your recipes to `recipes.json` in the same folder. This file is your database — back it up if you want to keep your recipes safe.

---

## Features

### Recipes
- **Add, edit, and delete** recipes with title, description, servings, prep/cook time, tags, ingredients, instructions, and notes
- **Source URL** — optionally link to where the original recipe came from
- **Search** recipes by title, description, or ingredients using the search bar
- **Export** all your recipes as a JSON file, and **import** them back (merge or replace)

### Tag Filtering
- Click the **Tags ▾** button in the header to open the tag filter panel
- Each tag has two buttons:
  - **✓** (green) — show only recipes *with* this tag
  - **✕** (red) — show only recipes *without* this tag
- You can combine multiple tags in any mix of include/exclude
- Filters apply when you click outside the panel or click Tags ▾ again
- Click **Clear all filters** to reset

### Sub-Recipes
Link one recipe inside another — useful when a recipe depends on a component that has its own recipe (e.g. Eggs Benedict linking to Hollandaise Sauce).

**To add a sub-recipe link:**

In the Ingredients field, type `@` followed by the exact title of another recipe on its own line:
```
4 egg yolks
1 tbsp lemon juice
@Hollandaise Sauce
4 English muffins
```

Or use the **"— insert sub-recipe link —"** dropdown below the ingredients field to pick a recipe by name.

When viewing a recipe, sub-recipe links appear as clickable **📖 buttons**. Clicking one opens the sub-recipe, and a **← Back** button appears in the header so you can return. The full navigation history is remembered if you click multiple levels deep.

### Grocery List
- Check off ingredients in any recipe to add them to your master grocery list
- **+ Add all** / **− Remove all** buttons add or remove all ingredients from a recipe at once
- Click **🛒 Grocery List** in the header to view your full list, grouped by recipe
- The list persists between sessions (stored in your browser's local storage)
- **Clear All** empties the grocery list

### Grocery List on iPhone (QR Code)
1. Add items to your grocery list
2. Click **🛒 Grocery List** → **QR Code for iPhone** tab
3. A QR code appears containing your full list as plain text
4. Point your iPhone camera at it — the list appears on screen without needing any app or WiFi

---

## Data & Backups

All recipes are stored in `recipes.json`. To back up your recipes:
- Use the **Export** button in the app to download a copy, or
- Copy `recipes.json` to a safe location

To restore from a backup, use the **Import** button and choose **Merge** (to add to existing) or **Replace all**.

---

## Project Structure

```
recipe-app/
├── server.py        # Python HTTP server (backend + API)
├── recipes.json     # Recipe data (your "database")
├── public/
│   └── index.html   # The entire frontend (HTML, CSS, JavaScript)
└── README.md
```
