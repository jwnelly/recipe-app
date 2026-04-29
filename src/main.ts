import QRCode from 'qrcode';
import type { Recipe, RecipeInput, GroceryItem } from './types';
import { signIn, signUp, signOut, getSession, onAuthChange } from './lib/auth';
import {
  loadRecipes,
  createRecipe,
  updateRecipe,
  deleteRecipe,
  importRecipes,
  getAllTags,
} from './lib/recipes';
import {
  loadGroceryList,
  addGroceryItem,
  removeGroceryItem,
  clearGroceryList as clearGroceryListDb,
} from './lib/grocery';

// ─────────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────────

let allRecipes: Recipe[] = [];
let currentRecipe: Recipe | null = null;
let importData: unknown[] | null = null;
let recipeNavStack: string[] = [];
let groceryList: GroceryItem[] = [];
const tagFilters = new Map<string, 'include' | 'exclude'>();
let allTags: string[] = [];

const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;
const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ─────────────────────────────────────────────────────────────────
// Toast
// ─────────────────────────────────────────────────────────────────

let toastTimer: number | undefined;
function toast(msg: string) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('show'), 3000);
}

// ─────────────────────────────────────────────────────────────────
// Modal helpers
// ─────────────────────────────────────────────────────────────────

function openModal(id: string) { $(id).classList.add('open'); }
function closeModal(id: string) { $(id).classList.remove('open'); }

// ─────────────────────────────────────────────────────────────────
// Auth view
// ─────────────────────────────────────────────────────────────────

let authMode: 'signin' | 'signup' = 'signin';

function switchAuthTab(mode: 'signin' | 'signup') {
  authMode = mode;
  document.querySelectorAll<HTMLButtonElement>('.auth-tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.authTab === mode);
  });
  $('auth-submit-btn').textContent = mode === 'signin' ? 'Sign in' : 'Sign up';
  const pwd = $<HTMLInputElement>('auth-password');
  pwd.autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
  hideAuthMessages();
}

function showAuthError(msg: string) {
  const el = $('auth-error');
  el.textContent = msg;
  el.classList.add('show');
  $('auth-success').classList.remove('show');
}

function showAuthSuccess(msg: string) {
  const el = $('auth-success');
  el.textContent = msg;
  el.classList.add('show');
  $('auth-error').classList.remove('show');
}

function hideAuthMessages() {
  $('auth-error').classList.remove('show');
  $('auth-success').classList.remove('show');
}

async function handleAuthSubmit(e: Event) {
  e.preventDefault();
  const email = $<HTMLInputElement>('auth-email').value.trim();
  const password = $<HTMLInputElement>('auth-password').value;
  if (!email || !password) return;

  const submitBtn = $<HTMLButtonElement>('auth-submit-btn');
  submitBtn.disabled = true;
  hideAuthMessages();

  try {
    if (authMode === 'signin') {
      await signIn(email, password);
      // onAuthChange handles UI swap
    } else {
      const result = await signUp(email, password);
      if (result.session) {
        // Auto-signed-in (email confirmation disabled)
      } else {
        showAuthSuccess('Check your email to confirm your account, then sign in.');
        switchAuthTab('signin');
      }
    }
  } catch (err) {
    showAuthError((err as Error).message || 'Authentication failed.');
  } finally {
    submitBtn.disabled = false;
  }
}

function showAuthScreen() {
  $('auth-screen').classList.add('show');
  $('app-shell').classList.remove('show');
}

function showAppShell(userEmail: string | undefined) {
  $('auth-screen').classList.remove('show');
  $('app-shell').classList.add('show');
  $('user-badge').textContent = userEmail ?? '';
}

// ─────────────────────────────────────────────────────────────────
// Recipe grid
// ─────────────────────────────────────────────────────────────────

