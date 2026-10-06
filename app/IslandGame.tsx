"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Hud = { health: number; oxygen: number; inWater: boolean; scrap: number; cells: number; wood:number; stone:number; treasure:number; discoveries:number; mapX:number; mapZ:number; quest:string; questProgress:number; time: number; message: string; nearTower: boolean; onlineCount: number };
type Progress={coins:number;xp:number;level:number;runs:number;unlocks:number;achievements:string[];secrets:number;bestDiscoveries:number};
type ColorKey="skin"|"shirt"|"pants"|"pack"|"hair";
type Appearance = Record<ColorKey,number>&{height:number;build:number;muscle:number};
type OnlineSession={code:string;playerId:string;token:string};
type OnlineRock={id:number;state:"held"|"thrown"|"rest";radius:number;scale:[number,number,number];position:[number,number,number];velocity:[number,number,number]};
type OnlinePlayer={id:string;name:string;appearance:Appearance;x:number;y:number;z:number;rotation:number;pose:string;anim:[number,number,number,number,number]|null;rock:OnlineRock|null;updatedAt:number};
type NpcSnapshot={z:Array<[number,number,number,number]>;d:[number,number,number,number]};
type VoiceSignal={id:number;fromId:string;payload:{type:"offer"|"answer"|"candidate";sdp?:RTCSessionDescriptionInit;candidate?:RTCIceCandidateInit}};
type ChatMessage={id:number;playerId:string;name:string;message:string;createdAt:number};
type OnlineState={room:{code:string;scrap:number;cells:number;won:boolean;time:number;serverNow:number};players:OnlinePlayer[];collected:number[];signals?:VoiceSignal[];messages?:ChatMessage[]};
type CollectionQuest={wood:number;stone:number;treasure:number;discoveries:number;scrap:number;cells:number};
const randomInt=(min:number,max:number)=>min+Math.floor(Math.random()*(max-min+1));
const collectionQuestFor=(seed?:string):CollectionQuest=>{
  if(!seed)return {wood:randomInt(2,6),stone:randomInt(2,5),treasure:randomInt(1,3),discoveries:randomInt(3,6),scrap:randomInt(3,6),cells:randomInt(1,3)};
  let value=0;for(const char of seed)value=(value*31+char.charCodeAt(0))>>>0;
  const next=(min:number,max:number)=>{value=(value*1664525+1013904223)>>>0;return min+(value%(max-min+1));};
  return {wood:next(2,6),stone:next(2,5),treasure:next(1,3),discoveries:next(3,6),scrap:next(3,6),cells:next(1,3)};
};
const collectionQuestStatus=(quest:CollectionQuest,craftedRaft:boolean,wood:number,stone:number,treasure:number,discoveries:number,scrap:number,cells:number)=>{
  if(!craftedRaft)return {quest:wood>=quest.wood&&stone>=quest.stone?"กด Q เพื่อคราฟต์แพ":`รวบรวมไม้ ${quest.wood} และหิน ${quest.stone} เพื่อสร้างแพ`,questProgress:Math.min(100,(wood/quest.wood+stone/quest.stone)*50)};
  if(treasure<quest.treasure)return {quest:`ค้นหาหีบสมบัติที่ซ่อนอยู่ทั้ง ${quest.treasure} ใบ`,questProgress:treasure/quest.treasure*100};
  if(discoveries<quest.discoveries)return {quest:`ค้นพบสถานที่สำคัญบนแผนที่ ${quest.discoveries} แห่ง`,questProgress:discoveries/quest.discoveries*100};
  return {quest:"ซ่อมหอส่งสัญญาณและเอาชีวิตรอด",questProgress:Math.min(100,(scrap/quest.scrap+cells/quest.cells)*50)};
};
const INITIAL: Hud = { health: 100, oxygen: 100, inWater: false, scrap: 0, cells: 0, wood:0,stone:0,treasure:0,discoveries:0,mapX:0,mapZ:90,quest:"ภารกิจรวบรวมทรัพยากรแบบสุ่ม",questProgress:0,time: 0.08, message: "ค้นหาชิ้นส่วนบนเกาะ", nearTower: false, onlineCount: 1 };
const COLOR_KEYS:ColorKey[]=["skin","shirt","pants","pack","hair"];
const DEFAULT_LOOK:Appearance={skin:0xe7c4a1,shirt:0xf1a447,pants:0x263e49,pack:0x304b51,hair:0x2b211d,height:.5,build:.45,muscle:.35};
const LOOK_OPTIONS={skin:[0xf4d2b5,0xe7c4a1,0xc98f65,0x8b5b3e,0x5c3828],shirt:[0xf1a447,0x4fb6a2,0xd85c51,0x5479c9,0xb479c8,0xe8d26f],pants:[0x263e49,0x25315b,0x564638,0x315844,0x5b3441],pack:[0x304b51,0x79543c,0x496a3d,0x9a654b,0x3e4269],hair:[0x191512,0x543322,0xa66a36,0xd6b36d,0x6b334d]};
const SWAMP_X=-75,SWAMP_Z=95,SWAMP_RADIUS=38,SWAMP_WATER=.25,ISLAND_RADIUS=235,MAIN_BEACH_START=214,SECOND_X=470,SECOND_Z=0,SECOND_RADIUS=125,SECOND_BEACH_START=108,BRIDGE_Y=-.15,OCEAN_LEVEL=-5.2,WORLD_MIN_X=-300,WORLD_MAX_X=660,WORLD_Z_LIMIT=300;
const MAZE_ZONES=[{x:-112,z:-104,half:29},{x:112,z:-104,half:29},{x:112,z:105,half:29}];
const terrainHeight=(x:number,z:number)=>{
  const hill=(cx:number,cz:number,height:number,spread:number)=>height*Math.exp(-((x-cx)**2+(z-cz)**2)/spread);
  const rolling=Math.sin(x*.045)*1.35+Math.cos(z*.052)*1.05+Math.sin((x+z)*.025)*.8;
  // Overlapping, broad foothills read as mountain ranges instead of isolated domes.
  const mountains=hill(-110,-75,18,4200)+hill(-132,-57,7,1450)+hill(-84,-91,6,1250)
    +hill(118,18,14,3300)+hill(139,6,5,1200)+hill(35,145,8,2300)+hill(-165,55,7,1900);
  const swamp=hill(SWAMP_X,SWAMP_Z,5.2,1100);
  return rolling+mountains-swamp;
};
// This is the exact height rendered by the radial island mesh. Gameplay and
// scenery must use the same edge falloff or they visibly hover above the land.
const rawSurfaceHeight=(x:number,z:number)=>{const r=Math.hypot(x,z),base=terrainHeight(x,z)*(1-Math.min(1,r/ISLAND_RADIUS)*.18);if(r<=MAIN_BEACH_START)return base;const shore=THREE.MathUtils.smoothstep(r,MAIN_BEACH_START,ISLAND_RADIUS);return THREE.MathUtils.lerp(base,OCEAN_LEVEL-.18,shore);};
const secondSurfaceHeight=(x:number,z:number)=>{const lx=x-SECOND_X,lz=z-SECOND_Z,r=Math.hypot(lx,lz),edge=Math.max(0,1-r/SECOND_RADIUS),rolling=Math.sin(lx*.055)*1.1+Math.cos(lz*.06)*.8,hill=9*Math.exp(-((lx-22)**2+(lz+28)**2)/2500),base=BRIDGE_Y+(rolling+hill)*Math.min(1,edge*3.2);if(r<=SECOND_BEACH_START)return base;const shore=THREE.MathUtils.smoothstep(r,SECOND_BEACH_START,SECOND_RADIUS);return THREE.MathUtils.lerp(base,OCEAN_LEVEL-.18,shore);};
const onBridge=(x:number,z:number)=>x>205&&x<357&&Math.abs(z)<3.5;
const surfaceHeight=(x:number,z:number)=>{if(onBridge(x,z))return BRIDGE_Y;if(Math.hypot(x-SECOND_X,z-SECOND_Z)<SECOND_RADIUS)return secondSurfaceHeight(x,z);const raw=rawSurfaceHeight(x,z);for(const zone of MAZE_ZONES){const edge=Math.max(Math.abs(x-zone.x),Math.abs(z-zone.z)),flat=rawSurfaceHeight(zone.x,zone.z);if(edge<zone.half+7){const blend=THREE.MathUtils.smoothstep(edge,zone.half-2,zone.half+7);return THREE.MathUtils.lerp(flat,raw,blend);}}return raw;};

