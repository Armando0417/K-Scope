// =============================================================================
// K-Scope Database Module
// SQLite wrapper with flexible launch type support
// =============================================================================

import Database from "@tauri-apps/plugin-sql";

// Launch types supported by the app
export type LaunchType = "steam" | "exe" | "url" | "bat";

export interface Entry {
  id: number;
  type: "game" | "app";
  name: string;
  launch_type: LaunchType;
  launch_data: string;      // Steam ID, exe path, URL, or bat path
  launch_args: string;      // Optional args (mainly for exe)
  image_data: string;       // base64 encoded image
  deprecated: boolean;
  created_at: number;
}

let db: Database | null = null;

/**
 * Initialize the database connection and create/migrate tables
 */
export async function initDatabase(): Promise<void> {
  db = await Database.load("sqlite:kscope.db");

  // Check if we need to migrate from old schema
  const tableInfo = await db.select<{ name: string }[]>(
    "PRAGMA table_info(entries)"
  );
  
  const columns = tableInfo.map(col => col.name);
  const hasOldSchema = columns.includes("bat_path") && !columns.includes("launch_type");
  const tableExists = columns.length > 0;

  if (hasOldSchema) {
    // Migrate from old schema
    console.log("Migrating database to new schema...");
    
    // 1. Rename old table
    await db.execute("ALTER TABLE entries RENAME TO entries_old");
    
    // 2. Create new table
    await db.execute(`
      CREATE TABLE entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('game', 'app')),
        name TEXT NOT NULL,
        launch_type TEXT NOT NULL DEFAULT 'bat' CHECK(launch_type IN ('steam', 'exe', 'url', 'bat')),
        launch_data TEXT NOT NULL,
        launch_args TEXT DEFAULT '',
        image_data TEXT NOT NULL,
        deprecated INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);
    
    // 3. Copy data, converting bat_path to launch_data with type 'bat'
    await db.execute(`
      INSERT INTO entries (id, type, name, launch_type, launch_data, launch_args, image_data, deprecated, created_at)
      SELECT id, type, name, 'bat', bat_path, '', image_data, deprecated, created_at
      FROM entries_old
    `);
    
    // 4. Drop old table
    await db.execute("DROP TABLE entries_old");
    
    console.log("Migration complete!");
    
  } else if (!tableExists) {
    // Fresh install - create new schema
    await db.execute(`
      CREATE TABLE entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL CHECK(type IN ('game', 'app')),
        name TEXT NOT NULL,
        launch_type TEXT NOT NULL DEFAULT 'bat' CHECK(launch_type IN ('steam', 'exe', 'url', 'bat')),
        launch_data TEXT NOT NULL,
        launch_args TEXT DEFAULT '',
        image_data TEXT NOT NULL,
        deprecated INTEGER DEFAULT 0,
        created_at INTEGER DEFAULT (unixepoch())
      )
    `);
  }

  console.log("Database initialized");
}

/**
 * Get all entries of a specific type
 */
export async function getEntries(type: "game" | "app"): Promise<Entry[]> {
  if (!db) throw new Error("Database not initialized");

  const rows = await db.select<Entry[]>(
    "SELECT * FROM entries WHERE type = ? ORDER BY created_at DESC",
    [type]
  );

  return rows.map((row) => ({
    ...row,
    deprecated: Boolean(row.deprecated),
  }));
}

/**
 * Get all games
 */
export async function getGames(): Promise<Entry[]> {
  return getEntries("game");
}

/**
 * Get all apps
 */
export async function getApps(): Promise<Entry[]> {
  return getEntries("app");
}

/**
 * Add a new entry
 */
export async function addEntry(
  type: "game" | "app",
  name: string,
  launchType: LaunchType,
  launchData: string,
  launchArgs: string,
  imageData: string
): Promise<Entry> {
  if (!db) throw new Error("Database not initialized");

  const result = await db.execute(
    "INSERT INTO entries (type, name, launch_type, launch_data, launch_args, image_data) VALUES (?, ?, ?, ?, ?, ?)",
    [type, name, launchType, launchData, launchArgs, imageData]
  );

  const entries = await db.select<Entry[]>(
    "SELECT * FROM entries WHERE id = ?",
    [result.lastInsertId]
  );

  return {
    ...entries[0],
    deprecated: Boolean(entries[0].deprecated),
  };
}

/**
 * Delete an entry by ID
 */
export async function deleteEntry(id: number): Promise<void> {
  if (!db) throw new Error("Database not initialized");
  await db.execute("DELETE FROM entries WHERE id = ?", [id]);
}

/**
 * Toggle deprecated status
 */
export async function toggleDeprecated(id: number): Promise<void> {
  if (!db) throw new Error("Database not initialized");
  await db.execute(
    "UPDATE entries SET deprecated = NOT deprecated WHERE id = ?",
    [id]
  );
}

/**
 * Update an entry
 */
export async function updateEntry(
  id: number,
  name: string,
  launchType: LaunchType,
  launchData: string,
  launchArgs: string,
  imageData: string
): Promise<void> {
  if (!db) throw new Error("Database not initialized");
  await db.execute(
    "UPDATE entries SET name = ?, launch_type = ?, launch_data = ?, launch_args = ?, image_data = ? WHERE id = ?",
    [name, launchType, launchData, launchArgs, imageData, id]
  );
}