function renderGrid() {
  const grid = $('recipe-grid');
  const empty = $('empty-state');

  let recipes = allRecipes;
  if (tagFilters.size > 0) {
    recipes = allRecipes.filter((r) => {
      for (const [tag, mode] of tagFilters) {
        if (mode === 'include' && !r.tags.includes(tag)) return false;
        if (mode === 'exclude' && r.tags.includes(tag)) return false;
      }
      return true;
    });
  }

  if (recipes.length === 0) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = recipes
    .map(
      (r) => `
    <div class="recipe-card" data-recipe-id="${esc(r.id)}">
      <div class="card-title">${esc(r.title)}</div>
      <div class="card-meta">
        ${r.servings ? `<span>🍽 ${esc(r.servings)} servings</span>` : ''}
        ${r.prepTime ? `<span>⏱ ${esc(r.prepTime)}</span>` : ''}
        ${r.cookTime ? `<span>🔥 ${esc(r.cookTime)}</span>` : ''}
      </div>
      ${r.description ? `<div class="card-desc">${esc(r.description)}</div>` : ''}
      ${
        r.tags.length
          ? `<div class="tag-list">${r.tags
              .map((t) => `<span class="tag" data-tag="${esc(t)}">${esc(t)}</span>`)
              .join('')}</div>`
          : ''
      }
    </div>`
    )
    .join('');
}

async function refreshRecipes() {
  const search = $<HTMLInputElement>('search').value.trim();
  try {
    allRecipes = await loadRecipes(search);
    allTags = getAllTags(allRecipes);
    renderTagPills();
    renderGrid();
  } catch (err) {
    toast('Failed to load recipes.');
    console.error(err);
  }
}

// ─────────────────────────────────────────────────────────────────
// Tag filter
// ─────────────────────────────────────────────────────────────────

function renderTagPills() {
  const list = $('tf-pill-list');
  list.innerHTML = allTags
    .map((tag) => {
      const mode = tagFilters.get(tag) ?? '';
      return `<div class="tf-pill ${mode}" data-tag="${esc(tag)}">
        <span class="tf-pill-name">${esc(tag)}</span>
        <div class="tf-pill-btns">
          <button class="tf-pill-btn check ${mode === 'include' ? 'active' : ''}" data-tag-action="include" title="Include">✓</button>
          <button class="tf-pill-btn cross ${mode === 'exclude' ? 'active' : ''}" data-tag-action="exclude" title="Exclude">✕</button>
        </div>
      </div>`;
    })
    .join('');
  updateTagFilterBtn();
}

function setTagFilter(tag: string, mode: 'include' | 'exclude') {
  if (tagFilters.get(tag) === mode) {
    tagFilters.delete(tag);
  } else {
    tagFilters.set(tag, mode);
  }
  renderTagPills();
}

function updateTagFilterBtn() {
  const count = tagFilters.size;
  const countEl = $('tf-count');
  if (count > 0) {
    countEl.textContent = String(count);
    countEl.style.display = 'inline';
  } else {
    countEl.style.display = 'none';
  }
}

// ─────────────────────────────────────────────────────────────────
// Recipe view modal
// ─────────────────────────────────────────────────────────────────

function viewRecipe(id: string, pushCurrent = false) {
  if (pushCurrent && currentRecipe) recipeNavStack.push(currentRecipe.id);
  const r = allRecipes.find((x) => x.id === id);
  if (!r) return;
  currentRecipe = r;
  $('view-modal-title').textContent = r.title;
  updateViewBackBtn();
  renderViewBody(r);
  openModal('view-modal');
}

function updateViewBackBtn() {
  const backBtn = $('view-back-btn');
  backBtn.style.display = recipeNavStack.length > 0 ? 'inline-flex' : 'none';
  if (recipeNavStack.length > 0) {
    const parentId = recipeNavStack[recipeNavStack.length - 1];
    const parent = allRecipes.find((x) => x.id === parentId);
    backBtn.textContent = `← ${parent ? parent.title : 'Back'}`;
  }
}

function goBackRecipe() {
  if (recipeNavStack.length === 0) return;
  const parentId = recipeNavStack.pop()!;
  const r = allRecipes.find((x) => x.id === parentId);
  if (!r) return;
  currentRecipe = r;
  $('view-modal-title').textContent = r.title;
  updateViewBackBtn();
  renderViewBody(r);
}

function closeViewModal() {
  recipeNavStack = [];
  $('view-back-btn').style.display = 'none';
  closeModal('view-modal');
}

function isInGroceryList(text: string, recipeId: string): boolean {
  return groceryList.some((i) => i.text === text && i.recipeId === recipeId);
}

