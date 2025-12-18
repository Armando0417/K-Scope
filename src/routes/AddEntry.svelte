<script lang="ts">
  import { open as openDialog } from "@tauri-apps/plugin-dialog";
  import { convertFileSrc } from "@tauri-apps/api/core";
  import type { LaunchType, LaunchConfig, KScopeConfig, Game, App } from "./types";
  import { addGame, addApp } from "./configStore";
  import {
    createExeLaunch,
    createSteamLaunch,
    createBatLaunch,
    createUrlLaunch,
  } from "./launcher";

  // Props
  interface Props {
    config: KScopeConfig;
    onConfigUpdate: (config: KScopeConfig) => void;
    onPlaySound: (sound: string) => void;
  }

  let { config, onConfigUpdate, onPlaySound }: Props = $props();

  // Form state
  let entryType = $state<"game" | "app">("game");
  let launchType = $state<LaunchType>("exe");
  let name = $state("");
  let target = $state("");        // exe path, steam id, bat path, or url
  let args = $state("");          // space-separated args for exe
  let workingDir = $state("");    // working directory for exe
  let imagePath = $state("");     // cover image or icon path
  let imagePreview = $state("");  // converted file:// URL for preview

  let isSaving = $state(false);
  let errorMessage = $state("");

  // Computed: is form valid?
  let isValid = $derived(
    name.trim() !== "" && target.trim() !== "" && imagePath.trim() !== ""
  );

  // Reset form
  function resetForm() {
    name = "";
    target = "";
    args = "";
    workingDir = "";
    imagePath = "";
    imagePreview = "";
    errorMessage = "";
  }

  // Browse for executable/script
  async function browseTarget() {
    onPlaySound("hover");
    
    const filters =
      launchType === "exe"
        ? [{ name: "Executable", extensions: ["exe"] }]
        : launchType === "bat"
          ? [{ name: "Batch Script", extensions: ["bat", "cmd"] }]
          : undefined;

    const selected = await openDialog({
      title: `Select ${launchType === "exe" ? "Executable" : "Script"}`,
      filters,
      multiple: false,
      directory: false,
    });

    if (selected) {
      target = selected as string;
      
      // Auto-fill name from filename if empty
      if (!name) {
        const filename = target.split(/[/\\]/).pop() || "";
        name = filename.replace(/\.(exe|bat|cmd)$/i, "");
      }

      // Auto-fill working directory if empty
      if (!workingDir && launchType === "exe") {
        workingDir = target.substring(0, target.lastIndexOf(/[/\\]/.test(target) ? (target.includes("/") ? "/" : "\\") : "\\"));
      }
    }
  }

  // Browse for working directory
  async function browseWorkingDir() {
    onPlaySound("hover");
    
    const selected = await openDialog({
      title: "Select Working Directory",
      multiple: false,
      directory: true,
    });

    if (selected) {
      workingDir = selected as string;
    }
  }

  // Browse for image
  async function browseImage() {
    onPlaySound("hover");
    
    const selected = await openDialog({
      title: "Select Image",
      filters: [
        { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
      ],
      multiple: false,
      directory: false,
    });

    if (selected) {
      imagePath = selected as string;
      // Convert to file:// URL for preview
      imagePreview = convertFileSrc(imagePath);
    }
  }

  // Build LaunchConfig from form state
  function buildLaunchConfig(): LaunchConfig {
    switch (launchType) {
      case "exe":
        return createExeLaunch(
          target,
          args.trim() ? args.trim().split(/\s+/) : undefined,
          workingDir || undefined
        );
      case "steam":
        return createSteamLaunch(target);
      case "bat":
        return createBatLaunch(target);
      case "url":
        return createUrlLaunch(target);
    }
  }

  // Save entry
  async function save() {
    if (!isValid || isSaving) return;

    onPlaySound("launch");
    isSaving = true;
    errorMessage = "";

    try {
      const launchConfig = buildLaunchConfig();

      let newConfig: KScopeConfig;

      if (entryType === "game") {
        const game: Omit<Game, "id" | "addedAt"> = {
          name: name.trim(),
          image: imagePath,
          launch: launchConfig,
        };
        newConfig = await addGame(config, game);
      } else {
        const app: Omit<App, "id" | "addedAt"> = {
          name: name.trim(),
          icon: imagePath,
          launch: launchConfig,
        };
        newConfig = await addApp(config, app);
      }

      onConfigUpdate(newConfig);
      resetForm();
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : "Failed to save";
    } finally {
      isSaving = false;
    }
  }
</script>

<div class="add-entry">
  <h2>Add New Entry</h2>

  {#if errorMessage}
    <div class="error">{errorMessage}</div>
  {/if}

  <div class="form-section">
    <label class="section-label">Entry Type</label>
    <div class="toggle-group">
      <button
        class="toggle-btn"
        class:active={entryType === "game"}
        onclick={() => { entryType = "game"; onPlaySound("switch"); }}
      >
        Game
      </button>
      <button
        class="toggle-btn"
        class:active={entryType === "app"}
        onclick={() => { entryType = "app"; onPlaySound("switch"); }}
      >
        App
      </button>
    </div>
  </div>

  <div class="form-section">
    <label class="section-label">Launch Type</label>
    <div class="toggle-group">
      <button
        class="toggle-btn"
        class:active={launchType === "exe"}
        onclick={() => { launchType = "exe"; target = ""; onPlaySound("switch"); }}
      >
        Executable
      </button>
      <button
        class="toggle-btn"
        class:active={launchType === "steam"}
        onclick={() => { launchType = "steam"; target = ""; onPlaySound("switch"); }}
      >
        Steam
      </button>
      <button
        class="toggle-btn"
        class:active={launchType === "bat"}
        onclick={() => { launchType = "bat"; target = ""; onPlaySound("switch"); }}
      >
        Batch
      </button>
      <button
        class="toggle-btn"
        class:active={launchType === "url"}
        onclick={() => { launchType = "url"; target = ""; onPlaySound("switch"); }}
      >
        URL
      </button>
    </div>
  </div>

  <div class="form-row">
    <label>
      <span>Name</span>
      <input
        type="text"
        bind:value={name}
        placeholder="Display name"
        onfocus={() => onPlaySound("hover")}
      />
    </label>
  </div>

  <div class="form-row">
    <label>
      <span>
        {#if launchType === "exe"}Executable Path
        {:else if launchType === "steam"}Steam App ID
        {:else if launchType === "bat"}Script Path
        {:else}URL
        {/if}
      </span>
      <div class="input-with-btn">
        <input
          type="text"
          bind:value={target}
          placeholder={launchType === "steam"
            ? "e.g. 814380"
            : launchType === "url"
              ? "e.g. https://..."
              : "Path to file..."}
          onfocus={() => onPlaySound("hover")}
        />
        {#if launchType === "exe" || launchType === "bat"}
          <button class="browse-btn" onclick={browseTarget}>Browse</button>
        {/if}
      </div>
    </label>
  </div>

  {#if launchType === "exe"}
    <div class="form-row">
      <label>
        <span>Arguments (optional)</span>
        <input
          type="text"
          bind:value={args}
          placeholder="e.g. --fullscreen --dx12"
          onfocus={() => onPlaySound("hover")}
        />
      </label>
    </div>

    <div class="form-row">
      <label>
        <span>Working Directory (optional)</span>
        <div class="input-with-btn">
          <input
            type="text"
            bind:value={workingDir}
            placeholder="Leave empty for exe directory"
            onfocus={() => onPlaySound("hover")}
          />
          <button class="browse-btn" onclick={browseWorkingDir}>Browse</button>
        </div>
      </label>
    </div>
  {/if}

  <div class="form-row">
    <label>
      <span>{entryType === "game" ? "Cover Image" : "Icon"}</span>
      <div class="image-picker">
        <div class="input-with-btn">
          <input
            type="text"
            bind:value={imagePath}
            placeholder="Path to image..."
            onfocus={() => onPlaySound("hover")}
          />
          <button class="browse-btn" onclick={browseImage}>Browse</button>
        </div>
        {#if imagePreview}
          <div class="image-preview" class:game={entryType === "game"}>
            <img src={imagePreview} alt="Preview" />
          </div>
        {/if}
      </div>
    </label>
  </div>

  <div class="form-actions">
    <button
      class="save-btn"
      class:disabled={!isValid}
      class:loading={isSaving}
      onclick={save}
    >
      {#if isSaving}
        <div class="spinner"></div>
      {:else}
        Add {entryType === "game" ? "Game" : "App"}
      {/if}
    </button>
  </div>
</div>

<style>
  .add-entry {
    padding: 8px;
    color: white;
  }

  h2 {
    margin: 0 0 20px;
    font-size: 1.1rem;
    font-weight: 600;
    color: #00d4ff;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .error {
    background: rgba(255, 50, 50, 0.2);
    border: 1px solid rgba(255, 50, 50, 0.4);
    color: #ff6b6b;
    padding: 10px 14px;
    border-radius: 4px;
    margin-bottom: 16px;
    font-size: 0.85rem;
  }

  .form-section {
    margin-bottom: 20px;
  }

  .section-label {
    display: block;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .toggle-group {
    display: flex;
    gap: 8px;
  }

  .toggle-btn {
    flex: 1;
    padding: 10px 16px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .toggle-btn:hover {
    background: rgba(0, 180, 255, 0.1);
    color: rgba(255, 255, 255, 0.8);
  }

  .toggle-btn.active {
    background: rgba(0, 180, 255, 0.2);
    border-color: rgba(0, 180, 255, 0.4);
    color: #00d4ff;
  }

  .form-row {
    margin-bottom: 16px;
  }

  .form-row label {
    display: block;
  }

  .form-row label > span {
    display: block;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
    margin-bottom: 6px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .form-row input {
    width: 100%;
    padding: 10px 12px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    color: white;
    font-size: 0.85rem;
    outline: none;
    transition: border-color 0.15s ease;
    box-sizing: border-box;
  }

  .form-row input:focus {
    border-color: rgba(0, 180, 255, 0.4);
  }

  .form-row input::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }

  .input-with-btn {
    display: flex;
    gap: 8px;
  }

  .input-with-btn input {
    flex: 1;
  }

  .browse-btn {
    padding: 10px 16px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    color: rgba(255, 255, 255, 0.7);
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .browse-btn:hover {
    background: rgba(0, 180, 255, 0.15);
    border-color: rgba(0, 180, 255, 0.3);
    color: white;
  }

  .image-picker {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .image-preview {
    width: 80px;
    height: 40px;
    background: rgba(0, 0, 0, 0.4);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 4px;
    overflow: hidden;
  }

  .image-preview.game {
    width: 75px;
    height: 100px;
  }

  .image-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .form-actions {
    margin-top: 24px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .save-btn {
    width: 100%;
    padding: 14px 24px;
    background: #00d4ff;
    border: none;
    border-radius: 4px;
    color: #000;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.15s ease;
  }

  .save-btn:hover:not(.disabled):not(.loading) {
    background: #00e5ff;
    box-shadow: 0 0 20px rgba(0, 200, 255, 0.4);
  }

  .save-btn.disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .save-btn.loading {
    cursor: wait;
    opacity: 0.8;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(0, 0, 0, 0.3);
    border-top-color: black;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
