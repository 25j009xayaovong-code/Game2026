import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  code: text("code").primaryKey(),
  scrap: integer("scrap").notNull().default(0),
  cells: integer("cells").notNull().default(0),
  won: integer("won", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const roomPlayers = sqliteTable("room_players", {
  id: text("id").primaryKey(),
  roomCode: text("room_code").notNull().references(() => rooms.code, { onDelete: "cascade" }),
  token: text("token").notNull(),
  name: text("name").notNull(),
  appearance: text("appearance").notNull(),
  x: integer("x").notNull().default(0),
  y: integer("y").notNull().default(0),
  z: integer("z").notNull().default(9000),
  rotation: integer("rotation").notNull().default(0),
  pose: text("pose").notNull().default("idle"),
  anim: text("anim").notNull().default(""),
  rock: text("rock").notNull().default(""),
  updatedAt: integer("updated_at").notNull(),
});

export const roomPickups = sqliteTable("room_pickups", {
  roomCode: text("room_code").notNull().references(() => rooms.code, { onDelete: "cascade" }),
  pickupId: integer("pickup_id").notNull(),
  type: text("type").notNull(),
  collectedBy: text("collected_by").notNull(),
  collectedAt: integer("collected_at").notNull(),
}, table => [primaryKey({ columns: [table.roomCode, table.pickupId] })]);

export const roomSignals = sqliteTable("room_signals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roomCode: text("room_code").notNull().references(() => rooms.code, { onDelete: "cascade" }),
  fromId: text("from_id").notNull(),
  toId: text("to_id").notNull(),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const roomMessages = sqliteTable("room_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  roomCode: text("room_code").notNull().references(() => rooms.code, { onDelete: "cascade" }),
  playerId: text("player_id").notNull(),
  name: text("name").notNull(),
  message: text("message").notNull(),
  createdAt: integer("created_at").notNull(),
});
