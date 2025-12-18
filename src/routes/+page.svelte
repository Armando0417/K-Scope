<script lang="ts">
  import { onMount } from "svelte";
  import { register } from "@tauri-apps/plugin-global-shortcut";
  
  import { 
    initDatabase, getGames, getApps, 
    addEntry as dbAddEntry, deleteEntry as dbDeleteEntry,
    updateEntry as dbUpdateEntry,
    type Entry, type LaunchType
  } from "./db";

  import * as AppLogic from "../lib/logic";

  // --- STATE ---
  let isOpen = $state(false);
  let activeTab = $state<"games" | "apps" | "add">("games");
  let theme = $state<"tech" | "paper">("tech");
  
  // Data Lists
  let games = $state<Entry[]>([]);
  let apps = $state<Entry[]>([]);
  
  // Loading State
  let launchingItem = $state<string | null>(null);

  // Form State
  let formEntryType = $state<"game" | "app">("game");
  let formLaunchType = $state<LaunchType>("steam");
  let formName = $state("");
  let formLaunchData = $state("");  // Steam ID, exe path, URL, or bat path
  let formLaunchArgs = $state("");  // Args for exe
  let formImage = $state("");
  let formError = $state("");
  let showSettings = $state(false);

  // Edit Mode State
  let editingEntry = $state<Entry | null>(null);
  let isEditing = $derived(editingEntry !== null);

  // Keyboard Navigation State
  let selectedGameIndex = $state(0);
  let selectedAppIndex = $state(0);
  
  // Grid refs for calculating columns
  let gamesGridEl: HTMLElement | null = null;
  let appsGridEl: HTMLElement | null = null;

  // --- ACTIONS ---

  async function handleLaunch(item: Entry) {
    launchingItem = item.name;
    await AppLogic.launchEntry(item);
    launchingItem = null;
    isOpen = false;
  }

  async function handleBrowseExe() {
    const path = await AppLogic.pickExeFile();
    if (path) {
      formLaunchData = path;
      if (!formName) {
        formName = AppLogic.getFilenameFromPath(path);
      }
    }
  }

  async function handleBrowseScript() {
    const path = await AppLogic.pickScriptFile();
    if (path) {
      formLaunchData = path;
      if (!formName) {
        formName = AppLogic.getFilenameFromPath(path);
      }
    }
  }

  async function handleBrowseImage() {
    const base64 = await AppLogic.pickImageFile();
    if (base64) {
      formImage = base64;
    }
  }

  // === START EDITING ===
  function startEdit(entry: Entry) {
    editingEntry = entry;
    
    formEntryType = entry.type;
    formLaunchType = entry.launch_type;
    formName = entry.name;
    formLaunchData = entry.launch_data;
    formLaunchArgs = entry.launch_args || "";
    formImage = entry.image_data;
    formError = "";
    
    activeTab = "add";
    AppLogic.playSound("switch");
  }

  // === CLEAR FORM ===
  function clearForm() {
    editingEntry = null;
    formName = "";
    formLaunchData = "";
    formLaunchArgs = "";
    formImage = "";
    formError = "";
  }

  // === CANCEL EDIT ===
  function cancelEdit() {
    clearForm();
    activeTab = formEntryType === "game" ? "games" : "apps";
    AppLogic.playSound("switch");
  }

  async function handleSaveEntry() {
    // Validation
    if (!formName.trim()) {
      formError = "Please enter a name.";
      return;
    }
    if (!formLaunchData.trim()) {
      formError = getDataFieldError();
      return;
    }
    if (!formImage) {
      formError = "Please select an image.";
      return;
    }

    // Extra validation for Steam ID
    if (formLaunchType === "steam" && !/^\d+$/.test(formLaunchData.trim())) {
      formError = "Steam App ID must be a number (e.g., 1245620).";
      return;
    }

    try {
      if (isEditing && editingEntry) {
        // === UPDATE ===
        await dbUpdateEntry(
          editingEntry.id, 
          formName.trim(), 
          formLaunchType,
          formLaunchData.trim(),
          formLaunchArgs.trim(),
          formImage
        );
        
        // Update local list
        const updatedEntry = {
          ...editingEntry,
          name: formName.trim(),
          launch_type: formLaunchType,
          launch_data: formLaunchData.trim(),
          launch_args: formLaunchArgs.trim(),
          image_data: formImage
        };

        if (editingEntry.type === "game") {
          games = games.map(g => g.id === editingEntry!.id ? updatedEntry : g);
          activeTab = "games";
        } else {
          apps = apps.map(a => a.id === editingEntry!.id ? updatedEntry : a);
          activeTab = "apps";
        }
        
        AppLogic.playSound("launch");
        
      } else {
        // === ADD NEW ===
        const newEntry = await dbAddEntry(
          formEntryType, 
          formName.trim(), 
          formLaunchType,
          formLaunchData.trim(),
          formLaunchArgs.trim(),
          formImage
        );
        
        if (formEntryType === "game") {
          games = [newEntry, ...games];
          activeTab = "games";
        } else {
          apps = [newEntry, ...apps];
          activeTab = "apps";
        }
        
        AppLogic.playSound("switch");
      }
      
      clearForm();
      
    } catch (e) {
      console.error(e);
      formError = "Database error: Could not save.";
    }
  }

  function getDataFieldError(): string {
    switch (formLaunchType) {
      case "steam": return "Please enter a Steam App ID.";
      case "exe": return "Please select an executable.";
      case "url": return "Please enter a URL.";
      case "bat": return "Please select a batch script.";
    }
  }

  async function handleDelete(entry: Entry) {
    if(!confirm("Delete " + entry.name + "?")) return;
    
    await dbDeleteEntry(entry.id);
    if (entry.type === "game") {
      games = games.filter(g => g.id !== entry.id);
      // Clamp selection index
      if (selectedGameIndex >= games.length) {
        selectedGameIndex = Math.max(0, games.length - 1);
      }
    } else {
      apps = apps.filter(a => a.id !== entry.id);
      // Clamp selection index
      if (selectedAppIndex >= apps.length) {
        selectedAppIndex = Math.max(0, apps.length - 1);
      }
    }
    AppLogic.playSound("launch");
  }

  // --- INITIALIZATION ---
  onMount(async () => {
    await register("Ctrl+Shift+F12", async (event) => {
      if (event.state === "Pressed") {
        isOpen = await AppLogic.toggleWindow(isOpen);
      }
    });

    const savedTheme = localStorage.getItem("k_scope_theme");
    if (savedTheme === "paper") theme = "paper";

    await initDatabase();
    games = await getGames();
    apps = await getApps();

    isOpen = await AppLogic.toggleWindow(false);

    // Keyboard navigation listener
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  // --- KEYBOARD NAVIGATION ---
  function handleKeyDown(e: KeyboardEvent) {
    // Don't handle if typing in input or modal open
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (showSettings) return;
    
    // Escape - close window
    if (e.key === "Escape") {
      e.preventDefault();
      if (isOpen) {
        AppLogic.toggleWindow(true);
        isOpen = false;
      }
      return;
    }

    // Tab - cycle tabs (only on Games/Apps, not Add form)
    if (e.key === "Tab" && activeTab !== "add") {
      e.preventDefault();
      if (e.shiftKey) {
        // Shift+Tab - go backwards
        activeTab = activeTab === "games" ? "apps" : "games";
      } else {
        activeTab = activeTab === "games" ? "apps" : "games";
      }
      AppLogic.playSound("switch");
      return;
    }

    // Arrow keys and Enter only apply to Games/Apps tabs
    if (activeTab === "add") return;

    const items = activeTab === "games" ? games : apps;
    const selectedIndex = activeTab === "games" ? selectedGameIndex : selectedAppIndex;
    const setSelectedIndex = (i: number) => {
      if (activeTab === "games") selectedGameIndex = i;
      else selectedAppIndex = i;
    };

    if (items.length === 0) return;

    const cols = getGridColumns();

    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        if (selectedIndex < items.length - 1) {
          setSelectedIndex(selectedIndex + 1);
          AppLogic.playSound("hover");
        }
        break;

      case "ArrowLeft":
        e.preventDefault();
        if (selectedIndex > 0) {
          setSelectedIndex(selectedIndex - 1);
          AppLogic.playSound("hover");
        }
        break;

      case "ArrowDown":
        e.preventDefault();
        if (selectedIndex + cols < items.length) {
          setSelectedIndex(selectedIndex + cols);
          AppLogic.playSound("hover");
        }
        break;

      case "ArrowUp":
        e.preventDefault();
        if (selectedIndex - cols >= 0) {
          setSelectedIndex(selectedIndex - cols);
          AppLogic.playSound("hover");
        }
        break;

      case "Enter":
        e.preventDefault();
        const item = items[selectedIndex];
        if (item && !launchingItem) {
          handleLaunch(item);
        }
        break;
    }
  }

  function getGridColumns(): number {
    const gridEl = activeTab === "games" ? gamesGridEl : appsGridEl;
    if (!gridEl) return 4; // fallback
    
    const style = window.getComputedStyle(gridEl);
    const columns = style.gridTemplateColumns.split(" ").length;
    return columns || 4;
  }

  function switchTab(t: "games" | "apps" | "add") {
    if (activeTab === "add" && t !== "add" && isEditing) {
      clearForm();
    }
    activeTab = t;
    // Reset selection when switching tabs
    if (t === "games") selectedGameIndex = 0;
    if (t === "apps") selectedAppIndex = 0;
    AppLogic.playSound("switch");
  }

  function switchLaunchType(type: LaunchType) {
    if (formLaunchType !== type) {
      formLaunchType = type;
      formLaunchData = "";  // Clear data when switching types
      formLaunchArgs = "";
      AppLogic.playSound("switch");
    }
  }
</script>

<main class:open={isOpen} data-theme={theme}>
  <div class="panel">
    
    <div class="tabs-container">
      <button class="tab" class:active={activeTab === "games"} on:click={() => switchTab("games")}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="2" y="6" width="20" height="12" rx="2" />
          <path d="M6 12h4m-2-2v4" />
          <circle cx="17" cy="10" r="1" />
          <circle cx="15" cy="14" r="1" />
        </svg>
        <span>Games</span>
      </button>

      <button class="tab" class:active={activeTab === "apps"} on:click={() => switchTab("apps")}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
        <span>Apps</span>
      </button>

      <div class="tab-spacer"></div>

      <button class="tab" class:active={activeTab === "add"} on:click={() => switchTab("add")}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        <span>Add</span>
      </button>

      <button class="tab settings" on:click={() => showSettings = !showSettings}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="3"></circle>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
        </svg>
        <span>Theme</span>
      </button>
    </div>

    <div class="content">
      
      {#if activeTab === "games"}
        <div class="games-grid" bind:this={gamesGridEl}>
          {#each games as game, i (game.id)}
            <div 
              class="game-card" 
              class:selected={i === selectedGameIndex}
              on:mouseenter={() => { selectedGameIndex = i; AppLogic.playSound("hover"); }} 
              role="button" 
              tabindex="0"
            >
              
              <button class="edit-btn" on:click|stopPropagation={() => startEdit(game)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>

              <button class="delete-btn" on:click|stopPropagation={() => handleDelete(game)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>

              <div class="game-image">
                <img src={game.image_data} alt={game.name} />
              </div>

              <div class="game-info">
                <span class="game-name">{game.name}</span>
                <button class="play-btn" class:loading={launchingItem === game.name} on:click={() => handleLaunch(game)}>
                  {#if launchingItem === game.name}
                    <div class="spinner"></div>
                  {:else}
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  {/if}
                </button>
              </div>
            </div>
          {/each}
        </div>

      {:else if activeTab === "apps"}
        <div class="apps-grid" bind:this={appsGridEl}>
          {#each apps as app, i (app.id)}
            <div class="app-wrapper" class:selected={i === selectedAppIndex}>
              <button class="app-card" class:loading={launchingItem === app.name} 
                on:click={() => handleLaunch(app)}
                on:mouseenter={() => { selectedAppIndex = i; AppLogic.playSound("hover"); }}
              >
                {#if launchingItem === app.name}
                   <div class="spinner"></div>
                {:else}
                  <img src={app.image_data} alt={app.name} />
                {/if}
              </button>
              <button class="edit-btn app-edit" on:click={() => startEdit(app)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button class="delete-btn app-delete" on:click={() => handleDelete(app)}>
                 <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          {/each}
        </div>

      {:else if activeTab === "add"}
        <div class="add-entry">
          <h2>{isEditing ? 'Edit Entry' : 'Add New Entry'}</h2>
          {#if formError} <div class="error">{formError}</div> {/if}

          <!-- Entry Type (Game/App) -->
          <div class="form-section">
            <label class="section-label">Entry Type</label>
            <div class="toggle-group">
              <button 
                class="toggle-btn" 
                class:active={formEntryType === "game"} 
                class:disabled={isEditing}
                disabled={isEditing}
                on:click={() => { if (!isEditing) { formEntryType = "game"; AppLogic.playSound("switch"); } }}
              >Game</button>
              <button 
                class="toggle-btn" 
                class:active={formEntryType === "app"} 
                class:disabled={isEditing}
                disabled={isEditing}
                on:click={() => { if (!isEditing) { formEntryType = "app"; AppLogic.playSound("switch"); } }}
              >App</button>
            </div>
          </div>

          <!-- Launch Type -->
          <div class="form-section">
            <label class="section-label">Launch Type</label>
            <div class="toggle-group four-col">
              <button 
                class="toggle-btn" 
                class:active={formLaunchType === "steam"} 
                on:click={() => switchLaunchType("steam")}
              >Steam</button>
              <button 
                class="toggle-btn" 
                class:active={formLaunchType === "exe"} 
                on:click={() => switchLaunchType("exe")}
              >Exe</button>
              <button 
                class="toggle-btn" 
                class:active={formLaunchType === "url"} 
                on:click={() => switchLaunchType("url")}
              >URL</button>
              <button 
                class="toggle-btn" 
                class:active={formLaunchType === "bat"} 
                on:click={() => switchLaunchType("bat")}
              >Batch</button>
            </div>
          </div>

          <!-- Name -->
          <div class="form-row">
            <label>
              <span>Name</span>
              <input type="text" bind:value={formName} placeholder="Display Name" />
            </label>
          </div>

          <!-- Dynamic Launch Data Input -->
          {#if formLaunchType === "steam"}
            <div class="form-row">
              <label>
                <span>Steam App ID</span>
                <input 
                  type="text" 
                  bind:value={formLaunchData} 
                  placeholder="e.g., 1245620"
                />
              </label>
              <div class="hint">
                Find this in the game's Steam URL: store.steampowered.com/app/<strong>1245620</strong>
              </div>
            </div>

          {:else if formLaunchType === "exe"}
            <div class="form-row">
              <label>
                <span>Executable Path</span>
                <div class="input-with-btn">
                  <input type="text" bind:value={formLaunchData} placeholder="C:\Games\Game.exe" />
                  <button class="browse-btn" on:click={handleBrowseExe}>Browse</button>
                </div>
              </label>
            </div>
            <div class="form-row">
              <label>
                <span>Launch Arguments (optional)</span>
                <input 
                  type="text" 
                  bind:value={formLaunchArgs} 
                      placeholder='e.g., --fullscreen --dx12 "mod path"'
                />
              </label>
            </div>

          {:else if formLaunchType === "url"}
            <div class="form-row">
              <label>
                <span>URL</span>
                <input 
                  type="text" 
                  bind:value={formLaunchData} 
                  placeholder="https://..."
                />
              </label>
            </div>

          {:else if formLaunchType === "bat"}
            <div class="form-row">
              <label>
                <span>Script Path (.bat / .cmd)</span>
                <div class="input-with-btn">
                  <input type="text" bind:value={formLaunchData} placeholder="C:\Games\launch.bat" />
                  <button class="browse-btn" on:click={handleBrowseScript}>Browse</button>
                </div>
              </label>
            </div>
          {/if}

          <!-- Image -->
          <div class="form-row">
            <label>
              <span>{formEntryType === "game" ? "Cover Image" : "Icon Image"}</span>
              <div class="image-picker">
                <button class="browse-btn full-width" on:click={handleBrowseImage}>
                  {formImage ? "Change Image" : "Select Image"}
                </button>
                {#if formImage}
                  <div class="image-preview" class:game={formEntryType === "game"}>
                    <img src={formImage} alt="Preview" />
                  </div>
                {/if}
              </div>
            </label>
          </div>

          <!-- Actions -->
          <div class="form-actions">
            {#if isEditing}
              <div class="button-row">
                <button class="cancel-btn" on:click={cancelEdit}>Cancel</button>
                <button class="save-btn" on:click={handleSaveEntry}>Save Changes</button>
              </div>
            {:else}
              <button class="save-btn" on:click={handleSaveEntry}>Add Entry</button>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    {#if showSettings}
      <div class="modal" on:click|self={() => (showSettings = false)} role="button" tabindex="0">
        <div class="modalCard">
          <div class="modalTitle">Appearance</div>
          <div class="themeGrid">
            <button class="themeChoice" class:active={theme === "tech"} 
              on:click={() => {theme = "tech"; localStorage.setItem("k_scope_theme", "tech");}}>
              <div class="themeName">Tech HUD</div>
            </button>
            <button class="themeChoice" class:active={theme === "paper"} 
              on:click={() => {theme = "paper"; localStorage.setItem("k_scope_theme", "paper");}}>
              <div class="themeName">Paper Archive</div>
            </button>
          </div>
          <div class="modalActions">
            <button class="browse-btn" on:click={() => (showSettings = false)}>Close</button>
          </div>
        </div>
      </div>
    {/if}

  </div>
</main>

<style>
  /* ===== THEME TOKENS ===== */
  main[data-theme="tech"]{
    --panel-bg: rgba(6, 8, 12, 0.97);
    --panel-border: rgba(0, 210, 255, 0.40);
    --panel-glow: rgba(0, 180, 255, 0.12);
    --panel-inset: rgba(0, 210, 255, 0.10);

    --sidebar-bg: rgba(0, 0, 0, 0.50);
    --sidebar-border: rgba(0, 210, 255, 0.25);

    --text: rgba(255,255,255,0.95);
    --muted: rgba(255,255,255,0.55);

    --accent: #00e0ff;
    --accent-soft: rgba(0, 200, 255, 0.12);
    --accent-mid: rgba(0, 200, 255, 0.18);
    --accent-strong: rgba(0, 210, 255, 0.50);

    --card-bg: rgba(255, 255, 255, 0.04);
    --card-border: rgba(255, 255, 255, 0.10);

    --input-bg: rgba(0, 0, 0, 0.45);
    --input-border: rgba(255, 255, 255, 0.18);
    --input-placeholder: rgba(255, 255, 255, 0.35);

    --overlay-a: rgba(0, 0, 0, 0.80);
    --overlay-b: rgba(0, 0, 0, 0.40);

    --accent-grad: linear-gradient(135deg, #00e0ff 0%, #00b4d8 100%);
    --accent-grad-hover: linear-gradient(135deg, #00f0ff 0%, #00d4ff 100%);
    --accent-ink: #000;

    --danger: rgba(255, 60, 60, 0.90);
    --danger-border: rgba(255, 80, 80, 0.60);
    --danger-glow: rgba(255, 60, 60, 0.40);

    --radius: 4px;
  }

  main[data-theme="paper"]{
    --panel-bg: rgba(253, 251, 247, 0.97);
    --panel-border: rgba(212, 197, 176, 0.95);
    --panel-glow: rgba(44, 40, 34, 0.08);
    --panel-inset: rgba(255, 255, 255, 0.70);

    --sidebar-bg: rgba(250, 249, 247, 0.90);
    --sidebar-border: rgba(212, 197, 176, 0.95);

    --text: #2c2822;
    --muted: #6b5d4f;

    --accent: #8b7860;
    --accent-soft: rgba(139, 120, 96, 0.10);
    --accent-mid: rgba(139, 120, 96, 0.16);
    --accent-strong: rgba(139, 120, 96, 0.45);

    --card-bg: rgba(255, 255, 255, 0.70);
    --card-border: rgba(212, 197, 176, 0.95);

    --input-bg: rgba(255, 255, 255, 0.92);
    --input-border: rgba(212, 197, 176, 0.95);
    --input-placeholder: rgba(107, 93, 79, 0.55);

    --overlay-a: rgba(44, 40, 34, 0.68);
    --overlay-b: rgba(44, 40, 34, 0.20);

    --accent-grad: linear-gradient(135deg, #8b7860 0%, #c17817 100%);
    --accent-grad-hover: linear-gradient(135deg, #9a8a78 0%, #d4af37 100%);
    --accent-ink: #fff;

    --danger: rgba(220, 20, 60, 0.90);
    --danger-border: rgba(220, 20, 60, 0.45);
    --danger-glow: rgba(220, 20, 60, 0.25);

    --radius: 8px;
  }

  /* === GLOBAL LAYOUT === */
  main{
    display:flex;
    align-items:center;
    justify-content:center;
    background: transparent;
    font-family: "Segoe UI", -apple-system, sans-serif;
    width: 100vw;
    height: 100vh;
    color: var(--text);
  }

  .panel{
    position: relative;
    display:flex;
    width:95%;
    height:95%;
    max-width:1000px;
    min-width:1000px;
    max-height:600px;
    min-height:600px;
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    border-radius: var(--radius);
    overflow:hidden;
    box-shadow:
      0 0 40px var(--panel-glow),
      0 0 1px var(--panel-border),
      inset 0 1px 0 var(--panel-inset);

    transform: scaleX(0);
    opacity: 0;
    transition: transform 0.2s ease-out, opacity 0.15s ease-out;
  }

  main.open .panel{
    transform: scaleX(1);
    opacity: 1;
  }

  /* === SPINNER === */
  .spinner{
    width:14px;
    height:14px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: var(--text);
    border-radius:50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin{ to{ transform: rotate(360deg); } }

  .play-btn.loading,
  .app-card.loading{
    cursor: wait;
    opacity: 0.8;
    pointer-events:none;
  }

  /* === TABS (LEFT) === */
  .tabs-container{
    width:72px;
    background: var(--sidebar-bg);
    border-right: 1px solid var(--sidebar-border);
    padding: 16px 10px;
    display:flex;
    flex-direction:column;
    gap: 8px;
    flex-shrink:0;
  }

  .tab-spacer{ flex: 1; }

  .tab{
    display:flex;
    flex-direction:column;
    align-items:center;
    gap:6px;
    padding: 14px 8px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius);
    color: var(--muted);
    cursor:pointer;
    transition: all 0.15s ease;
  }

  .tab svg{ width:22px; height:22px; }

  .tab span{
    font-size: 0.65rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .tab:hover{
    background: var(--accent-soft);
    color: var(--text);
    border-color: var(--accent-mid);
  }

  .tab.active{
    background: var(--accent-mid);
    border-color: var(--accent-strong);
    color: var(--accent);
    text-shadow: 0 0 10px rgba(0,0,0,0.12);
  }

  .tab.active svg{
    filter: drop-shadow(0 0 4px rgba(0,0,0,0.18));
  }

  /* === CONTENT (RIGHT) === */
  .content{
    flex:1;
    padding:24px;
    overflow-y:auto;
    scrollbar-width:none;
    -ms-overflow-style:none;
    color: var(--text);
  }
  .content::-webkit-scrollbar{ display:none; }

  /* === GAMES GRID === */
  .games-grid{
    display:grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 20px;
  }

  .game-card{
    position: relative;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: var(--radius);
    overflow:hidden;
    transition: all 0.2s ease;
  }

  .game-card:hover{
    border-color: var(--accent-strong);
    transform: translateY(-4px);
    box-shadow:
      0 8px 25px rgba(0,0,0,0.25),
      0 0 20px rgba(0,0,0,0.08);
  }

  .game-card.selected{
    border-color: var(--accent);
    box-shadow:
      0 0 0 2px var(--accent-soft),
      0 8px 25px rgba(0,0,0,0.25),
      0 0 20px var(--accent-soft);
  }

  /* DELETE BUTTON */
  .delete-btn{
    position:absolute;
    top: 8px;
    right: 8px;
    width:28px;
    height:28px;
    border-radius: var(--radius);
    background: rgba(0,0,0,0.70);
    border: 1px solid rgba(255,255,255,0.20);
    color: rgba(255,255,255,0.80);
    cursor:pointer;
    display:flex;
    align-items:center;
    justify-content:center;
    opacity:0;
    transition: all 0.15s ease;
    z-index:10;
    padding:0;
    margin:0;
  }

  .delete-btn svg{ width:14px; height:14px; }

  .game-card:hover .delete-btn{ opacity:1; }
  .game-card.selected .delete-btn{ opacity:1; }
  .app-wrapper:hover .delete-btn{ opacity:1; }
  .app-wrapper.selected .delete-btn{ opacity:1; }

  .delete-btn:hover{
    background: var(--danger);
    border-color: var(--danger-border);
    color: white;
    box-shadow: 0 0 12px var(--danger-glow);
  }

  /* EDIT BUTTON */
  .edit-btn{
    position:absolute;
    top: 8px;
    right: 42px;
    width:28px;
    height:28px;
    border-radius: var(--radius);
    background: rgba(0,0,0,0.70);
    border: 1px solid rgba(255,255,255,0.20);
    color: rgba(255,255,255,0.80);
    cursor:pointer;
    display:flex;
    align-items:center;
    justify-content:center;
    opacity:0;
    transition: all 0.15s ease;
    z-index:10;
    padding:0;
    margin:0;
  }

  .edit-btn svg{ width:14px; height:14px; }

  .game-card:hover .edit-btn{ opacity:1; }
  .game-card.selected .edit-btn{ opacity:1; }
  .app-wrapper:hover .edit-btn{ opacity:1; }
  .app-wrapper.selected .edit-btn{ opacity:1; }

  .edit-btn:hover{
    background: var(--accent-mid);
    border-color: var(--accent-strong);
    color: var(--accent);
    box-shadow: 0 0 12px var(--accent-soft);
  }

  .game-image{
    width:100%;
    aspect-ratio: 3 / 4;
    background: rgba(0,0,0,0.25);
    overflow:hidden;
  }

  .game-image img{
    width:100%;
    height:100%;
    object-fit: cover;
    transition: transform 0.3s ease;
  }
  .game-card:hover .game-image img{ transform: scale(1.05); }

  .game-info{
    padding: 12px;
    display:flex;
    align-items:center;
    justify-content:space-between;
    gap: 8px;
    background: linear-gradient(to top, var(--overlay-a) 0%, var(--overlay-b) 100%);
  }

  .game-name{
    color: rgba(255,255,255,0.95);
    font-size: 0.82rem;
    font-weight: 600;
    white-space: nowrap;
    overflow:hidden;
    text-overflow: ellipsis;
    text-shadow: 0 1px 3px rgba(0,0,0,0.55);
  }

  main[data-theme="paper"] .game-name{
    color: #fff;
    text-shadow: 0 1px 2px rgba(0,0,0,0.45);
  }

  .play-btn{
    width: 32px;
    height: 32px;
    border-radius: var(--radius);
    background: var(--accent-grad);
    border: none;
    cursor:pointer;
    display:flex;
    align-items:center;
    justify-content:center;
    flex-shrink:0;
    transition: all 0.15s ease;
    padding:0;
    box-shadow: 0 2px 10px rgba(0,0,0,0.18);
  }

  .play-btn:hover{
    background: var(--accent-grad-hover);
    transform: scale(1.08);
    box-shadow: 0 0 16px rgba(0,0,0,0.20);
  }

  .play-btn svg{
    width: 12px;
    height: 12px;
    color: var(--accent-ink);
    margin-left: 2px;
  }

  /* === APPS GRID === */
  .apps-grid{
    display:grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 24px;
  }

  .app-wrapper{ position: relative; }
  .app-delete{ position:absolute; top: -8px; right: -8px; }
  .app-edit{ position:absolute; top: -8px; right: 26px; }

  .app-card{
    width:100%;
    aspect-ratio: 2 / 1;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: var(--radius);
    cursor:pointer;
    display:flex;
    align-items:center;
    justify-content:center;
    padding: 12px 20px;
    transition: all 0.15s ease;
  }

  .app-card:hover{
    background: var(--accent-soft);
    border-color: var(--accent-strong);
    transform: scale(1.02);
    box-shadow: 0 0 15px rgba(0,0,0,0.12);
  }

  .app-wrapper.selected .app-card{
    border-color: var(--accent);
    box-shadow:
      0 0 0 2px var(--accent-soft),
      0 0 15px var(--accent-soft);
  }

  .app-card img{
    height:100%;
    width:auto;
    object-fit: contain;
  }

  /* === ADD ENTRY FORM === */
  .add-entry{ padding: 8px; color: var(--text); }

  .add-entry h2{
    margin: 0 0 24px;
    font-size: 1.15rem;
    font-weight: 800;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    text-shadow: 0 0 12px rgba(0,0,0,0.10);
  }

  .error{
    background: rgba(255, 50, 50, 0.14);
    border: 1px solid rgba(255, 70, 70, 0.35);
    color: #ff7b7b;
    padding: 12px 16px;
    border-radius: var(--radius);
    margin-bottom: 16px;
    font-size: 0.85rem;
    font-weight: 600;
  }

  main[data-theme="paper"] .error{
    color: #dc143c;
    background: rgba(220, 20, 60, 0.10);
    border-color: rgba(220, 20, 60, 0.30);
  }

  .form-section{ margin-bottom: 24px; }

  .section-label{
    display:block;
    font-size: 0.75rem;
    color: var(--muted);
    margin-bottom: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 700;
  }

  .toggle-group{ display:flex; gap: 10px; }
  .toggle-group.four-col .toggle-btn{ flex: 1; padding: 10px 8px; font-size: 0.78rem; }

  .toggle-btn{
    flex:1;
    padding: 12px 18px;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: var(--radius);
    color: var(--muted);
    font-size: 0.82rem;
    font-weight: 600;
    cursor:pointer;
    transition: all 0.15s ease;
  }

  .toggle-btn:hover:not(.disabled){
    background: var(--accent-soft);
    color: var(--text);
    border-color: var(--accent-mid);
  }

  .toggle-btn.active{
    background: var(--accent-mid);
    border-color: var(--accent-strong);
    color: var(--accent);
    font-weight: 800;
    box-shadow: 0 0 12px rgba(0,0,0,0.10);
  }

  .toggle-btn.disabled{
    opacity: 0.5;
    cursor: not-allowed;
  }

  .form-row{ margin-bottom: 18px; }
  .form-row label{ display:block; }

  .form-row label > span{
    display:block;
    font-size: 0.75rem;
    color: var(--muted);
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    font-weight: 700;
  }

  .form-row input{
    width:100%;
    padding: 12px 14px;
    background: var(--input-bg);
    border: 1px solid var(--input-border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 0.88rem;
    outline:none;
    transition: all 0.15s ease;
    box-sizing: border-box;
  }

  .form-row input:focus{
    border-color: var(--accent-strong);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  .form-row input::placeholder{ color: var(--input-placeholder); }

  .input-with-btn{ display:flex; gap: 10px; }
  .input-with-btn input{ flex:1; }

  .browse-btn{
    padding: 12px 18px;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: var(--radius);
    color: var(--text);
    font-size: 0.82rem;
    font-weight: 700;
    cursor:pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .browse-btn:hover{
    background: var(--accent-soft);
    border-color: var(--accent-strong);
  }

  .browse-btn.full-width{ width:100%; }

  .image-picker{ display:flex; flex-direction:column; gap: 14px; }

  .image-preview{
    width:80px;
    height:40px;
    background: rgba(0,0,0,0.10);
    border: 1px solid var(--card-border);
    border-radius: var(--radius);
    overflow:hidden;
  }

  .image-preview.game{ width:90px; height:120px; }

  .image-preview img{ width:100%; height:100%; object-fit: cover; }

  .hint{
    font-size: 0.78rem;
    color: var(--muted);
    margin: 10px 0 0;
    line-height: 1.5;
  }

  .hint strong{
    color: var(--accent);
    font-weight: 700;
  }

  .form-actions{
    margin-top: 28px;
    padding-top: 20px;
    border-top: 1px solid rgba(0,0,0,0.10);
  }

  main[data-theme="tech"] .form-actions{
    border-top-color: rgba(255,255,255,0.10);
  }

  .button-row{
    display: flex;
    gap: 12px;
  }

  .save-btn{
    flex: 1;
    padding: 16px 24px;
    background: var(--accent-grad);
    border: none;
    border-radius: var(--radius);
    color: var(--accent-ink);
    font-size: 0.92rem;
    font-weight: 900;
    cursor:pointer;
    transition: all 0.15s ease;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    box-shadow: 0 4px 16px rgba(0,0,0,0.18);
  }

  .save-btn:hover{
    background: var(--accent-grad-hover);
    box-shadow: 0 8px 26px rgba(0,0,0,0.22);
    transform: translateY(-1px);
  }

  .cancel-btn{
    padding: 16px 24px;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: var(--radius);
    color: var(--muted);
    font-size: 0.92rem;
    font-weight: 700;
    cursor:pointer;
    transition: all 0.15s ease;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .cancel-btn:hover{
    background: var(--accent-soft);
    border-color: var(--accent-mid);
    color: var(--text);
  }

  /* ===== MODAL ===== */
  .modal{
    position:absolute;
    inset:0;
    background: rgba(0,0,0,0.35);
    display:flex;
    align-items:center;
    justify-content:center;
    z-index: 999;
  }

  .modalCard{
    width: 420px;
    max-width: calc(100% - 24px);
    background: var(--panel-bg);
    border: 1px solid var(--panel-border);
    box-shadow: 0 18px 60px rgba(0,0,0,0.30);
    padding: 18px;
    border-radius: var(--radius);
    color: var(--text);
  }

  .modalTitle{
    font-weight: 900;
    letter-spacing: 0.5px;
  }

  .modalSub{
    margin-top: 6px;
    font-size: 0.88rem;
    color: var(--muted);
  }

  .themeGrid{
    margin-top: 14px;
    display:grid;
    grid-template-columns: 1fr;
    gap: 10px;
  }

  .themeChoice{
    text-align:left;
    padding: 12px 12px;
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: var(--radius);
    cursor:pointer;
    color: var(--text);
  }

  .themeChoice:hover{
    border-color: var(--accent-strong);
    background: var(--accent-soft);
  }

  .themeChoice.active{
    border-color: var(--accent-strong);
    box-shadow: 0 0 0 2px var(--accent-soft);
  }

  .themeName{ font-weight: 900; }
  .themeDesc{ font-size: 0.85rem; color: var(--muted); margin-top: 2px; }

  .modalActions{
    margin-top: 14px;
    display:flex;
    justify-content:flex-end;
  }
</style>