<script lang="ts">
  import { onMount } from "svelte";
  import { register } from "@tauri-apps/plugin-global-shortcut";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import { Command } from "@tauri-apps/plugin-shell";
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { readFile } from "@tauri-apps/plugin-fs";
  import type { Entry } from "./db";
  import {
    initDatabase,
    getGames,
    getApps,
    addEntry as dbAddEntry,
    deleteEntry as dbDeleteEntry,
  } from "./db";

  const appWindow = getCurrentWindow();

  // State
  let isOpen = $state(false);
  let activeTab = $state<"games" | "apps" | "add">("games");
  let launchingItem = $state<string | null>(null);

  // Arrays from database
  let games = $state<Entry[]>([]);
  let apps = $state<Entry[]>([]);

  // Form State
  let entryType = $state<"game" | "app">("game");
  let formName = $state("");
  let formBatPath = $state("");
  let formImageData = $state("");
  let formImagePreview = $state("");
  let formError = $state("");

  let sounds: Record<string, HTMLAudioElement> = {};

  function playSound(sound: HTMLAudioElement) {
    if (sound) {
      sound.currentTime = 0;
      sound.play().catch(() => {});
    }
  }

  function switchTab(tab: "games" | "apps" | "add") {
    if (activeTab !== tab) {
      playSound(sounds.switch_tab_sfx);
      activeTab = tab;
    }
  }

  async function toggle() {
    const isVisible = await appWindow.isVisible();
    if (!isVisible) {
      await appWindow.show();
      await appWindow.setFocus();
      playSound(sounds.open_modal_sfx);
      requestAnimationFrame(() => isOpen = true);
    } else {
      isOpen = false;
      playSound(sounds.close_modal_sfx);
      setTimeout(async () => await appWindow.hide(), 200);
    }
  }

  async function launchItem(item: Entry) {
    if (launchingItem) return;
    launchingItem = item.name;
    try {
      playSound(sounds.launch_sfx);
      const command = Command.create("cmd", ["/c", item.bat_path]);
      await command.execute();
      isOpen = false;
      setTimeout(async () => {
        await appWindow.hide();
        launchingItem = null;
      }, 200);
    } catch (error) {
      console.error("Failed:", error);
      launchingItem = null;
    }
  }

  function resetForm() {
    formName = "";
    formBatPath = "";
    formImageData = "";
    formImagePreview = "";
    formError = "";
  }

  async function browseBatFile() {
    playSound(sounds.hover_sfx);
    const selected = await openDialog({
      title: "Select Script",
      filters: [{ name: "Batch Files", extensions: ["bat", "cmd"] }],
    });
    if (selected) {
      formBatPath = selected as string;
      if (!formName) {
        const filename = formBatPath.split(/[/\\]/).pop() || "";
        formName = filename.replace(/\.(bat|cmd)$/i, "");
      }
    }
  }

  async function browseImage() {
    playSound(sounds.hover_sfx);
    const selected = await openDialog({
      title: "Select Image",
      filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp"] }],
    });
    if (selected) {
      try {
        const bytes = await readFile(selected as string);
        const base64 = btoa(bytes.reduce((data, byte) => data + String.fromCharCode(byte), ""));
        const ext = (selected as string).split(".").pop()?.toLowerCase() || "png";
        const mime = ext === 'jpg' ? 'jpeg' : ext;
        formImageData = `data:image/${mime};base64,${base64}`;
        formImagePreview = formImageData;
      } catch (e) { formError = "Failed to read image"; }
    }
  }

  async function handleAddEntry() {
    if (!formName.trim() || !formBatPath.trim() || !formImageData) {
      formError = "All fields are required";
      return;
    }
    try {
      playSound(sounds.launch_sfx);
      const newEntry = await dbAddEntry(entryType, formName, formBatPath, formImageData);
      if (entryType === "game") {
        games = [newEntry, ...games];
        switchTab("games");
      } else {
        apps = [newEntry, ...apps];
        switchTab("apps");
      }
      resetForm();
    } catch (e) { formError = "Failed to save"; }
  }

  async function handleDeleteEntry(entry: Entry) {
    if(!confirm("Are you sure?")) return;
    await dbDeleteEntry(entry.id);
    if (entry.type === "game") games = games.filter(g => g.id !== entry.id);
    else apps = apps.filter(a => a.id !== entry.id);
  }

  onMount(async () => {
    await register("Shift+F10", async (e) => { if (e.state === "Pressed") await toggle(); });
    await initDatabase();
    games = await getGames();
    apps = await getApps();
    sounds = {
      open_modal_sfx: new Audio("/sounds/deck_ui_side_menu_fly_in.wav"),
      close_modal_sfx: new Audio("/sounds/deck_ui_side_menu_fly_out.wav"),
      switch_tab_sfx: new Audio("/sounds/deck_ui_tab_transition_01.wav"),
      hover_sfx: new Audio("/sounds/deck_ui_navigation.wav"),
      launch_sfx: new Audio("/sounds/deck_ui_default_activation.wav"),
    };
    Object.values(sounds).forEach(s => s.volume = 0.4);
    await appWindow.show();
    requestAnimationFrame(() => isOpen = true);
  });