export default function IslandGame() {
  const mount = useRef<HTMLDivElement>(null);
  const keys = useRef<Record<string, boolean>>({});
  const [started, setStarted] = useState(false);
  const [hud, setHud] = useState(INITIAL);
  const [end, setEnd] = useState<"won" | "lost" | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [customizing,setCustomizing]=useState(false);
  const [carryingRock,setCarryingRock]=useState(false);
  const [aimingRock,setAimingRock]=useState(false);
  const [onlineSetup,setOnlineSetup]=useState(false);
  const [onlineSession,setOnlineSession]=useState<OnlineSession|null>(null);
  const [savedSession,setSavedSession]=useState<OnlineSession|null>(null);
  const [playerName,setPlayerName]=useState("นักสำรวจ");
  const [joinCode,setJoinCode]=useState("");
  const [onlineError,setOnlineError]=useState("");
  const [connecting,setConnecting]=useState(false);
  const [voiceEnabled,setVoiceEnabled]=useState(false);
  const [voiceError,setVoiceError]=useState("");
  const [chatOpen,setChatOpen]=useState(false);
  const [chatInput,setChatInput]=useState("");
  const [chatMessages,setChatMessages]=useState<ChatMessage[]>([]);
  const [appearance,setAppearance]=useState<Appearance>(DEFAULT_LOOK);
  const [lookLoaded,setLookLoaded]=useState(false);
  const [progress,setProgress]=useState<Progress>({coins:0,xp:0,level:1,runs:0,unlocks:0,achievements:[],secrets:0,bestDiscoveries:0});
  const progressRef=useRef(progress);
  const [previewQuest,setPreviewQuest]=useState<CollectionQuest>(()=>collectionQuestFor("solo-preview"));
  const [randomQuest]=useState(()=>["ค้นหาความลับ 2 จุด","ทำให้ซอมบี้ล้ม 3 ตัว","สำรวจสถานที่ 4 แห่ง","สร้างกำแพงฐาน 2 ชิ้น"][Math.floor(Math.random()*4)]);
  const repair = useRef<() => void>(() => {});
  const rockAction = useRef<() => void>(() => {});
  const paused=useRef(false),appearanceRef=useRef(appearance),voiceToggle=useRef<()=>void>(()=>{}),chatSend=useRef<(message:string)=>void>(()=>{});
  const lookMaterials=useRef<Record<ColorKey,THREE.MeshStandardMaterial>|null>(null);
  const bodyShape=useRef<{player:THREE.Group;body:THREE.Mesh;leftArm:THREE.Group;rightArm:THREE.Group}|null>(null);

  useEffect(()=>{try{const saved=localStorage.getItem("echo-island-look");if(saved)setAppearance({...DEFAULT_LOOK,...JSON.parse(saved)});}catch{}setLookLoaded(true);},[]);
  useEffect(()=>{try{const saved=localStorage.getItem("echo-island-room");if(saved)setSavedSession(JSON.parse(saved));const name=localStorage.getItem("echo-island-name");if(name)setPlayerName(name);}catch{}},[]);
  useEffect(()=>{try{const saved=localStorage.getItem("echo-island-progress");if(saved){const value={...progress,...JSON.parse(saved)};setProgress(value);progressRef.current=value;}}catch{}},[]);
  useEffect(()=>{progressRef.current=progress;localStorage.setItem("echo-island-progress",JSON.stringify(progress));},[progress]);
  useEffect(()=>{appearanceRef.current=appearance;const m=lookMaterials.current;if(m)COLOR_KEYS.forEach(k=>m[k].color.setHex(appearance[k]));const s=bodyShape.current;if(s){const width=.78+appearance.build*.5,height=.82+appearance.height*.38,arms=.82+appearance.muscle*.55;s.player.scale.set(width,height,width);s.body.scale.set(1+appearance.muscle*.18,1,1+appearance.muscle*.18);s.leftArm.scale.set(arms,1,arms);s.rightArm.scale.set(arms,1,arms);s.leftArm.position.x=-(.48+appearance.build*.11+appearance.muscle*.07);s.rightArm.position.x=-s.leftArm.position.x;}if(lookLoaded)localStorage.setItem("echo-island-look",JSON.stringify(appearance));},[appearance,lookLoaded]);
  useEffect(()=>{setPreviewQuest(collectionQuestFor());},[]);
  useEffect(()=>{if(started)setProgress(p=>({...p,runs:p.runs+1}));},[started]);
  useEffect(()=>{paused.current=customizing||showHelp||chatOpen;},[customizing,showHelp,chatOpen]);

  useEffect(() => {
    if (!mount.current) return;
    const host = mount.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x91d6d0);
    scene.fog = new THREE.FogExp2(0x91d6d0, 0.0032);
    const camera = new THREE.PerspectiveCamera(62, host.clientWidth / host.clientHeight, 0.1, 800);
    const lowPower=matchMedia("(pointer: coarse)").matches||innerWidth<760||(navigator.hardwareConcurrency??8)<=4;
    const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, powerPreference: "high-performance" });
    renderer.setPixelRatio(lowPower?1:Math.min(devicePixelRatio, 1.2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = !lowPower;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xcaf9ff, 0x22341d, 2.2);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe6b0, 3.4);
    sun.position.set(-35, 45, 20); sun.castShadow = true;
    sun.shadow.mapSize.set(512, 512); sun.shadow.camera.left = -120; sun.shadow.camera.right = 120;
    sun.shadow.camera.top = 120; sun.shadow.camera.bottom = -120; scene.add(sun);

    const mat = (color: number, roughness = 0.85, emissive = 0) => new THREE.MeshStandardMaterial({ color, roughness, flatShading: true, emissive, emissiveIntensity: emissive ? 1.4 : 0 });
    const addMesh = (geo: THREE.BufferGeometry, material: THREE.Material, x=0, y=0, z=0) => {
      const m = new THREE.Mesh(geo, material); m.position.set(x,y,z); m.castShadow = !lowPower; m.receiveShadow = !lowPower; scene.add(m); return m;
    };

    const PLAY_RADIUS=ISLAND_RADIUS-1, TOWER_Z=-40;
    const collectionQuest=onlineSession?.code?collectionQuestFor(onlineSession.code):previewQuest;
    addMesh(new THREE.CylinderGeometry(ISLAND_RADIUS, 255, 8, 24), mat(0x365f39), 0, -6.4, 0);
    addMesh(new THREE.CylinderGeometry(255, 275, 2, 28), mat(0xd8b46f), 0, -4.1, 0);
    const water = addMesh(new THREE.CircleGeometry(800, 72), new THREE.MeshStandardMaterial({color:0x1c7890, roughness:.25, metalness:.1, transparent:true, opacity:.9}), 180,OCEAN_LEVEL,0);
    water.rotation.x = -Math.PI/2;

    // Radial terrain grid with true elevation, vertex color biomes and walkable slopes.
    const rings=72,segments=144,positions:number[]=[],colors:number[]=[],indices:number[]=[];
    const colorFor=(x:number,z:number,h:number)=>{const radius=Math.hypot(x,z),swamp=Math.hypot(x-SWAMP_X,z-SWAMP_Z)<SWAMP_RADIUS+8;const c=new THREE.Color(radius>=MAIN_BEACH_START?0xd8b46f:swamp?0x345b43:h>18?0x69746d:h>7?0x4f7045:0x4b8148);return [c.r,c.g,c.b];};
    positions.push(0,surfaceHeight(0,0),0);colors.push(...colorFor(0,0,surfaceHeight(0,0)));
    for(let ring=1;ring<=rings;ring++){const radius=ISLAND_RADIUS*ring/rings;for(let s=0;s<segments;s++){const a=s/segments*Math.PI*2,x=Math.cos(a)*radius,z=Math.sin(a)*radius,h=surfaceHeight(x,z);positions.push(x,h,z);colors.push(...colorFor(x,z,h));}}
    // Counter-clockwise from above: the visible face and normals must point skyward.
    for(let s=0;s<segments;s++)indices.push(0,1+(s+1)%segments,1+s);
    for(let ring=1;ring<rings;ring++){const inner=1+(ring-1)*segments,outer=1+ring*segments;for(let s=0;s<segments;s++){const n=(s+1)%segments;indices.push(inner+s,outer+n,outer+s,inner+s,inner+n,outer+n);}}
    const terrainGeo=new THREE.BufferGeometry();terrainGeo.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));terrainGeo.setAttribute("color",new THREE.Float32BufferAttribute(colors,3));terrainGeo.setIndex(indices);terrainGeo.computeVertexNormals();
    const terrain=new THREE.Mesh(terrainGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96,flatShading:false,side:THREE.DoubleSide}));terrain.receiveShadow=!lowPower;scene.add(terrain);
    // A second explorable island, raised from the same ocean but with its own hills.
    addMesh(new THREE.CylinderGeometry(SECOND_RADIUS,SECOND_RADIUS+10,7,28),mat(0x365f39),SECOND_X,-4.6,SECOND_Z);
    const secondPositions:number[]=[],secondColors:number[]=[],secondIndices:number[]=[];secondPositions.push(SECOND_X,secondSurfaceHeight(SECOND_X,SECOND_Z),SECOND_Z);secondColors.push(.28,.51,.3);
    const secondRings=40,secondSegments=96;for(let ring=1;ring<=secondRings;ring++){const radius=SECOND_RADIUS*ring/secondRings;for(let s=0;s<secondSegments;s++){const a=s/secondSegments*Math.PI*2,x=SECOND_X+Math.cos(a)*radius,z=SECOND_Z+Math.sin(a)*radius,h=secondSurfaceHeight(x,z),c=new THREE.Color(radius>=SECOND_BEACH_START?0xd8b46f:h>4?0x60715a:0x4b8148);secondPositions.push(x,h,z);secondColors.push(c.r,c.g,c.b);}}
    for(let s=0;s<secondSegments;s++)secondIndices.push(0,1+(s+1)%secondSegments,1+s);for(let ring=1;ring<secondRings;ring++){const inner=1+(ring-1)*secondSegments,outer=1+ring*secondSegments;for(let s=0;s<secondSegments;s++){const n=(s+1)%secondSegments;secondIndices.push(inner+s,outer+n,outer+s,inner+s,inner+n,outer+n);}}
    const secondGeo=new THREE.BufferGeometry();secondGeo.setAttribute("position",new THREE.Float32BufferAttribute(secondPositions,3));secondGeo.setAttribute("color",new THREE.Float32BufferAttribute(secondColors,3));secondGeo.setIndex(secondIndices);secondGeo.computeVertexNormals();const secondTerrain=new THREE.Mesh(secondGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96,side:THREE.DoubleSide}));secondTerrain.receiveShadow=!lowPower;scene.add(secondTerrain);
    // One broad central bridge remains; the wider ocean gap can also be crossed by swimming.
    const bridgeMat=mat(0x805735),railMat=mat(0x4f3524);for(let x=207;x<=356;x+=2.4){const plank=addMesh(new THREE.BoxGeometry(2.25,.28,6.2),bridgeMat,x,BRIDGE_Y-.04,0);plank.rotation.y=(Math.sin(x*.3)*.012);}for(const side of [-3.25,3.25]){addMesh(new THREE.BoxGeometry(152,.18,.18),railMat,281,BRIDGE_Y+1.05,side);for(let x=207;x<=356;x+=6)addMesh(new THREE.BoxGeometry(.18,1.15,.18),railMat,x,BRIDGE_Y+.52,side);}
    const swampWater=addMesh(new THREE.CircleGeometry(SWAMP_RADIUS,48),new THREE.MeshStandardMaterial({color:0x315f58,roughness:.18,metalness:.08,transparent:true,opacity:.82}),SWAMP_X,SWAMP_WATER,SWAMP_Z);swampWater.rotation.x=-Math.PI/2;

    const rand = (n:number) => { const x = Math.sin(n * 9283.31) * 43758.5; return x - Math.floor(x); };
    const insideMaze=(x:number,z:number)=>MAZE_ZONES.some(m=>Math.abs(x-m.x)<m.half+5&&Math.abs(z-m.z)<m.half+5);
    // Circular ground colliders keep movement inexpensive and reliable on desktop and mobile.
    const colliders:{x:number;z:number;r:number}[]=[];
    type ThrowableRock={id:number;mesh:THREE.Mesh|null;velocity:THREE.Vector3|null;held:boolean;radius:number;baseScale:THREE.Vector3;restPosition:THREE.Vector3;instanceIndex:number|null;collider:{x:number;z:number;r:number}|null};
    const throwableRocks:ThrowableRock[]=[];
    const rockMaterial=mat(0x65716b);
    // Instancing lets the expanded island stay dense without multiplying draw calls.
    const treeCount=280, dummy=new THREE.Object3D();
    const trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.25,.42,2.6,6),mat(0x5a3923),treeCount);
    const crowns=new THREE.InstancedMesh(new THREE.ConeGeometry(1.65,3.8,7),mat(0x286044),treeCount);
    trunks.castShadow=trunks.receiveShadow=crowns.castShadow=crowns.receiveShadow=!lowPower;scene.add(trunks,crowns);
    for (let i=0;i<treeCount;i++) {
      const a=rand(i)*Math.PI*2, r=22+rand(i+91)*194, size=.5+Math.pow(rand(i+8),1.7)*1.45;let x=Math.cos(a)*r,z=Math.sin(a)*r;
      if(Math.hypot(x,z-90)<9||Math.hypot(x,z-TOWER_Z)<9){x+=12;z+=8;}
      if(insideMaze(x,z)){x*=.72;z*=-.55;}
      const ground=surfaceHeight(x,z);dummy.position.set(x,ground+1.3*size,z);dummy.rotation.set(0,rand(i+2)*6,(rand(i+3)-.5)*.16);dummy.scale.set(.7+size*.3,size,.7+size*.3);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
      dummy.position.set(x,ground+3.7*size,z);dummy.rotation.set(0,rand(i+2)*6,0);dummy.scale.set(size,size,size);dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);
      colliders.push({x,z,r:.38+size*.3});
    }
    const rockCount=120, rocks=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),rockMaterial,rockCount);rocks.castShadow=rocks.receiveShadow=!lowPower;scene.add(rocks);
    for(let i=0;i<rockCount;i++){
      const a=rand(i+400)*6.28,r=14+rand(i+530)*202,size=.4+rand(i+600)*.8;let x=Math.cos(a)*r,z=Math.sin(a)*r;
      if(Math.hypot(x,z-90)<7||Math.hypot(x,z-TOWER_Z)<7){x-=10;z+=7;}
      if(insideMaze(x,z)){x*=.68;z*=-.5;}
      const rockHeight=size*(.55+rand(i+700));
      dummy.position.set(x,surfaceHeight(x,z)+rockHeight*.72,z);dummy.rotation.set(rand(i)*2,rand(i+2)*3,0);dummy.scale.set(size,rockHeight,size*.9);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);
      const collider={x,z,r:Math.max(.5,size)};colliders.push(collider);throwableRocks.push({id:i,mesh:null,velocity:null,held:false,radius:Math.max(size,rockHeight),baseScale:new THREE.Vector3(size,rockHeight,size*.9),restPosition:dummy.position.clone(),instanceIndex:i,collider});
    }

    const shrubCount=190,shrubs=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.65,0),mat(0x2f6b42),shrubCount);scene.add(shrubs);
    for(let i=0;i<shrubCount;i++){const a=rand(i+980)*6.28,r=12+rand(i+1080)*205;let x=Math.cos(a)*r,z=Math.sin(a)*r;const s=.55+rand(i+1180)*.75;if(insideMaze(x,z)){x*=.7;z*=-.52;}dummy.position.set(x,surfaceHeight(x,z)+.25*s,z);dummy.rotation.set(0,rand(i+77)*6,0);dummy.scale.set(s,.55*s,s);dummy.updateMatrix();shrubs.setMatrixAt(i,dummy.matrix);}
    const reedCount=90,reeds=new THREE.InstancedMesh(new THREE.ConeGeometry(.09,1.5,5),mat(0x78934b),reedCount);scene.add(reeds);
    for(let i=0;i<reedCount;i++){const a=rand(i+1300)*6.28,r=12+rand(i+1400)*(SWAMP_RADIUS-12),x=SWAMP_X+Math.cos(a)*r,z=SWAMP_Z+Math.sin(a)*r;dummy.position.set(x,SWAMP_WATER+.4,z);dummy.rotation.set(0,rand(i)*6,(rand(i+8)-.5)*.18);dummy.scale.set(1,.7+rand(i+9)*.8,1);dummy.updateMatrix();reeds.setMatrixAt(i,dummy.matrix);}
    const secondTreeCount=155,secondTrunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.24,.4,2.5,6),mat(0x604027),secondTreeCount),secondCrowns=new THREE.InstancedMesh(new THREE.ConeGeometry(1.5,3.6,7),mat(0x2d6847),secondTreeCount);scene.add(secondTrunks,secondCrowns);for(let i=0;i<secondTreeCount;i++){const a=rand(i+2200)*6.28,r=18+rand(i+2300)*96,x=SECOND_X+Math.cos(a)*r,z=Math.sin(a)*r,size=.45+rand(i+2400)*1.15,y=secondSurfaceHeight(x,z);dummy.position.set(x,y+1.25*size,z);dummy.scale.set(size,size,size);dummy.rotation.set(0,rand(i)*6,0);dummy.updateMatrix();secondTrunks.setMatrixAt(i,dummy.matrix);dummy.position.y=y+3.55*size;dummy.updateMatrix();secondCrowns.setMatrixAt(i,dummy.matrix);colliders.push({x,z,r:.4+size*.25});}
    const flowerCount=70,flowers=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.18,0),mat(0xffd45c,.55,0x8c5a12),flowerCount);scene.add(flowers);for(let i=0;i<flowerCount;i++){const a=rand(i+2600)*6.28,r=18+rand(i+2700)*92,x=SECOND_X+Math.cos(a)*r,z=Math.sin(a)*r,y=secondSurfaceHeight(x,z);dummy.position.set(x,y+.18,z);dummy.scale.setScalar(.7+rand(i)*1.4);dummy.updateMatrix();flowers.setMatrixAt(i,dummy.matrix);}
    const secondRockCount=75,secondRocks=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1,0),mat(0x66736f),secondRockCount);scene.add(secondRocks);for(let i=0;i<secondRockCount;i++){const a=rand(i+5200)*6.28,r=12+rand(i+5300)*102,x=SECOND_X+Math.cos(a)*r,z=Math.sin(a)*r,s=.28+rand(i+5400)*1.05,y=secondSurfaceHeight(x,z);dummy.position.set(x,y+s*.55,z);dummy.rotation.set(rand(i)*2,rand(i+4)*4,rand(i+8)*2);dummy.scale.set(s,.55*s,s*.82);dummy.updateMatrix();secondRocks.setMatrixAt(i,dummy.matrix);if(s>.72)colliders.push({x,z,r:s*.65});}
    const secondShrubCount=130,secondShrubs=new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.7,0),mat(0x397849),secondShrubCount);scene.add(secondShrubs);for(let i=0;i<secondShrubCount;i++){const a=rand(i+5500)*6.28,r=10+rand(i+5600)*104,x=SECOND_X+Math.cos(a)*r,z=Math.sin(a)*r,s=.4+rand(i+5700)*.85,y=secondSurfaceHeight(x,z);dummy.position.set(x,y+.28*s,z);dummy.rotation.set(0,rand(i)*6,0);dummy.scale.set(s,.55*s,s);dummy.updateMatrix();secondShrubs.setMatrixAt(i,dummy.matrix);}
    const camp2X=SECOND_X-42,camp2Z=46,camp2Y=secondSurfaceHeight(camp2X,camp2Z);const tent2=addMesh(new THREE.ConeGeometry(3.8,3.5,4),mat(0x3d7ea0),camp2X,camp2Y+1.7,camp2Z);tent2.rotation.y=Math.PI/4;addMesh(new THREE.CylinderGeometry(.5,.65,.35,8),mat(0x4b2d20,1,0xe06a24),camp2X+5,camp2Y+.25,camp2Z-2);for(let i=0;i<7;i++){const a=i/7*6.28,x=SECOND_X+58+Math.cos(a)*10,z=-48+Math.sin(a)*10,y=secondSurfaceHeight(x,z);addMesh(new THREE.BoxGeometry(2.4,2.2+i%2*1.5,1.5),mat(0x758078),x,y+1.1,z).rotation.y=a;}
    // Landmarks provide navigation silhouettes: a campsite and ancient stone ruins.
    const campY=surfaceHeight(58,64);const tent=addMesh(new THREE.ConeGeometry(3.2,3.2,4),mat(0xb66d3e),58,campY+1.5,64);tent.rotation.y=Math.PI/4;
    addMesh(new THREE.CylinderGeometry(.35,.45,.3,8),mat(0x4a2c20,1,0x6e2410),53,campY+.2,62);
    // Bright launch pads turn distant areas into playful traversal routes.
    const springs:THREE.Group[]=[];
    [[18,112],[-58,42],[86,-36],[-154,-22],[58,154],[-36,-154],[168,-92],[SECOND_X-62,-52],[SECOND_X+56,42],[SECOND_X-38,76],[SECOND_X+72,-58]].forEach(([x,z],i)=>{const g=new THREE.Group(),y=surfaceHeight(x,z);g.position.set(x,y+.15,z);const base=new THREE.Mesh(new THREE.CylinderGeometry(1.45,1.7,.32,12),mat(i%2?0x30c9d8:0xffb52e,.45,i%2?0x126c79:0x8d4b08));g.add(base);for(let j=0;j<3;j++){const ring=new THREE.Mesh(new THREE.TorusGeometry(.95-j*.12,.11,6,14),mat(0xeafff5,.25,0x65ffd0));ring.rotation.x=Math.PI/2;ring.position.y=.28+j*.3;g.add(ring);}const top=new THREE.Mesh(new THREE.CylinderGeometry(1.15,1.15,.18,12),mat(0x64f5bd,.35,0x2deaa0));top.position.y=1.13;g.add(top);scene.add(g);springs.push(g);});
    // Two flat, image-inspired mazes: a bright open spiral and a denser dark labyrinth.
    type MazeSegment=[number,number,number,number];
    const pinkMaze:MazeSegment[]=[[-25,-25,-25,25],[-25,-25,-6,-25],[4,-25,25,-25],[25,-25,25,25],[25,25,5,25],[-5,25,-25,25],[-22,-21,-6,-21],[-1,-21,21,-21],[21,-21,21,21],[21,21,5,21],[-4,21,-21,21],[-21,21,-21,4],[-21,-4,-21,-21],[-21,3,0,3],[0,3,0,18],[0,18,-9,18],[-9,18,-9,10],[-15,10,-4,10],[-4,10,-4,16],[5,21,5,-16],[5,-16,16,-16],[16,-16,16,16],[16,16,13,16],[13,16,13,-10],[-14,-21,-14,-12],[-14,-12,-5,-12],[-5,-12,-5,-17],[-5,-17,-1,-17],[-1,-17,-1,-4],[-1,-4,-10,-4],[-10,-4,-10,-10],[-10,-10,-17,-10]];
    const darkMaze:MazeSegment[]=[[-25,-25,-25,25],[-25,-25,-6,-25],[4,-25,25,-25],[25,-25,25,-5],[25,4,25,25],[-25,25,25,25],[-21,21,-21,2],[-21,-7,-21,-21],[-21,-21,-12,-21],[-12,-21,-12,-7],[-5,-7,-5,20],[-5,20,-21,20],[-17,16,-2,16],[-17,16,-17,5],[-17,5,-2,5],[-2,5,-2,15],[-2,15,14,15],[14,15,14,11],[14,11,2,11],[2,11,2,-17],[2,-17,9,-17],[9,-17,9,-8],[9,-8,19,-8],[19,-8,19,8],[19,8,10,8],[10,8,10,4],[10,4,21,4],[21,4,21,21],[6,20,6,13],[6,20,18,20],[6,1,18,1],[18,1,18,-4],[18,-4,6,-4],[6,-4,6,-13],[6,-13,18,-13]];
    const arrowMaze:MazeSegment[]=[[-25,-25,-25,21],[-25,25,25,25],[25,25,25,-21],[25,-25,4,-25],[-4,-25,-25,-25],[-20,15,-10,15],[-20,15,-20,5],[-20,5,-7,5],[-7,5,-7,25],[-20,-5,-13,-5],[-13,-5,-13,4],[-20,-16,-7,-16],[-7,-16,-7,-6],[-7,-6,-1,-6],[-1,-6,-1,5],[-1,5,-4,5],[-4,5,-4,15],[-4,15,-1,15],[-1,15,-1,5],[4,15,13,15],[13,15,13,5],[13,5,17,5],[17,5,17,15],[17,15,21,15],[21,15,21,5],[21,5,25,5],[4,5,8,5],[8,5,8,-5],[8,-5,16,-5],[16,-5,16,4],[4,-5,4,-16],[4,-16,12,-16],[12,-16,12,-6],[17,-16,25,-16]];
    const buildMaze=(zone:{x:number;z:number;half:number},segments:MazeSegment[],color:number,accent:number)=>{const y=surfaceHeight(zone.x,zone.z);const floor=addMesh(new THREE.BoxGeometry(60,.5,60),mat(accent),zone.x,y-.22,zone.z);floor.receiveShadow=!lowPower;const wallMat=mat(color,.9);for(const [x1,z1,x2,z2] of segments){const dx=x2-x1,dz=z2-z1,length=Math.hypot(dx,dz),cx=zone.x+(x1+x2)/2,cz=zone.z+(z1+z2)/2,wall=addMesh(new THREE.BoxGeometry(length+1,3.8,1.15),wallMat,cx,y+1.85,cz);wall.rotation.y=-Math.atan2(dz,dx);const steps=Math.ceil(length/1.25);for(let i=0;i<=steps;i++){const t=i/steps;colliders.push({x:zone.x+THREE.MathUtils.lerp(x1,x2,t),z:zone.z+THREE.MathUtils.lerp(z1,z2,t),r:.62});}}};
    buildMaze(MAZE_ZONES[0],pinkMaze,0xd82d86,0x567b4c);buildMaze(MAZE_ZONES[1],darkMaze,0x26313a,0x6f8059);buildMaze(MAZE_ZONES[2],arrowMaze,0x111514,0x7b8a55);
    // A climbable observation pillar overlooks both islands and all three bridges.
    const OBS_X=SECOND_X+18,OBS_Z=12,obsGround=secondSurfaceHeight(OBS_X,OBS_Z),OBS_HEIGHT=30;
    const obsStone=mat(0x46545a),obsWood=mat(0x9b6d3e),obsMetal=mat(0xd2b16c);addMesh(new THREE.CylinderGeometry(2.8,3.6,OBS_HEIGHT,10),obsStone,OBS_X,obsGround+OBS_HEIGHT/2,OBS_Z);addMesh(new THREE.CylinderGeometry(6,5.4,.8,12),obsWood,OBS_X,obsGround+OBS_HEIGHT,OBS_Z);addMesh(new THREE.ConeGeometry(6.8,3.4,8),mat(0x8c4436),OBS_X,obsGround+32.1,OBS_Z);
    for(const side of [-.72,.72])addMesh(new THREE.BoxGeometry(.14,OBS_HEIGHT,.16),obsMetal,OBS_X+side,obsGround+OBS_HEIGHT/2,OBS_Z-3.05);for(let y=1;y<OBS_HEIGHT;y+=.75)addMesh(new THREE.BoxGeometry(1.6,.11,.18),obsMetal,OBS_X,obsGround+y,OBS_Z-3.08);colliders.push({x:OBS_X,z:OBS_Z,r:2.4});
    // Five elevated wooden fortresses. Each has a dedicated ladder on its
    // south side and a broad, solid roof deck that players can stand on.
    type Fortress={x:number;z:number;ground:number;height:number;radius:number;ladderZ:number};
    const fortresses:Fortress[]=[];
    [[-178,-42],[172,72],[-42,178],[SECOND_X-62,-68],[SECOND_X+64,52]].forEach(([x,z],i)=>{
      const heights=[52,58,55,78,60],ground=surfaceHeight(x,z),height=heights[i],radius=5.2,ladderZ=z-radius-.45;fortresses.push({x,z,ground,height,radius,ladderZ});
      const timber=mat(i%2?0x765035:0x67452f),stone=mat(0x59635c),banner=mat(i%2?0x2aa98f:0xb85b42,.75);
      addMesh(new THREE.CylinderGeometry(radius,radius+.7,1.1,12),stone,x,ground+.5,z);
      for(let p=0;p<12;p++){const a=p/12*Math.PI*2,px=x+Math.cos(a)*(radius-.25),pz=z+Math.sin(a)*(radius-.25);addMesh(new THREE.BoxGeometry(1.2,height,.8),timber,px,ground+height/2,pz).rotation.y=-a;}
      const deck=addMesh(new THREE.CylinderGeometry(radius+1,radius+1,.75,12),timber,x,ground+height,z);deck.receiveShadow=!lowPower;
      for(let p=0;p<12;p++){const a=p/12*Math.PI*2,pz=z+Math.sin(a)*(radius+.15);addMesh(new THREE.BoxGeometry(1.8,1.5,.65),stone,x+Math.cos(a)*(radius+.15),ground+height+1,pz).rotation.y=-a;}
      const flagPole=addMesh(new THREE.CylinderGeometry(.08,.1,5,6),stone,x,ground+height+2.5,z);flagPole.castShadow=!lowPower;const flag=addMesh(new THREE.BoxGeometry(2.2,1.15,.08),banner,x+1.05,ground+height+4,z);flag.rotation.y=i*.75;
      for(const side of [-.7,.7])addMesh(new THREE.BoxGeometry(.15,height+.4,.18),stone,x+side,ground+(height+.4)/2,ladderZ);
      for(let y=.8;y<height+.2;y+=1.45)addMesh(new THREE.BoxGeometry(1.55,.14,.2),stone,x,ground+y,ladderZ-.02);
      // The circular wall remains solid except at the ladder entrance.
      for(let p=0;p<24;p++){const a=p/24*Math.PI*2;if(Math.abs(Math.atan2(Math.sin(a+Math.PI/2),Math.cos(a+Math.PI/2)))<.24)continue;colliders.push({x:x+Math.cos(a)*radius,z:z+Math.sin(a)*radius,r:.52});}
    });
    // A three-floor underground dungeon beneath the main island. The glowing
    // stair seals move the player between floors without exposing the rooms
    // through the terrain above.
    const DUNGEON_X=42,DUNGEON_Z=28,DUNGEON_LEVELS=[-18,-36,-54],dungeonStone=mat(0x252c32),dungeonFloor=mat(0x3c4649),dungeonGlow=mat(0x55e6bd,.35,0x1b8f75),dungeonColliders:{x:number;z:number;floor:number;r:number}[]=[];
    const dmesh=(geo:THREE.BufferGeometry,material:THREE.Material,x=0,y=0,z=0)=>{const m=addMesh(geo,material,x,y,z);m.castShadow=false;m.receiveShadow=false;return m;};
    const hatchY=surfaceHeight(DUNGEON_X,DUNGEON_Z),entranceVoid=dmesh(new THREE.BoxGeometry(6,.08,9),new THREE.MeshBasicMaterial({color:0x050809}),DUNGEON_X,hatchY+.05,DUNGEON_Z+4.5);for(const x of [-3.25,3.25])dmesh(new THREE.BoxGeometry(.45,2.4,10),dungeonStone,DUNGEON_X+x,hatchY+1.1,DUNGEON_Z+4.5);dmesh(new THREE.BoxGeometry(7,2.4,.45),dungeonStone,DUNGEON_X,hatchY+1.1,DUNGEON_Z-0.3);entranceVoid.renderOrder=2;
    const mazeLines=[[-28,-18,18,-18],[-18,-8,30,-8],[-30,2,12,2],[-12,12,30,12],[0,-26,0,-8],[18,-18,18,2],[-20,2,-20,22],[10,12,10,26]];
    DUNGEON_LEVELS.forEach((floorY,level)=>{dmesh(new THREE.BoxGeometry(80,.7,64),dungeonFloor,DUNGEON_X,floorY-.35,DUNGEON_Z);dmesh(new THREE.BoxGeometry(80,.45,64),dungeonStone,DUNGEON_X,floorY+8.8,DUNGEON_Z);for(const [ox,oz,w,d] of [[0,-32,80,1],[0,32,80,1],[-40,0,1,64],[40,0,1,64]] as number[][]){dmesh(new THREE.BoxGeometry(w,9,d),dungeonStone,DUNGEON_X+ox,floorY+4.5,DUNGEON_Z+oz);const len=Math.max(w,d);for(let s=-len/2;s<=len/2;s+=1.45)dungeonColliders.push({x:DUNGEON_X+ox+(w>d?s:0),z:DUNGEON_Z+oz+(d>w?s:0),floor:level+1,r:.72});}for(const [x1,z1,x2,z2] of mazeLines){const dx=x2-x1,dz=z2-z1,len=Math.hypot(dx,dz),wall=dmesh(new THREE.BoxGeometry(len,7,1),dungeonStone,DUNGEON_X+(x1+x2)/2,floorY+3.5,DUNGEON_Z+(z1+z2)/2);wall.rotation.y=-Math.atan2(dz,dx);for(let s=0;s<len;s+=1.5)dungeonColliders.push({x:DUNGEON_X+x1+dx*s/len,z:DUNGEON_Z+z1+dz*s/len,floor:level+1,r:.65});}for(let t=0;t<2;t++){const light=new THREE.PointLight(level===2?0xff633d:0x55e6bd,1.7,18);light.position.set(DUNGEON_X+(t?24:-24),floorY+5,DUNGEON_Z+(t?22:-22));scene.add(light);}});
    // Sealed rune doors are the only dungeon transitions. G moves the player
    // between matching doors so there are no open shafts or accidental falls.
    const dungeonDoorMat=mat(0x182126),dungeonDoors=[{x:DUNGEON_X,z:DUNGEON_Z+2,y:hatchY,level:0},{x:DUNGEON_X,z:DUNGEON_Z+25,y:DUNGEON_LEVELS[0],level:1},{x:DUNGEON_X+34,z:DUNGEON_Z+23,y:DUNGEON_LEVELS[0],level:1},{x:DUNGEON_X+34,z:DUNGEON_Z+23,y:DUNGEON_LEVELS[1],level:2},{x:DUNGEON_X-34,z:DUNGEON_Z-23,y:DUNGEON_LEVELS[1],level:2},{x:DUNGEON_X-34,z:DUNGEON_Z-23,y:DUNGEON_LEVELS[2],level:3}];
    for(const [i,door] of dungeonDoors.entries()){const descending=i%2===0,color=descending?0xff5d3d:0x43e5c1,runeMat=mat(color,.2,color);dmesh(new THREE.BoxGeometry(5.6,4.8,.7),dungeonDoorMat,door.x,door.y+2.4,door.z);dmesh(new THREE.TorusGeometry(1.25,.16,7,18),runeMat,door.x,door.y+2.45,door.z-.38);const destination=dungeonDoors[descending?i+1:i-1]?.level??0,canvas=document.createElement("canvas");canvas.width=256;canvas.height=128;const ctx=canvas.getContext("2d");if(ctx){ctx.fillStyle="#071719dd";ctx.fillRect(18,18,220,92);ctx.strokeStyle=`#${color.toString(16).padStart(6,"0")}`;ctx.lineWidth=8;ctx.strokeRect(18,18,220,92);ctx.fillStyle="#f4fff9";ctx.font="bold 64px Arial";ctx.textAlign="center";ctx.fillText(`${descending?"↓":"↑"} ${destination}`,128,88);}const signMaterial=new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,side:THREE.DoubleSide,depthTest:true,depthWrite:true,polygonOffset:true,polygonOffsetFactor:-2}),sign=new THREE.Mesh(new THREE.PlaneGeometry(3.2,1.6),signMaterial);sign.position.set(door.x,door.y+2.45,door.z-.42);scene.add(sign);}
    for(let i=0;i<5;i++){const x=-145+i*7,z=8+(i%2)*5,y=surfaceHeight(x,z);const ruin=addMesh(new THREE.BoxGeometry(2.3,4+rand(i+1500)*5,2.3),mat(0x69726a),x,y+2,z);ruin.rotation.y=rand(i+80);colliders.push({x,z,r:1.7});}
    for(let i=0;i<12;i++){const a=i/12*6.28,x=SWAMP_X+Math.cos(a)*43,z=SWAMP_Z+Math.sin(a)*43,y=surfaceHeight(x,z);const stump=addMesh(new THREE.CylinderGeometry(.45,.65,1.5,7),mat(0x4d3825),x,y+.7,z);stump.rotation.z=(rand(i+1600)-.5)*.25;colliders.push({x,z,r:.75});}

    const tower = new THREE.Group(); tower.position.set(0,surfaceHeight(0,TOWER_Z),TOWER_Z); scene.add(tower);
    const towerMat=mat(0x35424a), rust=mat(0x9b5236), glow=mat(0x42515c);
    for(const x of [-1.5,1.5]) for(const z of [-1.5,1.5]) { const p=new THREE.Mesh(new THREE.CylinderGeometry(.16,.25,11,6),towerMat); p.position.set(x,5.5,z); p.rotation.z=x*.035; p.castShadow=true; tower.add(p); }
    for(let y=1;y<11;y+=2){ const b1=new THREE.Mesh(new THREE.BoxGeometry(3.4,.12,.12),rust); b1.position.y=y;tower.add(b1); const b2=b1.clone();b2.rotation.y=Math.PI/2;tower.add(b2); }
    const dish=new THREE.Mesh(new THREE.SphereGeometry(1.7,12,6,0,Math.PI*2,0,Math.PI/2),glow); dish.position.y=11.7;dish.rotation.x=-.6;tower.add(dish);
    const beacon=new THREE.PointLight(0xff4e3a,0,15); beacon.position.y=12.5;tower.add(beacon);
    const consoleBox=new THREE.Mesh(new THREE.BoxGeometry(1.7,1.2,1),mat(0x1e292e));consoleBox.position.set(2.4,.7,0);tower.add(consoleBox);
    const consoleLight=new THREE.Mesh(new THREE.BoxGeometry(.7,.22,.03),mat(0xd34634,1,0xd34634));consoleLight.position.set(2.4,.85,.51);tower.add(consoleLight);
    colliders.push({x:0,z:TOWER_Z,r:2.05},{x:2.4,z:TOWER_Z,r:1.05});

    const pickups:{id:number;mesh:THREE.Object3D;type:"scrap"|"cell";taken:boolean;baseY:number}[]=[];
    const spots=Array.from({length:40},(_,i)=>{const a=rand(i+810)*Math.PI*2,r=20+rand(i+920)*188;return [Math.cos(a)*r,Math.sin(a)*r];});
    spots.forEach(([x,z],i)=>{
      const type=i%4===0?"cell":"scrap";
      const g=new THREE.Group();g.position.set(x,surfaceHeight(x,z)+.8,z);scene.add(g);
      if(type==="cell"){
        const body=new THREE.Mesh(new THREE.CylinderGeometry(.34,.34,.85,8),mat(0x56d8e8,0.35,0x178697));body.rotation.z=Math.PI/2;g.add(body);
        const ring=new THREE.Mesh(new THREE.TorusGeometry(.37,.07,6,12),mat(0xffd76a,0.5,0x8d5d10));ring.rotation.y=Math.PI/2;g.add(ring);
      }else{
        const body=new THREE.Mesh(new THREE.DodecahedronGeometry(.55,0),mat(0xd59a54));body.scale.set(1.2,.55,.8);g.add(body);
        const bolt=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.75,6),mat(0x42505a));bolt.rotation.z=1;g.add(bolt);
      }
      pickups.push({id:i,mesh:g,type,taken:false,baseY:g.position.y});
    });
    const survivalNodes:{mesh:THREE.Object3D;type:"wood"|"stone";taken:boolean}[]=[];for(let i=0;i<24;i++){const second=i>=12,cx=second?SECOND_X:0,a=rand(i+3100)*6.28,r=18+rand(i+3200)*(second?82:175),x=cx+Math.cos(a)*r,z=Math.sin(a)*r,type=i%2?"wood":"stone",g=new THREE.Group();g.position.set(x,surfaceHeight(x,z)+.45,z);if(type==="wood"){const log=new THREE.Mesh(new THREE.CylinderGeometry(.25,.32,1.5,7),mat(0x815333));log.rotation.z=Math.PI/2;g.add(log);}else g.add(new THREE.Mesh(new THREE.DodecahedronGeometry(.55,0),mat(0x89918c)));scene.add(g);survivalNodes.push({mesh:g,type,taken:false});}
    const treasureChests:{mesh:THREE.Group;taken:boolean}[]=[];[[-172,132],[148,-150],[SECOND_X+72,62]].forEach(([x,z])=>{const g=new THREE.Group();g.position.set(x,surfaceHeight(x,z)+.45,z);const box=new THREE.Mesh(new THREE.BoxGeometry(1.25,.75,.9),mat(0x7e4d28));g.add(box);const lid=new THREE.Mesh(new THREE.BoxGeometry(1.32,.28,.95),mat(0xd5a13d,0.55,0x714713));lid.position.y=.48;g.add(lid);scene.add(g);treasureChests.push({mesh:g,taken:false});});
    const animals:THREE.Group[]=[];for(let i=0;i<18;i++){const g=new THREE.Group(),second=i>=6,cx=second?SECOND_X:0,a=rand(i+3500)*6.28,r=28+rand(i+3600)*(second?72:120);g.position.set(cx+Math.cos(a)*r,0,Math.sin(a)*r);const bodyA=new THREE.Mesh(new THREE.CapsuleGeometry(.35,.7,3,6),mat(i%3===0?0xd0a76a:i%2?0xb98252:0x9c6b43));bodyA.rotation.z=Math.PI/2;bodyA.position.y=.75;g.add(bodyA);const headA=new THREE.Mesh(new THREE.IcosahedronGeometry(.28,0),bodyA.material);headA.position.set(.65,1.05,0);g.add(headA);for(const x of [-.38,.38])for(const z of [-.2,.2]){const legA=new THREE.Mesh(new THREE.CylinderGeometry(.06,.07,.65,5),mat(0x5c3d29));legA.position.set(x,.35,z);g.add(legA);}scene.add(g);animals.push(g);}
    const fish:THREE.Mesh[]=[];for(let i=0;i<18;i++){const f=new THREE.Mesh(new THREE.ConeGeometry(.22,.8,6),mat(i%3===0?0xffc85a:0x49a9b7));f.rotation.z=Math.PI/2;f.position.set(235+rand(i)*200,OCEAN_LEVEL-1.8-rand(i+2)*3,(rand(i+3)-.5)*120);scene.add(f);fish.push(f);}
    const raft=new THREE.Group();for(let i=-2;i<=2;i++){const log=new THREE.Mesh(new THREE.CylinderGeometry(.28,.34,3.8,7),mat(0x815333));log.rotation.x=Math.PI/2;log.position.x=i*.58;raft.add(log);}const mast=new THREE.Mesh(new THREE.CylinderGeometry(.08,.1,3.2,6),mat(0x5b3c25));mast.position.y=1.55;raft.add(mast);const sail=new THREE.Mesh(new THREE.PlaneGeometry(2.2,2),mat(0xe8d7ad));sail.position.set(.95,2,0);sail.rotation.y=Math.PI/2;raft.add(sail);raft.position.set(232,OCEAN_LEVEL+.15,12);raft.visible=false;scene.add(raft);

    const player=new THREE.Group(),model=new THREE.Group();scene.add(player);player.add(model);player.position.set(0,surfaceHeight(0,90),90);
    const look=appearanceRef.current;
    const shirt=mat(look.shirt), skin=mat(look.skin), pants=mat(look.pants), packMat=mat(look.pack), hairMat=mat(look.hair), boot=mat(0x17262b);
    lookMaterials.current={shirt,skin,pants,pack:packMat,hair:hairMat};
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.43,.74,4,8),shirt);body.position.y=1.22;body.castShadow=true;model.add(body);
    const pack=new THREE.Mesh(new THREE.BoxGeometry(.67,.78,.36,2,2,1),packMat);pack.position.set(0,1.25,.43);pack.castShadow=true;model.add(pack);
    const packFlap=new THREE.Mesh(new THREE.BoxGeometry(.58,.23,.1),packMat);packFlap.position.set(0,1.47,.65);model.add(packFlap);
    const bedroll=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.72,8),boot);bedroll.rotation.z=Math.PI/2;bedroll.position.set(0,.82,.55);model.add(bedroll);
    for(const x of [-.23,.23]){const strap=new THREE.Mesh(new THREE.BoxGeometry(.06,.72,.05),boot);strap.position.set(x,1.25,.64);model.add(strap);}
    const neck=new THREE.Mesh(new THREE.CylinderGeometry(.15,.17,.18,8),skin);neck.position.y=1.83;model.add(neck);
    const head=new THREE.Mesh(new THREE.IcosahedronGeometry(.38,1),skin);head.position.y=2.12;head.castShadow=true;model.add(head);
    const faceMat=new THREE.MeshStandardMaterial({color:0x1c1b1e, roughness:0.72, metalness:0.08});
    const faceDetails=new THREE.Group();head.add(faceDetails);
    const leftEye=new THREE.Mesh(new THREE.SphereGeometry(.05,12,12),faceMat);leftEye.position.set(-.12,.06,-.31);faceDetails.add(leftEye);
    const rightEye=new THREE.Mesh(new THREE.SphereGeometry(.05,12,12),faceMat);rightEye.position.set(.12,.06,-.31);faceDetails.add(rightEye);
    const nose=new THREE.Mesh(new THREE.ConeGeometry(.045,.16,12),faceMat);nose.rotation.x=Math.PI/2;nose.position.set(0,-.02,-.36);faceDetails.add(nose);
    const mouth=new THREE.Mesh(new THREE.BoxGeometry(.18,.04,.02),faceMat);mouth.position.set(0,-.18,-.32);faceDetails.add(mouth);
    const hair=new THREE.Mesh(new THREE.SphereGeometry(.39,8,5,0,Math.PI*2,0,Math.PI*.48),hairMat);hair.position.y=2.23;model.add(hair);
    const limb=(x:number,y:number,material:THREE.Material,length:number,radius:number)=>{const pivot=new THREE.Group();pivot.position.set(x,y,0);const mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius*.9,length,7),material);mesh.position.y=-length/2;mesh.castShadow=true;pivot.add(mesh);model.add(pivot);return pivot;};
    const leftArm=limb(-.56,1.58,shirt,.72,.13),rightArm=limb(.56,1.58,shirt,.72,.13);
    bodyShape.current={player:model,body,leftArm,rightArm};
    const width=.78+look.build*.5,height=.82+look.height*.38,arms=.82+look.muscle*.55;model.scale.set(width,height,width);body.scale.set(1+look.muscle*.18,1,1+look.muscle*.18);leftArm.scale.set(arms,1,arms);rightArm.scale.set(arms,1,arms);leftArm.position.x=-(.48+look.build*.11+look.muscle*.07);rightArm.position.x=-leftArm.position.x;
    const leftHand=new THREE.Mesh(new THREE.SphereGeometry(.14,7,6),skin);leftHand.position.y=-.75;leftArm.add(leftHand);
    const rightHand=leftHand.clone();rightArm.add(rightHand);
    const leftLeg=limb(-.23,.82,pants,.83,.17),rightLeg=limb(.23,.82,pants,.83,.17);
    const leftBoot=new THREE.Mesh(new THREE.BoxGeometry(.28,.2,.45),boot);leftBoot.position.set(0,-.86,-.08);leftLeg.add(leftBoot);
    const rightBoot=leftBoot.clone();rightLeg.add(rightBoot);

    for(let i=0;i<28;i++){
      const a=i<5?(i/5*Math.PI*2):rand(i+1810)*Math.PI*2;
      const r=i<5?5.5+rand(i+1830)*3:18+rand(i+1840)*185;
      const x=Math.cos(a)*r,z=(i<5?90:0)+Math.sin(a)*r,radius=.28+rand(i+1860)*.16;
      const mesh=new THREE.Mesh(new THREE.DodecahedronGeometry(radius,0),rockMaterial);
      mesh.position.set(x,surfaceHeight(x,z)+radius*.78,z);mesh.rotation.set(rand(i)*3,rand(i+2)*4,rand(i+5)*2);mesh.castShadow=!lowPower;mesh.receiveShadow=!lowPower;scene.add(mesh);
      throwableRocks.push({id:rockCount+i,mesh,velocity:null,held:false,radius,baseScale:new THREE.Vector3(1,1,1),restPosition:mesh.position.clone(),instanceIndex:null,collider:null});
    }
    const activateRock=(rock:ThrowableRock)=>{
      if(!rock.mesh){
        rock.mesh=new THREE.Mesh(new THREE.DodecahedronGeometry(1,0),rockMaterial);rock.mesh.position.copy(rock.restPosition);rock.mesh.scale.copy(rock.baseScale);rock.mesh.castShadow=rock.mesh.receiveShadow=!lowPower;scene.add(rock.mesh);
        if(rock.instanceIndex!==null){dummy.position.set(0,-1000,0);dummy.scale.set(0,0,0);dummy.updateMatrix();rocks.setMatrixAt(rock.instanceIndex,dummy.matrix);rocks.instanceMatrix.needsUpdate=true;}
        if(rock.collider){const index=colliders.indexOf(rock.collider);if(index>=0)colliders.splice(index,1);rock.collider=null;}
      }
      return rock.mesh;
    };

    const enemy=new THREE.Group();scene.add(enemy);enemy.position.set(165,surfaceHeight(165,145)+.2,145);
    const ebody=new THREE.Mesh(new THREE.CapsuleGeometry(.55,1.4,4,7),mat(0x17272d,0.7,0x06171d));ebody.position.y=1.2;enemy.add(ebody);
    for(const x of [-.2,.2]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.07,6,6),mat(0xff533d,1,0xff2200));eye.position.set(x,1.65,-.5);enemy.add(eye);}
    const enemyLight=new THREE.PointLight(0xff1f13,0,6);enemyLight.position.y=1.5;enemy.add(enemyLight);
    type Zombie={root:THREE.Group;leftArm:THREE.Group;rightArm:THREE.Group;leftLeg:THREE.Group;rightLeg:THREE.Group;floor:number;phase:number;stunnedUntil:number;lastHit:number};const zombies:Zombie[]=[];for(let i=0;i<23;i++){const root=new THREE.Group(),bodyZ=new THREE.Mesh(new THREE.CapsuleGeometry(.38,.7,3,6),mat(i%3===0?0x596f3d:0x4b5d43));bodyZ.position.y=1.15;root.add(bodyZ);const headZ=new THREE.Mesh(new THREE.IcosahedronGeometry(.34,0),mat(0x78905a));headZ.position.y=2;root.add(headZ);for(const ex of [-.12,.12]){const eyeZ=new THREE.Mesh(new THREE.SphereGeometry(.035,5,5),mat(0xff4c2f,1,0xff2200));eyeZ.position.set(ex,2.05,.31);root.add(eyeZ);}const armZ=(x:number)=>{const p=new THREE.Group(),m=new THREE.Mesh(new THREE.CylinderGeometry(.09,.1,.78,6),mat(0x718451));p.position.set(x,1.55,0);m.position.y=-.36;p.add(m);root.add(p);return p;},legZ=(x:number)=>{const p=new THREE.Group(),m=new THREE.Mesh(new THREE.CylinderGeometry(.11,.13,.85,6),mat(0x273b39));p.position.set(x,.87,0);m.position.y=-.42;p.add(m);root.add(p);return p;},leftArmZ=armZ(-.48),rightArmZ=armZ(.48),leftLegZ=legZ(-.2),rightLegZ=legZ(.2),floor=i<14?0:1+(i-14)%3;if(floor>0){root.position.set(DUNGEON_X-25+rand(i)*50,DUNGEON_LEVELS[floor-1],DUNGEON_Z-22+rand(i+7)*44);}else{const second=i>=8,cx=second?SECOND_X:0,a=rand(i+4100)*6.28,r=second?55+rand(i)*45:75+rand(i)*115;root.position.set(cx+Math.cos(a)*r,0,Math.sin(a)*r);}root.visible=false;scene.add(root);zombies.push({root,leftArm:leftArmZ,rightArm:rightArmZ,leftLeg:leftLegZ,rightLeg:rightLegZ,floor,phase:rand(i)*6.28,stunnedUntil:0,lastHit:0});}
    zombies.slice(-3).forEach((boss,i)=>{boss.root.scale.setScalar(1.75+i*.12);const aura=new THREE.PointLight(0xff3c25,2.2,9);aura.position.y=2;boss.root.add(aura);});
    const dragon=new THREE.Group(),dragonMat=mat(0x8f1722),dragonScale=mat(0xd13a35),dragonWing=mat(0x5b101b),dragonDark=mat(0x351015);if(dragonWing instanceof THREE.MeshStandardMaterial)dragonWing.side=THREE.DoubleSide;scene.add(dragon);const dragonPart=(geo:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z:number)=>{const mesh=new THREE.Mesh(geo,material);mesh.position.set(x,y,z);mesh.castShadow=!lowPower;dragon.add(mesh);return mesh;};dragonPart(new THREE.BoxGeometry(4.2,3.2,7),dragonMat,0,0,0);dragonPart(new THREE.BoxGeometry(2.8,2.4,4),dragonScale,0,-.05,5.1);dragonPart(new THREE.BoxGeometry(2.35,1.45,2.8),dragonDark,0,-.35,8);dragonPart(new THREE.BoxGeometry(2.4,1.25,5),dragonMat,0,.1,-5.8);dragonPart(new THREE.BoxGeometry(1.5,.9,5.5),dragonScale,0,.1,-10.8);const wing=(side:number)=>{const pivot=new THREE.Group();pivot.position.set(side*2,1,0);const frame=new THREE.Mesh(new THREE.BoxGeometry(8,.18,.22),dragonScale);frame.position.x=side*4;const wingGeo=new THREE.BufferGeometry();wingGeo.setAttribute("position",new THREE.Float32BufferAttribute([0,0,2,side*8,0,-3,side*7,0,4],3));wingGeo.computeVertexNormals();const sail=new THREE.Mesh(wingGeo,dragonWing);pivot.add(frame,sail);dragon.add(pivot);return pivot;},dragonLeftWing=wing(-1),dragonRightWing=wing(1);for(const x of [-1.35,1.35]){dragonPart(new THREE.BoxGeometry(.65,2.2,.7),dragonScale,x,-2.3,1);dragonPart(new THREE.BoxGeometry(.55,.7,2.2),dragonDark,x,-3.15,1.7);const eye=dragonPart(new THREE.BoxGeometry(.35,.35,.12),mat(0xffd447,1,0xff5a00),x*.72,.35,9.42);eye.rotation.y=0;}for(let i=0;i<6;i++){const spine=dragonPart(new THREE.ConeGeometry(.3,1.15,4),dragonScale,0,2,-3.5+i*1.45);spine.rotation.z=Math.PI;}dragon.position.set(-115,24,-135);
    const secretNodes=[[-188,132],[190,-174],[SECOND_X-86,70],[SECOND_X+78,-64]].map(([x,z],i)=>{const mesh=addMesh(new THREE.OctahedronGeometry(.72),mat(0x7bfff0,.25,0x27d7c4),x,surfaceHeight(x,z)+1.1,z);const light=new THREE.PointLight(0x55ffe0,1.4,7);mesh.add(light);return {mesh,taken:false,id:i};});
    const coopPads=[[SECOND_X-12,18],[SECOND_X+12,18]].map(([x,z],i)=>{const mesh=addMesh(new THREE.CylinderGeometry(2.2,2.5,.35,16),mat(i?0xffb13b:0x4ee9d0,.3,i?0xa95c08:0x168d83),x,secondSurfaceHeight(x,z)+.15,z);return mesh;});let coopRewarded=false;
    const builtWalls:THREE.Mesh[]=[];

    type RemoteAvatar={root:THREE.Group;model:THREE.Group;leftArm:THREE.Group;rightArm:THREE.Group;leftLeg:THREE.Group;rightLeg:THREE.Group;target:THREE.Vector3;renderTarget:THREE.Vector3;velocity:THREE.Vector3;rotation:number;pose:string;anim:[number,number,number,number,number]|null;seen:number;sampleAt:number;serverUpdatedAt:number;rockMesh:THREE.Mesh|null;rockState:OnlineRock|null};
    const remotePlayers=new Map<string,RemoteAvatar>();
    let localVoiceStream:MediaStream|null=null,processVoiceSignals=(signals:VoiceSignal[],players:OnlinePlayer[])=>{};const voicePeers=new Map<string,RTCPeerConnection>(),voiceAudios=new Map<string,HTMLAudioElement>(),seenSignals=new Set<number>(),pendingCandidates=new Map<string,RTCIceCandidateInit[]>();
    const makeRemote=(p:OnlinePlayer)=>{
      const root=new THREE.Group(),avatar=new THREE.Group(),look={...DEFAULT_LOOK,...p.appearance};root.add(avatar);scene.add(root);
      const remoteMat=(color:number)=>new THREE.MeshStandardMaterial({color,roughness:.82,flatShading:true});
      const skinR=remoteMat(look.skin),shirtR=remoteMat(look.shirt),pantsR=remoteMat(look.pants),packR=remoteMat(look.pack),hairR=remoteMat(look.hair),bootsR=remoteMat(0x17262b);
      const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.43,.74,3,7),shirtR);torso.position.y=1.22;avatar.add(torso);
      const backpack=new THREE.Mesh(new THREE.BoxGeometry(.67,.78,.36),packR);backpack.position.set(0,1.25,.43);avatar.add(backpack);
      const face=new THREE.Mesh(new THREE.IcosahedronGeometry(.38,1),skinR);face.position.y=2.12;avatar.add(face);
      const faceMatR=new THREE.MeshStandardMaterial({color:0x1c1b1e, roughness:0.72, metalness:0.08});
      const faceDetailsR=new THREE.Group();face.add(faceDetailsR);
      const leftEyeR=new THREE.Mesh(new THREE.SphereGeometry(.05,12,12),faceMatR);leftEyeR.position.set(-.12,.06,-.31);faceDetailsR.add(leftEyeR);
      const rightEyeR=new THREE.Mesh(new THREE.SphereGeometry(.05,12,12),faceMatR);rightEyeR.position.set(.12,.06,-.31);faceDetailsR.add(rightEyeR);
      const noseR=new THREE.Mesh(new THREE.ConeGeometry(.045,.16,12),faceMatR);noseR.rotation.x=Math.PI/2;noseR.position.set(0,-.02,-.36);faceDetailsR.add(noseR);
      const mouthR=new THREE.Mesh(new THREE.BoxGeometry(.18,.04,.02),faceMatR);mouthR.position.set(0,-.18,-.32);faceDetailsR.add(mouthR);
      const cap=new THREE.Mesh(new THREE.SphereGeometry(.39,8,5,0,Math.PI*2,0,Math.PI*.48),hairR);cap.position.y=2.23;avatar.add(cap);
      const remoteLimb=(x:number,y:number,material:THREE.Material,length:number,radius:number)=>{const pivot=new THREE.Group(),mesh=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius*.9,length,6),material);pivot.position.set(x,y,0);mesh.position.y=-length/2;pivot.add(mesh);avatar.add(pivot);return pivot;};
      const leftArmR=remoteLimb(-.56,1.58,shirtR,.72,.13),rightArmR=remoteLimb(.56,1.58,shirtR,.72,.13),leftLegR=remoteLimb(-.23,.82,pantsR,.83,.17),rightLegR=remoteLimb(.23,.82,pantsR,.83,.17);
      const handR=new THREE.Mesh(new THREE.SphereGeometry(.14,7,6),skinR);handR.position.y=-.75;leftArmR.add(handR);rightArmR.add(handR.clone());
      const bootR=new THREE.Mesh(new THREE.BoxGeometry(.28,.2,.45),bootsR);bootR.position.set(0,-.86,-.08);leftLegR.add(bootR);rightLegR.add(bootR.clone());
      const width=.78+look.build*.5,height=.82+look.height*.38,armScale=.82+look.muscle*.55;avatar.scale.set(width,height,width);torso.scale.set(1+look.muscle*.18,1,1+look.muscle*.18);leftArmR.scale.set(armScale,1,armScale);rightArmR.scale.set(armScale,1,armScale);
      const canvas=document.createElement("canvas");canvas.width=256;canvas.height=64;const ctx2=canvas.getContext("2d");if(ctx2){ctx2.font="bold 26px Arial";ctx2.textAlign="center";ctx2.fillStyle="#071719cc";ctx2.fillRect(0,8,256,44);ctx2.fillStyle="#eafff5";ctx2.fillText(p.name,128,40);}const label=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(canvas),transparent:true,depthTest:false}));label.position.y=2.9;label.scale.set(3.2,.8,1);root.add(label);
      const target=new THREE.Vector3(p.x/100,p.y/100,p.z/100);root.position.copy(target);root.rotation.y=p.rotation/100;
      const sampleAt=performance.now();return {root,model:avatar,leftArm:leftArmR,rightArm:rightArmR,leftLeg:leftLegR,rightLeg:rightLegR,target,renderTarget:target.clone(),velocity:new THREE.Vector3(),rotation:p.rotation/100,pose:p.pose,anim:p.anim,seen:sampleAt,sampleAt,serverUpdatedAt:p.updatedAt,rockMesh:null,rockState:null};
    };

    let yaw=0, pitch=.32, last=performance.now(), lastHud=0, lastSync=0,lastNpcSync=0,lastFullSync=0,lastBoundaryNotice=0, gameTime=.08,lastRoomServerNow=0, health=100, oxygen=100, scrap=0, cells=0, wood=0,stone=0,treasure=0,discoveries=0,craftedRaft=false,ridingRaft=false,downed=false,downedTimer=0,reviveProgress=0,won=false, gameOver=false, damagedAt=0, messageUntil=0, syncInFlight=0, localPose="idle",packHealReady=true;
    let jumpHeight=0, jumpVelocity=0, jumpWasDown=false, swimDepth=0, cameraSwimPose=0, cameraInWater=false, heldRock:ThrowableRock|null=null, lastActionRock:ThrowableRock|null=null, isAiming=false, springCooldown=0, climbing=false, climbHeight=0,climbFort=-1,dungeonLevel=0,falling=false,fallY=0,fallVelocity=0,lastSupportY=surfaceHeight(0,90);const discovered=new Set<number>();
    const velocity=new THREE.Vector3(),moveDir=new THREE.Vector3(),zeroVelocity=new THREE.Vector3(),proposedPosition=new THREE.Vector3(),zombieDirection=new THREE.Vector3(),wanderDirection=new THREE.Vector3(),enemyDirection=new THREE.Vector3(),cameraTarget=new THREE.Vector3(),desiredCamera=new THREE.Vector3();
    const sky=new THREE.Color(),nightSky=new THREE.Color(0x07121f),daySky=new THREE.Color(0x91d6d0),eventSky=new THREE.Color(0x521629);
    const notice=(message:string,secs=2.5)=>{messageUntil=performance.now()+secs*1000;setHud(h=>({...h,message}));};
    const rewardProgress=(xpGain:number,coinGain:number,achievement?:string)=>setProgress(p=>{const xp=p.xp+xpGain,level=1+Math.floor(xp/100),newAchievement=achievement&&!p.achievements.includes(achievement),achievements=newAchievement?[...p.achievements,achievement]:p.achievements;return {...p,xp,coins:p.coins+coinGain,level,unlocks:Math.max(p.unlocks,Math.floor(level/2)),achievements};});
    const sound=(freq:number,dur=.12)=>{try{const ac=new AudioContext();const o=ac.createOscillator(),g=ac.createGain();o.frequency.value=freq;o.type="sine";g.gain.setValueAtTime(.07,ac.currentTime);g.gain.exponentialRampToValueAtTime(.001,ac.currentTime+dur);o.connect(g).connect(ac.destination);o.start();o.stop(ac.currentTime+dur);}catch{}};
    const craftRaft=()=>{if(craftedRaft){notice("สร้างแพเรียบร้อยแล้ว • เข้าใกล้แพแล้วกด R");return;}if(wood>=collectionQuest.wood&&stone>=collectionQuest.stone){wood-=collectionQuest.wood;stone-=collectionQuest.stone;craftedRaft=true;raft.visible=true;sound(720,.35);notice("สร้างแพสำเร็จ! พบแพที่ชายฝั่งตะวันออก",4);}else notice(`ต้องการไม้ ${Math.max(0,collectionQuest.wood-wood)} และหิน ${Math.max(0,collectionQuest.stone-stone)} เพิ่ม`,3);};
    const toggleRaft=()=>{if(!craftedRaft)return;if(ridingRaft){ridingRaft=false;notice("ลงจากแพแล้ว");}else if(player.position.distanceTo(raft.position)<4){ridingRaft=true;notice("ขึ้นแพแล้ว • ใช้ WASD บังคับ",3);}else notice("เดินหรือว่ายเข้าใกล้แพก่อน");};
    const updateRemoteRock=(avatar:RemoteAvatar,state:OnlineRock|null)=>{
      avatar.rockState=state;if(!state){if(avatar.rockMesh)avatar.rockMesh.visible=false;return;}
      if(!avatar.rockMesh){avatar.rockMesh=new THREE.Mesh(new THREE.DodecahedronGeometry(1,0),rockMaterial);avatar.rockMesh.castShadow=!lowPower;scene.add(avatar.rockMesh);}
      const mesh=avatar.rockMesh;mesh.visible=true;mesh.scale.set(...state.scale);
      if(state.state==="held"){avatar.model.add(mesh);const s=new THREE.Vector3();avatar.model.getWorldScale(s);mesh.scale.set(state.scale[0]/s.x,state.scale[1]/s.y,state.scale[2]/s.z);mesh.position.set(.72,1.12,-.28);mesh.rotation.set(.2,0,0);}
      else{scene.attach(mesh);mesh.scale.set(...state.scale);mesh.position.set(...state.position);}
    };
    const applyOnlineState=(state:OnlineState)=>{scrap=state.room.scrap;cells=state.room.cells;if(state.messages)setChatMessages(state.messages);if(state.room.serverNow>lastRoomServerNow){lastRoomServerNow=state.room.serverNow;gameTime=state.room.time;}for(const id of state.collected){const pickup=pickups[id];if(pickup){pickup.taken=true;pickup.mesh.visible=false;}}const stamp=performance.now(),authorityId=[onlineSession?.playerId??"",...state.players.map(p=>p.id)].filter(Boolean).sort()[0];for(const remote of state.players){const snap=(remote.appearance as Appearance&{_npcs?:NpcSnapshot})._npcs;if(remote.id===authorityId&&snap){snap.z.forEach((p,i)=>{if(zombies[i]){zombies[i].root.position.set(p[0],p[1],p[2]);zombies[i].root.rotation.y=p[3];}});dragon.position.set(snap.d[0],snap.d[1],snap.d[2]);dragon.rotation.y=snap.d[3];}let avatar=remotePlayers.get(remote.id);if(!avatar){avatar=makeRemote(remote);remotePlayers.set(remote.id,avatar);}avatar.seen=stamp;if(remote.updatedAt<avatar.serverUpdatedAt)continue;const nextTarget=new THREE.Vector3(remote.x/100,remote.y/100,remote.z/100);const sampleSeconds=(remote.updatedAt-avatar.serverUpdatedAt)/1000;if(sampleSeconds>.04){const measuredVelocity=nextTarget.clone().sub(avatar.target).divideScalar(sampleSeconds);if(measuredVelocity.length()>11)measuredVelocity.setLength(11);avatar.velocity.lerp(measuredVelocity,.55);}avatar.target.copy(nextTarget);avatar.sampleAt=stamp;avatar.serverUpdatedAt=remote.updatedAt;avatar.rotation=remote.rotation/100;avatar.pose=remote.pose;avatar.anim=remote.anim;updateRemoteRock(avatar,remote.rock);}processVoiceSignals(state.signals??[],state.players);for(const [id,avatar] of remotePlayers)if(stamp-avatar.seen>2500){scene.remove(avatar.root);if(avatar.rockMesh)scene.remove(avatar.rockMesh);remotePlayers.delete(id);}setHud(h=>({...h,scrap,cells,onlineCount:state.players.length+1}));if(state.room.won&&!won){won=true;gameOver=true;beacon.intensity=12;beacon.color.set(0x4dffb8);setEnd("won");}};
    const onlinePost=async(payload:Record<string,unknown>)=>{if(!onlineSession)return null;const response=await fetch("/api/multiplayer",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({...payload,...onlineSession})});if(!response.ok)return null;const state=await response.json() as OnlineState;applyOnlineState(state);return state;};
    chatSend.current=(message:string)=>{const clean=message.trim();if(clean)void onlinePost({action:"chat",message:clean});};
    const offered=new Set<string>();
    const sendVoiceSignal=(to:string,payload:VoiceSignal["payload"])=>{void onlinePost({action:"signal",to,payload});};
    const ensureVoicePeer=(remoteId:string)=>{let pc=voicePeers.get(remoteId);if(pc)return pc;pc=new RTCPeerConnection({iceServers:[{urls:["stun:stun.cloudflare.com:3478","stun:stun.l.google.com:19302"]}],iceCandidatePoolSize:6});voicePeers.set(remoteId,pc);localVoiceStream?.getAudioTracks().forEach(track=>{const sender=pc!.addTrack(track,localVoiceStream!),transceiver=pc!.getTransceivers().find(t=>t.sender===sender),codecs=RTCRtpReceiver.getCapabilities("audio")?.codecs??[],opus=codecs.filter(c=>c.mimeType.toLowerCase()==="audio/opus"),others=codecs.filter(c=>c.mimeType.toLowerCase()!=="audio/opus");if(transceiver&&opus.length)transceiver.setCodecPreferences([...opus,...others]);});pc.onicecandidate=e=>{if(e.candidate)sendVoiceSignal(remoteId,{type:"candidate",candidate:e.candidate.toJSON()});};pc.ontrack=e=>{let audio=voiceAudios.get(remoteId);if(!audio){audio=new Audio();audio.autoplay=true;audio.playsInline=true;audio.preload="auto";voiceAudios.set(remoteId,audio);}if(audio.srcObject!==e.streams[0])audio.srcObject=e.streams[0];audio.muted=false;audio.playbackRate=1;void audio.play().catch(()=>setVoiceError("แตะปุ่มไมค์อีกครั้งเพื่อเริ่มเล่นเสียง"));};pc.onconnectionstatechange=()=>{if(pc?.connectionState==="connected")setVoiceError("");if(pc?.connectionState==="failed"){pc.close();voicePeers.delete(remoteId);offered.delete(remoteId);pendingCandidates.delete(remoteId);setVoiceError("กำลังเชื่อมต่อเสียงใหม่อัตโนมัติ…");}};return pc;};
    const flushCandidates=async(remoteId:string,pc:RTCPeerConnection)=>{const queue=pendingCandidates.get(remoteId)??[];pendingCandidates.delete(remoteId);for(const candidate of queue)try{await pc.addIceCandidate(candidate);}catch{}};
    processVoiceSignals=(signals,players)=>{if(!localVoiceStream||!onlineSession)return;for(const remote of players){if(onlineSession.playerId<remote.id&&!offered.has(remote.id)){offered.add(remote.id);const pc=ensureVoicePeer(remote.id);void pc.createOffer({offerToReceiveAudio:true}).then(offer=>pc.setLocalDescription(offer).then(()=>sendVoiceSignal(remote.id,{type:"offer",sdp:offer}))).catch(()=>offered.delete(remote.id));}}for(const signal of signals){if(seenSignals.has(signal.id))continue;seenSignals.add(signal.id);void(async()=>{const pc=ensureVoicePeer(signal.fromId),p=signal.payload;try{if(p.type==="offer"&&p.sdp){await pc.setRemoteDescription(p.sdp);await flushCandidates(signal.fromId,pc);const answer=await pc.createAnswer();await pc.setLocalDescription(answer);sendVoiceSignal(signal.fromId,{type:"answer",sdp:answer});}else if(p.type==="answer"&&p.sdp){await pc.setRemoteDescription(p.sdp);await flushCandidates(signal.fromId,pc);}else if(p.type==="candidate"&&p.candidate){if(pc.remoteDescription)await pc.addIceCandidate(p.candidate);else{const queue=pendingCandidates.get(signal.fromId)??[];queue.push(p.candidate);pendingCandidates.set(signal.fromId,queue);}}}catch{setVoiceError("สัญญาณเสียงขัดข้อง กำลังลองเชื่อมต่อใหม่…");}})();}};
    voiceToggle.current=()=>{void(async()=>{if(!onlineSession){setVoiceError("ต้องเข้าเล่นออนไลน์ก่อนจึงจะใช้เสียงได้");return;}if(localVoiceStream){localVoiceStream.getTracks().forEach(t=>t.stop());localVoiceStream=null;voicePeers.forEach(p=>p.close());voicePeers.clear();voiceAudios.forEach(a=>{a.pause();a.srcObject=null;});voiceAudios.clear();offered.clear();setVoiceEnabled(false);notice("ปิดไมโครโฟนแล้ว");return;}try{localVoiceStream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:{ideal:1},sampleRate:{ideal:48000},sampleSize:{ideal:16},echoCancellation:true,noiseSuppression:true,autoGainControl:false},video:false});setVoiceEnabled(true);setVoiceError("");notice("เปิดเสียงตามระยะแล้ว • เข้าใกล้เพื่อนเพื่อคุย",4);void onlinePost({action:"sync",x:player.position.x,y:player.position.y,z:player.position.z,rotation:player.rotation.y,pose:localPose,appearance:appearanceRef.current});}catch{setVoiceError("ไม่สามารถเปิดไมโครโฟนได้ กรุณาอนุญาตสิทธิ์ไมค์ในเบราว์เซอร์");setVoiceEnabled(false);}})();};
    repair.current=()=>{
      if(player.position.distanceTo(tower.position)>5) return;
      if(onlineSession){void onlinePost({action:"repair",requiredScrap:collectionQuest.scrap,requiredCells:collectionQuest.cells});return;}
      if(scrap>=collectionQuest.scrap&&cells>=collectionQuest.cells){scrap-=collectionQuest.scrap;cells-=collectionQuest.cells;won=true;gameOver=true;beacon.intensity=12;beacon.color.set(0x4dffb8);consoleLight.material=mat(0x4dffb8,1,0x23c987);sound(880,.7);setEnd("won");setHud(h=>({...h,scrap,cells,message:"ส่งสัญญาณสำเร็จ!"}));}
      else notice(`ยังขาด เศษโลหะ ${Math.max(0,collectionQuest.scrap-scrap)} • เซลล์พลังงาน ${Math.max(0,collectionQuest.cells-cells)}`,4);
    };
    const throwHeldRock=(aimed:boolean)=>{
      if(!heldRock)return;
      const rock=heldRock,mesh=activateRock(rock);scene.attach(mesh);mesh.scale.copy(rock.baseScale);rock.held=false;
      const direction=new THREE.Vector3();camera.getWorldDirection(direction);direction.normalize();
      const power=aimed?18:11;rock.velocity=direction.multiplyScalar(power).add(new THREE.Vector3(0,aimed?2.4:3.4,0));
      lastActionRock=rock;heldRock=null;isAiming=false;setCarryingRock(false);setAimingRock(false);rightArm.remove(mesh);sound(aimed?310:260,.1);notice(aimed?"โยนหินแบบเล็งเป้า":"โยนหิน");
    };
    const pickupOrThrow=()=>{
      if(heldRock){throwHeldRock(isAiming);return;}
      let nearest:ThrowableRock|null=null,best=3.25;
      for(const rock of throwableRocks){if(rock.held||rock.velocity)continue;const position=rock.mesh?.position??rock.restPosition;const d=player.position.distanceTo(position)-Math.min(1.2,rock.radius*.45);if(d<best){best=d;nearest=rock;}}
      if(!nearest){notice("เดินเข้าใกล้ก้อนหินอีกหน่อย");return;}
      const mesh=activateRock(nearest);heldRock=nearest;lastActionRock=nearest;nearest.held=true;nearest.velocity=null;rightHand.add(mesh);
      // Cancel the character/body/arm scale while carried so repeated
      // re-parenting can never multiply the rock's size.
      rightHand.updateWorldMatrix(true,false);const handScale=new THREE.Vector3();rightHand.getWorldScale(handScale);
      mesh.scale.set(nearest.baseScale.x/handScale.x,nearest.baseScale.y/handScale.y,nearest.baseScale.z/handScale.z);mesh.position.set(0,-.2,-.16);mesh.rotation.set(.2,0,0);setCarryingRock(true);sound(190,.1);notice("ยกหินแล้ว • คลิกซ้ายเพื่อโยน หรือกดเมาส์ขวาค้างเพื่อเล็ง",4);
    };
    const onlineRock=():OnlineRock|null=>{const rock=heldRock??lastActionRock;if(!rock)return null;const mesh=activateRock(rock),v=rock.velocity??new THREE.Vector3(),geometryScale=rock.instanceIndex===null?rock.radius:1;return {id:rock.id,state:rock.held?"held":rock.velocity?"thrown":"rest",radius:rock.radius,scale:[rock.baseScale.x*geometryScale,rock.baseScale.y*geometryScale,rock.baseScale.z*geometryScale],position:[mesh.position.x,mesh.position.y,mesh.position.z],velocity:[v.x,v.y,v.z]};};
    rockAction.current=pickupOrThrow;
    const toggleFortressLadder=()=>{if(climbing&&climbFort>=0){climbing=false;climbFort=-1;velocity.set(0,0,0);notice("ปล่อยบันไดแล้ว",1.5);return;}let nearest=-1,best=2.25;fortresses.forEach((f,i)=>{const d=Math.hypot(player.position.x-f.x,player.position.z-f.ladderZ);if(d<best){best=d;nearest=i;}});if(nearest<0){notice("เข้าใกล้บันไดป้อมก่อนกด L",2);return;}const f=fortresses[nearest];climbing=true;climbFort=nearest;climbHeight=THREE.MathUtils.clamp(player.position.y-f.ground,0,f.height+.2);jumpHeight=0;velocity.set(0,0,0);notice("เกาะบันไดแล้ว • W ขึ้น • S ลง • L ปล่อย",3);};
    const useSurvivalPack=()=>{if(!packHealReady){notice("ชุดปฐมพยาบาลในกระเป๋าถูกใช้ไปแล้ว",2);return;}if(health>=100){notice("กระเป๋าเอาตัวรอด: ชุดปฐมพยาบาลพร้อมใช้ • กด B เมื่อบาดเจ็บ",3);return;}health=Math.min(100,health+35);packHealReady=false;sound(690,.25);notice("ใช้ชุดปฐมพยาบาลจากกระเป๋า • ฟื้นพลังชีวิต 35",3);};
    const buildBaseWall=()=>{if(dungeonLevel>0){notice("สร้างฐานได้เฉพาะบนเกาะ",2);return;}if(wood<2||stone<1){notice("กำแพงต้องใช้ไม้ 2 และหิน 1",2);return;}wood-=2;stone-=1;const forward=new THREE.Vector3(0,0,-4).applyAxisAngle(new THREE.Vector3(0,1,0),player.rotation.y),x=player.position.x+forward.x,z=player.position.z+forward.z,y=surfaceHeight(x,z),wall=addMesh(new THREE.BoxGeometry(5,2.8,.55),mat(0x795234),x,y+1.4,z);wall.rotation.y=player.rotation.y;builtWalls.push(wall);colliders.push({x,z,r:2.1});rewardProgress(12,3,builtWalls.length>=2?"ช่างสร้างฐาน":undefined);notice("สร้างกำแพงฐานแล้ว",2);};
    const useDungeonDoor=()=>{let nearest=-1,best=4.2;dungeonDoors.forEach((door,i)=>{const distance=Math.hypot(player.position.x-door.x,player.position.z-door.z);if(Math.abs(player.position.y-door.y)<5&&distance<best){best=distance;nearest=i;}});if(nearest<0){notice("เข้าใกล้ประตูรูนก่อนกด G",2);return;}const pair=nearest%2===0?nearest+1:nearest-1,destination=dungeonDoors[pair];dungeonLevel=destination.level;player.position.set(destination.x,destination.y+.12,destination.z+(pair%2===0?-3:3));velocity.set(0,0,0);jumpHeight=0;jumpVelocity=0;falling=false;lastSupportY=destination.y;sound(410,.2);notice(destination.level===0?"กลับขึ้นสู่เกาะแล้ว":`เข้าสู่ดันเจี้ยนชั้น ${destination.level}`,2.5);};
    const down=(e:KeyboardEvent)=>{keys.current[e.code]=true;if(e.code==="KeyE")repair.current();if(e.code==="KeyF"&&!e.repeat)pickupOrThrow();if(e.code==="KeyG"&&!e.repeat)useDungeonDoor();if(e.code==="KeyQ"&&!e.repeat)craftRaft();if(e.code==="KeyR"&&!e.repeat)toggleRaft();if(e.code==="KeyL"&&!e.repeat)toggleFortressLadder();if(e.code==="KeyB"&&!e.repeat)useSurvivalPack();if(e.code==="KeyV"&&!e.repeat)buildBaseWall();if(e.code==="Escape")document.exitPointerLock?.();};
    const up=(e:KeyboardEvent)=>{keys.current[e.code]=false;};
    const moveMouse=(e:MouseEvent)=>{if(document.pointerLockElement===renderer.domElement){yaw-=e.movementX*.0024;pitch=THREE.MathUtils.clamp(pitch+e.movementY*.002,cameraInWater?-1.12:-.32,cameraInWater?1.12:.92);}};
    const mouseDown=(e:MouseEvent)=>{if(document.pointerLockElement!==renderer.domElement)return;if(e.button===2&&heldRock){isAiming=true;setAimingRock(true);}else if(e.button===0&&heldRock)throwHeldRock(isAiming);};
    const mouseUp=(e:MouseEvent)=>{if(e.button===2){isAiming=false;setAimingRock(false);}};
    const preventMenu=(e:Event)=>e.preventDefault();
    addEventListener("keydown",down);addEventListener("keyup",up);addEventListener("mousemove",moveMouse);addEventListener("mousedown",mouseDown);addEventListener("mouseup",mouseUp);renderer.domElement.addEventListener("contextmenu",preventMenu);
    renderer.domElement.addEventListener("click",()=>{if(started&&!end)renderer.domElement.requestPointerLock?.();});

    const tick=()=>{
      const raf=requestAnimationFrame(tick); const now=performance.now(); const dt=Math.min((now-last)/1000,.05); last=now;
      if(started&&!gameOver&&!paused.current){
        gameTime=(gameTime+dt/230)%1; const angle=gameTime*Math.PI*2; const daylight=THREE.MathUtils.clamp(Math.sin(angle)*.85+.25,.07,1);
        sun.position.set(Math.cos(angle)*45,Math.sin(angle)*55,20);sun.intensity=.35+daylight*3.1;hemi.intensity=.3+daylight*1.9;
        sky.copy(nightSky).lerp(daySky,daylight);scene.background=sky;scene.fog.color.copy(sky);
        const night=daylight<.33,nightEvent=night&&Math.floor(gameTime*72)%3===0;if(nightEvent){sky.lerp(eventSky,.38);scene.fog.color.copy(sky);scene.fog.density=.0052;}else scene.fog.density=.0032;enemyLight.intensity=night?3:0;beacon.intensity=won?12:(night?2.5:0);
        const onMainNow=Math.hypot(player.position.x,player.position.z)<PLAY_RADIUS,onSecondNow=Math.hypot(player.position.x-SECOND_X,player.position.z-SECOND_Z)<SECOND_RADIUS-1,bridgeArea=onBridge(player.position.x,player.position.z),onBridgeNow=bridgeArea&&player.position.y>BRIDGE_Y-1.15,underBridge=bridgeArea&&!onBridgeNow,inOcean=dungeonLevel===0&&(underBridge||(!onMainNow&&!onSecondNow&&!onBridgeNow))&&player.position.x>WORLD_MIN_X&&player.position.x<WORLD_MAX_X&&Math.abs(player.position.z)<WORLD_Z_LIMIT;
        const inSwamp=Math.hypot(player.position.x-SWAMP_X,player.position.z-SWAMP_Z)<SWAMP_RADIUS-2&&surfaceHeight(player.position.x,player.position.z)<SWAMP_WATER-.7;
        const swimming=dungeonLevel===0&&(inSwamp||inOcean)&&jumpHeight<=.01&&!falling,waterLevel=inOcean?OCEAN_LEVEL:SWAMP_WATER;
        const wantsDive=swimming&&!!keys.current.KeyC,fastDive=wantsDive&&!!keys.current.ShiftLeft;
        const fwd=(keys.current.KeyW||keys.current.ArrowUp?1:0)-(keys.current.KeyS||keys.current.ArrowDown?1:0);
        const side=(keys.current.KeyD||keys.current.ArrowRight?1:0)-(keys.current.KeyA||keys.current.ArrowLeft?1:0);
        moveDir.set(side,0,-fwd).applyAxisAngle(THREE.Object3D.DEFAULT_UP,yaw);if(downed||climbing)moveDir.set(0,0,0);
        if(moveDir.lengthSq()>0){moveDir.normalize();const skillBoost=Math.min(1.8,(progressRef.current.level-1)*.12);velocity.lerp(moveDir.multiplyScalar((swimming?(keys.current.ShiftLeft?(wantsDive?6.2:5.8):3.5):keys.current.ShiftLeft?9:6)+skillBoost),.16);player.rotation.y=Math.atan2(-velocity.x,-velocity.z);}
        else velocity.lerp(zeroVelocity,.13);
        if(heldRock&&isAiming)player.rotation.y=yaw;
        const proposed=proposedPosition.copy(player.position).addScaledVector(velocity,dt);proposed.y=0;
        const activeColliders=dungeonLevel>0?dungeonColliders:colliders;for(const c of activeColliders){if("floor" in c&&c.floor!==dungeonLevel)continue;const dx=proposed.x-c.x,dz=proposed.z-c.z,min=c.r+.52;if(Math.abs(dx)>min||Math.abs(dz)>min)continue;const dist=Math.hypot(dx,dz);if(dist<min){const nx=dist>.001?dx/dist:1,nz=dist>.001?dz/dist:0;proposed.x=c.x+nx*min;proposed.z=c.z+nz*min;velocity.multiplyScalar(.72);}}
        const proposedOnMain=Math.hypot(proposed.x,proposed.z)<PLAY_RADIUS,proposedOnSecond=Math.hypot(proposed.x-SECOND_X,proposed.z)<SECOND_RADIUS-1,proposedBridge=onBridge(proposed.x,proposed.z),shoreEntry=dungeonLevel===0&&!inOcean&&!proposedOnMain&&!proposedOnSecond&&!proposedBridge;const outsideWorld=proposed.x<=WORLD_MIN_X||proposed.x>=WORLD_MAX_X||Math.abs(proposed.z)>=WORLD_Z_LIMIT;if(outsideWorld){proposed.x=THREE.MathUtils.clamp(proposed.x,WORLD_MIN_X+1,WORLD_MAX_X-1);proposed.z=THREE.MathUtils.clamp(proposed.z,-WORLD_Z_LIMIT+1,WORLD_Z_LIMIT-1);velocity.multiplyScalar(-.18);if(now-lastBoundaryNotice>1800){lastBoundaryNotice=now;notice("ถึงขอบเขตปลอดภัยของทะเลแล้ว",1.5);}}player.position.x=proposed.x;player.position.z=proposed.z;
        const jumpDown=!!keys.current.Space;
        if(jumpDown&&!jumpWasDown&&jumpHeight<=.001&&!swimming&&!falling){jumpVelocity=7.2;sound(260,.08);}
        jumpWasDown=jumpDown;jumpVelocity-=18*dt;jumpHeight+=jumpVelocity*dt;
        if(jumpHeight<0){jumpHeight=0;jumpVelocity=0;}
        springCooldown=Math.max(0,springCooldown-dt);if(jumpHeight<.08&&springCooldown<=0){for(const spring of springs){if(Math.hypot(player.position.x-spring.position.x,player.position.z-spring.position.z)<1.65){jumpVelocity=15.5;jumpHeight=.12;springCooldown=.8;sound(520,.22);notice("สปริงดีดตัว!",1.2);break;}}}
        const ladderNear=Math.hypot(player.position.x-OBS_X,player.position.z-(OBS_Z-3.15))<1.35;if(!climbing&&ladderNear&&(keys.current.KeyW||keys.current.ArrowUp)){climbing=true;climbFort=-1;climbHeight=Math.max(0,player.position.y-obsGround);jumpHeight=0;velocity.set(0,0,0);notice("กำลังปีนบันได • W ขึ้น • S ลง",2);}if(climbing){const fort=climbFort>=0?fortresses[climbFort]:null,base=fort?.ground??obsGround,max=fort?.height??OBS_HEIGHT;player.position.x=fort?.x??OBS_X;player.position.z=fort?.ladderZ??(OBS_Z-3.15);const climbInput=(keys.current.KeyW||keys.current.ArrowUp?1:0)-(keys.current.KeyS||keys.current.ArrowDown?1:0);climbHeight=THREE.MathUtils.clamp(climbHeight+climbInput*dt*6.2,0,max+.2);if(climbHeight<=0&&climbInput<0){climbing=false;climbFort=-1;}if(fort&&climbHeight>=fort.height-.05&&climbInput>0){climbing=false;player.position.set(fort.x,fort.ground+fort.height+.5,fort.z);climbFort=-1;notice("ขึ้นถึงยอดป้อมแล้ว • สามารถเดินบนลานได้",2.5);}}
        const terrainY=dungeonLevel>0?DUNGEON_LEVELS[dungeonLevel-1]:inOcean?OCEAN_LEVEL-11:surfaceHeight(player.position.x,player.position.z);let platformY=terrainY;for(const f of fortresses){if(Math.hypot(player.position.x-f.x,player.position.z-f.z)<f.radius+.45&&player.position.y>f.ground+f.height-2)platformY=Math.max(platformY,f.ground+f.height+.5);}const groundY=platformY,maxDepth=inOcean?9:Math.max(.12,SWAMP_WATER-groundY-.75);
        if(swimming){if(wantsDive)swimDepth+=dt*(fastDive?4.3:1.65);else if(jumpDown)swimDepth-=dt*4.8;else swimDepth-=dt*.9;swimDepth=THREE.MathUtils.clamp(swimDepth,0,maxDepth);}else swimDepth=0;
        const underwater=swimming&&swimDepth>.82,swimPose=swimming?THREE.MathUtils.smoothstep(swimDepth,.18,1.05):0;cameraSwimPose=swimPose;cameraInWater=swimming;
        if(underwater&&!downed){oxygen=Math.max(0,oxygen-dt*(fastDive?6.5:4.2));if(oxygen<=0){health=Math.max(0,health-dt*14);if(messageUntil<now)notice("ออกซิเจนหมด! กด Space เพื่อขึ้นสู่ผิวน้ำ",1.2);if(health<=0){downed=true;downedTimer=15;reviveProgress=0;notice("คุณล้มลง • เพื่อนมีเวลา 15 วินาทีเพื่อช่วย",4);}}}else oxygen=Math.min(100,oxygen+dt*18);
        const airborne=jumpHeight>.025||falling;
        const moving=velocity.length()>.45, stride=moving?Math.sin(now*(keys.current.ShiftLeft ? .014 : .010))*.72:0;
        localPose=downed?"downed":underwater?"underwater":swimming?(keys.current.ShiftLeft?"swim-fast":"swim"):airborne?"jump":moving?(keys.current.ShiftLeft?"run":"walk"):"idle";
        // Lock into an athletic split-stride in the air; walking oscillation resumes only after landing.
        const swimStroke=swimming?Math.sin(now*(underwater?.006:keys.current.ShiftLeft?.007:.0045)):0;
        const surfaceLeftLeg=.16+swimStroke*.22,surfaceRightLeg=.16-swimStroke*.22,diveLeftLeg=.45+swimStroke*.4,diveRightLeg=.45-swimStroke*.4;
        const surfaceLeftArm=.18+swimStroke*.7,surfaceRightArm=.18-swimStroke*.7,diveLeftArm=1.05+swimStroke*.55,diveRightArm=1.05-swimStroke*.55;
        const leftLegTarget=airborne?-1.02:swimming?THREE.MathUtils.lerp(surfaceLeftLeg,diveLeftLeg,swimPose):-stride, rightLegTarget=airborne?.78:swimming?THREE.MathUtils.lerp(surfaceRightLeg,diveRightLeg,swimPose):stride;
        const leftArmTarget=airborne?.72:swimming?THREE.MathUtils.lerp(surfaceLeftArm,diveLeftArm,swimPose):stride, rightArmTarget=heldRock?(isAiming?1.42:.65):airborne?-.88:swimming?THREE.MathUtils.lerp(surfaceRightArm,diveRightArm,swimPose):-stride;
        const poseBlend=airborne?.22:.3;
        leftLeg.rotation.x=THREE.MathUtils.lerp(leftLeg.rotation.x,leftLegTarget,poseBlend);
        rightLeg.rotation.x=THREE.MathUtils.lerp(rightLeg.rotation.x,rightLegTarget,poseBlend);
        leftArm.rotation.x=THREE.MathUtils.lerp(leftArm.rotation.x,leftArmTarget,poseBlend);
        rightArm.rotation.x=THREE.MathUtils.lerp(rightArm.rotation.x,rightArmTarget,poseBlend);
        const armSpread=THREE.MathUtils.lerp(.62,.2,swimPose),legSpread=THREE.MathUtils.lerp(.2,.08,swimPose);
        leftArm.rotation.z=THREE.MathUtils.lerp(leftArm.rotation.z,swimming?armSpread+swimStroke*.12:0,.18);rightArm.rotation.z=THREE.MathUtils.lerp(rightArm.rotation.z,swimming?-armSpread-swimStroke*.12:0,.18);
        leftLeg.rotation.z=THREE.MathUtils.lerp(leftLeg.rotation.z,swimming?legSpread:0,.18);rightLeg.rotation.z=THREE.MathUtils.lerp(rightLeg.rotation.z,swimming?-legSpread:0,.18);
        model.rotation.x=THREE.MathUtils.lerp(model.rotation.x,swimming?-1.18*swimPose:0,.12);
        const surfaceFloatY=waterLevel-1.48+Math.sin(now*.0035)*.045,diveY=waterLevel-.42-swimDepth;
        if(!falling&&!climbing&&!swimming&&!shoreEntry&&!ridingRaft&&dungeonLevel===0&&lastSupportY-groundY>3){falling=true;fallY=player.position.y;fallVelocity=jumpVelocity;jumpHeight=0;jumpVelocity=0;notice("กำลังตกจากที่สูง!",1.5);}
        if(falling){fallVelocity-=18*dt;fallY+=fallVelocity*dt;const landingY=groundY+.12;if(fallY<=landingY){const impact=Math.abs(fallVelocity),damage=Math.min(95,Math.max(0,Math.round((impact-9)*2.15)));fallY=landingY;falling=false;fallVelocity=0;if(damage>0){health=Math.max(0,health-damage);sound(72,.3);notice(`ตกกระแทกพื้น • เสียพลังชีวิต ${damage}`,3);if(health<=0){downed=true;downedTimer=15;reviveProgress=0;}}}player.position.y=fallY;}else player.position.y=climbing?(climbFort>=0?fortresses[climbFort].ground:obsGround)+climbHeight:ridingRaft?OCEAN_LEVEL+.65:swimming?THREE.MathUtils.lerp(surfaceFloatY,diveY,swimPose):groundY+.12+jumpHeight;
        if(shoreEntry){falling=false;jumpHeight=0;jumpVelocity=0;player.position.y=OCEAN_LEVEL-1.45;}if(dungeonLevel===0&&(!Number.isFinite(player.position.y)||player.position.y<-55)){player.position.set(0,surfaceHeight(0,90)+.12,90);velocity.set(0,0,0);falling=false;swimDepth=0;notice("ระบบพากลับสู่จุดปลอดภัย",3);}if(!falling)lastSupportY=groundY;if(ridingRaft){raft.position.set(player.position.x,OCEAN_LEVEL+.08,player.position.z);raft.rotation.y=player.rotation.y;}
        survivalNodes.forEach(n=>{if(n.taken)return;n.mesh.rotation.y+=dt*.5;if(player.position.distanceTo(n.mesh.position)<1.45){n.taken=true;n.mesh.visible=false;if(n.type==="wood")wood++;else stone++;rewardProgress(2,1);sound(n.type==="wood"?330:240);notice(n.type==="wood"?"เก็บไม้แล้ว":"เก็บหินสำหรับคราฟต์แล้ว");}});
        treasureChests.forEach(c=>{if(c.taken)return;c.mesh.rotation.y+=dt*.18;if(player.position.distanceTo(c.mesh.position)<1.7){c.taken=true;c.mesh.visible=false;treasure++;health=Math.min(100,health+20);rewardProgress(20,12,treasure>=collectionQuest.treasure?"นักล่าสมบัติ":undefined);sound(880,.35);notice(`พบหีบสมบัติ ${treasure}/${collectionQuest.treasure} • รับ 12 เหรียญ`,3);}});
        secretNodes.forEach(secret=>{if(secret.taken)return;secret.mesh.rotation.y+=dt;secret.mesh.position.y+=Math.sin(now*.004+secret.id)*.001;if(player.position.distanceTo(secret.mesh.position)<1.65){secret.taken=true;secret.mesh.visible=false;setProgress(p=>({...p,secrets:p.secrets+1}));rewardProgress(30,20,secret.id===3?"ผู้เปิดเผยความลับ":undefined);sound(980,.3);notice("ค้นพบเสียงสะท้อนลับ • รับ 20 เหรียญ",3);}});
        if(!coopRewarded&&onlineSession&&remotePlayers.size>0){const occupied=coopPads.every(pad=>player.position.distanceTo(pad.position)<2.7||[...remotePlayers.values()].some(a=>a.root.position.distanceTo(pad.position)<2.7));if(occupied){coopRewarded=true;rewardProgress(45,30,"พลังแห่งมิตรภาพ");sound(1080,.4);notice("เปิดแท่นร่วมมือสำเร็จ • รับ 30 เหรียญ",4);}}
        [[58,64],[0,TOWER_Z],[MAZE_ZONES[0].x,MAZE_ZONES[0].z],[MAZE_ZONES[2].x,MAZE_ZONES[2].z],[SECOND_X,0],[OBS_X,OBS_Z]].forEach(([x,z],i)=>{if(!discovered.has(i)&&Math.hypot(player.position.x-x,player.position.z-z)<16){discovered.add(i);discoveries=discovered.size;rewardProgress(8,3,discoveries>=collectionQuest.discoveries?"นักสำรวจแห่งเกาะ":undefined);setProgress(p=>({...p,bestDiscoveries:Math.max(p.bestDiscoveries,discoveries)}));sound(660,.18);notice(`ค้นพบสถานที่ใหม่ ${discoveries}/${collectionQuest.discoveries}`,2.5);}});
        animals.forEach((a,i)=>{const speed=.35+(i%3)*.12;a.rotation.y+=Math.sin(now*.0003+i)*dt*.35;a.position.x+=Math.sin(a.rotation.y)*dt*speed;a.position.z+=Math.cos(a.rotation.y)*dt*speed;const cx=i>=6?SECOND_X:0;if(Math.hypot(a.position.x-cx,a.position.z)>105){a.rotation.y+=Math.PI;}a.position.y=surfaceHeight(a.position.x,a.position.z);});fish.forEach((f,i)=>{f.position.x+=Math.sin(i)*dt*.65;f.position.z+=Math.cos(now*.0004+i)*dt*.5;f.rotation.y=now*.0004+i;});
        throwableRocks.forEach(rock=>{if(!rock.velocity)return;const mesh=activateRock(rock);rock.velocity.y-=15*dt;mesh.position.addScaledVector(rock.velocity,dt);mesh.rotation.x+=dt*rock.velocity.length()*.45;mesh.rotation.z+=dt*3;const floor=surfaceHeight(mesh.position.x,mesh.position.z)+rock.radius*.72;if(mesh.position.y<=floor){mesh.position.y=floor;if(Math.abs(rock.velocity.y)>2.2){rock.velocity.y=Math.abs(rock.velocity.y)*.34;rock.velocity.x*=.62;rock.velocity.z*=.62;sound(120,.05);}else{rock.velocity=null;rock.restPosition.copy(mesh.position);}}if(rock.velocity&&mesh.position.distanceTo(enemy.position)<1.45){const push=rock.velocity.clone().setY(0).normalize();enemy.position.addScaledVector(push,2.8);rock.velocity.multiplyScalar(-.25);rock.velocity.y=2.2;sound(90,.16);notice("หินกระแทกเงามืดจนชะงัก!");}if(rock.velocity)for(const zombie of zombies){if(zombie.root.visible&&mesh.position.distanceTo(zombie.root.position)<1.25){const push=rock.velocity.clone().setY(0).normalize();zombie.root.position.addScaledVector(push,3.5);zombie.stunnedUntil=now+3000;rock.velocity.multiplyScalar(-.22);rock.velocity.y=2;sound(105,.14);notice("ซอมบี้ล้มลง 3 วินาที!");break;}}});
        pickups.forEach(p=>{if(p.taken)return;p.mesh.rotation.y+=dt*1.4;p.mesh.position.y=p.baseY+Math.sin(now*.003+p.mesh.position.x)*.18;if(player.position.distanceTo(p.mesh.position)<1.65){p.taken=true;p.mesh.visible=false;if(onlineSession)void onlinePost({action:"collect",pickupId:p.id,type:p.type});else if(p.type==="scrap")scrap++;else cells++;sound(p.type==="cell"?620:440);notice(p.type==="cell"?"พบเซลล์พลังงาน":"เก็บเศษโลหะ");}});
        const nearTower=player.position.distanceTo(tower.position)<5;
        const npcAuthority=!onlineSession||[onlineSession.playerId,...remotePlayers.keys()].sort()[0]===onlineSession.playerId,dragonPhase=gameTime*Math.PI*2,dragonAngle=dragonPhase*.82,dragonX=SECOND_X*.5+Math.cos(dragonAngle)*315,dragonZ=Math.sin(dragonAngle)*175,overSecond=Math.hypot(dragonX-SECOND_X,dragonZ)<SECOND_RADIUS,overMain=Math.hypot(dragonX,dragonZ)<ISLAND_RADIUS,dragonGround=overSecond?secondSurfaceHeight(dragonX,dragonZ):overMain?surfaceHeight(dragonX,dragonZ):OCEAN_LEVEL;dragon.visible=dungeonLevel===0;dragon.position.x=dragonX;dragon.position.z=dragonZ;dragon.position.y=dragonGround+34+Math.sin(dragonAngle*2.5)*10;dragon.rotation.y=Math.atan2(-315*Math.sin(dragonAngle),175*Math.cos(dragonAngle));dragonLeftWing.rotation.z=Math.sin(now*.009)*.32;dragonRightWing.rotation.z=-Math.sin(now*.009)*.32;
        zombies.forEach((z,i)=>{
          z.root.visible=z.floor>0?dungeonLevel===z.floor:night&&dungeonLevel===0;if(!z.root.visible)return;z.root.rotation.x=0;
          const stunned=now<z.stunnedUntil,verticalGap=Math.abs(player.position.y-z.root.position.y),toPlayer=zombieDirection.subVectors(player.position,z.root.position);toPlayer.y=0;
          const distance=toPlayer.length(),sameIsland=(z.root.position.x<260)===(player.position.x<260),canReach=verticalGap<2.4;
          const oldX=z.root.position.x,oldZ=z.root.position.z,eventBoost=nightEvent&&z.floor===0?1.55:1;if(npcAuthority&&!stunned&&sameIsland&&canReach&&distance<78){z.root.position.addScaledVector(toPlayer.normalize(),dt*(1.05+(i%4)*.12)*eventBoost);z.root.lookAt(player.position.x,z.root.position.y,player.position.z);z.root.rotation.x=0;z.root.rotation.z=0;}else if(npcAuthority&&!stunned){z.root.rotation.y+=Math.sin(now*.0005+z.phase)*dt*.35;wanderDirection.set(Math.sin(z.root.rotation.y),0,Math.cos(z.root.rotation.y));z.root.position.addScaledVector(wanderDirection,dt*.22);}if(npcAuthority){const zombieWalls=z.floor>0?dungeonColliders:colliders;for(const c of zombieWalls){if("floor" in c&&c.floor!==z.floor)continue;const dx=z.root.position.x-c.x,dz=z.root.position.z-c.z,min=c.r+.46;if(Math.abs(dx)>min||Math.abs(dz)>min)continue;if(Math.hypot(dx,dz)<min){z.root.position.x=oldX;z.root.position.z=oldZ;z.root.rotation.y+=Math.PI*.62;break;}}}
          z.root.position.y=(z.floor>0?DUNGEON_LEVELS[z.floor-1]:surfaceHeight(z.root.position.x,z.root.position.z))+(stunned?.28:0);z.root.rotation.x=0;z.root.rotation.z=THREE.MathUtils.lerp(z.root.rotation.z,0,.3);const biting=!stunned&&canReach&&distance<1.25,walk=stunned||biting?0:Math.sin(now*.008+z.phase)*.58;z.leftArm.rotation.x=biting?1.5:1.05+walk;z.rightArm.rotation.x=biting?1.5:1.05-walk;z.leftLeg.rotation.x=-walk;z.rightLeg.rotation.x=walk;
          if(!downed&&biting&&now-z.lastHit>1100){z.lastHit=now;const biteDamage=i>=20?15:8;health=Math.max(0,health-biteDamage);sound(82,.18);notice(i>=20?"บอสดันเจี้ยนโจมตี!":"ซอมบี้ยืนกัด! ใช้หินขว้างหรือวิ่งหนี",1.5);if(health<=0){downed=true;downedTimer=15;reviveProgress=0;}}
        });
        enemy.visible=night&&dungeonLevel===0;if(night&&dungeonLevel===0){const ed=enemyDirection.subVectors(player.position,enemy.position);ed.y=0;if(ed.length()<62)enemy.position.addScaledVector(ed.normalize(),dt*(1.7+(1-daylight)*1.8));else{enemy.position.x+=Math.sin(now*.0007)*dt;enemy.position.z+=Math.cos(now*.0009)*dt;}if(Math.hypot(enemy.position.x,enemy.position.z)>PLAY_RADIUS){const a=Math.atan2(enemy.position.z,enemy.position.x);enemy.position.x=Math.cos(a)*PLAY_RADIUS;enemy.position.z=Math.sin(a)*PLAY_RADIUS;}enemy.position.y=surfaceHeight(enemy.position.x,enemy.position.z)+.2;enemy.lookAt(player.position.x,player.position.y+1,player.position.z);
          if(!downed&&enemy.position.distanceTo(player.position)<1.7&&now-damagedAt>850){health-=14;damagedAt=now;sound(110,.3);notice("เงามืดโจมตีคุณ! วิ่งหนี!",1.5);if(health<=0){health=0;downed=true;downedTimer=15;reviveProgress=0;notice("คุณล้มลง • เพื่อนมีเวลา 15 วินาทีเพื่อช่วย",4);}}
        } else { enemyDirection.subVectors(enemy.position,player.position).normalize();enemy.position.addScaledVector(enemyDirection,dt*2); }
        if(downed){downedTimer-=dt;const helper=[...remotePlayers.values()].some(a=>a.root.position.distanceTo(player.position)<3);reviveProgress=helper?reviveProgress+dt:Math.max(0,reviveProgress-dt*.5);model.rotation.z=THREE.MathUtils.lerp(model.rotation.z,-1.45,.18);model.rotation.x=THREE.MathUtils.lerp(model.rotation.x,0,.18);model.position.y=THREE.MathUtils.lerp(model.position.y,.18,.16);if(reviveProgress>=2.5){downed=false;health=45;oxygen=60;model.rotation.set(0,0,0);model.position.y=0;sound(760,.3);notice("เพื่อนช่วยคุณกลับขึ้นมาแล้ว!",3);}else if(downedTimer<=0){gameOver=true;setEnd("lost");}}else{model.rotation.z=THREE.MathUtils.lerp(model.rotation.z,0,.15);model.position.y=THREE.MathUtils.lerp(model.position.y,0,.18);}
        if(onlineSession&&now-lastSync>115&&syncInFlight===0){lastSync=now;syncInFlight=1;const anim=[leftArm.rotation.x,rightArm.rotation.x,leftLeg.rotation.x,rightLeg.rotation.x,model.rotation.x],isAuthority=[onlineSession.playerId,...remotePlayers.keys()].sort()[0]===onlineSession.playerId,sendNpcs=isAuthority&&now-lastNpcSync>450,full=now-lastFullSync>1000;if(sendNpcs)lastNpcSync=now;if(full)lastFullSync=now;const npcs=sendNpcs?{z:zombies.map(z=>[z.root.position.x,z.root.position.y,z.root.position.z,z.root.rotation.y]),d:[dragon.position.x,dragon.position.y,dragon.position.z,dragon.rotation.y]} as NpcSnapshot:undefined;void onlinePost({action:"sync",x:player.position.x,y:player.position.y,z:player.position.z,rotation:player.rotation.y,pose:localPose,anim,appearance:{...appearanceRef.current,...(npcs?{_npcs:npcs}:{})},rock:onlineRock(),full}).finally(()=>{syncInFlight=0;});}
        if(now-lastHud>160){lastHud=now;const quest=!craftedRaft?wood>=4&&stone>=3?"กด Q เพื่อคราฟต์แพ":"รวบรวมไม้ 4 และหิน 3 เพื่อสร้างแพ":treasure<3?"ค้นหาหีบสมบัติที่ซ่อนอยู่ทั้ง 3 ใบ":discoveries<6?"ค้นพบสถานที่สำคัญบนแผนที่ 6 แห่ง":"ซ่อมหอส่งสัญญาณและเอาชีวิตรอด";const questProgress=!craftedRaft?Math.min(100,(wood/4+stone/3)*50):treasure<3?treasure/3*100:discoveries<6?discoveries/6*100:Math.min(100,(scrap/6+cells/3)*50);let nearFort=false;for(const f of fortresses)if(Math.hypot(player.position.x-f.x,player.position.z-f.ladderZ)<2.25)nearFort=true;const defaultMessage=climbing?(climbFort>=0?"เกาะบันไดป้อม • W ขึ้น • S ลง • L ปล่อย":"กำลังปีนหอสังเกตการณ์ • W ขึ้น • S ลง"):nearFort?"กด L เพื่อเกาะบันไดป้อม":ladderNear?"กด W เพื่อปีนบันไดหอสังเกตการณ์":ridingRaft?"กำลังล่องแพ • กด R เพื่อลง":underwater?(fastDive?"ว่ายเร็วใต้น้ำ • กด Space เพื่อขึ้น":"กำลังดำน้ำ • กด Shift ร่วมกับ C เพื่อว่ายเร็ว"):swimming?(keys.current.ShiftLeft?"กำลังว่ายเร็วที่ผิวน้ำ":"กำลังลอยน้ำ • กด Shift เพื่อว่ายเร็ว • C เพื่อดำน้ำ"):nearTower?(scrap>=6&&cells>=3?"กด E เพื่อซ่อมหอส่งสัญญาณ":"หอส่งสัญญาณต้องการ 6 เศษโลหะ + 3 เซลล์"):"สำรวจสองเกาะ ป้อมปราการ และหอสังเกตการณ์";setHud(h=>({ ...h,health,oxygen:Math.round(oxygen),inWater:swimming&&!ridingRaft,scrap,cells,wood,stone,treasure,discoveries,mapX:player.position.x,mapZ:player.position.z,quest,questProgress,time:gameTime,nearTower,message:messageUntil<now?defaultMessage:h.message }));}
        if(now-lastHud<20){const dynamicQuest=collectionQuestStatus(collectionQuest,craftedRaft,wood,stone,treasure,discoveries,scrap,cells);setHud(h=>({...h,...dynamicQuest}));}
      }
      for(const avatar of remotePlayers.values()){const predictionSeconds=Math.min(.18,Math.max(0,(now-avatar.sampleAt)/1000));avatar.renderTarget.copy(avatar.target).addScaledVector(avatar.velocity,predictionSeconds);const gap=avatar.root.position.distanceTo(avatar.renderTarget);if(gap>12)avatar.root.position.copy(avatar.renderTarget);else avatar.root.position.lerp(avatar.renderTarget,1-Math.exp(-dt*11));let delta=avatar.rotation-avatar.root.rotation.y;delta=Math.atan2(Math.sin(delta),Math.cos(delta));avatar.root.rotation.y+=delta*(1-Math.exp(-dt*10));const t=now*.008,movingRemote=avatar.pose==="walk"||avatar.pose==="run",swimmingRemote=avatar.pose.startsWith("swim")||avatar.pose==="underwater",a=avatar.anim;const strideRemote=movingRemote?Math.sin(t*(avatar.pose==="run"?1.7:1))*.65:0;avatar.leftLeg.rotation.x=THREE.MathUtils.lerp(avatar.leftLeg.rotation.x,avatar.pose==="downed"?-1.05:a?a[2]:swimmingRemote?.35+Math.sin(t)*.35:-strideRemote,.32);avatar.rightLeg.rotation.x=THREE.MathUtils.lerp(avatar.rightLeg.rotation.x,avatar.pose==="downed"?-1.05:a?a[3]:swimmingRemote?.35-Math.sin(t)*.35:strideRemote,.32);avatar.leftArm.rotation.x=THREE.MathUtils.lerp(avatar.leftArm.rotation.x,a?a[0]:swimmingRemote?.8+Math.sin(t)*.5:strideRemote,.32);avatar.rightArm.rotation.x=THREE.MathUtils.lerp(avatar.rightArm.rotation.x,a?a[1]:swimmingRemote?.8-Math.sin(t)*.5:-strideRemote,.32);avatar.model.rotation.x=THREE.MathUtils.lerp(avatar.model.rotation.x,avatar.pose==="downed"?.32:a?a[4]:avatar.pose==="underwater"?-1.18:0,.28);avatar.model.rotation.z=THREE.MathUtils.lerp(avatar.model.rotation.z,0,.18);avatar.model.position.y=THREE.MathUtils.lerp(avatar.model.position.y,avatar.pose==="downed"?-.42:0,.18);if(avatar.rockMesh&&avatar.rockState?.state==="thrown"){const r=avatar.rockState,v=r.velocity;avatar.rockMesh.position.set(r.position[0]+v[0]*predictionSeconds,r.position[1]+v[1]*predictionSeconds-.5*15*predictionSeconds*predictionSeconds,r.position[2]+v[2]*predictionSeconds);avatar.rockMesh.rotation.x+=dt*4;avatar.rockMesh.rotation.z+=dt*3;}}
      for(const avatar of remotePlayers.values())if(avatar.pose==="downed"){avatar.model.rotation.x=THREE.MathUtils.lerp(avatar.model.rotation.x,0,.35);avatar.model.rotation.z=THREE.MathUtils.lerp(avatar.model.rotation.z,-1.45,.35);avatar.model.position.y=THREE.MathUtils.lerp(avatar.model.position.y,.18,.25);}
      for(const [id,audio] of voiceAudios){const avatar=remotePlayers.get(id);if(!avatar){audio.volume=0;continue;}const distance=player.position.distanceTo(avatar.root.position),radius=42;audio.volume=THREE.MathUtils.clamp(1-distance/radius,0,1);}
      const target=cameraTarget.copy(player.position);target.y+=1.25-cameraSwimPose*.65;
      const orbitDistance=8.5, horizontal=Math.cos(pitch)*orbitDistance;
      desiredCamera.copy(target).add(moveDir.set(Math.sin(yaw)*horizontal,Math.sin(pitch)*orbitDistance,Math.cos(yaw)*horizontal));
      // On land the camera stays above terrain. In water and in the dungeon it
      // can orbit freely, including looking upward and underneath the bridge.
      if(!cameraInWater&&dungeonLevel===0)desiredCamera.y=Math.max(desiredCamera.y,surfaceHeight(desiredCamera.x,desiredCamera.z)+.55);
      else if(cameraInWater)desiredCamera.y=Math.max(desiredCamera.y,OCEAN_LEVEL-10.5);
      if(dungeonLevel>0){const floorY=DUNGEON_LEVELS[dungeonLevel-1];desiredCamera.x=THREE.MathUtils.clamp(desiredCamera.x,DUNGEON_X-38.2,DUNGEON_X+38.2);desiredCamera.z=THREE.MathUtils.clamp(desiredCamera.z,DUNGEON_Z-30.2,DUNGEON_Z+30.2);desiredCamera.y=THREE.MathUtils.clamp(desiredCamera.y,floorY+.55,floorY+8.1);}
      camera.position.lerp(desiredCamera,.12);camera.lookAt(target);
      water.material instanceof THREE.MeshStandardMaterial && (water.material.opacity=.86+Math.sin(now*.001)*.03);
      renderer.render(scene,camera);(host as any)._raf=raf;
    };tick();
    const resize=()=>{camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();renderer.setSize(host.clientWidth,host.clientHeight)};addEventListener("resize",resize);
    return()=>{cancelAnimationFrame((host as any)._raf);removeEventListener("resize",resize);removeEventListener("keydown",down);removeEventListener("keyup",up);removeEventListener("mousemove",moveMouse);removeEventListener("mousedown",mouseDown);removeEventListener("mouseup",mouseUp);renderer.domElement.removeEventListener("contextmenu",preventMenu);localVoiceStream?.getTracks().forEach(t=>t.stop());voicePeers.forEach(p=>p.close());voiceAudios.forEach(a=>a.pause());voiceToggle.current=()=>{};chatSend.current=()=>{};rockAction.current=()=>{};lookMaterials.current=null;bodyShape.current=null;renderer.dispose();host.innerHTML="";};
  },[started,onlineSession?.playerId]);

  const press=(code:string,on:boolean)=>{keys.current[code]=on;};
  const restart=()=>location.reload();
  const openWardrobe=()=>{document.exitPointerLock?.();setCustomizing(true);};
  const openChat=()=>{document.exitPointerLock?.();setChatOpen(v=>!v);};
  const submitChat=()=>{const message=chatInput.trim();if(!message)return;chatSend.current(message);setChatInput("");};
  const startOnline=async(action:"create"|"join"|"resume")=>{setConnecting(true);setOnlineError("");try{let session:OnlineSession;if(action==="resume"&&savedSession){session=savedSession;const check=await fetch(`/api/multiplayer?code=${session.code}&playerId=${session.playerId}`);if(!check.ok)throw new Error("ห้องเดิมหมดอายุแล้ว");}else{const response=await fetch("/api/multiplayer",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,code:joinCode,name:playerName,appearance})});const data=await response.json() as {session?:OnlineSession;error?:string};if(!response.ok||!data.session)throw new Error(data.error||"เชื่อมต่อไม่สำเร็จ");session=data.session;}localStorage.setItem("echo-island-room",JSON.stringify(session));localStorage.setItem("echo-island-name",playerName);setOnlineSession(session);setSavedSession(session);setOnlineSetup(false);setStarted(true);}catch(error){setOnlineError(error instanceof Error?error.message:"เชื่อมต่อไม่สำเร็จ");}finally{setConnecting(false);}};
  const swatches=(key:ColorKey,label:string)=>{const bonus=key==="shirt"?[0x151515,0xffd23f,0x53e4c1,0xd83b8c].slice(0,progress.unlocks):[];return <div className="look-row"><span>{label}{key==="shirt"&&progress.unlocks>0?` • ปลดล็อก ${progress.unlocks}`:""}</span><div>{[...LOOK_OPTIONS[key],...bonus].map(color=><button key={color} className={appearance[key]===color?"selected":""} style={{backgroundColor:`#${color.toString(16).padStart(6,"0")}`}} onClick={()=>setAppearance(a=>({...a,[key]:color}))} aria-label={`${label} ${color.toString(16)}`} />)}</div></div>};
  const shapeSlider=(key:"height"|"build"|"muscle",label:string,left:string,right:string)=><label className="shape-slider"><span><b>{label}</b><small>{Math.round(appearance[key]*100)}%</small></span><div><em>{left}</em><input type="range" min="0" max="100" value={Math.round(appearance[key]*100)} onChange={e=>setAppearance(a=>({...a,[key]:Number(e.target.value)/100}))}/><em>{right}</em></div></label>;
  const hours=Math.floor((hud.time*24+5)%24), mins=Math.floor((((hud.time*24+5)%24)%1)*60);
  return <main className="game-shell">
    <div ref={mount} className="viewport" aria-label="เกมสามมิติ Echo Island" />
    <div className="grain" />
    <header className="topbar"><div className="brand"><span className="brand-mark">E</span><div><strong>ECHO ISLAND</strong><small>เกาะที่จดจำคุณ</small></div></div><div className="top-actions">{started&&onlineSession&&<><button className={`icon-btn voice-btn ${voiceEnabled?"active":""}`} onClick={()=>voiceToggle.current()} aria-label={voiceEnabled?"ปิดไมโครโฟน":"เปิดเสียงตามระยะ"}>{voiceEnabled?"🎙":"🔇"}</button><button className={`icon-btn ${chatOpen?"active":""}`} onClick={openChat} aria-label="เปิดแชต">💬</button></>}<button className="icon-btn" onClick={openWardrobe} aria-label="ปรับแต่งตัวละคร">♙</button><button className="icon-btn" onClick={()=>setShowHelp(true)} aria-label="วิธีเล่น">?</button></div></header>
    {voiceError&&<div className="voice-error" onClick={()=>setVoiceError("")}>{voiceError}</div>}
    {started&&onlineSession&&chatOpen&&<section className="room-chat"><header><b>แชตห้อง {onlineSession.code}</b><button onClick={()=>setChatOpen(false)}>×</button></header><div className="chat-log">{chatMessages.length===0&&<small>ยังไม่มีข้อความ เริ่มคุยกับเพื่อนได้เลย</small>}{chatMessages.map(m=><p key={m.id} className={m.playerId===onlineSession.playerId?"mine":""}><strong>{m.name}</strong><span>{m.message}</span></p>)}</div><form onSubmit={e=>{e.preventDefault();submitChat();}}><input autoFocus value={chatInput} maxLength={180} placeholder="พิมพ์แผนหรือข้อความถึงเพื่อน…" onChange={e=>setChatInput(e.target.value)}/><button type="submit">ส่ง</button></form></section>}
    {started&&!end&&<>
      <section className="mission"><span>{onlineSession?<>ห้อง {onlineSession.code} • {hud.onlineCount}/4 คน <button className="copy-code" onClick={()=>navigator.clipboard?.writeText(onlineSession.code)}>คัดลอกรหัส</button></>:"ภารกิจต่อเนื่อง"}</span><strong>{hud.quest}</strong><div className="progress-row"><i style={{width:`${hud.questProgress}%`}} /></div></section>
      <section className="legacy"><b>LV.{progress.level}</b><span>✦ {progress.coins} เหรียญ</span><small>XP {progress.xp%100}/100</small><em>{randomQuest}</em><i>{progress.achievements.length} ความสำเร็จ • ความลับ {progress.secrets}/4 • ปลดล็อก {progress.unlocks}</i></section>
      <section className="stats"><div className="vitals"><div className="health"><b>พลังชีวิต</b><span>{Math.round(hud.health)}</span><i><em style={{width:`${hud.health}%`}}/></i></div>{hud.inWater&&<div className="oxygen"><b>ออกซิเจน</b><span>{hud.oxygen}</span><i><em style={{width:`${hud.oxygen}%`}}/></i></div>}</div><div className="time"><small>{hours>=18||hours<6?"กลางคืน":"กลางวัน"}</small><strong>{String(hours).padStart(2,"0")}:{String(mins).padStart(2,"0")}</strong></div></section>
      <section className="inventory"><div><span className="resource scrap">◆</span><p><b>{hud.scrap}</b><small>โลหะ</small></p></div><div><span className="resource cell">◉</span><p><b>{hud.cells}</b><small>เซลล์</small></p></div><div><span className="resource">▰</span><p><b>{hud.wood}</b><small>ไม้</small></p></div><div><span className="resource">⬟</span><p><b>{hud.stone}</b><small>หิน</small></p></div></section>
      <section className="minimap"><b>แผนที่สำรวจ</b><div><i className="island one"/><i className="island two"/><i className="bridge-dot"/><i className="player-dot" style={{left:`${Math.max(2,Math.min(98,(hud.mapX+235)/830*100))}%`,top:`${Math.max(3,Math.min(97,(hud.mapZ+230)/460*100))}%`}}/><span>ค้นพบ {hud.discoveries}/6 • หีบ {hud.treasure}/3</span></div></section>
      <div className="message">{hud.message}</div>
      {hud.nearTower&&<button className="interact" onClick={()=>repair.current()}><kbd>E</kbd><span>ซ่อมหอส่งสัญญาณ</span></button>}
      {carryingRock&&<div className={`aim-reticle ${aimingRock?"active":""}`}><i/><span>{aimingRock?"ปล่อยเมาส์ขวาเพื่อยกเลิก • คลิกซ้ายเพื่อโยนแรง":"กดเมาส์ขวาค้างเพื่อเล็ง"}</span></div>}
      <div className="desktop-hint"><kbd>WASD</kbd> เคลื่อนที่ <span>•</span> <kbd>G</kbd> ประตูดันเจี้ยน <span>•</span> <kbd>V</kbd> สร้างกำแพงฐาน <span>•</span> <kbd>L</kbd> บันไดป้อม <span>•</span> <kbd>B</kbd> ใช้กระเป๋า</div>
      <div className="mobile-controls"><div className="dpad"><button onPointerDown={()=>press("KeyW",true)} onPointerUp={()=>press("KeyW",false)}>▲</button><button onPointerDown={()=>press("KeyA",true)} onPointerUp={()=>press("KeyA",false)}>◀</button><button onPointerDown={()=>press("KeyS",true)} onPointerUp={()=>press("KeyS",false)}>▼</button><button onPointerDown={()=>press("KeyD",true)} onPointerUp={()=>press("KeyD",false)}>▶</button></div><button className="jump" onPointerDown={()=>press("Space",true)} onPointerUp={()=>press("Space",false)}>{hud.inWater?"ขึ้น":"โดด"}</button><button className="run" onPointerDown={()=>press("ShiftLeft",true)} onPointerUp={()=>press("ShiftLeft",false)}>{hud.inWater?"เร็ว":"วิ่ง"}</button><button className="dive" onPointerDown={()=>press("KeyC",true)} onPointerUp={()=>press("KeyC",false)}>ดำน้ำ</button><button className="rock-action" onPointerDown={()=>rockAction.current()}>{carryingRock?"โยน":"ยกหิน"}</button></div>
    </>}
    {!started&&!onlineSetup&&<div className="overlay"><div className="hero-card"><div className="eyebrow">3D SURVIVAL ADVENTURE</div><h1>เกาะนี้<br/><em>จดจำคุณ</em></h1><p>เรือของคุณอับปางกลางพายุ หอส่งสัญญาณเก่าคือความหวังเดียว — แต่เมื่อดวงอาทิตย์ลับขอบฟ้า บางสิ่งบนเกาะจะเริ่มตามล่า</p><div className="goal"><span>ภารกิจ</span><b>รวบรวมไม้ {previewQuest.wood} และหิน {previewQuest.stone} เพื่อสร้างแพ</b></div><div className="start-actions triple"><button className="secondary" onClick={openWardrobe}>ปรับแต่ง</button><button className="secondary online" onClick={()=>setOnlineSetup(true)}>เล่นออนไลน์</button><button className="primary" onClick={()=>setStarted(true)}>เล่นคนเดียว <span>→</span></button></div>{savedSession&&<button className="resume-room" onClick={()=>startOnline("resume")} disabled={connecting}>กลับเข้าห้อง {savedSession.code}</button>}<small>ออนไลน์รองรับห้องส่วนตัวสูงสุด 4 คน</small></div></div>}
    {onlineSetup&&<div className="overlay"><div className="online-card"><button className="close-online" onClick={()=>setOnlineSetup(false)}>×</button><span className="eyebrow">PRIVATE CO-OP</span><h2>สำรวจเกาะกับเพื่อน</h2><p>สร้างห้องแล้วส่งรหัส 6 ตัวให้เพื่อน หรือกรอกรหัสที่ได้รับเพื่อเข้าร่วม</p><label>ชื่อผู้เล่น<input value={playerName} maxLength={18} onChange={e=>setPlayerName(e.target.value)}/></label><div className="online-actions"><button className="primary" disabled={connecting} onClick={()=>startOnline("create")}>สร้างห้องใหม่</button><div><input value={joinCode} maxLength={6} placeholder="รหัสห้อง" onChange={e=>setJoinCode(e.target.value.toUpperCase())}/><button className="secondary" disabled={connecting||joinCode.length<6} onClick={()=>startOnline("join")}>เข้าร่วม</button></div></div>{onlineError&&<div className="online-error">{onlineError}</div>}<small>{connecting?"กำลังเชื่อมต่อ…":"ผู้เล่นสูงสุด 4 คน • รหัสห้องเป็นส่วนตัว"}</small></div></div>}
    {end&&<div className="overlay"><div className={`end-card ${end}`}><span>{end==="won"?"SIGNAL RESTORED":"THE ISLAND REMEMBERS"}</span><h2>{end==="won"?"ส่งสัญญาณสำเร็จ":"คุณหายไปในความมืด"}</h2><p>{end==="won"?"แสงสีเขียวพุ่งผ่านหมอก เสียงตอบรับจากแผ่นดินใหญ่ดังขึ้น — คุณรอดชีวิตจาก Echo Island":"เมื่อแสงแรกมาถึง ชายหาดว่างเปล่า เหลือเพียงรอยเท้าที่วนกลับไปยังป่า"}</p><button className="primary" onClick={restart}>เล่นอีกครั้ง <span>↻</span></button></div></div>}
    {showHelp&&<div className="overlay"><div className="help-card"><button onClick={()=>setShowHelp(false)}>×</button><span>คู่มือนักสำรวจ</span><h2>วิธีเอาชีวิตรอด</h2><ol><li><b>สำรวจเกาะ</b><small>วัตถุที่มีแสงเรืองคือทรัพยากร เดินเข้าใกล้เพื่อเก็บ ใช้ Space เพื่อกระโดดข้ามสิ่งกีดขวาง</small></li><li><b>ว่ายน้ำและดำน้ำ</b><small>กด Shift เพื่อว่ายเร็วที่ผิวน้ำ กด C เพื่อดำน้ำ และกด Shift พร้อม C เพื่อว่ายเร็วใต้น้ำ กด Space เพื่อกลับขึ้นผิวน้ำ ระวังออกซิเจนหมดเพราะอาจจมน้ำได้</small></li><li><b>ใช้ก้อนหิน</b><small>เข้าใกล้หินก้อนเล็กแล้วกด F เพื่อยก คลิกซ้ายเพื่อโยน หรือกดเมาส์ขวาค้างเพื่อเล็งก่อนโยน หินทำให้เงามืดชะงักได้</small></li><li><b>เตรียมก่อนค่ำ</b><small>เงามืดแข็งแกร่งในเวลากลางคืน วิ่งหนีและรักษาระยะห่าง</small></li><li><b>กลับไปยังหอคอย</b><small>เมื่อมีเศษโลหะ 6 ชิ้นและเซลล์ 3 ก้อน กด E ที่แผงควบคุม</small></li></ol><button className="primary" onClick={()=>setShowHelp(false)}>เข้าใจแล้ว</button></div></div>}
    {customizing&&<div className="overlay wardrobe-overlay"><CharacterPreview appearance={appearance}/><section className="wardrobe"><button className="close" onClick={()=>setCustomizing(false)}>×</button><div className="eyebrow">EXPLORER LOADOUT</div><h2>ปรับแต่งนักสำรวจ</h2><p>เลือกรูปลักษณ์และสรีระ การเปลี่ยนแปลงจะแสดงบนตัวละครและบันทึกโดยอัตโนมัติ</p><div className="shape-list">{shapeSlider("height","ความสูง","เตี้ย","สูง")}{shapeSlider("build","รูปร่าง","ผอม","อ้วน")}{shapeSlider("muscle","กล้ามเนื้อ","ธรรมดา","กำยำ")}</div><div className="look-list">{swatches("skin","สีผิว")}{swatches("shirt","เสื้อเดินป่า")}{swatches("pants","กางเกง")}{swatches("pack","กระเป๋า")}{swatches("hair","สีผม")}</div><div className="wardrobe-actions"><button className="reset-look" onClick={()=>setAppearance(DEFAULT_LOOK)}>คืนค่าเดิม</button><button className="primary" onClick={()=>setCustomizing(false)}>เสร็จเรียบร้อย <span>✓</span></button></div></section></div>}
  </main>;
}

