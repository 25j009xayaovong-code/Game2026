import { and, desc, eq, gt } from "drizzle-orm";
import { getDb } from "../../../db";
import { ensureMultiplayerSchema } from "../../../db/multiplayer";
import { roomMessages, roomPickups, roomPlayers, roomSignals, rooms } from "../../../db/schema";

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const cleanName = (value: unknown) => String(value ?? "นักสำรวจ").trim().slice(0, 18) || "นักสำรวจ";
const cleanCode = (value: unknown) => String(value ?? "").trim().toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), n => CODE_CHARS[n % CODE_CHARS.length]).join("");
const jsonAppearance = (value: unknown) => JSON.stringify(value && typeof value === "object" ? value : {});
const jsonRock = (value: unknown) => value && typeof value === "object" ? JSON.stringify(value).slice(0, 600) : "";
const jsonAnim = (value: unknown) => Array.isArray(value) ? JSON.stringify(value.slice(0,5).map(n=>Math.max(-2,Math.min(2,Number(n)||0)))) : "";

async function roomState(code: string, playerId?: string, compact = false) {
  const db = getDb(), now = Date.now();
  const [room] = await db.select().from(rooms).where(eq(rooms.code, code)).limit(1);
  if (!room) return null;
  const players = await db.select({ id: roomPlayers.id, name: roomPlayers.name, appearance: roomPlayers.appearance, x: roomPlayers.x, y: roomPlayers.y, z: roomPlayers.z, rotation: roomPlayers.rotation, pose: roomPlayers.pose, anim:roomPlayers.anim, rock:roomPlayers.rock, updatedAt: roomPlayers.updatedAt })
    .from(roomPlayers).where(and(eq(roomPlayers.roomCode, code), gt(roomPlayers.updatedAt, now - 20_000))).limit(4);
  const collected = compact ? [] : await db.select({ id: roomPickups.pickupId }).from(roomPickups).where(eq(roomPickups.roomCode, code));
  const signals=playerId?await db.select({id:roomSignals.id,fromId:roomSignals.fromId,payload:roomSignals.payload}).from(roomSignals).where(and(eq(roomSignals.roomCode,code),eq(roomSignals.toId,playerId),gt(roomSignals.createdAt,now-30_000))).limit(60):[];
  const messages=compact?undefined:(await db.select({id:roomMessages.id,playerId:roomMessages.playerId,name:roomMessages.name,message:roomMessages.message,createdAt:roomMessages.createdAt}).from(roomMessages).where(eq(roomMessages.roomCode,code)).orderBy(desc(roomMessages.createdAt)).limit(30)).reverse();
  return { room: { code, scrap: room.scrap, cells: room.cells, won: room.won, time:((now-room.createdAt)/230_000+.08)%1, serverNow:now }, players: players.filter(p => p.id !== playerId).map(p => ({ ...p, appearance: JSON.parse(p.appearance), anim:p.anim?JSON.parse(p.anim):null, rock:p.rock?JSON.parse(p.rock):null })), collected: collected.map(p => p.id),signals:signals.map(s=>({...s,payload:JSON.parse(s.payload)})),...(messages?{messages}:{}) };
}

export async function GET(request: Request) {
  try {
    await ensureMultiplayerSchema();
    const url = new URL(request.url), code = cleanCode(url.searchParams.get("code")), playerId = String(url.searchParams.get("playerId") ?? "");
    const state = await roomState(code, playerId);
    return state ? Response.json(state) : Response.json({ error: "ไม่พบห้องนี้" }, { status: 404 });
  } catch { return Response.json({ error: "ระบบห้องออนไลน์ยังไม่พร้อม" }, { status: 500 }); }
}