</script>

<main class:open={isOpen}>
  <div class="solid-panel">
    
    <aside class="sidebar">
      <div class="nav-group">
        <button 
          class="nav-item" 
          class:active={activeTab === "games"} 
          onclick={() => switchTab("games")}
          onmouseenter={() => playSound(sounds.hover_sfx)}
        >
          <span class="icon">🎮</span>
          <span class="label">Games</span>
        </button>

        <button 
          class="nav-item" 
          class:active={activeTab === "apps"} 
          onclick={() => switchTab("apps")}
          onmouseenter={() => playSound(sounds.hover_sfx)}
        >
          <span class="icon">📱</span>
          <span class="label">Apps</span>
        </button>

        <button 
          class="nav-item add" 
          class:active={activeTab === "add"} 
          onclick={() => switchTab("add")}
          onmouseenter={() => playSound(sounds.hover_sfx)}
        >
          <span class="icon">➕</span>
          <span class="label">Add New</span>
        </button>
      </div>
    </aside>

    <section class="content">
      <header>
        <h1>{activeTab === 'add' ? 'Add Entry' : activeTab}</h1>
      </header>

      <div class="scroll-area">
        {#if activeTab === "games"}
          <div class="grid games-grid">
            {#each games as game (game.id)}
              <div class="card game-card" onclick={() => launchItem(game)} onmouseenter={() => playSound(sounds.hover_sfx)} role="button" tabindex="0">
                <div class="image-container">
                  <img src={game.image_data} alt={game.name} />
                  {#if launchingItem === game.name}
                    <div class="loading-overlay"><div class="spinner"></div></div>
                  {/if}
                </div>
                <div class="card-footer">
                  <span class="title">{game.name}</span>
                  <button class="delete-btn" onclick={(e) => { e.stopPropagation(); handleDeleteEntry(game); }}>🗑️</button>
                </div>
              </div>
            {/each}
          </div>

        {:else if activeTab === "apps"}
          <div class="grid apps-grid">
            {#each apps as app (app.id)}
              <div class="card app-card" onclick={() => launchItem(app)} onmouseenter={() => playSound(sounds.hover_sfx)} role="button" tabindex="0">
                <div class="app-icon">
                  {#if launchingItem === app.name}
                    <div class="spinner"></div>
                  {:else}
                    <img src={app.image_data} alt={app.name} />
                  {/if}
                </div>
                <span class="app-title">{app.name}</span>
                <button class="delete-btn app-del" onclick={(e) => { e.stopPropagation(); handleDeleteEntry(app); }}>×</button>
              </div>
            {/each}
          </div>

        {:else if activeTab === "add"}
          <div class="form-wrapper">
            {#if formError} <div class="error-msg">{formError}</div> {/if}

            <div class="form-group">
              <label>Type</label>
              <div class="type-switch">
                <button class:selected={entryType === 'game'} onclick={() => entryType = 'game'}>Game</button>
                <button class:selected={entryType === 'app'} onclick={() => entryType = 'app'}>App</button>
              </div>
            </div>

            <div class="form-group">
              <label>Name</label>
              <input type="text" bind:value={formName} placeholder="Display Name..." />
            </div>

            <div class="form-group">
              <label>File Path (.bat)</label>
              <div class="row">
                <input type="text" bind:value={formBatPath} placeholder="C:/Games/start.bat" />
                <button class="btn-secondary" onclick={browseBatFile}>Browse</button>
              </div>
            </div>

            <div class="form-group">
              <label>Image</label>
              <div class="row">
                <button class="btn-secondary full" onclick={browseImage}>Select Image...</button>
                {#if formImagePreview}
                  <img src={formImagePreview} class="preview-img" alt="Preview" />
                {/if}
              </div>
            </div>

            <button class="btn-primary" onclick={handleAddEntry}>Save</button>
          </div>
        {/if}
      </div>
    </section>
  </div>
</main>

<style>
  :global(body) {
    margin: 0;
    overflow: hidden;
    background: transparent;
    font-family: 'Segoe UI', sans-serif;
  }

  /* Main Wrapper - Centered Modal */
  main {
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.6); /* Dims the actual desktop wallpaper */
    opacity: 0;
    transition: opacity 0.2s;
  }
  main.open { opacity: 1; }

  /* The Solid Panel */
  .solid-panel {
    width: 1000px;
    height: 600px;
    background: #18181b; /* Solid Dark Grey */
    border: 1px solid #3f3f46; /* Distinct Grey Border */
    border-radius: 8px;
    display: flex;
    overflow: hidden;
    box-shadow: 0 20px 50px rgba(0,0,0,0.8);
    transform: scale(0.95);
    transition: transform 0.2s;
  }
  main.open .solid-panel { transform: scale(1); }

  /* === SIDEBAR === */
  .sidebar {
    width: 200px;
    background: #27272a; /* Slightly lighter grey than panel */
    border-right: 1px solid #3f3f46;
    padding: 20px;
  }

  .nav-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: #a1a1aa; /* Muted text */
    cursor: pointer;
    text-align: left;
    transition: 0.2s;
    font-size: 16px;
    font-weight: 500;
  }

  .nav-item:hover {
    background: #3f3f46;
    color: white;
  }

  .nav-item.active {
    background: #2563eb; /* Bright Solid Blue */
    color: white;
  }
  
  .nav-item.add { margin-top: 20px; border: 1px dashed #52525b; }
  .nav-item.add:hover { border-color: white; }

  /* === CONTENT === */
  .content {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: #18181b;
  }

  header {
    padding: 20px 30px;
    border-bottom: 1px solid #27272a;
  }

  h1 {
    margin: 0;
    font-size: 24px;
    color: white;
    text-transform: capitalize;
  }

  .scroll-area {
    padding: 30px;
    overflow-y: auto;
    flex: 1;
  }

  /* === GRIDS === */
  .grid {
    display: grid;
    gap: 20px;
  }
  
  .games-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
  .apps-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }

  /* === CARDS === */
  .card {
    background: #27272a;
    border: 1px solid #3f3f46;
    border-radius: 8px;
    overflow: hidden;
    cursor: pointer;
    transition: transform 0.15s, border-color 0.15s;
    position: relative;
  }

  .card:hover {
    transform: translateY(-4px);
    border-color: #60a5fa; /* Blue border on hover */
    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  }

  /* Game Card Specifics */
  .game-card .image-container {
    width: 100%;
    aspect-ratio: 2/3;
    position: relative;
  }
  .game-card img { width: 100%; height: 100%; object-fit: cover; }
  
  .card-footer {
    padding: 12px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-top: 1px solid #3f3f46;
    background: #202023;
  }
  .title { color: white; font-weight: 600; font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* App Card Specifics */
  .app-card {
    padding: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 15px;
    text-align: center;
  }
  .app-icon { width: 48px; height: 48px; }
  .app-icon img { width: 100%; height: 100%; object-fit: contain; }
  .app-title { color: white; font-weight: 600; font-size: 14px; }

  /* Delete Buttons */
  .delete-btn {
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 16px;
    opacity: 0.5;
    transition: 0.2s;
  }
  .delete-btn:hover { opacity: 1; transform: scale(1.2); }
  .app-del { position: absolute; top: 5px; right: 5px; font-size: 20px; color: #ef4444; }

  /* === FORM === */
  .form-wrapper { max-width: 450px; margin: 0 auto; color: white; }
  
  .form-group { margin-bottom: 20px; }
  label { display: block; margin-bottom: 8px; color: #a1a1aa; font-size: 14px; }
  
  input {
    width: 100%;
    padding: 12px;
    background: #09090b; /* Very dark for inputs */
    border: 1px solid #3f3f46;
    border-radius: 4px;
    color: white;
    font-size: 15px;
    box-sizing: border-box;
  }
  input:focus { outline: 2px solid #2563eb; border-color: transparent; }

  .row { display: flex; gap: 10px; }
  
  .btn-secondary {
    background: #3f3f46;
    color: white;
    border: none;
    padding: 0 15px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  }
  .btn-secondary.full { width: 100%; padding: 12px; }
  .btn-secondary:hover { background: #52525b; }

  .btn-primary {
    width: 100%;
    background: #2563eb;
    color: white;
    border: none;
    padding: 14px;
    font-size: 16px;
    font-weight: bold;
    border-radius: 4px;
    cursor: pointer;
    margin-top: 10px;
  }
  .btn-primary:hover { background: #1d4ed8; }

  .type-switch { display: flex; background: #09090b; padding: 4px; border-radius: 4px; border: 1px solid #3f3f46; }
  .type-switch button {
    flex: 1;
    background: transparent;
    color: #71717a;
    border: none;
    padding: 8px;
    cursor: pointer;
    border-radius: 4px;
    font-weight: 600;
  }
  .type-switch button.selected { background: #27272a; color: white; box-shadow: 0 1px 3px rgba(0,0,0,0.5); }

  .preview-img { width: 50px; height: 50px; object-fit: cover; border-radius: 4px; border: 1px solid #3f3f46; }
  
  .error-msg { background: #450a0a; color: #fca5a5; padding: 10px; border-radius: 4px; margin-bottom: 20px; border: 1px solid #7f1d1d; }

  /* Utilities */
  .spinner {
    width: 20px; height: 20px;
    border: 3px solid rgba(255,255,255,0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  
  .loading-overlay {
    position: absolute; inset: 0;
    background: rgba(0,0,0,0.7);
    display: flex; align-items: center; justify-content: center;
  }
</style>