function CharacterPreview({appearance}:{appearance:Appearance}){
  const mount=useRef<HTMLDivElement>(null);
  const appearanceRef=useRef(appearance);
  appearanceRef.current=appearance;
  useEffect(()=>{
    const host=mount.current;if(!host)return;
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(38,1,.1,30);camera.position.set(0,1.25,-7.2);camera.lookAt(0,1.18,0);
    const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:"high-performance"});renderer.setPixelRatio(Math.min(devicePixelRatio,1.4));renderer.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xcaffed,0x10201c,3));const key=new THREE.DirectionalLight(0xffe1b5,4);key.position.set(-4,6,-5);scene.add(key);
    const mat=(color:number)=>new THREE.MeshStandardMaterial({color,roughness:.72,flatShading:true});
    const look=appearanceRef.current,skin=mat(look.skin),shirt=mat(look.shirt),pants=mat(look.pants),packMat=mat(look.pack),hairMat=mat(look.hair),boots=mat(0x17262b);
    const player=new THREE.Group();player.scale.setScalar(1);scene.add(player);
    const mesh=(geo:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z=0)=>{const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);player.add(m);return m;};
    const torso=mesh(new THREE.CapsuleGeometry(.43,.74,4,8),shirt,0,1.22);mesh(new THREE.BoxGeometry(.67,.78,.36),packMat,0,1.25,.43);mesh(new THREE.CylinderGeometry(.15,.17,.18,8),skin,0,1.83);const headPreview=mesh(new THREE.IcosahedronGeometry(.38,1),skin,0,2.12);const facePreviewMat=mat(0x1c1b1e);const facePreview=new THREE.Group();headPreview.add(facePreview);for(const x of [-.12,.12]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.05,12,12),facePreviewMat);eye.position.set(x,.06,-.31);facePreview.add(eye);}const nose=new THREE.Mesh(new THREE.ConeGeometry(.045,.16,12),facePreviewMat);nose.rotation.x=Math.PI/2;nose.position.set(0,-.02,-.36);facePreview.add(nose);const mouth=new THREE.Mesh(new THREE.BoxGeometry(.18,.04,.02),facePreviewMat);mouth.position.set(0,-.18,-.32);facePreview.add(mouth);mesh(new THREE.SphereGeometry(.39,8,5,0,Math.PI*2,0,Math.PI*.48),hairMat,0,2.23);
    const limb=(x:number,y:number,material:THREE.Material,length:number,radius:number)=>{const p=new THREE.Group();p.position.set(x,y,0);const m=new THREE.Mesh(new THREE.CylinderGeometry(radius,radius*.9,length,7),material);m.position.y=-length/2;p.add(m);player.add(p);return p;};
    const la=limb(-.56,1.58,shirt,.72,.13),ra=limb(.56,1.58,shirt,.72,.13),ll=limb(-.23,.82,pants,.83,.17),rl=limb(.23,.82,pants,.83,.17);
    const width=.78+look.build*.5,height=.82+look.height*.38,armScale=.82+look.muscle*.55;player.scale.set(width,height,width);torso.scale.set(1+look.muscle*.18,1,1+look.muscle*.18);la.scale.set(armScale,1,armScale);ra.scale.set(armScale,1,armScale);la.position.x=-(.48+look.build*.11+look.muscle*.07);ra.position.x=-la.position.x;
    const lh=new THREE.Mesh(new THREE.SphereGeometry(.14,7,6),skin);lh.position.y=-.75;la.add(lh);ra.add(lh.clone());const lb=new THREE.Mesh(new THREE.BoxGeometry(.28,.2,.45),boots);lb.position.set(0,-.86,-.08);ll.add(lb);rl.add(lb.clone());
    const floor=new THREE.Mesh(new THREE.CircleGeometry(1.6,32),new THREE.MeshBasicMaterial({color:0x72edbd,transparent:true,opacity:.13}));floor.rotation.x=-Math.PI/2;floor.position.y=-.12;scene.add(floor);
    const resize=()=>{const w=host.clientWidth,h=host.clientHeight;camera.aspect=w/Math.max(h,1);camera.updateProjectionMatrix();renderer.setSize(w,h,false)};resize();const ro=new ResizeObserver(resize);ro.observe(host);
    let raf=0;const start=performance.now();const draw=()=>{const t=(performance.now()-start)/1000,look=appearanceRef.current,nextWidth=.78+look.build*.5,nextHeight=.82+look.height*.38,nextArmScale=.82+look.muscle*.55;skin.color.setHex(look.skin);shirt.color.setHex(look.shirt);pants.color.setHex(look.pants);packMat.color.setHex(look.pack);hairMat.color.setHex(look.hair);player.scale.set(nextWidth,nextHeight,nextWidth);torso.scale.set(1+look.muscle*.18,1,1+look.muscle*.18);la.scale.set(nextArmScale,1,nextArmScale);ra.scale.set(nextArmScale,1,nextArmScale);la.position.x=-(.48+look.build*.11+look.muscle*.07);ra.position.x=-la.position.x;player.rotation.y=Math.sin(t*.55)*.55;player.position.y=Math.sin(t*1.4)*.025;renderer.render(scene,camera);raf=requestAnimationFrame(draw)};draw();
    return()=>{cancelAnimationFrame(raf);ro.disconnect();renderer.dispose();host.innerHTML="";};
  },[]);
  return <div ref={mount} className="wardrobe-preview"><div><span>ตัวอย่างสด</span><small>โมเดลจะหมุนเพื่อดูด้านหน้าและกระเป๋า</small></div></div>;
}