export async function POST(request: Request) {
  try {
    await ensureMultiplayerSchema();
    const body = await request.json() as Record<string, unknown>, action = String(body.action ?? ""), db = getDb(), now = Date.now();
    if (action === "create") {
      let code = randomCode();
      for (let i=0;i<4;i++) { const found=await db.select({code:rooms.code}).from(rooms).where(eq(rooms.code,code)).limit(1); if(!found.length)break; code=randomCode(); }
      const id=crypto.randomUUID(),token=crypto.randomUUID();
      await db.insert(rooms).values({code,createdAt:now,updatedAt:now});
      await db.insert(roomPlayers).values({id,roomCode:code,token,name:cleanName(body.name),appearance:jsonAppearance(body.appearance),updatedAt:now});
      return Response.json({ session:{code,playerId:id,token}, state:await roomState(code,id) },{status:201});
    }
    if (action === "join") {
      const code=cleanCode(body.code),[room]=await db.select().from(rooms).where(eq(rooms.code,code)).limit(1);
      if(!room)return Response.json({error:"ไม่พบรหัสห้องนี้"},{status:404});
      const active=await db.select({id:roomPlayers.id}).from(roomPlayers).where(and(eq(roomPlayers.roomCode,code),gt(roomPlayers.updatedAt,now-20_000)));
      if(active.length>=4)return Response.json({error:"ห้องนี้มีผู้เล่นครบ 4 คนแล้ว"},{status:409});
      const id=crypto.randomUUID(),token=crypto.randomUUID();
      await db.insert(roomPlayers).values({id,roomCode:code,token,name:cleanName(body.name),appearance:jsonAppearance(body.appearance),updatedAt:now});
      return Response.json({session:{code,playerId:id,token},state:await roomState(code,id)},{status:201});
    }
    const code=cleanCode(body.code),playerId=String(body.playerId??""),token=String(body.token??"");
    const [player]=await db.select().from(roomPlayers).where(and(eq(roomPlayers.id,playerId),eq(roomPlayers.roomCode,code),eq(roomPlayers.token,token))).limit(1);
    if(!player)return Response.json({error:"เซสชันผู้เล่นหมดอายุ"},{status:401});
    if(action==="sync"){
      const n=(v:unknown,min:number,max:number)=>Math.round(Math.max(min,Math.min(max,Number(v)||0))*100);
      const previousAppearance=JSON.parse(player.appearance||"{}") as Record<string,unknown>,nextAppearance=body.appearance&&typeof body.appearance==="object"?body.appearance as Record<string,unknown>:{};if(!nextAppearance._npcs&&previousAppearance._npcs)nextAppearance._npcs=previousAppearance._npcs;
      await db.update(roomPlayers).set({x:n(body.x,-305,665),y:n(body.y,-65,120),z:n(body.z,-305,305),rotation:n(body.rotation,-7,7),pose:String(body.pose??"idle").slice(0,20),anim:jsonAnim(body.anim),appearance:jsonAppearance(nextAppearance),rock:jsonRock(body.rock),updatedAt:now}).where(eq(roomPlayers.id,playerId));
      await db.update(rooms).set({updatedAt:now}).where(eq(rooms.code,code));
      return Response.json(await roomState(code,playerId,!body.full));
    }
    if(action==="collect"){
      const pickupId=Math.max(0,Math.min(39,Number(body.pickupId)|0)),type=body.type==="cell"?"cell":"scrap";
      const inserted=await db.insert(roomPickups).values({roomCode:code,pickupId,type,collectedBy:playerId,collectedAt:now}).onConflictDoNothing().returning({id:roomPickups.pickupId});
      if(inserted.length){const [room]=await db.select().from(rooms).where(eq(rooms.code,code)).limit(1);await db.update(rooms).set(type==="cell"?{cells:Math.min(3,(room?.cells??0)+1),updatedAt:now}:{scrap:Math.min(6,(room?.scrap??0)+1),updatedAt:now}).where(eq(rooms.code,code));}
      return Response.json(await roomState(code,playerId));
    }
    if(action==="repair"){
      const [room]=await db.select().from(rooms).where(eq(rooms.code,code)).limit(1);if(room&&room.scrap>=6&&room.cells>=3)await db.update(rooms).set({won:true,updatedAt:now}).where(eq(rooms.code,code));
      return Response.json(await roomState(code,playerId));
    }
    if(action==="signal"){
      const toId=String(body.to??""),payload=body.payload&&typeof body.payload==="object"?JSON.stringify(body.payload).slice(0,5000):"";
      const [target]=await db.select({id:roomPlayers.id}).from(roomPlayers).where(and(eq(roomPlayers.id,toId),eq(roomPlayers.roomCode,code),gt(roomPlayers.updatedAt,now-20_000))).limit(1);
      if(!target||!payload)return Response.json({error:"ปลายทางเสียงไม่พร้อม"},{status:404});
      await db.insert(roomSignals).values({roomCode:code,fromId:playerId,toId,payload,createdAt:now});
      return Response.json(await roomState(code,playerId));
    }
    if(action==="chat"){
      const message=String(body.message??"").trim().replace(/[<>]/g,"").slice(0,180);if(!message)return Response.json({error:"ข้อความว่างเปล่า"},{status:400});
      await db.insert(roomMessages).values({roomCode:code,playerId,name:player.name,message,createdAt:now});
      return Response.json(await roomState(code,playerId));
    }
    return Response.json({error:"คำสั่งไม่ถูกต้อง"},{status:400});
  } catch (error) { console.error(error); return Response.json({error:"เชื่อมต่อห้องออนไลน์ไม่สำเร็จ"},{status:500}); }
}