function renderViewBody(r: Recipe) {
  $('view-body').innerHTML = `
    <div class="view-title">${esc(r.title)}</div>
    <div class="view-meta">
      ${r.servings ? `<span>🍽 ${esc(r.servings)} servings</span>` : ''}
      ${r.prepTime ? `<span>⏱ Prep: ${esc(r.prepTime)}</span>` : ''}
      ${r.cookTime ? `<span>🔥 Cook: ${esc(r.cookTime)}</span>` : ''}
    </div>
    ${r.tags.length ? `<div class="tag-list" style="margin-bottom:0.8rem;">${r.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
    ${r.description ? `<p class="view-desc">${esc(r.description)}</p>` : ''}
    ${r.sourceUrl ? `<p class="view-source-link">Source: <a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener noreferrer" style="color:var(--primary);">${esc(r.sourceUrl)}</a></p>` : ''}
    ${
      r.ingredients.length
        ? `<div class="view-section">
        <h3 style="display:flex;align-items:center;gap:0.5rem;flex-wrap:wrap;">Ingredients
          <button class="btn btn-accent" id="btn-add-all-ingredients" style="font-size:0.72rem;padding:0.15rem 0.55rem;font-weight:600;">+ Add all</button>
          <button class="btn btn-secondary" id="btn-remove-all-ingredients" style="font-size:0.72rem;padding:0.15rem 0.55rem;font-weight:600;">− Remove all</button>
        </h3>
        <ul class="ingredients-checklist">
          ${r.ingredients
            .map((i) => {
              if (i.startsWith('@')) {
                const name = i.slice(1).trim();
                const linked = allRecipes.find((x) => x.title.toLowerCase() === name.toLowerCase());
                if (linked) {
                  return `<li class="ingredient-item">
                    <div class="ingredient-subrecipe">
                      <button class="subrecipe-btn" data-subrecipe-id="${esc(linked.id)}">📖 ${esc(linked.title)}</button>
                    </div>
                  </li>`;
                } else {
                  return `<li class="ingredient-item">
                    <div class="ingredient-subrecipe">
                      <button class="subrecipe-btn not-found" disabled>📖 ${esc(name)} <span style="font-size:0.75rem;">(not found)</span></button>
                    </div>
                  </li>`;
                }
              }
              const checked = isInGroceryList(i, r.id);
              return `<li class="ingredient-item${checked ? ' checked' : ''}">
                <label class="ingredient-check-label">
                  <input type="checkbox" class="ingredient-cb"
                         data-recipe-id="${esc(r.id)}"
                         data-recipe-title="${esc(r.title)}"
                         data-ingredient="${esc(i)}"
                         ${checked ? 'checked' : ''} />
                  <span>${esc(i)}</span>
                </label>
              </li>`;
            })
            .join('')}
        </ul>
      </div>`
        : ''
    }
    ${r.instructions ? `<div class="view-section"><h3>Instructions</h3><div class="instructions-text">${esc(r.instructions)}</div></div>` : ''}
    ${r.notes ? `<div class="view-section"><h3>Notes</h3><div class="notes-text">${esc(r.notes)}</div></div>` : ''}
  `;
}

async function handleIngredientCheck(checkbox: HTMLInputElement) {
  const li = checkbox.closest('li')!;
  const text = checkbox.dataset.ingredient ?? '';
  const recipeId = checkbox.dataset.recipeId ?? '';
  const recipeTitle = checkbox.dataset.recipeTitle ?? '';
  try {
    if (checkbox.checked) {
      li.classList.add('checked');
      await addGroceryItem(text, recipeId, recipeTitle);
      groceryList = await loadGroceryList();
      updateGroceryBadge();
      toast('Added to grocery list.');
    } else {
      li.classList.remove('checked');
      await removeGroceryItem(text, recipeId);
      groceryList = await loadGroceryList();
      updateGroceryBadge();
    }
  } catch (err) {
    toast('Failed to update grocery list.');
    console.error(err);
    checkbox.checked = !checkbox.checked;
  }
}

async function addAllIngredients() {
  if (!currentRecipe) return;
  let added = 0;
  for (const ingredient of currentRecipe.ingredients) {
    if (ingredient.startsWith('@')) continue;
    if (!isInGroceryList(ingredient, currentRecipe.id)) {
      try {
        await addGroceryItem(ingredient, currentRecipe.id, currentRecipe.title);
        added++;
      } catch (err) {
        console.error(err);
      }
    }
  }
  groceryList = await loadGroceryList();
  updateGroceryBadge();
  // Re-render the view to update checkbox states
  if (currentRecipe) renderViewBody(currentRecipe);
  toast(added > 0 ? `Added ${added} ingredient(s) to grocery list.` : 'All already in list.');
}

async function removeAllIngredients() {
  if (!currentRecipe) return;
  let removed = 0;
  for (const ingredient of currentRecipe.ingredients) {
    if (ingredient.startsWith('@')) continue;
    if (isInGroceryList(ingredient, currentRecipe.id)) {
      try {
        await removeGroceryItem(ingredient, currentRecipe.id);
        removed++;
      } catch (err) {
        console.error(err);
      }
    }
  }
  groceryList = await loadGroceryList();
  updateGroceryBadge();
  if (currentRecipe) renderViewBody(currentRecipe);
  toast(removed > 0 ? `Removed ${removed} ingredient(s) from grocery list.` : 'None were in the list.');
}

// ─────────────────────────────────────────────────────────────────
// Recipe form (add/edit)
// ─────────────────────────────────────────────────────────────────

let formMode: 'add' | 'edit' = 'add';
let formEditingId: string | null = null;

function openForm(recipe: Recipe | null = null) {
  formMode = recipe ? 'edit' : 'add';
  formEditingId = recipe?.id ?? null;
  $('form-title').textContent = recipe ? 'Edit Recipe' : 'Add Recipe';
  $<HTMLInputElement>('f-title').value = recipe?.title ?? '';
  $<HTMLTextAreaElement>('f-desc').value = recipe?.description ?? '';
  $<HTMLInputElement>('f-servings').value = recipe?.servings != null ? String(recipe.servings) : '';
  $<HTMLInputElement>('f-tags').value = (recipe?.tags ?? []).join(', ');
  $<HTMLInputElement>('f-prep').value = recipe?.prepTime ?? '';
  $<HTMLInputElement>('f-cook').value = recipe?.cookTime ?? '';
  $<HTMLTextAreaElement>('f-ingredients').value = (recipe?.ingredients ?? []).join('\n');
  $<HTMLTextAreaElement>('f-instructions').value = recipe?.instructions ?? '';
  $<HTMLTextAreaElement>('f-notes').value = recipe?.notes ?? '';
  $<HTMLInputElement>('f-source-url').value = recipe?.sourceUrl ?? '';
  populateSubRecipePicker();
  openModal('form-modal');
}

function populateSubRecipePicker() {
  const picker = $<HTMLSelectElement>('f-subrecipe-picker');
  picker.innerHTML = '<option value="">— insert sub-recipe link —</option>';
  for (const r of allRecipes) {
    const opt = document.createElement('option');
    opt.value = r.title;
    opt.textContent = r.title;
    picker.appendChild(opt);
  }
}

function insertSubRecipeLink() {
  const picker = $<HTMLSelectElement>('f-subrecipe-picker');
  const title = picker.value;
  if (!title) return;
  const ta = $<HTMLTextAreaElement>('f-ingredients');
  const pos = ta.selectionStart;
  const before = ta.value.slice(0, pos);
  const needsNewlineBefore = before.length > 0 && !before.endsWith('\n');
  const insert = (needsNewlineBefore ? '\n' : '') + '@' + title;
  ta.value = ta.value.slice(0, pos) + insert + ta.value.slice(ta.selectionEnd);
  ta.selectionStart = ta.selectionEnd = pos + insert.length;
  ta.focus();
  picker.value = '';
}

async function submitForm(e: Event) {
  e.preventDefault();
  const input: RecipeInput = {
    title: $<HTMLInputElement>('f-title').value.trim(),
    description: $<HTMLTextAreaElement>('f-desc').value.trim() || null,
    servings: parseInt($<HTMLInputElement>('f-servings').value) || null,
    tags: $<HTMLInputElement>('f-tags').value
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    prepTime: $<HTMLInputElement>('f-prep').value.trim() || null,
    cookTime: $<HTMLInputElement>('f-cook').value.trim() || null,
    ingredients: $<HTMLTextAreaElement>('f-ingredients').value
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
    instructions: $<HTMLTextAreaElement>('f-instructions').value.trim() || null,
    notes: $<HTMLTextAreaElement>('f-notes').value.trim() || null,
    sourceUrl: $<HTMLInputElement>('f-source-url').value.trim() || null,
  };

  try {
    if (formMode === 'edit' && formEditingId) {
      await updateRecipe(formEditingId, input);
      toast('Recipe updated.');
    } else {
      await createRecipe(input);
      toast('Recipe added.');
    }
    closeModal('form-modal');
    await refreshRecipes();
  } catch (err) {
    toast('Save failed: ' + (err as Error).message);
    console.error(err);
  }
}

// ─────────────────────────────────────────────────────────────────
// Delete recipe
// ─────────────────────────────────────────────────────────────────

async function handleDeleteRecipe() {
  if (!currentRecipe) return;
  if (!confirm(`Delete "${currentRecipe.title}"?`)) return;
  try {
    await deleteRecipe(currentRecipe.id);
    closeViewModal();
    toast('Recipe deleted.');
    await refreshRecipes();
  } catch (err) {
    toast('Delete failed.');
    console.error(err);
  }
}

// ─────────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────────

function exportRecipes() {
  const json = JSON.stringify(allRecipes, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'recipes.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Downloading recipes.json…');
}

// ─────────────────────────────────────────────────────────────────
// Import
// ─────────────────────────────────────────────────────────────────

function openImport() {
  importData = null;
  $('import-status').textContent = '';
  $<HTMLButtonElement>('import-btn').disabled = true;
  $<HTMLInputElement>('import-file').value = '';
  openModal('import-modal');
}

function readImportFile(file: File) {
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target?.result as string);
      importData = Array.isArray(data) ? data : null;
      if (!importData) throw new Error('Expected a JSON array');
      $('import-status').textContent = `✓ ${importData.length} recipe(s) ready to import from "${file.name}"`;
      $<HTMLButtonElement>('import-btn').disabled = false;
    } catch {
      $('import-status').textContent = '✗ Invalid JSON file.';
      $<HTMLButtonElement>('import-btn').disabled = true;
      importData = null;
    }
  };
  reader.readAsText(file);
}

async function doImport() {
  if (!importData) return;
  const mode = (document.querySelector<HTMLInputElement>('input[name="import-mode"]:checked')?.value ?? 'merge') as
    | 'merge'
    | 'replace';
  try {
    const result = await importRecipes(importData, mode);
    closeModal('import-modal');
    await refreshRecipes();
    if (mode === 'replace') {
      toast(`Imported ${result.imported} recipe(s) (replaced all).`);
    } else {
      toast(`Imported ${result.imported} new recipe(s), skipped ${result.skipped} duplicate(s).`);
    }
  } catch (err) {
    toast('Import failed: ' + (err as Error).message);
    console.error(err);
  }
}

// ─────────────────────────────────────────────────────────────────
// Grocery list
// ─────────────────────────────────────────────────────────────────

function updateGroceryBadge() {
  const badge = $('grocery-badge');
  if (groceryList.length > 0) {
    badge.textContent = String(groceryList.length);
    badge.style.display = 'inline';
  } else {
    badge.style.display = 'none';
  }
}

async function refreshGroceryList() {
  try {
    groceryList = await loadGroceryList();
    updateGroceryBadge();
  } catch (err) {
    console.error('Failed to load grocery list:', err);
  }
}

async function openGroceryModal() {
  switchGroceryTab('list');
  await refreshGroceryList();
  renderGroceryModal();
  openModal('grocery-modal');
}

function renderGroceryModal() {
  const body = $('grocery-list-body');
  if (groceryList.length === 0) {
    body.innerHTML =
      '<div class="grocery-empty">No items yet.<br>Check ingredients in a recipe to add them here.</div>';
    return;
  }
  const grouped: Record<string, string[]> = {};
  for (const item of groceryList) {
    const key = item.recipeTitle ?? 'Other';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item.text);
  }
  body.innerHTML = Object.entries(grouped)
    .map(
      ([title, items]) => `
    <div class="grocery-section">
      <div class="grocery-section-title">${esc(title)}</div>
      <ul class="grocery-item-list">
        ${items.map((i) => `<li>${esc(i)}</li>`).join('')}
      </ul>
    </div>`
    )
    .join('');
}

async function clearGroceryListAction() {
  if (!confirm('Clear all items from the grocery list?')) return;
  try {
    await clearGroceryListDb();
    groceryList = [];
    updateGroceryBadge();
    renderGroceryModal();
    document.querySelectorAll<HTMLInputElement>('.ingredient-cb:checked').forEach((cb) => {
      cb.checked = false;
      cb.closest('li')?.classList.remove('checked');
    });
    toast('Grocery list cleared.');
  } catch (err) {
    toast('Failed to clear grocery list.');
    console.error(err);
  }
}

function switchGroceryTab(tab: 'list' | 'qr') {
  document.querySelectorAll<HTMLButtonElement>('.grocery-tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.groceryTab === tab);
  });
  $('grocery-tab-list').style.display = tab === 'list' ? '' : 'none';
  $('grocery-tab-qr').style.display = tab === 'qr' ? '' : 'none';
  if (tab === 'qr') void renderQrCode();
}

async function renderQrCode() {
  const canvas = $<HTMLCanvasElement>('qr-canvas');
  const container = $('qr-container');
  const emptyMsg = $('qr-empty');

  if (groceryList.length === 0) {
    container.style.display = 'none';
    emptyMsg.style.display = 'block';
    return;
  }
  container.style.display = 'block';
  emptyMsg.style.display = 'none';

  const grouped: Record<string, string[]> = {};
  for (const item of groceryList) {
    const key = item.recipeTitle ?? 'Other';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item.text);
  }
  let text = 'GROCERY LIST\n\n';
  for (const [title, items] of Object.entries(grouped)) {
    text += `From: ${title}\n`;
    for (const i of items) text += `- ${i}\n`;
    text += '\n';
  }

  try {
    await QRCode.toCanvas(canvas, text.trim(), {
      width: 220,
      color: { dark: '#2c5f2e', light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });
  } catch (err) {
    console.error('QR generation failed:', err);
    container.style.display = 'none';
    emptyMsg.style.display = 'block';
    emptyMsg.textContent = 'List is too long for a QR code.';
  }
}

// ─────────────────────────────────────────────────────────────────
// Wire up event listeners (single setup at boot)
// ─────────────────────────────────────────────────────────────────

function wireUpEventListeners() {
  // Auth form
  $('auth-form').addEventListener('submit', handleAuthSubmit);
  document.querySelectorAll<HTMLButtonElement>('.auth-tab-btn').forEach((b) => {
    b.addEventListener('click', () => switchAuthTab(b.dataset.authTab as 'signin' | 'signup'));
  });

  // Header buttons
  $('btn-add-recipe').addEventListener('click', () => openForm());
  $('btn-import').addEventListener('click', openImport);
  $('btn-export').addEventListener('click', exportRecipes);
  $('grocery-btn').addEventListener('click', openGroceryModal);
  $('btn-signout').addEventListener('click', async () => {
    try {
      await signOut();
    } catch (err) {
      console.error(err);
    }
  });

  // Search debounced
  let searchTimer: number | undefined;
  $('search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = window.setTimeout(refreshRecipes, 300);
  });

  // Tag filter
  $('tag-filter-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    const dropdown = $('tag-filter-dropdown');
    const wasOpen = dropdown.classList.contains('open');
    dropdown.classList.toggle('open');
    if (wasOpen) renderGrid();
  });
  $('tf-clear-btn').addEventListener('click', () => {
    tagFilters.clear();
    renderTagPills();
    renderGrid();
  });
  $('tf-pill-list').addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest<HTMLButtonElement>('.tf-pill-btn');
    if (!btn) return;
    const pill = btn.closest<HTMLElement>('.tf-pill');
    const tag = pill?.dataset.tag;
    const action = btn.dataset.tagAction as 'include' | 'exclude' | undefined;
    if (tag && action) setTagFilter(tag, action);
  });
  document.addEventListener('click', (e) => {
    const wrapper = $('tag-filter-wrapper');
    const dropdown = $('tag-filter-dropdown');
    if (!wrapper.contains(e.target as Node) && dropdown.classList.contains('open')) {
      dropdown.classList.remove('open');
      renderGrid();
    }
  });

  // Recipe grid click delegation
  $('recipe-grid').addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    // Tag chip click
    const tagChip = target.closest<HTMLElement>('.tag[data-tag]');
    if (tagChip) {
      e.stopPropagation();
      const tag = tagChip.dataset.tag!;
      if (!tagFilters.has(tag)) tagFilters.set(tag, 'include');
      renderTagPills();
      renderGrid();
      $('tag-filter-dropdown').classList.add('open');
      return;
    }
    // Card click → view recipe
    const card = target.closest<HTMLElement>('.recipe-card');
    if (card?.dataset.recipeId) viewRecipe(card.dataset.recipeId);
  });

  // View modal click delegation (sub-recipe links, ingredient checkboxes, add/remove all)
  $('view-modal').addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    // Sub-recipe button
    const subBtn = target.closest<HTMLButtonElement>('.subrecipe-btn[data-subrecipe-id]');
    if (subBtn?.dataset.subrecipeId) {
      viewRecipe(subBtn.dataset.subrecipeId, true);
      return;
    }
    // Add all / Remove all
    if (target.id === 'btn-add-all-ingredients') {
      void addAllIngredients();
      return;
    }
    if (target.id === 'btn-remove-all-ingredients') {
      void removeAllIngredients();
      return;
    }
  });
  $('view-modal').addEventListener('change', (e) => {
    const cb = e.target as HTMLInputElement;
    if (cb.classList.contains('ingredient-cb')) void handleIngredientCheck(cb);
  });
  $('view-back-btn').addEventListener('click', goBackRecipe);
  $('view-edit-btn').addEventListener('click', () => {
    closeModal('view-modal');
    if (currentRecipe) openForm(currentRecipe);
  });
  $('view-delete-btn').addEventListener('click', handleDeleteRecipe);
  document.querySelectorAll<HTMLElement>('[data-close-view]').forEach((el) => {
    el.addEventListener('click', closeViewModal);
  });

  // Form modal
  $('recipe-form').addEventListener('submit', submitForm);
  $('form-save-btn').addEventListener('click', () => {
    $<HTMLFormElement>('recipe-form').requestSubmit();
  });
  $('f-subrecipe-picker').addEventListener('change', insertSubRecipeLink);

  // Generic close for modals
  document.querySelectorAll<HTMLElement>('[data-close]').forEach((el) => {
    el.addEventListener('click', () => closeModal(el.dataset.close!));
  });
  document.querySelectorAll<HTMLElement>('.modal-backdrop').forEach((bd) => {
    bd.addEventListener('click', (e) => {
      if (e.target === bd) {
        // Never close the form modal on backdrop click — the user may be
        // clicking to refocus the browser tab after switching away to copy
        // text, and accidentally landing on the overlay would silently
        // discard their unsaved recipe.  The form has explicit ✕ / Cancel.
        if (bd.id === 'form-modal') return;
        if (bd.id === 'view-modal') closeViewModal();
        else closeModal(bd.id);
      }
    });
  });

  // Import modal
  $('drop-area').addEventListener('click', () => $<HTMLInputElement>('import-file').click());
  $('drop-area').addEventListener('dragover', (e) => {
    e.preventDefault();
    $('drop-area').classList.add('dragover');
  });
  $('drop-area').addEventListener('dragleave', () => {
    $('drop-area').classList.remove('dragover');
  });
  $('drop-area').addEventListener('drop', (e) => {
    e.preventDefault();
    $('drop-area').classList.remove('dragover');
    const file = (e as DragEvent).dataTransfer?.files[0];
    if (file) readImportFile(file);
  });
  $('import-file').addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) readImportFile(file);
  });
  $('import-btn').addEventListener('click', doImport);

  // Grocery modal
  document.querySelectorAll<HTMLButtonElement>('.grocery-tab-btn').forEach((b) => {
    b.addEventListener('click', () =>
      switchGroceryTab(b.dataset.groceryTab as 'list' | 'qr')
    );
  });
  $('grocery-clear-btn').addEventListener('click', clearGroceryListAction);
}

// ─────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────

async function boot() {
  wireUpEventListeners();

  const session = await getSession();
  if (session) {
    showAppShell(session.user.email);
    await refreshGroceryList();
    await refreshRecipes();
  } else {
    showAuthScreen();
  }

  onAuthChange(async (newSession) => {
    if (newSession) {
      showAppShell(newSession.user.email);
      await refreshGroceryList();
      await refreshRecipes();
    } else {
      showAuthScreen();
      // Reset state
      allRecipes = [];
      groceryList = [];
      tagFilters.clear();
      recipeNavStack = [];
    }
  });
}

void boot();
