/* ---------- Whole-assembly 3D viewer (redesign, Nov 15 2026 - preview) ----------
   Replaces openAsm3D in viewer3d.js (the single-part STEP viewer there is unchanged).

   What the assembly file (jobs/<job>/model/_assembly.glb) actually contains - checked on the 1086WT file:
     1,128 bodies, one glTF node each, positions in millimetres already placed in the truck (no node transforms),
     Draco-compressed (per-body quantisation: 0.058 mm worst / 0.003 mm mean vertex error against the raw Fusion
     export), NO normals and NO CAD face ids. node.extras = {comp, body, path, mat, pn}; path is Fusion's
     occurrence path "Front Headache Rack:1+Winch rack:1" ('+' between levels, ':n' = which copy).
   So:
     - The Assemblies tree is built from those occurrence paths (stable ids), never from loose name matching.
     - Face to face works on FLAT faces rebuilt from the mesh: starting at the tapped triangle, neighbouring
       triangles that lie in the same plane (every corner within 0.15 mm of it, normal within 3 deg) are joined
       into one face; the plane is then least-squares fitted to all of its corners. A curved surface
       (bend, hole, tube) shows up as narrow facets with similar facets beside it and is refused, never measured.
     - Exact CAD faces (cylinders, true face edges) would need face ids in the export - see EXPORT NOTE at the end.
   Face to face reading: perpendicular separation of the two fitted planes, the same wherever you tap on either
   face. "Parallel" means the gap varies by no more than 0.15 mm across both faces; otherwise it says how far
   off parallel they are and the range - never a single gap. */
(()=>{
/* ================= core (no DOM, no three) - also run by the node tests ================= */
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]], mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2], cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.hypot(a[0],a[1],a[2]), unit=a=>{ const l=len(a)||1; return [a[0]/l,a[1]/l,a[2]/l]; };
const DEG=180/Math.PI;
const TOL={planeMM:0.15, normalDeg:3, parallelSpreadMM:0.15, nearParallelDeg:5, smoothDeg:45};

