import { env } from "cloudflare:workers";

let ready: Promise<void> | null = null;

export function ensureMultiplayerSchema() {
  if (!ready) ready = (async () => {
    const d1 = env.DB;
    await d1.batch([
      d1.prepare("CREATE TABLE IF NOT EXISTS rooms (code TEXT PRIMARY KEY NOT NULL, scrap INTEGER NOT NULL DEFAULT 0, cells INTEGER NOT NULL DEFAULT 0, won INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)"),
      d1.prepare("CREATE TABLE IF NOT EXISTS room_players (id TEXT PRIMARY KEY NOT NULL, room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE, token TEXT NOT NULL, name TEXT NOT NULL, appearance TEXT NOT NULL, x INTEGER NOT NULL DEFAULT 0, y INTEGER NOT NULL DEFAULT 0, z INTEGER NOT NULL DEFAULT 9000, rotation INTEGER NOT NULL DEFAULT 0, pose TEXT NOT NULL DEFAULT 'idle', anim TEXT NOT NULL DEFAULT '', rock TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL)"),
      d1.prepare("CREATE TABLE IF NOT EXISTS room_pickups (room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE, pickup_id INTEGER NOT NULL, type TEXT NOT NULL, collected_by TEXT NOT NULL, collected_at INTEGER NOT NULL, PRIMARY KEY(room_code, pickup_id))"),
      d1.prepare("CREATE TABLE IF NOT EXISTS room_signals (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE, from_id TEXT NOT NULL, to_id TEXT NOT NULL, payload TEXT NOT NULL, created_at INTEGER NOT NULL)"),
      d1.prepare("CREATE TABLE IF NOT EXISTS room_messages (id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, room_code TEXT NOT NULL REFERENCES rooms(code) ON DELETE CASCADE, player_id TEXT NOT NULL, name TEXT NOT NULL, message TEXT NOT NULL, created_at INTEGER NOT NULL)"),
      d1.prepare("CREATE INDEX IF NOT EXISTS room_players_active_idx ON room_players(room_code, updated_at)"),
      d1.prepare("CREATE INDEX IF NOT EXISTS room_signals_target_idx ON room_signals(room_code, to_id, created_at)"),
      d1.prepare("CREATE INDEX IF NOT EXISTS room_messages_recent_idx ON room_messages(room_code, created_at)"),
    ]);
  })();
  return ready;
}
