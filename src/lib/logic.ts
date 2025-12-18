import { Command } from "@tauri-apps/plugin-shell";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { Entry, LaunchType } from "../routes/db";

// --- SOUND MANAGER ---
/**
 * A list of the SFX Available to play.
 */
const sounds: Record<string, HTMLAudioElement> = {
  open: new Audio("/sounds/deck_ui_side_menu_fly_in.wav"),
  close: new Audio("/sounds/deck_ui_side_menu_fly_out.wav"),
  switch: new Audio("/sounds/deck_ui_tab_transition_01.wav"),
  hover: new Audio("/sounds/deck_ui_navigation.wav"),
  launch: new Audio("/sounds/deck_ui_default_activation.wav"),
};

// === Modify Volume Here! ===
Object.values(sounds).forEach((s) => (s.volume = 0.4));
sounds.hover.volume = 0.2;


/**
 * Generic SFX Player.
 */
export function playSound( name: "open" | "close" | "switch" | "hover" | "launch" ) {
  const sound = sounds[name];
  if (sound) {
    sound.currentTime = 0;
    sound.play().catch(() => {}); 
  }
}

/**
 * Toggle the window visibility
 */
export async function toggleWindow(isOpen: boolean) {
  const appWindow = getCurrentWindow();

  if (isOpen) {
    playSound("close");
    await appWindow.hide();
    return false;
  } 
  else {
    await appWindow.show();
    await appWindow.setFocus();
    playSound("open");
    return true;
  }
}

// --- LAUNCH SYSTEM ---

/**
 * Launch an entry based on its launch_type.
 * Handles Steam, Exe, URL, and Batch files.
 */
export async function launchEntry(entry: Entry): Promise<boolean> {
  try {
    playSound("launch");

    switch (entry.launch_type) {
      case "steam":
        await launchSteam(entry.launch_data);
        break;
      
      case "exe":
        await launchExe(entry.launch_data, entry.launch_args);
        break;
      
      case "url":
        await launchUrl(entry.launch_data);
        break;
      
      case "bat":
        await launchBat(entry.launch_data);
        break;
      
      default:
        console.error("Unknown launch type:", entry.launch_type);
        return false;
    }

    // Close window after successful launch
    setTimeout(async () => {
      await toggleWindow(true);
    }, 200);

    return true;
  } 
  catch (error) {
    console.error("Failed to launch:", error);
    return false;
  }
}

/**
 * Launch a Steam game by App ID
 * Example: launchSteam("1245620") opens Monster Hunter Rise
 */
async function launchSteam(appId: string): Promise<void> {
  const command = Command.create("cmd", [
    "/c", 
    "start", 
    `steam://rungameid/${appId}`
  ]);
  await command.execute();
}

/**
 * Launch an executable with optional arguments
 */
async function launchExe(exePath: string, args: string): Promise<void> {
  // Parse args - split by spaces but respect quoted strings
  const argList = args.trim() ? parseArgs(args) : [];
  
  // Use cmd /c start to launch detached
  const command = Command.create("cmd", [
    "/c",
    "start",
    "",  // Empty title (required for start when path has spaces)
    exePath,
    ...argList
  ]);
  await command.execute();
}

/**
 * Launch a URL in default browser
 */
async function launchUrl(url: string): Promise<void> {
  const command = Command.create("cmd", [
    "/c",
    "start",
    url
  ]);
  await command.execute();
}

/**
 * Launch a batch file (legacy support)
 */
async function launchBat(batPath: string): Promise<void> {
  const command = Command.create("cmd", ["/c", batPath]);
  await command.execute();
}

/**
 * Simple argument parser - splits by space but keeps quoted strings together
 * Example: '--arg1 "path with spaces" --arg2' => ['--arg1', 'path with spaces', '--arg2']
 */
function parseArgs(argsString: string): string[] {
  const args: string[] = [];
  let current = "";
  let inQuotes = false;
  
  for (const char of argsString) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === " " && !inQuotes) {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }
  
  if (current) {
    args.push(current);
  }
  
  return args;
}

// --- FILE HELPERS ---

/**
 * Opens file dialog to select an executable
 */
export async function pickExeFile(): Promise<string | null> {
  playSound("hover");
  const selected = await openDialog({
    title: "Select Executable",
    filters: [{ name: "Executable", extensions: ["exe"] }],
    multiple: false,
    directory: false,
  });

  if (typeof selected === "string") {
    return selected;
  }
  return null;
}

/**
 * Opens file dialog to select a batch script
 */
export async function pickScriptFile(): Promise<string | null> {
  playSound("hover");
  const selected = await openDialog({
    title: "Select Launch Script",
    filters: [{ name: "Batch Files", extensions: ["bat", "cmd"] }],
    multiple: false,
    directory: false,
  });

  if (typeof selected === "string") {
    return selected;
  }
  return null;
}

/**
 * Opens file dialog to select an image, converts to Base64
 */
export async function pickImageFile(): Promise<string | null> {
  playSound("hover");

  const selected = await openDialog({
    title: "Select Image",
    filters: [
      { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
    ],
    multiple: false,
    directory: false,
  });

  if (typeof selected !== "string") {
    return null;
  }

  try {
    const bytes = await readFile(selected);

    let binary = "";
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    const base64 = btoa(binary);

    const ext = selected.split(".").pop()?.toLowerCase() || "png";
    let mimeType = "image/png";
    if (ext === "jpg" || ext === "jpeg") mimeType = "image/jpeg";
    if (ext === "webp") mimeType = "image/webp";
    if (ext === "gif") mimeType = "image/gif";

    return `data:${mimeType};base64,${base64}`;
  } catch (error) {
    console.error("Image read failed:", error);
    return null;
  }
}

/**
 * Extract filename from path (without extension)
 */
export function getFilenameFromPath(path: string): string {
  const parts = path.split(/[/\\]/);
  const filename = parts[parts.length - 1] || "";
  return filename.replace(/\.(exe|bat|cmd)$/i, "");
}

/**
 * Get a human-readable label for launch type
 */
export function getLaunchTypeLabel(type: LaunchType): string {
  const labels: Record<LaunchType, string> = {
    steam: "Steam",
    exe: "Executable",
    url: "URL",
    bat: "Batch Script"
  };
  return labels[type];
}