/* --- names --- */
const occName=s=>String(s||"").replace(/:\d+$/,"");
const occNo=s=>{ const m=String(s||"").match(/:(\d+)$/); return m?+m[1]:1; };
/* readable name: drop the job prefix ("1086_7-", "1086_7W "), Fusion version tags, "_ai" import tags, odd dashes */
function pretty(s){
  let t=occName(s).replace(/\s+v\d+$/i,"").replace(/_ai\b/gi,"").replace(/^#?\(?\d{3,4}(?:\(\d+_\d+\)|_\d+)?\)?[A-Z]?\s*[-_ ]\s*/,"").replace(/^\d{3,4}_\d+[A-Z]?[-_ ]+/,"");
  t=t.replace(/\s*-\s*/g," - ").replace(/\s{2,}/g," ").replace(/^[\s-]+|[\s-]+$/g,"").trim()||occName(s);
  return t.charAt(0).toUpperCase()+t.slice(1);
}
/* tree from occurrence paths. items: [{i, path, comp, body, pn, mat}] -> {nodes:Map(id->node), roots:[id], leafOf:[mesh index -> leaf id]}
   node: {id, kind:"asm"|"part"|"body", raw, name, parent, kids:[ids], meshes:[mesh idx (this node and below)], own:[mesh idx directly on it]} */
function buildTree(items){
  const nodes=new Map(), roots=[], leafOf=[];
  const get=(id,raw,parent)=>{ let n=nodes.get(id); if(!n){ n={id,raw,kind:"asm",name:pretty(raw),parent,kids:[],meshes:[],own:[]}; nodes.set(id,n); if(parent) nodes.get(parent).kids.push(id); else roots.push(id); } return n; };
  items.forEach(it=>{ const segs=String(it.path||"").split("+").filter(Boolean); let parent=null, id="";
    segs.forEach(s=>{ id=id?id+"+"+s:s; get(id,s,parent); parent=id; });
    const occ=parent?nodes.get(parent):get("(top)","Other parts",null); occ.own.push(it.i); });
  // an occurrence with exactly one body and no sub-assemblies IS the part; more bodies -> one row per body
  [...nodes.values()].forEach(n=>{ if(!n.own.length) return;   // snapshot: body rows added below must not be re-processed
    if(n.own.length===1&&!n.kids.length){ n.kind="part"; leafOf[n.own[0]]=n.id; return; }
    if(!n.kids.length) n.kind="part";   // a multi-body part (weldment): its bodies are listed under it
    n.own.forEach(mi=>{ const it=items.find(x=>x.i===mi)||{}; const bid=n.id+"#"+(it.body||mi);
      nodes.set(bid,{id:bid,raw:it.body||"Body",kind:"body",name:(it.pn&&it.pn.length?it.pn.join(", "):String(it.body||"Body").replace(/^Body\s*/i,"Body ")),parent:n.id,kids:[],meshes:[mi],own:[mi]});
      n.kids.push(bid); leafOf[mi]=bid; }); });
  // meshes under each node; duplicate sibling names get "#1", "#2" in the order of Fusion's copy number
  const fill=id=>{ const n=nodes.get(id); if(n.kind==="body") return n.meshes; n.meshes=[...(n.kind==="part"&&n.own.length===1&&!n.kids.length?n.own:[])]; n.kids.forEach(k=>n.meshes.push(...fill(k))); if(n.kind!=="part"||n.kids.length) n.own.forEach(mi=>{ if(!n.meshes.includes(mi)) n.meshes.push(mi); }); return n.meshes; };
  roots.forEach(fill);
  const dedupe=ids=>{ const by={}; ids.forEach(id=>{ const n=nodes.get(id); (by[n.name]=by[n.name]||[]).push(n); });
    Object.values(by).forEach(g=>{ if(g.length<2) return; g.sort((a,b)=>occNo(a.raw)-occNo(b.raw)); g.forEach((n,k)=>{ n.name+=` #${k+1}`; }); });
    const seen=new Set(); ids.forEach(id=>{ const n=nodes.get(id); let nm=n.name, k=2; while(seen.has(nm)) nm=n.name+" ·"+(k++); n.name=nm; seen.add(nm); }); };
  dedupe(roots); nodes.forEach(n=>dedupe(n.kids));
  // children order: assemblies first, then parts, by name
  const ord=ids=>ids.sort((a,b)=>{ const A=nodes.get(a), B=nodes.get(b); const ka=A.kind==="asm"?0:1, kb=B.kind==="asm"?0:1; return ka-kb||A.name.localeCompare(B.name,undefined,{numeric:true}); });
  ord(roots); nodes.forEach(n=>ord(n.kids));
  return {nodes,roots,leafOf};
}
/* --- tidy the tree for the shop (Kyle, Nov 15): the list only - the 3D file and Fusion are not changed, and every
   part still shows / hides / measures the same. Fusion's own nesting is kept underneath.
   - Loose fasteners at the top -> "Hardware". Inside an assembly with 3+ fastener rows -> a "Hardware" folder in it.
     A fastener = Fusion name with bolt / nut / washer / screw / pin / rivet / stud... (bought, "_ai" imports etc.),
     never a name starting with our job/part number (e.g. "1086_7- 2301-5th wheel pin" is a GVC part).
     An assembly counts as hardware only if everything in it is.
   - The truck and loose tools (truck chassis, plastic fenders, broom, pry bar, shovel, sledgehammer, fuel nozzle)
     -> "Truck & tools", so everything that isn't fabricated hides in one tap.
   - A top-level logo goes into the assembly whose box it sits inside (needs boxOf; on 1086WT: Front Headache Rack).
   - Top-level "skirt" reads "Skirt / rear apron".
   Group rows are kind "group" with ids "(hardware)", "(truck)", "<parent id>›(hardware)"; real Fusion parents are
   kept in n.fparent for "Hide assembly" etc. */
const HW_RE=/\b(bolts?|nuts?|washers?|screws?|pins?|rivets?|studs?|clevis|cotter|shcs|hhcs|fasteners?|lock ?nuts?|nylocks?|u-?bolts?|grommets?|gromets?)\b/i;
const OURS_RE=/^#?\(?\d{3,4}[_(]|^(passenger|driver)[- ]\d{3,4}_/i;
const TRUCK_RE=/kenworth|peterbilt|freightliner|western ?star|\bmack\b|\bchassis\b|plastic fenders?|\bbroom\b|pry ?bar|\bshovel\b|sledge|hose nozzle|fuel nozzle/i;
function organize(T,boxOf){
  const N=T.nodes, nm=n=>occName(n.raw).replace(/_/g," ");
  const isHwPart=n=>n.kind!=="body"&&!OURS_RE.test(n.raw)&&HW_RE.test(nm(n));
  const isHw=id=>{ const n=N.get(id); if(n.kind==="group") return false; if(!n.kids.length||n.kind==="part") return isHwPart(n);
    return n.kids.every(k=>N.get(k).kind==="body"||isHw(k))&&n.kids.some(k=>N.get(k).kind!=="body"); };
  N.forEach(n=>{ n.fparent=n.parent; });
  const mkGroup=(id,name,parent,kids)=>{ const g={id,raw:name,kind:"group",name,parent,fparent:parent,kids:[],meshes:[],own:[]}; N.set(id,g);
    kids.forEach(k=>{ const c=N.get(k); c.parent=id; g.kids.push(k); g.meshes.push(...c.meshes); }); return g; };
  // 1. logo into the assembly it sits in
  if(boxOf){ T.roots.slice().forEach(r=>{ const n=N.get(r); if(!/logo/i.test(n.raw)) return; const lb=boxOf(n.meshes); if(!lb) return;
      const c=[0,1,2].map(k=>(lb[k]+lb[k+3])/2); let best=null, bv=Infinity;
      T.roots.forEach(o=>{ if(o===r) return; const on=N.get(o); if(/logo/i.test(on.raw)||TRUCK_RE.test(on.raw)||isHw(o)) return; const b=boxOf(on.meshes); if(!b) return;
        if([0,1,2].every(k=>c[k]>=b[k]&&c[k]<=b[k+3])){ const v=(b[3]-b[0])*(b[4]-b[1])*(b[5]-b[2]); if(v<bv){ bv=v; best=o; } } });
      if(best){ T.roots.splice(T.roots.indexOf(r),1); n.parent=best; const B=N.get(best); B.kids.push(r); B.meshes.push(...n.meshes); } }); }
  // 2/3. top-level groups
  const truck=T.roots.filter(r=>TRUCK_RE.test(N.get(r).raw)), hw=T.roots.filter(r=>!truck.includes(r)&&isHw(r));
  T.roots=T.roots.filter(r=>!truck.includes(r)&&!hw.includes(r));
  if(hw.length) { mkGroup("(hardware)","Hardware",null,hw); T.roots.push("(hardware)"); }
  if(truck.length){ mkGroup("(truck)","Truck & tools",null,truck); T.roots.push("(truck)"); }
  // 4. hardware folders inside assemblies
  [...N.values()].forEach(n=>{ if(n.kind==="group"||n.kind==="body"||!n.kids.length) return; const h=n.kids.filter(k=>isHw(k)); if(h.length<3||h.length===n.kids.length) return;
    n.kids=n.kids.filter(k=>!h.includes(k)); mkGroup(n.id+"›(hardware)","Hardware",n.id,h); n.kids.push(n.id+"›(hardware)"); });
  // 5. names
  T.roots.forEach(r=>{ const n=N.get(r); if(/\bskirt\b/i.test(n.raw)) n.name="Skirt / rear apron"; });
  // order: assemblies, then parts, then groups (Hardware before Truck & tools)
  const rank=n=>n.kind==="asm"?0:n.kind==="group"?(n.id.endsWith("(truck)")?3:2):1;
  const ord=ids=>ids.sort((a,b)=>{ const A=N.get(a), B=N.get(b); return rank(A)-rank(B)||A.name.localeCompare(B.name,undefined,{numeric:true}); });
  ord(T.roots); N.forEach(n=>ord(n.kids));
  return T;
}
const ancestors=(T,id)=>{ const a=[]; let n=T.nodes.get(id); while(n&&n.parent){ a.unshift(n.parent); n=T.nodes.get(n.parent); } return a; };
const crumbs=(T,id)=>ancestors(T,id).map(a=>T.nodes.get(a).name);

/* --- visibility: explicit hidden set + temporary isolation --- */
function visModel(T){
  const V={hidden:new Set(), iso:null, saved:null};
  V.leafVisible=mi=>{ let id=T.leafOf[mi]; while(id){ if(V.hidden.has(id)) return false; id=T.nodes.get(id).parent; } return true; };
  V.state=id=>{ const ms=T.nodes.get(id).meshes; let v=0; ms.forEach(mi=>{ if(V.leafVisible(mi)) v++; }); return v===0?"hidden":v===ms.length?"visible":"partial"; };
  V.hide=id=>{ V.hidden.add(id); };
  V.show=id=>{   // show this item fully: clear it and everything under it; if a parent is hidden, open the parent but keep its other children hidden
    const n=T.nodes.get(id); const drop=x=>{ V.hidden.delete(x); T.nodes.get(x).kids.forEach(drop); }; drop(id);
    const path=[...ancestors(T,id),id];
    for(let i=0;i<path.length-1;i++){ const a=path[i]; if(V.hidden.has(a)){ V.hidden.delete(a); T.nodes.get(a).kids.forEach(k=>{ if(k!==path[i+1]) V.hidden.add(k); }); } }
    void n; };
  V.toggle=id=>{ if(V.state(id)==="visible") V.hide(id); else V.show(id); };
  V.showAll=()=>{ V.hidden.clear(); V.iso=null; V.saved=null; };
  V.isolate=id=>{ if(!V.iso) V.saved=new Set(V.hidden); V.iso=id; V.hidden=new Set();
    const path=[...ancestors(T,id),id];
    T.roots.forEach(r=>{ if(r!==path[0]) V.hidden.add(r); });
    for(let i=0;i<path.length-1;i++) T.nodes.get(path[i]).kids.forEach(k=>{ if(k!==path[i+1]) V.hidden.add(k); }); };
  V.exitIso=()=>{ if(V.saved) V.hidden=V.saved; V.iso=null; V.saved=null; };
  V.hiddenLeaves=()=>{ let n=0; T.leafOf.forEach((id,mi)=>{ if(id!=null&&!V.leafVisible(mi)) n++; }); return n; };
  return V;
}

/* --- flat faces from a triangle mesh (world positions, mm) --- */
/* topology for one mesh: welded vertex ids + triangles across each edge */
function topo(pos,idx){
  const ntri=idx.length/3, key=new Map(), wid=new Int32Array(pos.length/3);
  for(let v=0;v<pos.length/3;v++){ const k=Math.round(pos[v*3]*1000)+","+Math.round(pos[v*3+1]*1000)+","+Math.round(pos[v*3+2]*1000); let w=key.get(k); if(w===undefined){ w=key.size; key.set(k,w); } wid[v]=w; }
  const edge=new Map();
  for(let t=0;t<ntri;t++) for(let k=0;k<3;k++){ const a=wid[idx[t*3+k]], b=wid[idx[t*3+(k+1)%3]]; const e=a<b?a+"_"+b:b+"_"+a; const L=edge.get(e); if(L) L.push(t); else edge.set(e,[t]); }
  const nb=Array.from({length:ntri},()=>[]);
  edge.forEach(L=>{ for(let i=0;i<L.length;i++) for(let j=0;j<L.length;j++) if(i!==j) nb[L[i]].push(L[j]); });
  return {ntri,nb,wid};
}
const V3=(pos,i)=>[pos[i*3],pos[i*3+1],pos[i*3+2]];
function triInfo(pos,idx,t){ const a=V3(pos,idx[t*3]), b=V3(pos,idx[t*3+1]), c=V3(pos,idx[t*3+2]); const n=cross(sub(b,a),sub(c,a)); const ar=len(n)/2; return {a,b,c,n:ar>0?unit(n):[0,0,0],area:ar,c0:mul(add(add(a,b),c),1/3)}; }
/* smallest-eigenvalue eigenvector of a symmetric 3x3 (Jacobi) */
function eigMin(m){
  const a=m.map(r=>r.slice()), v=[[1,0,0],[0,1,0],[0,0,1]];
  for(let it=0;it<60;it++){ let p=0,q=1,big=Math.abs(a[0][1]); if(Math.abs(a[0][2])>big){p=0;q=2;big=Math.abs(a[0][2]);} if(Math.abs(a[1][2])>big){p=1;q=2;big=Math.abs(a[1][2]);}
    if(big<1e-14) break; const th=(a[q][q]-a[p][p])/(2*a[p][q]), t=Math.sign(th||1)/(Math.abs(th)+Math.sqrt(th*th+1)), c=1/Math.sqrt(t*t+1), s=t*c;
    for(let k=0;k<3;k++){ const x=a[k][p], y=a[k][q]; a[k][p]=c*x-s*y; a[k][q]=s*x+c*y; }
    for(let k=0;k<3;k++){ const x=a[p][k], y=a[q][k]; a[p][k]=c*x-s*y; a[q][k]=s*x+c*y; }
    for(let k=0;k<3;k++){ const x=v[k][p], y=v[k][q]; v[k][p]=c*x-s*y; v[k][q]=s*x+c*y; } }
  const vals=[a[0][0],a[1][1],a[2][2]], i=vals.indexOf(Math.min(...vals)); return unit([v[0][i],v[1][i],v[2][i]]); }
/* grow the flat region around triangle t0. returns {tris, n, p (centroid), area, verts:[[x,y,z]], ok, why} */
function flatFace(pos,idx,T,t0){
  const cosN=Math.cos(TOL.normalDeg/DEG);
  const t0i=triInfo(pos,idx,t0); if(!(t0i.area>0)) return {ok:false,why:"degenerate",tris:[t0]};
  let n=t0i.n.slice(), area=t0i.area, C=mul(t0i.c0,t0i.area), N=mul(t0i.n,t0i.area);
  const inR=new Uint8Array(T.ntri); inR[t0]=1; const tris=[t0], q=[t0];
  while(q.length){ const t=q.pop(); for(const u of T.nb[t]){ if(inR[u]) continue; const I=triInfo(pos,idx,u); if(!(I.area>0)){ inR[u]=2; continue; }
      if(dot(I.n,n)<cosN){ continue; }
      const p=mul(C,1/area); if([I.a,I.b,I.c].some(v=>Math.abs(dot(sub(v,p),n))>TOL.planeMM)) continue;
      inR[u]=1; tris.push(u); q.push(u); area+=I.area; C=add(C,mul(I.c0,I.area)); N=add(N,mul(I.n,I.area)); n=unit(N); } }
  // least-squares plane through every corner of the face
  const seen=new Set(), verts=[]; tris.forEach(t=>{ for(let k=0;k<3;k++){ const vi=idx[t*3+k], w=T.wid[vi]; if(!seen.has(w)){ seen.add(w); verts.push(V3(pos,vi)); } } });
  const c=verts.reduce((s,v)=>add(s,v),[0,0,0]).map(x=>x/verts.length);
  const cov=[[0,0,0],[0,0,0],[0,0,0]]; verts.forEach(v=>{ const d=sub(v,c); for(let r=0;r<3;r++) for(let k=0;k<3;k++) cov[r][k]+=d[r]*d[k]; });
  let nf=eigMin(cov); if(dot(nf,N)<0) nf=mul(nf,-1);
  let dev=0; verts.forEach(v=>{ dev=Math.max(dev,Math.abs(dot(sub(v,c),nf))); });
  // curved surface? a facet of a bend/hole/tube has neighbours that turn a little (smooth) and are about the same size
  const edgeTris=new Set(); tris.forEach(t=>T.nb[t].forEach(u=>{ if(inR[u]!==1) edgeTris.add(u); }));
  let curved=false; const cosS=Math.cos(TOL.smoothDeg/DEG);
  const tried=new Set();
  for(const u of edgeTris){ if(tried.has(u)) continue; const I=triInfo(pos,idx,u); if(!(I.area>0)) continue; const d=dot(I.n,nf);
    if(d<cosS||d>Math.cos(0.3/DEG)) continue;   // a sharp corner, or practically the same plane
    const R=growQuick(pos,idx,T,u); R.forEach(x=>tried.add(x.t)); const ra=R.reduce((s,x)=>s+x.area,0);
    const ratio=ra/area; if(ratio>0.4&&ratio<2.5){ curved=true; break; } }
  return {ok:!curved, why:curved?"curved":"", tris, n:nf, p:c, area, verts, flatness:dev};
}
function growQuick(pos,idx,T,t0){ const s=triInfo(pos,idx,t0), out=[{t:t0,area:s.area}], seen=new Set([t0]), q=[t0], cosN=Math.cos(TOL.normalDeg/DEG);
  while(q.length&&out.length<4000){ const t=q.pop(); for(const u of T.nb[t]){ if(seen.has(u)) continue; seen.add(u); const I=triInfo(pos,idx,u); if(!(I.area>0)||dot(I.n,s.n)<cosN) continue; if([I.a,I.b,I.c].some(v=>Math.abs(dot(sub(v,s.c0),s.n))>TOL.planeMM)) continue; out.push({t:u,area:I.area}); q.push(u); } }
  return out; }

/* --- face to face --- */
function faceToFace(A,B){
  if(!A||!B) return {kind:"none"};
  if(!A.ok||!B.ok) return {kind:"curved", which:!A.ok&&!B.ok?"both":!A.ok?"first":"second"};
  const c=dot(A.n,B.n), th=Math.acos(Math.max(-1,Math.min(1,Math.abs(c))))*DEG;   // 0 = parallel (either way)
  const s=c<0?-1:1, n=unit(add(A.n,mul(B.n,s)));
  // signed distance of every corner of each face to the other face's plane
  const dB=B.verts.map(v=>dot(sub(v,A.p),A.n)), dA=A.verts.map(v=>dot(sub(v,B.p),B.n));
  const lo=Math.min(...dB.map(Math.abs),...dA.map(Math.abs)), hi=Math.max(...dB.map(Math.abs),...dA.map(Math.abs));
  const spread=Math.max(Math.max(...dB)-Math.min(...dB), Math.max(...dA)-Math.min(...dA));
  const facing=c<-0.5?"facing":"same";
  if(th<TOL.nearParallelDeg&&spread<=TOL.parallelSpreadMM){
    const dist=Math.abs(dot(sub(B.p,A.p),n));   // plane to plane along the shared normal: same wherever the faces were tapped
    return {kind:"parallel", dist, n, facing, angle:th, spread};
  }
  if(th<TOL.nearParallelDeg) return {kind:"nearly", angle:th, min:lo, max:hi, spread};
  return {kind:"angle", angle:Math.acos(Math.max(-1,Math.min(1,c)))*DEG};
}
/* where to draw the dimension: from the tapped point on A, straight across (shared normal) to B's plane */
function dimLine(A,B,pA,pB,R){
  const n=R.n, P=sub(pA,mul(A.n,dot(sub(pA,A.p),A.n)));       // tapped point moved onto A's fitted plane
  const t=dot(sub(B.p,P),n); const Q=add(P,mul(n,t));            // straight across to B's plane
  const QB=sub(pB,mul(B.n,dot(sub(pB,B.p),B.n)));                // tapped point on B's plane (extension line Q -> it)
  return {P,Q,QB};
}

/* --- numbers: precision the mesh supports (about +/- 0.1 mm) --- */
function frac32(inch){ const s=inch<0?"-":""; const n=Math.round(Math.abs(inch)*32); const w=Math.floor(n/32); let r=n%32, d=32; while(r&&r%2===0){ r/=2; d/=2; }
  return s+(w?w+(r?"-":""):"")+(r?r+"/"+d:"")+(!w&&!r?"0":"")+'"'; }
function fmtLen(mm,u){ return u==="mm"?(mm).toFixed(1)+" mm":(mm/25.4).toFixed(2)+'" ('+frac32(mm/25.4)+")"; }
const ACC_MM=0.1;   // stated reading accuracy for flat faces from this mesh (worst vertex error 0.058 mm + plane fit)

const core={buildTree,organize,HW_RE,ancestors,crumbs,visModel,topo,flatFace,faceToFace,dimLine,fmtLen,frac32,pretty,TOL,ACC_MM,eigMin};
(typeof window!=="undefined"?window:globalThis).GVCASM=core;
if(typeof document==="undefined") return;   // node tests stop here

/* ================= viewer ================= */
const CDN={ three:"https://cdn.jsdelivr.net/npm/three@0.170.0/+esm",
  gltf:"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js/+esm",
  draco:"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/DRACOLoader.js/+esm",
  dracoDec:"https://www.gstatic.com/draco/versioned/decoders/1.5.7/" };
let libsP=null;
function loadLibs(){ if(!libsP) libsP=(async()=>{ const [THREE,gl,dr]=await Promise.all([import(CDN.three),import(CDN.gltf),import(CDN.draco)]);
    const loader=new gl.GLTFLoader(); const dl=new dr.DRACOLoader(); dl.setDecoderPath(CDN.dracoDec); loader.setDRACOLoader(dl); return {THREE,loader}; })().catch(e=>{ libsP=null; throw e; });
  return libsP; }
function webglOK(){ try{ const c=document.createElement("canvas"); return !!(window.WebGLRenderingContext&&(c.getContext("webgl2")||c.getContext("webgl"))); }catch(e){ return false; } }
const RM=()=>window.matchMedia&&matchMedia("(prefers-reduced-motion: reduce)").matches;

const ICON={
  eye:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  off:'<path d="M3 3l18 18M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.3-1"/>',
  half:'<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" stroke-dasharray="3 3"/><path d="M12 9a3 3 0 0 0 0 6z" fill="currentColor"/>',
  tree:'<path d="M4 5h6M4 12h6M4 19h6M14 5h6M16 12h4M16 19h4M10 5v14"/>', view:'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  ruler:'<path d="M3 17L17 3l4 4L7 21z"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2"/>', fit:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>', x:'<path d="M6 6l12 12M18 6L6 18"/>',
  chev:'<path d="M9 6l6 6-6 6"/>', undo:'<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>', redo:'<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
  tapoff:'<path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.3-1"/>', search:'<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>' };
const svg=(k,s=20)=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
const E=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const css=document.createElement("style");
css.textContent=`
#v3d.a3v{--a3bg:#20252b;--a3panel:#14181d;--a3line:#2c333b;--a3text:#eef1f4;--a3mut:#a6b0bb;--a3acc:#ff8a2a;--a3sel:#2f8ff0}
#v3d.a3v .a3top{display:flex;align-items:center;gap:6px;padding:8px 10px;padding-top:max(8px,env(safe-area-inset-top));background:var(--a3panel);border-bottom:1px solid var(--a3line);flex-wrap:wrap}
#v3d.a3v .a3t{flex:1 1 160px;min-width:0;font:700 15px var(--font-ui,Inter,sans-serif);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#v3d.a3v .a3b{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 12px;border-radius:10px;border:1px solid var(--a3line);background:#1b2026;color:var(--a3text);font:600 14px var(--font-ui,Inter,sans-serif);cursor:pointer}
#v3d.a3v .a3b[aria-pressed=true],#v3d.a3v .a3b[aria-expanded=true]{border-color:var(--a3acc);color:var(--a3acc);background:rgba(255,138,42,.10)}
#v3d.a3v .a3b:disabled{opacity:.4;cursor:not-allowed}
#v3d.a3v .a3b.pri{background:var(--a3acc);border-color:var(--a3acc);color:#111}
#v3d.a3v .a3body{flex:1;display:flex;min-height:0;position:relative}
#v3d.a3v .cv{flex:1;position:relative;touch-action:none;overflow:hidden;min-width:0}
#v3d.a3v .a3panel{width:340px;max-width:85vw;background:var(--a3panel);border-right:1px solid var(--a3line);display:flex;flex-direction:column;min-height:0}
#v3d.a3v .a3panel[hidden]{display:none}
#v3d.a3v .a3ph{padding:10px;border-bottom:1px solid var(--a3line);display:flex;flex-direction:column;gap:8px}
#v3d.a3v .a3ph .row{display:flex;gap:6px;flex-wrap:wrap}
#v3d.a3v .a3ph .row .a3b{min-height:40px;padding:0 9px;font-size:13px;flex:1 1 auto;justify-content:center}
#v3d.a3v .a3q{display:flex;flex-direction:row;flex:none;min-width:0;align-items:center;gap:6px;background:#0f1216;border:1px solid var(--a3line);border-radius:10px;padding:0 10px;min-height:44px}
#v3d.a3v .a3q input{flex:1;width:auto;min-height:40px;padding:0;background:none;border:0;box-shadow:none!important;color:var(--a3text);font:15px var(--font-ui,Inter,sans-serif);min-width:0;outline:none}
#v3d.a3v .a3list{overflow:auto;flex:1;padding:4px 0 16px;overscroll-behavior:contain}
#v3d.a3v .a3row{display:grid;grid-template-columns:36px minmax(0,1fr) 44px;align-items:center;min-height:44px}
#v3d.a3v .a3row.sel{background:rgba(47,143,240,.22)}
#v3d.a3v .a3row .ex{width:36px;height:44px;background:none;border:0;color:var(--a3mut);cursor:pointer;display:flex;align-items:center;justify-content:center}
#v3d.a3v .a3row .ex svg{transition:transform .12s}#v3d.a3v .a3row .ex[aria-expanded=true] svg{transform:rotate(90deg)}
#v3d.a3v .a3row .nm{min-width:0;text-align:left;background:none;border:0;color:var(--a3text);font:500 14px var(--font-ui,Inter,sans-serif);padding:6px 4px;cursor:pointer;line-height:1.3;word-break:break-word}
#v3d.a3v .a3row .nm small{display:block;color:var(--a3mut);font-size:12px}
#v3d.a3v .a3row.hid .nm{color:#7f8994}
#v3d.a3v .a3row .eye{width:44px;height:44px;background:none;border:0;color:var(--a3text);cursor:pointer;display:flex;align-items:center;justify-content:center}
#v3d.a3v .a3row .eye[data-st=hidden]{color:#6f7983}#v3d.a3v .a3row .eye[data-st=partial]{color:#ffb36b}
#v3d.a3v .a3iso{margin:8px 10px 0;padding:8px 10px;border-radius:10px;background:rgba(47,143,240,.16);border:1px solid rgba(47,143,240,.5);font-size:13px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#v3d.a3v .a3hidl{padding:6px 10px;font-size:13px;color:var(--a3mut)}
#v3d.a3v .a3hidl summary{cursor:pointer;min-height:36px;display:flex;align-items:center}
#v3d.a3v .a3hidl .hr{display:flex;align-items:center;gap:6px;min-height:40px;border-top:1px solid var(--a3line)}
#v3d.a3v .a3hidl .hr span{flex:1;min-width:0;color:var(--a3text)}
#v3d.a3v .a3foot{background:var(--a3panel);border-top:1px solid var(--a3line);padding:10px 12px;padding-bottom:max(10px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px;max-height:46vh;overflow:auto}
#v3d.a3v .a3seg{display:inline-flex;border:1px solid var(--a3line);border-radius:10px;overflow:hidden}
#v3d.a3v .a3seg button{min-height:40px;padding:0 12px;background:#1b2026;border:0;color:var(--a3mut);font:600 13px var(--font-ui,Inter,sans-serif);cursor:pointer}
#v3d.a3v .a3seg button[aria-pressed=true]{background:var(--a3sel);color:#fff}
#v3d.a3v .a3line{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#v3d.a3v .a3lab{font-size:12px;color:var(--a3mut)}
#v3d.a3v .a3name{font:700 16px var(--font-ui,Inter,sans-serif);word-break:break-word}
#v3d.a3v .a3crumb{display:flex;flex-wrap:wrap;gap:2px;align-items:center;font-size:13px;color:var(--a3mut)}
#v3d.a3v .a3crumb button{background:none;border:0;color:#9cc8ff;font:500 13px var(--font-ui,Inter,sans-serif);padding:4px 2px;cursor:pointer;min-height:32px;text-decoration:underline}
#v3d.a3v .a3acts{display:flex;flex-wrap:wrap;gap:6px}
#v3d.a3v .a3acts .a3b{min-height:40px;font-size:13px}
#v3d.a3v .a3res{font:700 18px var(--font-ui,Inter,sans-serif)}
#v3d.a3v .a3res small{display:block;font:500 13px var(--font-ui,Inter,sans-serif);color:var(--a3mut);margin-top:2px}
#v3d.a3v .a3warn{color:#ffd28a;font-size:14px}
#v3d.a3v .a3note{font-size:12px;color:var(--a3mut)}
#v3d.a3v details.a3det summary{cursor:pointer;font-size:13px;color:var(--a3mut);min-height:32px;display:flex;align-items:center}
#v3d.a3v details.a3det div{font-size:12.5px;color:var(--a3mut);word-break:break-all}
#v3d.a3v .a3menu{position:absolute;z-index:6;background:#171b21;border:1px solid var(--a3line);border-radius:12px;padding:6px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px;min-width:270px;max-height:calc(100% - 70px);overflow:auto;box-shadow:0 10px 30px rgba(0,0,0,.45)}
#v3d.a3v .a3menu button{min-height:44px;border-radius:8px;border:1px solid transparent;background:#1f242b;color:var(--a3text);font:600 13px var(--font-ui,Inter,sans-serif);cursor:pointer;text-align:left;padding:0 10px}
#v3d.a3v .a3menu button:hover{border-color:var(--a3line)}
#v3d.a3v .a3menu .wide{grid-column:1/-1}
#v3d.a3v .a3menu .a3seg.wide{display:flex}#v3d.a3v .a3menu .a3seg button{flex:1;min-height:44px;border-radius:0;text-align:center;border:0}
#v3d.a3v .a3mh{grid-column:1/-1;font-size:12px;color:var(--a3mut);padding:6px 4px 0}
#v3d.a3v .a3menu label{grid-column:1/-1;display:flex;flex-direction:row;color:var(--a3text);align-items:center;gap:8px;min-height:44px;padding:0 8px;font-size:14px;cursor:pointer}
#v3d.a3v .a3menu label input{width:20px;height:20px}
#v3d.a3v .a3ov[hidden]{display:none}
#v3d.a3v:focus,#v3d.a3v:focus-visible{box-shadow:none!important;outline:none}
#v3d.a3v .a3ov{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:24px;background:var(--a3bg);z-index:5}
#v3d.a3v .a3ov b{font-size:17px}#v3d.a3v .a3ov p{margin:0;color:var(--a3mut);max-width:440px;font-size:14px;line-height:1.45}
#v3d.a3v .a3spin{width:34px;height:34px;border-radius:50%;border:3px solid #3a424c;border-top-color:var(--a3acc);animation:a3s 0.9s linear infinite}
@keyframes a3s{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){ #v3d.a3v .a3spin{animation-duration:3s} #v3d.a3v .a3row .ex svg{transition:none} }
#v3d.a3v .a3lbl{position:absolute;z-index:4;transform:translate(-50%,-50%);background:#111;color:#ffd400;border:1px solid #ffd400;border-radius:8px;padding:3px 8px;font:700 14px var(--font-ui,Inter,sans-serif);pointer-events:none;white-space:nowrap}
#v3d.a3v .a3draw{position:absolute;inset:0;z-index:7;background:rgba(0,0,0,.82);display:flex;flex-direction:column;padding:12px;gap:8px}
#v3d.a3v .a3draw img{flex:1;min-height:0;object-fit:contain;background:#fff;border-radius:8px;width:100%}
@media (pointer:coarse){ #v3d.a3v .a3b{min-height:48px} #v3d.a3v .a3row{min-height:48px} }
@media (max-height:500px) and (orientation:landscape){ #v3d.a3v .a3t{flex-basis:auto} #v3d.a3v .a3b .lbl{display:none} #v3d.a3v .a3foot{max-height:40vh} }
@media (max-width:760px) and (orientation:portrait){
  #v3d.a3v .a3body{flex-direction:column}
  #v3d.a3v .a3panel{order:2;flex:0 0 56%;width:auto;max-width:none;border-right:0;border-top:1px solid var(--a3line);border-radius:14px 14px 0 0;box-shadow:0 -10px 30px rgba(0,0,0,.4)}   /* sheet under the model, model shrinks above it */
  #v3d.a3v .cv{order:1}
  #v3d.a3v .a3top{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
  #v3d.a3v .a3t{grid-column:1/-1}
  #v3d.a3v .a3top .a3b{min-height:52px;flex-direction:column;justify-content:center;gap:2px;padding:4px 2px;font-size:11.5px}
  #v3d.a3v .a3top .a3b .lbl{display:inline;white-space:nowrap}
  #v3d.a3v.sheet .a3foot{display:none}
  #v3d.a3v .a3row{min-height:48px}
  #v3d.a3v .a3seg button{min-height:44px}
}
@media (max-width:760px){ #v3d.a3v .a3t{flex-basis:100%;order:-1} }
#v3d.a3v .a3ctr{position:absolute;z-index:4;width:6px;height:6px;margin:-3px 0 0 -3px;border-radius:50%;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.55);pointer-events:none;display:none}
#v3d.a3v .a3piv{position:absolute;z-index:4;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#3ddc84;border:2px solid #fff;box-shadow:0 0 0 1px #000;pointer-events:none;display:none}
#v3d.a3v .a3fb{position:absolute;left:8px;right:8px;bottom:8px;z-index:4;display:flex;gap:6px;flex-wrap:wrap;align-items:flex-end;pointer-events:none}
#v3d.a3v .a3fb .a3b{pointer-events:auto;min-height:44px;padding:0 11px;background:rgba(20,24,29,.9);box-shadow:0 2px 10px rgba(0,0,0,.35)}
#v3d.a3v .a3fb .a3b.on{background:var(--a3acc);border-color:var(--a3acc);color:#111}
#v3d.a3v .a3fb .a3b[hidden]{display:none}
#v3d.a3v .a3fb .gap{flex:1}
#v3d.a3v .a3toast{position:absolute;left:50%;top:8px;transform:translateX(-50%);z-index:4;max-width:calc(100% - 16px);background:rgba(17,17,17,.92);border:1px solid var(--a3line);border-radius:10px;padding:7px 12px;font:600 13px var(--font-ui,Inter,sans-serif);color:var(--a3text);pointer-events:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:0;transition:opacity .15s}
#v3d.a3v .a3toast.on{opacity:1}
#v3d.a3v .a3hidebar{border:1px solid var(--a3acc);background:rgba(255,138,42,.1);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:8px}
`;
document.head.appendChild(css);

window.openAsm3D=async function(url,title,opts){
  opts=opts||{};
  const W=document.createElement("div"); W.id="v3d"; W.className="a3v"; W.setAttribute("role","dialog"); W.setAttribute("aria-modal","true"); W.setAttribute("aria-label",title+" - 3D");
  W.innerHTML=`<div class="a3top">
      <div class="a3t" id="a3title">${E(title)}</div>
      <button class="a3b keep" type="button" id="a3asm" aria-label="Assemblies" aria-expanded="false" title="Assemblies - show and hide parts" disabled>${svg("tree")}<span class="lbl">Assemblies</span></button>
      <button class="a3b keep" type="button" id="a3view" aria-label="View" aria-expanded="false" title="View - camera directions, colours, edge lines" disabled>${svg("view")}<span class="lbl">View</span></button>
      <button class="a3b keep" type="button" id="a3meas" aria-label="Measure" aria-pressed="false" title="Measure - face to face or point to point" disabled>${svg("ruler")}<span class="lbl">Measure</span></button>
      <button class="a3b" type="button" id="a3fit" aria-label="Fit model" title="Fit model - frame everything that's showing" disabled>${svg("fit")}<span class="lbl">Fit model</span></button>
      <button class="a3b" type="button" id="v3x" aria-label="Close" title="Close the 3D viewer">${svg("x")}<span class="lbl">Close</span></button></div>
    <div class="a3body"><aside class="a3panel" id="a3panel" hidden aria-label="Assemblies"></aside>
      <div class="cv" id="a3cv"><div class="a3ov" id="a3ov"><div class="a3spin" aria-hidden="true"></div><b id="a3ovt">Opening the 3D model…</b><p id="a3ovp">Loading the 3D tools.</p></div></div></div>
    <div class="a3foot" id="a3foot" aria-live="polite"></div>`;
  document.body.appendChild(W);
  const $=s=>W.querySelector(s);
  const cv=$("#a3cv"), foot=$("#a3foot"), panel=$("#a3panel"), ov=$("#a3ov");
  let disposed=false, renderer=null, onResize=null, raf=0;
  const myId=window.__v3dDepth=(window.__v3dDepth||0)+1; const onPop=()=>{ if(((history.state&&history.state.v3d)||0)<myId) close(); };
  function close(){ disposed=true; cancelAnimationFrame(raf); if(onResize) window.removeEventListener("resize",onResize); if(renderer){ try{ renderer.dispose(); renderer.forceContextLoss&&renderer.forceContextLoss(); }catch(e){} } W.remove(); window.removeEventListener("popstate",onPop); if(window.__v3dBack===innerBack) window.__v3dBack=null; }
  try{ history.pushState({v3d:myId},""); window.addEventListener("popstate",onPop); }catch(e){}
  const back=()=>{ try{ if(history.state&&history.state.v3d) history.back(); else close(); }catch(e){ close(); } };
  $("#v3x").onclick=back;
  const reopen=()=>{ close(); try{ if(history.state&&history.state.v3d) history.back(); }catch(e){} setTimeout(()=>window.openAsm3D(url,title,opts),60); };
  function fail(head,text,retry,tech){ ov.hidden=false; ov.innerHTML=`<b>${E(head)}</b><p>${E(text)}</p>${tech?`<details class="a3det"><summary>Technical detail</summary><div>${E(tech)}</div></details>`:""}<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">${retry?`<button class="a3b pri" type="button" id="a3retry">Retry</button>`:""}<button class="a3b" type="button" id="a3backd">Back to drawings</button></div>`;
    W.querySelectorAll(".a3top .a3b:not(#v3x)").forEach(b=>b.disabled=true); foot.innerHTML="";
    const r=$("#a3retry"); if(r){ r.onclick=reopen; setTimeout(()=>r.focus(),30); } $("#a3backd").onclick=back; }
  const say=(t,p)=>{ $("#a3ovt").textContent=t; $("#a3ovp").textContent=p; };

  /* ---- load ---- */
  if(!webglOK()) return fail("3D graphics aren't available here","This browser or device couldn't start WebGL, which the 3D view needs. Try Chrome, turn on hardware acceleration in the browser's settings, or use the phone app. The drawings still work.",true);
  let L, gltf;
  try{ L=await loadLibs(); if(disposed) return; say("Downloading the model…","0%");
    gltf=await new Promise((ok,no)=>L.loader.load(url,ok,ev=>{ if(ev.total) say("Downloading the model…",Math.round(ev.loaded/ev.total*100)+"% of "+(ev.total/1048576).toFixed(1)+" MB"); },no)); if(disposed) return;
  }catch(e){ const m=String(e&&e.message||e||""); return fail("The model didn't load",(navigator.onLine===false?"You're offline. ":"")+(/\b(404|not found)\b/i.test(m)?"The 3D file isn't in storage any more - it may have been replaced. Close and open it again from the drawings.":/\b(401|403)\b/.test(m)?"The download link ran out. Close and open it again from the drawings.":"The 3D file couldn't be downloaded or read. Check the connection and try again."),true,m); }
  const {THREE}=L;
  try{ renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"}); }catch(e){ return fail("3D graphics couldn't start","The device refused to start WebGL ("+(e&&e.message||e)+"). Close other 3D apps or tabs and retry.",true); }
  say("Preparing the parts…","");
  renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1)); renderer.outputColorSpace=THREE.SRGBColorSpace; cv.appendChild(renderer.domElement);
  renderer.domElement.setAttribute("aria-label","3D model"); renderer.domElement.tabIndex=0;
  renderer.domElement.addEventListener("webglcontextlost",e=>{ e.preventDefault(); fail("The 3D graphics stopped","The device took the graphics memory back (this happens when it's low on memory or the app was in the background). Reload the model to carry on.",true); $("#a3retry").textContent="Reload model"; },false);

  const scene=new THREE.Scene(); scene.background=new THREE.Color(0x20252b);
  const cam=new THREE.PerspectiveCamera(35,1,1,1e7); scene.add(cam);
  scene.add(new THREE.HemisphereLight(0xf2f5ff,0x3a3f46,1.15));
  const key=new THREE.DirectionalLight(0xffffff,1.9); key.position.set(0.6,1,0.45); cam.add(key);
  const rim=new THREE.DirectionalLight(0xcfe0ff,0.65); rim.position.set(-0.8,-0.2,-0.6); cam.add(rim);
  const root=gltf.scene; scene.add(root); root.updateMatrixWorld(true);
  const meshes=[]; root.traverse(o=>{ if(o.isMesh){ o.userData=Object.assign({},o.parent&&o.parent.userData,o.userData); o.userData._i=meshes.length; meshes.push(o); } });
  const items=meshes.map((m,i)=>({i,path:m.userData.path||m.name||("Part "+i),comp:m.userData.comp||m.name,body:m.userData.body,pn:m.userData.pn||null,mat:m.userData.mat}));
  const bb3=meshes.map(m=>new THREE.Box3().setFromObject(m));
  const T=organize(buildTree(items),ms=>{ const b=new THREE.Box3(); ms.forEach(i=>b.union(bb3[i])); return b.isEmpty()?null:[b.min.x,b.min.y,b.min.z,b.max.x,b.max.y,b.max.z]; }), VIS=visModel(T);
  // materials: neutral metal (flat shading - the file has no normals) or one colour per top assembly
  const neutral=new THREE.MeshStandardMaterial({color:0xb9c0c8,metalness:0.15,roughness:0.62,flatShading:true,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
  const PAL=[0xd98b5f,0x6fa8dc,0x93c47d,0xc27ba0,0xe0c060,0x76a5af,0xb4a7d6,0xf6b26b,0x8fbc8f,0xd5a6bd,0x9fc5e8,0xb6d7a8];
  const topOf=mi=>{ let id=T.leafOf[mi]; let n=T.nodes.get(id); while(n&&n.parent) n=T.nodes.get(n.parent); return n?n.id:""; };
  const topMats=new Map(); T.roots.forEach((r,k)=>topMats.set(r,new THREE.MeshStandardMaterial({color:PAL[k%PAL.length],metalness:0.1,roughness:0.6,flatShading:true,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1})));
  const selMat=new THREE.MeshStandardMaterial({color:0x3d9bff,emissive:0x0a3d7a,emissiveIntensity:0.9,metalness:0.1,roughness:0.5,flatShading:true,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
  let colourBy=false, edgesOn=true;
  const baseMat=m=>colourBy?topMats.get(topOf(m.userData._i))||neutral:neutral;
  meshes.forEach(m=>{ m.material=baseMat(m); });
  // restrained edge lines: only where faces meet at > 35 deg (not every triangle edge); built once, in a quiet colour
  const edgeMat=new THREE.LineBasicMaterial({color:0x2b3036,transparent:true,opacity:0.55});
  // ...worked out once per body, then drawn as ONE line object (1,128 separate ones doubled the draw calls); rebuilt when parts are hidden
  const edgeArr=meshes.map(m=>{ const g=new THREE.EdgesGeometry(m.geometry,35); const a=g.getAttribute("position").array; const w=new Float32Array(a.length), v=new THREE.Vector3();
    for(let i=0;i<a.length;i+=3){ v.set(a[i],a[i+1],a[i+2]).applyMatrix4(m.matrixWorld); w[i]=v.x; w[i+1]=v.y; w[i+2]=v.z; } g.dispose(); return w; });
  const edgeObj=new THREE.LineSegments(new THREE.BufferGeometry(),edgeMat); edgeObj.raycast=()=>{}; edgeObj.frustumCulled=false; scene.add(edgeObj);
  function rebuildEdges(){ edgeObj.visible=edgesOn; if(!edgesOn) return; let n=0; meshes.forEach((m,i)=>{ if(m.visible) n+=edgeArr[i].length; });
    const all=new Float32Array(n); let o=0; meshes.forEach((m,i)=>{ if(m.visible){ all.set(edgeArr[i],o); o+=edgeArr[i].length; } });
    edgeObj.geometry.dispose(); edgeObj.geometry=new THREE.BufferGeometry(); edgeObj.geometry.setAttribute("position",new THREE.BufferAttribute(all,3)); }

  const bbAll=new THREE.Box3().setFromObject(root), sizeAll=bbAll.getSize(new THREE.Vector3()).length();
  const upY=(opts.up||"y")==="y", UP=new THREE.Vector3(0,upY?1:0,upY?0:1);
  cam.up.copy(UP);
  const ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
  const visibleMeshes=()=>meshes.filter(m=>m.visible);
  function hit(x,y){ const r=renderer.domElement.getBoundingClientRect(); ndc.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1); ray.setFromCamera(ndc,cam); return ray.intersectObjects(visibleMeshes(),false)[0]||null; }
  /* viewer preferences (View menu, remembered on this device): Keep upright (default) or Free orbit; spin speed;
     spin around the selected part. Inertia is off while measuring. */
  const PREF=(()=>{ const d={upright:true,speed:1,selOrbit:false}; try{ const o=JSON.parse(localStorage.getItem("gvc_a3_prefs")||"{}"); delete o.selPivot; return Object.assign(d,o); }catch(e){ return d; } })();
  const savePref=()=>{ try{ localStorage.setItem("gvc_a3_prefs",JSON.stringify(PREF)); }catch(e){} };
  /* Orbit centre (Nov 15, 2nd review). It used to be the controls' target, which zooming pulled onto the surface under
     the fingers/cursor and panning dragged sideways, and (last round) the selected part by default - so it could sit
     on an edge. Now: the middle of the box round every VISIBLE part (meshes only - no outlines, measure graphics or
     helpers), worked out again whenever parts are hidden / shown / isolated / restored. The controls ask for it once
     at the start of each spin, and turning about a point that isn't mid-screen needs no camera re-aim, so a new centre
     never makes the view jump. "Orbit around selection" (View menu, off by default) uses the selection instead. */
  let selCentre=null, visCentre=null;   // set by setSel / applyVis
  /* Nov 19 (Kyle, after a few days on the phone): the box-centre pivot was unintuitive - zoomed in on one corner, it
     swung around the middle of the whole truck. Now it spins around WHATEVER IS IN THE MIDDLE OF THE SCREEN: the spot on
     the model under the centre of the view. Nothing there (looking past an edge, into a gap) -> the point on the centre
     line of the view at the depth of the visible parts' centre, so it still turns about the middle of the screen. */
  const centrePivot=()=>{ const r=renderer.domElement.getBoundingClientRect(); const h=hit(r.left+r.width/2,r.top+r.height/2); if(h) return h.point.clone();
    if(!visCentre) return null; ndc.set(0,0); ray.setFromCamera(ndc,cam); const o=ray.ray.origin, d=ray.ray.direction;
    return o.clone().addScaledVector(d,Math.max(cam.near*4,visCentre.clone().sub(o).dot(d))); };
  const pivotFn=()=>{ if(PREF.selOrbit&&selCentre&&mode!=="measure") return selCentre; return centrePivot(); };
  function pivotAround(){ return PREF.selOrbit&&selCentre&&mode!=="measure"?selCentre:null; }   // what the white dot marks (null = middle of the screen)   // null (nothing showing) -> controls keep their own target
  const ctl=window.GVC3DControls?window.GVC3DControls(THREE,cam,renderer.domElement,UP.clone(),(x,y)=>{ const h=hit(x,y); return h?h.point.clone():null; },
    {tapPx:8, viewportRot:true, sens:()=>PREF.speed, upright:()=>PREF.upright, pivot:()=>pivotFn(), inertia:()=>mode!=="measure"}):null;
  let need=true; const draw=()=>{ need=true; }; if(ctl) ctl.addEventListener("change",draw);
  const labels=[];   // HTML labels pinned to 3D points
  const pivDot=document.createElement("div"); pivDot.className="a3piv"; pivDot.setAttribute("aria-hidden","true"); cv.appendChild(pivDot); let pivOn=false;
  /* Kyle, Nov 19: a tiny white dot always shows what the model will spin around - the middle of the screen, or the
     selected part's centre when the spin follows the selection. While spinning it becomes the green dot. */
  const ctrDot=document.createElement("div"); ctrDot.className="a3ctr"; ctrDot.setAttribute("aria-hidden","true"); cv.appendChild(ctrDot); let ctrKey="";
  const spinAt=()=>{ try{ if(typeof pivotAround==="function") return pivotAround(); }catch(e){} return null; };   // a point to project, or null = middle of the screen
  const showCtr=hide=>{ let x=cv.clientWidth/2, y=cv.clientHeight/2, on=!hide;
    if(on){ const P=spinAt(); if(P){ const p=P.clone().project(cam); if(p.z>1||Math.abs(p.x)>1||Math.abs(p.y)>1) on=false; else { x=(p.x+1)/2*cv.clientWidth; y=(1-p.y)/2*cv.clientHeight; } } }
    const k=on?Math.round(x)+","+Math.round(y):"off"; if(k===ctrKey) return; ctrKey=k;
    ctrDot.style.display=on?"block":"none"; if(on){ ctrDot.style.left=x+"px"; ctrDot.style.top=y+"px"; } };
  const showPiv=()=>{ const P=ctl&&ctl.rotating&&ctl.rotating()&&ctl.pivotPoint&&ctl.pivotPoint();   // green dot on the spin centre while spinning (like Fusion)
    showCtr(!!P);
    if(!P){ if(pivOn){ pivDot.style.display="none"; pivOn=false; } return; }
    const p=P.clone().project(cam); pivDot.style.left=((p.x+1)/2*cv.clientWidth)+"px"; pivDot.style.top=((1-p.y)/2*cv.clientHeight)+"px"; if(!pivOn){ pivDot.style.display="block"; pivOn=true; } };
  const loop=()=>{ if(disposed) return; ctl&&ctl.update(); showPiv(); if(need){ need=false; renderer.render(scene,cam); labels.forEach(l=>{ const p=l.p.clone().project(cam); const r=cv.getBoundingClientRect(); l.el.style.left=((p.x+1)/2*r.width)+"px"; l.el.style.top=((1-p.y)/2*r.height)+"px"; l.el.style.display=p.z>1?"none":""; }); } raf=requestAnimationFrame(loop); };
  onResize=()=>{ const w=cv.clientWidth, h=cv.clientHeight; renderer.setSize(w,h,false); cam.aspect=w/Math.max(1,h); cam.updateProjectionMatrix(); draw(); };
  window.addEventListener("resize",onResize);

  /* ---- camera ---- */
  function boxOf(list){ const b=new THREE.Box3(); list.forEach(m=>b.expandByObject(m)); return b.isEmpty()?bbAll.clone():b; }
  let anim=0;   // a newer camera move (or a finger on the model) cancels one still running
  /* Fit: keeps the current viewing angle (dir null) and works out the distance from the box's 8 corners against BOTH
     the width and the height of the view, so a long truck fits the same on a portrait phone and a landscape tablet.
     The canvas already excludes the side panel / phone sheet, so its aspect is the space actually free. */
  function frame(box,dir,animate){ ctl&&ctl.stop&&ctl.stop(); const my=++anim; const c=box.getCenter(new THREE.Vector3());
    const d=dir?dir.clone().normalize():cam.getWorldDirection(new THREE.Vector3()).negate();
    const upv=dir?(Math.abs(d.dot(UP))>0.99?(upY?new THREE.Vector3(0,0,-1):new THREE.Vector3(0,1,0)):UP.clone()):cam.up.clone();
    const ax=new THREE.Vector3().crossVectors(upv,d); if(ax.lengthSq()<1e-9) ax.set(1,0,0); ax.normalize(); const ay=new THREE.Vector3().crossVectors(d,ax).normalize();
    const tV=Math.tan(cam.fov*Math.PI/360), tH=tV*Math.max(0.05,cam.aspect); let dist=1;
    for(let k=0;k<8;k++){ const p=new THREE.Vector3(k&1?box.max.x:box.min.x,k&2?box.max.y:box.min.y,k&4?box.max.z:box.min.z).sub(c);
      const z=p.dot(d); dist=Math.max(dist,z+Math.abs(p.dot(ax))/tH,z+Math.abs(p.dot(ay))/tV); }
    dist*=1.08;   // a little margin round the edges
    const to=c.clone().addScaledVector(d,dist), from=cam.position.clone(), t0=ctl?ctl.target.clone():c.clone();
    cam.near=Math.max(0.5,sizeAll/5000); cam.far=sizeAll*60; cam.updateProjectionMatrix();
    const setUp=()=>{ if(dir) cam.up.copy(upv); };
    const done=()=>{ cam.position.copy(to); if(ctl) ctl.target.copy(c); setUp(); cam.lookAt(c); cam.updateMatrixWorld(); draw(); };
    if(!animate||RM()){ done(); return; }
    const t1=performance.now(), dur=220; const step=()=>{ if(my!==anim) return; const k=Math.min(1,(performance.now()-t1)/dur), e=1-Math.pow(1-k,3);
      cam.position.lerpVectors(from,to,e); if(ctl) ctl.target.lerpVectors(t0,c,e); setUp(); cam.lookAt(ctl?ctl.target:c); cam.updateMatrixWorld(); draw(); if(k<1&&!disposed&&my===anim) requestAnimationFrame(step); }; step(); }
  const ISO=upY?new THREE.Vector3(1.2,0.8,1):new THREE.Vector3(1,1.2,0.8);
  const fitVisible=()=>{ const v=visibleMeshes(); if(!v.length){ renderFoot(); return; } updCentre(); frame(boxOf(v),null,true); };   // nothing showing: leave the camera alone (footer offers Show all)
  const resetView=()=>frame(bbAll.clone(),ISO.clone(),true);   // camera only - hidden parts stay hidden
  /* Fusion's ViewCube names for a Y-up model: Front looks along -Z, Right along -X, Top down -Y */
  const VIEWS=upY?{Front:[0,0,1],Back:[0,0,-1],Left:[-1,0,0],Right:[1,0,0],Top:[0,1,0],Bottom:[0,-1,0],Isometric:[1.2,0.8,1]}:{Front:[0,-1,0],Back:[0,1,0],Left:[-1,0,0],Right:[1,0,0],Top:[0,0,1],Bottom:[0,0,-1],Isometric:[1,-1.2,0.8]};

  /* ---- state ---- */
  let mode="select", selMode="part", sel=null;   // sel = tree node id
  let mType="face", units=(()=>{ try{ return localStorage.getItem("gvc_a3_units")||"in"; }catch(e){ return "in"; } })();
  let mA=null, mB=null, mPick="A", pA=null, pB=null;   // face/point picks
  const topos=new Map();
  const worldGeo=m=>{ if(m.userData._w) return m.userData._w; const g=m.geometry, p=g.getAttribute("position"), idx=g.index?g.index.array:Uint32Array.from({length:p.count},(_,i)=>i);
    const w=new Float64Array(p.count*3), v=new THREE.Vector3(); for(let i=0;i<p.count;i++){ v.fromBufferAttribute(p,i).applyMatrix4(m.matrixWorld); w[i*3]=v.x; w[i*3+1]=v.y; w[i*3+2]=v.z; }
    return (m.userData._w={pos:w,idx}); };
  const topoOf=m=>{ let t=topos.get(m); if(!t){ const g=worldGeo(m); t=topo(g.pos,g.idx); topos.set(m,t); } return t; };

  /* ---- visibility ---- */
  function updCentre(){ const v=visibleMeshes(); visCentre=v.length?boxOf(v).getCenter(new THREE.Vector3()):null; }
  function applyVis(){ meshes.forEach((m,i)=>{ m.visible=VIS.leafVisible(i); }); rebuildEdges(); updCentre(); if(sel&&!T.nodes.get(sel).meshes.some(i=>meshes[i].visible)){ setSel(null); } draw(); renderPanel(); renderFoot(); updBar(); }
  /* ---- undo / redo (Kyle, Nov 19: "when you hide something you should be able to go back") ----
     Every hide / show / show only / show all goes through visDo, which saves what was showing first. Steps that also
     moved the camera (Show only, Exit isolation, Show all from an empty screen) save the camera too, so Undo puts the
     view back where it was. Up to 100 steps; a new change clears Redo. */
  const hist=[], redoS=[];
  const camSnap=()=>({p:cam.position.clone(),q:cam.quaternion.clone(),u:cam.up.clone(),t:ctl?ctl.target.clone():null});
  const visSnap=()=>({hidden:new Set(VIS.hidden),iso:VIS.iso,saved:VIS.saved?new Set(VIS.saved):null,cam:camSnap()});
  function visRestore(s,withCam){ VIS.hidden=new Set(s.hidden); VIS.iso=s.iso; VIS.saved=s.saved?new Set(s.saved):null;
    if(withCam){ anim++; ctl&&ctl.stop&&ctl.stop(); cam.position.copy(s.cam.p); cam.quaternion.copy(s.cam.q); cam.up.copy(s.cam.u); if(ctl&&s.cam.t) ctl.target.copy(s.cam.t); cam.updateMatrixWorld(); }
    applyVis(); }
  const keyOf=()=>[...VIS.hidden].sort().join("|")+"§"+(VIS.iso||"");
  function visDo(what,fn,fit){ const before=visSnap(), k0=keyOf(); fn(); if(keyOf()===k0){ applyVis(); return; }   // nothing changed: no undo step
    hist.push({s:before,fit:!!fit,what}); if(hist.length>100) hist.shift(); redoS.length=0;
    applyVis(); if(fit) fitVisible(); toast(what); }
  function undo(){ const h=hist.pop(); if(!h) return; redoS.push({s:visSnap(),fit:h.fit,what:h.what}); visRestore(h.s,h.fit); toast("Undone: "+h.what); }
  function redo(){ const h=redoS.pop(); if(!h) return; hist.push({s:visSnap(),fit:h.fit,what:h.what}); visRestore(h.s,h.fit); toast("Redone: "+h.what); }
  const nm=id=>T.nodes.get(id).name;
  let toastEl=null, toastT=0;
  function toast(t){ if(!toastEl){ toastEl=document.createElement("div"); toastEl.className="a3toast"; toastEl.setAttribute("role","status"); cv.appendChild(toastEl); }
    toastEl.textContent=t; toastEl.classList.add("on"); clearTimeout(toastT); toastT=setTimeout(()=>toastEl&&toastEl.classList.remove("on"),2200); }
  /* ---- selection ---- */
  const selOutline=new THREE.Group(); scene.add(selOutline);
  function paint(){ const ids=new Set(sel?T.nodes.get(sel).meshes:[]);
    meshes.forEach((m,i)=>{ m.material=ids.has(i)?selMat:baseMat(m); });
    while(selOutline.children.length){ const c=selOutline.children.pop(); c.geometry.dispose(); }
    if(ids.size&&ids.size<=400){ const om=new THREE.LineBasicMaterial({color:0xffe066,depthTest:false,transparent:true,opacity:0.95}); ids.forEach(i=>{ const l=new THREE.LineSegments(new THREE.EdgesGeometry(meshes[i].geometry,25),om); l.matrixAutoUpdate=false; l.matrix.copy(meshes[i].matrixWorld); l.renderOrder=8; selOutline.add(l); }); }
    draw(); }
  function setSel(id,from){ sel=id; selCentre=id?boxOf(T.nodes.get(id).meshes.map(i=>meshes[i])).getCenter(new THREE.Vector3()):null; paint(); renderFoot(); updBar(); if(from!=="tree") renderPanel(true); }
  const leafFor=mi=>T.leafOf[mi];
  // the real Fusion assembly above a row (skips the app's Hardware / Truck & tools groups)
  const realParent=id=>{ let n=T.nodes.get(id); if(n.kind==="body") n=T.nodes.get(n.parent); return n.fparent||null; };
  const parentAsm=id=>{ const n=T.nodes.get(id); if(n.kind==="group") return id; return realParent(id)||(n.kind==="body"?n.parent:id); };

  /* ---- measurement graphics ---- */
  const mg=new THREE.Group(); scene.add(mg);
  function clearMG(){ while(mg.children.length){ const c=mg.children.pop(); c.geometry&&c.geometry.dispose(); } labels.splice(0).forEach(l=>l.el.remove()); draw(); }
  function faceMesh(m,F,color){ const g=worldGeo(m); const arr=new Float32Array(F.tris.length*9); F.tris.forEach((t,k)=>{ for(let j=0;j<3;j++){ const vi=g.idx[t*3+j]; arr.set([g.pos[vi*3],g.pos[vi*3+1],g.pos[vi*3+2]],k*9+j*3); } });
    const bg=new THREE.BufferGeometry(); bg.setAttribute("position",new THREE.BufferAttribute(arr,3));
    const mm=new THREE.Mesh(bg,new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.55,side:THREE.DoubleSide,depthTest:true,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2})); mm.renderOrder=7; mg.add(mm); }
  const V=a=>new THREE.Vector3(a[0],a[1],a[2]);
  function seg(a,b,color,dashed){ const g=new THREE.BufferGeometry().setFromPoints([a,b]); const l=dashed?new THREE.Line(g,new THREE.LineDashedMaterial({color,dashSize:sizeAll/300,gapSize:sizeAll/500,depthTest:false})):new THREE.Line(g,new THREE.LineBasicMaterial({color,depthTest:false})); if(dashed) l.computeLineDistances(); l.renderOrder=9; mg.add(l); }
  function arrow(at,dir){ const h=Math.max(2,Math.min(25,at.distanceTo(cam.position)/60)); const c=new THREE.Mesh(new THREE.ConeGeometry(h*0.35,h,10),new THREE.MeshBasicMaterial({color:0xffd400,depthTest:false})); c.position.copy(at).add(dir.clone().multiplyScalar(-h/2)); c.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.clone().normalize()); c.renderOrder=10; mg.add(c); }
  function dot3(p,color){ const s=new THREE.Mesh(new THREE.SphereGeometry(Math.max(1.5,p.distanceTo(cam.position)/180),12,8),new THREE.MeshBasicMaterial({color,depthTest:false})); s.position.copy(p); s.renderOrder=10; mg.add(s); }
  function label(p,text){ const el=document.createElement("div"); el.className="a3lbl"; el.textContent=text; cv.appendChild(el); labels.push({el,p:p.clone()}); draw(); }
  function drawMeasure(){
    clearMG();
    if(mType==="face"){
      if(mA) faceMesh(mA.m,mA.F,0x2f8ff0); if(mB) faceMesh(mB.m,mB.F,0xff8a2a);
      if(mA&&mB){ const R=faceToFace(mA.F,mB.F); if(R.kind==="parallel"){ const D=dimLine(mA.F,mB.F,mA.pt,mB.pt,R); const P=V(D.P), Q=V(D.Q);
          seg(P,Q,0xffd400); if(P.distanceTo(Q)>0.01){ arrow(Q,Q.clone().sub(P)); arrow(P,P.clone().sub(Q)); }
          seg(Q,V(D.QB),0xffd400,true); seg(P,V(mA.pt),0xffd400,true);
          label(P.clone().add(Q).multiplyScalar(0.5),fmtLen(R.dist,units)); } }
    } else {
      if(pA) dot3(pA.p,0x2f8ff0); if(pB) dot3(pB.p,0xff8a2a);
      if(pA&&pB){ seg(pA.p,pB.p,0xffd400); label(pA.p.clone().add(pB.p).multiplyScalar(0.5),fmtLen(pA.p.distanceTo(pB.p),units)); }
    }
    draw(); }

  /* ---- panel (assemblies) ---- */
  const openRows=new Set(); let q="";
  T.roots.forEach(r=>{ if(T.roots.length<=3) openRows.add(r); });
  const ST_LABEL={visible:"Showing",hidden:"Hidden",partial:"Partly showing"};
  function rowHtml(id,d){ const n=T.nodes.get(id), st=VIS.state(id), kids=n.kids.length;
    const kindTxt=n.kind==="asm"||n.kind==="group"?`${n.meshes.length} part${n.meshes.length===1?"":"s"}`:n.kind==="body"?"":"";
    return `<div class="a3row${sel===id?" sel":""}${st==="hidden"?" hid":""}" role="treeitem" aria-level="${d+1}" ${kids?`aria-expanded="${openRows.has(id)}"`:""} aria-selected="${sel===id}" style="padding-left:${d*14}px" data-id="${E(id)}">
      ${kids?`<button class="ex" type="button" data-ex="1" aria-expanded="${openRows.has(id)}" aria-label="${openRows.has(id)?"Collapse":"Expand"} ${E(n.name)}">${svg("chev",16)}</button>`:`<span></span>`}
      <button class="nm" type="button" data-pick="1" title="Select ${E(n.name)}">${E(n.name)}${kindTxt?`<small>${kindTxt}</small>`:""}</button>
      <button class="eye" type="button" data-eye="1" data-st="${st}" aria-label="${st==="visible"?"Hide":"Show"} ${E(n.name)} (${ST_LABEL[st]})" title="${ST_LABEL[st]} - tap to ${st==="visible"?"hide":"show"}">${svg(st==="visible"?"eye":st==="hidden"?"off":"half")}</button></div>`; }
  function treeHtml(ids,d){ return ids.map(id=>rowHtml(id,d)+(openRows.has(id)?treeHtml(T.nodes.get(id).kids,d+1):"")).join(""); }
  function renderPanel(scrollToSel){
    if(panel.hidden) return;
    const words=q.toLowerCase().split(/\s+/).filter(Boolean);
    let list;
    if(words.length){ const hits=[...T.nodes.values()].filter(n=>words.every(w=>(n.name+" "+n.raw).toLowerCase().includes(w))).slice(0,200);
      list=hits.length?hits.map(n=>{ const c=crumbs(T,n.id); return rowHtml(n.id,0).replace(/(<button class="nm"[^>]*>)([^<]*)/,(m0,a,b)=>a+b+(c.length?`<small>in ${E(c.join(" › "))}</small>`:"")); }).join(""):`<div class="a3hidl">No assembly or part matches “${E(q)}”.</div>`; }
    else list=treeHtml(T.roots,0);
    const hidN=VIS.hiddenLeaves(), hidIds=[...VIS.hidden];
    const iso=VIS.iso?T.nodes.get(VIS.iso):null;
    const qh=panel.querySelector("#a3q"), had=document.activeElement===qh, sp=had?qh.selectionStart:0, sc=panel.querySelector(".a3list")?panel.querySelector(".a3list").scrollTop:0;
    panel.innerHTML=`<div class="a3ph"><label class="a3q">${svg("search",18)}<input id="a3q" type="search" placeholder="Find an assembly or part" value="${E(q)}" aria-label="Find an assembly or part"></label>
      <div class="row"><button class="a3b" type="button" data-pa="all">Show all</button><button class="a3b" type="button" data-pa="only" ${sel?"":"disabled"}>Show only selected</button><button class="a3b" type="button" data-pa="zoom" ${sel?"":"disabled"}>Zoom to selected</button></div></div>
      ${iso?`<div class="a3iso">Showing only <b>${E(iso.name)}</b><button class="a3b" type="button" data-pa="exit" style="min-height:36px">Exit isolation</button></div>`:""}
      ${hidN&&!iso?`<details class="a3hidl"><summary>${hidN} part${hidN===1?"":"s"} hidden - find and show them</summary>${hidIds.map(id=>`<div class="hr"><span>${E(T.nodes.get(id).name)}${crumbs(T,id).length?` <small style="color:var(--a3mut)">in ${E(crumbs(T,id).join(" › "))}</small>`:""}</span><button class="a3b" type="button" data-un="${E(id)}" style="min-height:36px">Show</button></div>`).join("")}</details>`:""}
      <div class="a3list" role="tree" aria-label="Assemblies and parts">${list}</div>`;
    const qi=panel.querySelector("#a3q"); qi.oninput=()=>{ q=qi.value; renderPanel(); };
    if(had){ qi.focus(); qi.setSelectionRange(sp,sp); }
    const L2=panel.querySelector(".a3list"); L2.scrollTop=sc;
    panel.querySelectorAll(".a3row").forEach(r=>{ const id=r.dataset.id;
      const ex=r.querySelector("[data-ex]"); if(ex) ex.onclick=()=>{ openRows.has(id)?openRows.delete(id):openRows.add(id); renderPanel(); };
      r.querySelector("[data-pick]").onclick=()=>{ setSel(sel===id?null:id,"tree"); renderPanel(); };
      r.querySelector("[data-eye]").onclick=()=>{ const was=VIS.state(id)==="visible"; visDo((was?"Hid ":"Showed ")+nm(id),()=>VIS.toggle(id)); const b=panel.querySelector(`.a3row[data-id="${CSS.escape(id)}"] [data-eye]`); if(b) b.focus(); }; });
    panel.querySelectorAll("[data-un]").forEach(b=>b.onclick=()=>visDo("Showed "+nm(b.dataset.un),()=>VIS.show(b.dataset.un)));
    panel.querySelector('[data-pa="all"]').onclick=()=>visDo("Showed all",()=>VIS.showAll());
    const po=panel.querySelector('[data-pa="only"]'); po.onclick=()=>{ if(!sel) return; const id=sel; visDo("Showing only "+nm(id),()=>VIS.isolate(id),true); };
    panel.querySelector('[data-pa="zoom"]').onclick=()=>zoomSel();
    const pe=panel.querySelector('[data-pa="exit"]'); if(pe) pe.onclick=()=>visDo("Back to all parts",()=>VIS.exitIso(),true);
    if(scrollToSel&&sel){ const r=panel.querySelector(`.a3row[data-id="${CSS.escape(sel)}"]`); if(r) r.scrollIntoView({block:"nearest"}); }
  }
  function revealInTree(id){ ancestors(T,id).forEach(a=>openRows.add(a)); }
  const zoomSel=()=>{ if(!sel) return; frame(boxOf(T.nodes.get(sel).meshes.map(i=>meshes[i]).filter(m=>m.visible)),null,true); };

  /* ---- footer: selection card or measure panel ---- */
  function renderFoot(){
    if(mode==="measure") return renderMeasure();
    if(mode==="hide"){ const hn=VIS.hiddenLeaves();
      foot.innerHTML=`<div class="a3hidebar"><div class="a3name" style="font-size:15px">Tap to hide: every ${selMode==="asm"?"assembly":"part"} you tap disappears.</div>
        <div class="a3line"><span class="a3lab" id="a3hml">Tap hides a</span><div class="a3seg" role="group" aria-labelledby="a3hml"><button type="button" data-sm="part" aria-pressed="${selMode==="part"}">Part</button><button type="button" data-sm="asm" aria-pressed="${selMode==="asm"}">Assembly</button></div></div>
        <div class="a3note">Undo (bottom left) brings back the last one, one step at a time. ${hn?hn+" part"+(hn===1?"":"s")+" hidden so far.":""}</div>
        <div class="a3acts"><button class="a3b pri" type="button" data-hx="done">Done hiding</button></div></div>`;
      foot.querySelectorAll("[data-sm]").forEach(b=>b.onclick=()=>{ selMode=b.dataset.sm; renderFoot(); });
      foot.querySelector('[data-hx="done"]').onclick=()=>setMode("select"); return; }
    const segSel=`<div class="a3line"><span class="a3lab" id="a3sml">Tap selects a</span><div class="a3seg" role="group" aria-labelledby="a3sml"><button type="button" data-sm="part" aria-pressed="${selMode==="part"}">Part</button><button type="button" data-sm="asm" aria-pressed="${selMode==="asm"}">Assembly</button></div></div>`;
    if(!sel){ const hn=VIS.hiddenLeaves();
      foot.innerHTML=`${segSel}<div class="a3note">Tap the model to select. One finger spins around whatever is in the middle of the screen (green dot), two fingers zoom and move (mouse: drag to spin, right-drag to move, wheel to zoom).${hn?` ${hn} part${hn===1?" is":"s are"} hidden - Assemblies shows them.`:""}</div><div class="a3note">Model reference - the drawings and parts list are the boss.</div>`;
      if(!visibleMeshes().length){ foot.innerHTML=`<div class="a3warn">Nothing is showing - every part is hidden.</div><div class="a3acts"><button class="a3b pri" type="button" data-fa="showall">Show all</button></div>`;
        foot.querySelector('[data-fa="showall"]').onclick=()=>visDo("Showed all",()=>VIS.showAll(),true); } }
    else { const n=T.nodes.get(sel), cr=ancestors(T,sel), mi=n.meshes[0], u=mi!=null?meshes[mi].userData:{};
      const isAsm=n.kind==="asm"||n.kind==="group"||(n.kind==="part"&&n.kids.length), pns=n.meshes.length===1?(u.pn||[]):[];
      const asmId=n.kind==="group"?null:realParent(sel);
      const drw=pns.length&&opts.drawingFor?pns.filter(pn=>opts.drawingFor(pn,true)):[];
      foot.innerHTML=`${segSel}
        <div><div class="a3lab">${n.kind==="group"?"Group (in the app only)":n.kind==="asm"?"Assembly":n.kind==="body"?"Part (body)":"Part"}${isAsm?` · ${n.meshes.length} parts`:""}</div>
          <div class="a3name" id="a3selname">${E(n.name)}</div>
          ${cr.length?`<nav class="a3crumb" aria-label="Assembly levels">${cr.map((a,k)=>`${k?"<span aria-hidden=true>›</span>":""}<button type="button" data-lvl="${E(a)}" title="Select this whole assembly">${E(T.nodes.get(a).name)}</button>`).join("")}</nav>`:""}</div>
        <div class="a3acts">
          <button class="a3b" type="button" data-fa="hide">${n.kind==="group"?"Hide group":isAsm?"Hide assembly":"Hide part"}</button>
          ${!isAsm&&asmId?`<button class="a3b" type="button" data-fa="hideasm" title="Hide ${E(T.nodes.get(asmId).name)}">Hide assembly</button>`:""}
          <button class="a3b" type="button" data-fa="only">${n.kind==="group"?"Show only group":isAsm?"Show only assembly":"Show only part"}</button>
          ${!isAsm&&asmId?`<button class="a3b" type="button" data-fa="onlyasm">Show only assembly</button>`:""}
          <button class="a3b" type="button" data-fa="zoom">Zoom to</button>
          ${drw.length?drw.map(pn=>`<button class="a3b" type="button" data-dr="${E(pn)}">Open drawing${drw.length>1?" "+E(pn):""}</button>`).join(""):""}
          ${pns.length&&opts.onPart?pns.map(pn=>`<button class="a3b" type="button" data-p3="${E(pn)}">Exact 3D${pns.length>1?" "+E(pn):""}</button>`).join(""):""}
        </div>
        ${!isAsm&&!pns.length?`<div class="a3note">No drawing linked: this part isn't matched to a laser part on the parts list (bought part, tube, hardware, or not confidently matched). Nothing is guessed from the name.</div>`:pns.length&&!drw.length?`<div class="a3note">${E(pns.join(", "))} has no drawing uploaded yet.</div>`:""}
        ${n.kind==="group"?`<div class="a3note">${n.id.endsWith("(truck)")?"The truck and loose tools - not fabricated. Hide this to see only what we build.":"Bolts, nuts, washers, screws and pins, gathered here by the app so the list stays short. In Fusion they sit where the breadcrumb shows."}</div>`:""}<details class="a3det"${n.kind==="group"?" hidden":""}><summary>Details</summary><div>Imported name: ${E(u.comp||n.raw)}${u.body?" · "+E(u.body):""}<br>Fusion path: ${E(n.kind==="body"?n.parent:n.id)}${u.mat?"<br>Material: "+E(u.mat):""}${pns.length?"<br>Part number: "+E(pns.join(", ")):""}</div></details>`; }
    foot.querySelectorAll("[data-sm]").forEach(b=>b.onclick=()=>{ selMode=b.dataset.sm; if(sel){ const n=T.nodes.get(sel); if(selMode==="asm"&&n.kind!=="asm"&&n.kind!=="group") setSel(parentAsm(sel)); } renderFoot(); });
    foot.querySelectorAll("[data-lvl]").forEach(b=>b.onclick=()=>{ revealInTree(b.dataset.lvl); setSel(b.dataset.lvl); });
    const fa=k=>foot.querySelector(`[data-fa="${k}"]`);
    if(fa("hide")) fa("hide").onclick=()=>{ const id=sel; visDo("Hid "+nm(id),()=>VIS.hide(id)); };
    if(fa("hideasm")) fa("hideasm").onclick=()=>{ const a=realParent(sel); if(a) visDo("Hid "+nm(a),()=>VIS.hide(a)); };
    if(fa("only")) fa("only").onclick=()=>{ const id=sel; visDo("Showing only "+nm(id),()=>VIS.isolate(id),true); };
    if(fa("onlyasm")) fa("onlyasm").onclick=()=>{ const a=realParent(sel); if(a) visDo("Showing only "+nm(a),()=>VIS.isolate(a),true); };
    if(fa("zoom")) fa("zoom").onclick=zoomSel;
    foot.querySelectorAll("[data-dr]").forEach(b=>b.onclick=()=>showDrawing(b.dataset.dr));
    foot.querySelectorAll("[data-p3]").forEach(b=>b.onclick=()=>opts.onPart(b.dataset.p3));
  }
  async function showDrawing(pn){ const d=opts.drawingFor&&await opts.drawingFor(pn); if(!d||!d.url){ alert("Couldn't open the drawing for "+pn); return; }
    const o=document.createElement("div"); o.className="a3draw"; o.setAttribute("role","dialog"); o.setAttribute("aria-label",d.title||pn);
    o.innerHTML=`<div class="a3line"><b style="flex:1">${E(d.title||pn)}</b><button class="a3b" type="button" id="a3dx">Close drawing</button></div><img alt="${E(d.title||pn)}" src="${E(d.url)}">`;
    cv.appendChild(o); const x=o.querySelector("#a3dx"); x.onclick=()=>o.remove(); setTimeout(()=>x.focus(),30); }
  function renderMeasure(){
    const R=mType==="face"&&mA&&mB?faceToFace(mA.F,mB.F):null;
    let prompt="", res="";
    if(mType==="face"){
      if(!mA) prompt="Select the first face."; else if(!mB) prompt="Select the second face.";
      if(mA&&!mA.F.ok) res=`<div class="a3warn">That's a curved surface (bend, hole or round part). Face to face needs two flat faces - tap a flat face, or use Point to point.</div>`;
      else if(mB&&!mB.F.ok) res=`<div class="a3warn">The second pick is a curved surface. Face to face needs two flat faces - change the second face, or use Point to point.</div>`;
      else if(R&&R.kind==="parallel") res=`<div class="a3res">${fmtLen(R.dist,units)}<small>Face to face · parallel faces${R.facing==="facing"?"":" (facing the same way)"} · measured square to the faces, the same anywhere on them · about ±${units==="mm"?ACC_MM.toFixed(1)+" mm":(ACC_MM/25.4).toFixed(3)+'"'}</small></div>`;
      else if(R&&R.kind==="nearly") res=`<div class="a3warn"><b>Not parallel</b> - these faces are ${R.angle.toFixed(1)}° apart, so there's no single face-to-face gap. Across the two faces it runs from ${fmtLen(R.min,units)} to ${fmtLen(R.max,units)}.</div>`;
      else if(R&&R.kind==="angle") res=`<div class="a3res">${R.angle.toFixed(1)}°<small>Angle between the faces (not a distance) · 90° = square</small></div>`;
    } else {
      if(!pA) prompt="Tap the first point (it snaps to a mesh corner when one is close)."; else if(!pB) prompt="Tap the second point.";
      if(pA&&pB) res=`<div class="a3res">${fmtLen(pA.p.distanceTo(pB.p),units)}<small>Point to point · ${pA.snap&&pB.snap?"both snapped to mesh corners":"from where you tapped (not snapped)"} - not a face-to-face size</small></div>`;
    }
    const has=mType==="face"?(mA||mB):(pA||pB);
    foot.innerHTML=`<div class="a3line"><div class="a3seg" role="group" aria-label="Measure"><button type="button" data-mt="face" aria-pressed="${mType==="face"}">Face to face</button><button type="button" data-mt="point" aria-pressed="${mType==="point"}">Point to point</button></div>
        <span class="a3lab" id="a3ul">Units:</span><div class="a3seg" role="group" aria-labelledby="a3ul"><button type="button" data-u="in" aria-pressed="${units==="in"}">inches</button><button type="button" data-u="mm" aria-pressed="${units==="mm"}">mm</button></div></div>
      ${prompt?`<div class="a3name" style="font-size:15px">${prompt}</div>`:""}${res}
      <div class="a3acts">${mType==="face"&&mA?`<button class="a3b" type="button" data-mx="a">Change first face</button>`:""}${mType==="face"&&mB?`<button class="a3b" type="button" data-mx="b">Change second face</button>`:""}
        ${has?`<button class="a3b" type="button" data-mx="new">New measurement</button><button class="a3b" type="button" data-mx="clear">Clear</button>`:""}<button class="a3b" type="button" data-mx="done">Done measuring</button></div>
      <div class="a3note">${mType==="face"?"Flat faces are rebuilt from the model's mesh (no CAD faces in this file): good to about ±0.1 mm on flat faces. Curved faces aren't measured here - open the part's Exact 3D for holes and bends.":"Point to point measures between two tapped points - use Face to face for plate gaps and thicknesses."}</div>`;
    foot.querySelectorAll("[data-mt]").forEach(b=>b.onclick=()=>{ mType=b.dataset.mt; mA=mB=pA=pB=null; mPick="A"; drawMeasure(); renderMeasure(); });
    foot.querySelectorAll("[data-u]").forEach(b=>b.onclick=()=>{ units=b.dataset.u; try{ localStorage.setItem("gvc_a3_units",units); }catch(e){} drawMeasure(); renderMeasure(); });
    foot.querySelectorAll("[data-mx]").forEach(b=>b.onclick=()=>{ const k=b.dataset.mx;
      if(k==="a"){ mA=null; mPick="A"; } else if(k==="b"){ mB=null; mPick="B"; } else if(k==="new"||k==="clear"){ mA=mB=pA=pB=null; mPick="A"; }
      if(k==="done"){ setMode("select"); return; } drawMeasure(); renderMeasure(); });
  }
  function setMode(m){ mode=m; $("#a3meas").setAttribute("aria-pressed",m==="measure");
    mA=mB=pA=pB=null; mPick="A"; if(m==="measure") mType="face";   // picks never carry over into another mode
    if(m!=="select"&&sel) setSel(null);
    clearMG(); drawMeasure(); renderFoot(); updBar(); }

  /* ---- taps ---- */
  function tap(x,y){ ctl&&ctl.stop();
    const h=hit(x,y);
    if(mode==="hide"){ if(!h) return; const leaf=leafFor(h.object.userData._i); const id=selMode==="asm"?parentAsm(leaf):leaf; visDo("Hid "+nm(id),()=>VIS.hide(id)); return; }
    if(mode==="select"){ if(!h){ setSel(null); return; } const leaf=leafFor(h.object.userData._i); const id=selMode==="asm"?parentAsm(leaf):leaf; revealInTree(id); setSel(id); return; }
    if(!h) return;
    if(mType==="face"){ const m=h.object, g=worldGeo(m), F=flatFace(g.pos,g.idx,topoOf(m),h.faceIndex); const pk={m,F,pt:[h.point.x,h.point.y,h.point.z]};
      if(mPick==="done"){ mA=pk; mB=null; mPick="B"; }          // both already picked: a new tap starts a new measurement
      else if(mPick==="A"||!mA){ mA=pk; mPick=mB?"done":"B"; } else { mB=pk; mPick="done"; }
      drawMeasure(); renderMeasure(); return; }
    // point to point: snap to the nearest corner of the tapped triangle when it's within 24 px on screen
    const r=renderer.domElement.getBoundingClientRect(), pos=h.object.geometry.getAttribute("position"); let best=h.point.clone(), bd=24*24, snapped=false;
    [h.face.a,h.face.b,h.face.c].forEach(i=>{ const v=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(h.object.matrixWorld); const s=v.clone().project(cam); const d=(((s.x+1)/2*r.width+r.left)-x)**2+(((1-s.y)/2*r.height+r.top)-y)**2; if(d<bd){ bd=d; best=v; snapped=true; } });
    const pk={p:best,snap:snapped}; if(!pA||(pA&&pB)){ pA=pk; pB=null; } else pB=pk; drawMeasure(); renderMeasure(); }
  let down=null, moved=false, fingers=0; const el=renderer.domElement;
  // event timestamps, not the clock when the handler runs: on a slow phone a frame can take longer than the tap
  el.addEventListener("pointerdown",e=>{ anim++; fingers++; if(fingers===1){ down={x:e.clientX,y:e.clientY,t:e.timeStamp}; moved=false; } else down=null; });
  el.addEventListener("pointermove",e=>{ if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>(ctl?ctl.TAP_PX:8)) moved=true; /* same distance the controls wait before spinning */ });
  el.addEventListener("pointerup",e=>{ fingers=Math.max(0,fingers-1); if(!down||moved||e.timeStamp-down.t>600){ if(fingers===0) down=null; return; } const x=down.x,y=down.y; down=null; tap(x,y); });
  el.addEventListener("pointercancel",()=>{ fingers=0; down=null; });

  /* ---- floating bar on the model (Nov 19): Undo / Redo always in reach, Tap to hide, Hide the selection, Show all ----
     Hiding used to need: select, scroll the card, Hide - and getting a part back meant digging in Assemblies. */
  const fb=document.createElement("div"); fb.className="a3fb";
  fb.innerHTML=`<button class="a3b" type="button" data-fb="undo" aria-label="Undo" title="Undo the last hide / show (Ctrl+Z)">${svg("undo")}<span class="lbl">Undo</span></button>
    <button class="a3b" type="button" data-fb="redo" aria-label="Redo" title="Redo (Ctrl+Y)">${svg("redo")}</button>
    <button class="a3b" type="button" data-fb="tap" aria-pressed="false" aria-label="Tap to hide" title="Tap to hide - each part you tap disappears">${svg("tapoff")}<span class="lbl">Tap to hide</span></button>
    <button class="a3b" type="button" data-fb="hide" aria-label="Hide selected" hidden>${svg("off")}<span class="lbl">Hide</span></button>
    <span class="gap"></span>
    <button class="a3b" type="button" data-fb="all" aria-label="Show all" hidden>${svg("eye")}<span class="lbl" data-fbn></span></button>`;
  cv.appendChild(fb);
  const fbB=k=>fb.querySelector(`[data-fb="${k}"]`);
  function updBar(){ if(!fb) return; const hn=VIS.hiddenLeaves();
    fbB("undo").disabled=!hist.length; fbB("redo").disabled=!redoS.length; fbB("redo").hidden=!redoS.length;
    const t=fbB("tap"); t.classList.toggle("on",mode==="hide"); t.setAttribute("aria-pressed",mode==="hide"); t.hidden=mode==="measure";
    fbB("hide").hidden=!(sel&&mode==="select");
    const a=fbB("all"); a.hidden=!hn; a.querySelector("[data-fbn]").textContent=VIS.iso?"Show all again":`Show all (${hn} hidden)`;
    if(hist.length){ fbB("undo").title="Undo: "+hist[hist.length-1].what; } }
  fbB("undo").onclick=undo; fbB("redo").onclick=redo;
  fbB("tap").onclick=()=>setMode(mode==="hide"?"select":"hide");
  fbB("hide").onclick=()=>{ if(!sel) return; const id=sel; visDo("Hid "+nm(id),()=>VIS.hide(id)); };
  fbB("all").onclick=()=>visDo("Showed all",()=>VIS.showAll(),true);
  const onKey=e=>{ if(disposed){ document.removeEventListener("keydown",onKey); return; } if(!(e.ctrlKey||e.metaKey)||/^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return; const k=e.key.toLowerCase();
    if(k==="z"&&!e.shiftKey){ e.preventDefault(); undo(); } else if(k==="y"||(k==="z"&&e.shiftKey)){ e.preventDefault(); redo(); } };
  document.addEventListener("keydown",onKey);   // on the document: focus often sits on the page after a button hides itself

  /* ---- toolbar ---- */
  const bAsm=$("#a3asm"), bView=$("#a3view"), bMeas=$("#a3meas"), bFit=$("#a3fit");
  bAsm.onclick=()=>{ panel.hidden=!panel.hidden; bAsm.setAttribute("aria-expanded",!panel.hidden); W.classList.toggle("sheet",!panel.hidden); /* phone portrait: the sheet replaces the footer card while open */ renderPanel(true); onResize(); if(window.innerWidth<=760) fitVisible(); if(!panel.hidden){ const f=panel.querySelector("#a3q"); if(f&&window.innerWidth>760) f.focus(); } };
  let menu=null; const closeMenu=()=>{ if(menu){ menu.remove(); menu=null; bView.setAttribute("aria-expanded","false"); return true; } return false; };
  bView.onclick=()=>{ if(closeMenu()) return; menu=document.createElement("div"); menu.className="a3menu"; menu.setAttribute("role","menu");
    menu.innerHTML=Object.keys(VIEWS).map(k=>`<button type="button" role="menuitem" data-v="${k}" class="${k==="Isometric"?"wide":""}">${k}</button>`).join("")+
      `<button type="button" role="menuitem" class="wide" data-v="reset">Reset view (camera only)</button>
       <label><input type="checkbox" id="a3cb" ${colourBy?"checked":""}> Colour by assembly</label><label><input type="checkbox" id="a3ed" ${edgesOn?"checked":""}> Edge lines</label>
       <div class="a3mh">Spinning</div>
       <div class="a3seg wide" role="group" aria-label="Spinning"><button type="button" data-up="1" aria-pressed="${PREF.upright}">Keep upright</button><button type="button" data-up="0" aria-pressed="${!PREF.upright}">Free orbit</button></div>
       <div class="a3seg wide" role="group" aria-label="Spin speed"><button type="button" data-sp="0.6" aria-pressed="${PREF.speed===0.6}">Slow</button><button type="button" data-sp="1" aria-pressed="${PREF.speed===1}">Normal</button><button type="button" data-sp="1.6" aria-pressed="${PREF.speed===1.6}">Fast</button></div>
       <label><input type="checkbox" id="a3sp" ${PREF.selOrbit?"checked":""}> Orbit around selection</label>`;
    const r=bView.getBoundingClientRect(), wr=W.getBoundingClientRect(); menu.style.top=(r.bottom-wr.top+6)+"px"; menu.style.left=Math.max(8,Math.min(r.left-wr.left,wr.width-270))+"px"; W.appendChild(menu); bView.setAttribute("aria-expanded","true");
    menu.querySelectorAll("[data-v]").forEach(b=>b.onclick=()=>{ const v=b.dataset.v; closeMenu(); if(v==="reset") resetView(); else frame(boxOf(visibleMeshes()),new THREE.Vector3(...VIEWS[v]),true); });
    menu.querySelector("#a3cb").onchange=e=>{ colourBy=e.target.checked; paint(); };
    menu.querySelectorAll("[data-up]").forEach(b=>b.onclick=()=>{ PREF.upright=b.dataset.up==="1"; savePref();
      if(PREF.upright&&cam.up.dot(UP)<0.2){ frame(boxOf(visibleMeshes()),cam.getWorldDirection(new THREE.Vector3()).negate().setComponent(upY?1:2,0).normalize().addScaledVector(UP,0.6).normalize(),true); }   // was upside down: stand it back up
      menu.querySelectorAll("[data-up]").forEach(x=>x.setAttribute("aria-pressed",x===b)); });
    menu.querySelectorAll("[data-sp]").forEach(b=>b.onclick=()=>{ PREF.speed=+b.dataset.sp; savePref(); menu.querySelectorAll("[data-sp]").forEach(x=>x.setAttribute("aria-pressed",x===b)); });
    menu.querySelector("#a3sp").onchange=e=>{ PREF.selOrbit=e.target.checked; savePref(); };
    menu.querySelector("#a3ed").onchange=e=>{ edgesOn=e.target.checked; rebuildEdges(); draw(); };
    setTimeout(()=>{ const f=menu&&menu.querySelector("button"); if(f) f.focus(); },20); };
  W.addEventListener("pointerdown",e=>{ if(menu&&!menu.contains(e.target)&&e.target!==bView&&!bView.contains(e.target)) closeMenu(); },true);
  bMeas.onclick=()=>setMode(mode==="measure"?"select":"measure");
  bFit.onclick=fitVisible;
  /* Escape / Android Back: close the innermost thing first (menu, drawing, measure, panel), then the viewer */
  const innerBack=()=>{ if(closeMenu()) return true; const d=cv.querySelector(".a3draw"); if(d){ d.remove(); return true; } if(mode==="measure"||mode==="hide"){ setMode("select"); return true; }
    if(!panel.hidden&&(window.innerWidth<=760||(window.matchMedia&&matchMedia("(pointer:coarse)").matches))){ bAsm.click(); return true; } return false; };   // phones: Back shuts the panel first
  window.__v3dBack=innerBack;

  /* ---- ready ---- */
  ov.hidden=true; W.querySelectorAll(".a3top .a3b").forEach(b=>b.disabled=false);
  if(window.innerWidth>1000){ panel.hidden=false; bAsm.setAttribute("aria-expanded","true"); W.classList.add("sheet"); }
  onResize(); resetView(); applyVis(); loop();
  window.__a3=window.__a3test?{ctl,PREF,UP,pivot:()=>pivotFn(),applyVis:()=>applyVis(),T,VIS,meshes,setSel:id=>setSel(id),tap,cam,frame,fitVisible,hitAt:hit,state:()=>({sel,mode,mType,mA:!!mA,mB:!!mB,units}),measure:()=>mA&&mB?faceToFace(mA.F,mB.F):null,renderer,boxOf,visibleMeshes}:undefined;
};
/* EXPORT NOTE - exact CAD faces in the whole-assembly view
   The assembly GLB comes from the Fusion mesh export (asm_mesh.json/bin -> glTF-Transform -> Draco) and has no
   face ids. For exact faces (holes, bends, true face boundaries) the export would need, per body, the triangle
   range of each B-Rep face (Fusion: BRepFace.meshManager per face) written as a per-triangle face-id attribute
   (e.g. _FACEID) or as extras {faces:[[firstTri,lastTri,"plane"|"cylinder",params...]]}. Not done here: it needs
   a re-export in Fusion and a new file in storage, which is a live-data change. */
})();
