/* ---------- 3D model viewer (Kyle, Nov 10 2026) ----------
   Opens a part's STEP (folded) from storage, spins it, and measures it - a help at the brake.
   Loaded only when 3D is opened: three.js (ES modules, own orbit controls) and occt-import-js
   (STEP reader, ~7 MB wasm) from jsdelivr. OCCT gives millimetres; shown in inches by default.
   Measure:
     Faces mode - tap a flat face: thickness there. Tap a round face: hole/pin diameter or bend radius.
                  Tap two flat faces: gap (parallel) or angle between them (bend angle).
     Points mode - tap two points (snaps to corners, edge ends and hole centres): distance.
   The bend drawing is the boss - this is a model reference only. */
(()=>{
const CDN={
  three:"https://cdn.jsdelivr.net/npm/three@0.170.0/+esm",
  /* Own orbit controls (makeControls below): three's Orbit stopped at straight up/down (Nov 10) and Trackball felt clunky (Nov 11). */
  occt:"https://cdn.jsdelivr.net/npm/occt-import-js@0.0.23/dist/",
  gltf:"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/GLTFLoader.js/+esm",
  draco:"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/loaders/DRACOLoader.js/+esm",
  dracoDec:"https://www.gstatic.com/draco/versioned/decoders/1.5.7/" };

/* ---------- math (no DOM, no three) - also used by the node tests ---------- */
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]], add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]], mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2], cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len=a=>Math.hypot(a[0],a[1],a[2]), unit=a=>{ const l=len(a)||1; return [a[0]/l,a[1]/l,a[2]/l]; };
const DEG=180/Math.PI;

/* smallest-eigenvalue eigenvector of a symmetric 3x3 (Jacobi) */
function eig3(m){
  const a=[[m[0][0],m[0][1],m[0][2]],[m[1][0],m[1][1],m[1][2]],[m[2][0],m[2][1],m[2][2]]], v=[[1,0,0],[0,1,0],[0,0,1]];
  for(let it=0;it<50;it++){
    let p=0,q=1,big=Math.abs(a[0][1]); if(Math.abs(a[0][2])>big){p=0;q=2;big=Math.abs(a[0][2]);} if(Math.abs(a[1][2])>big){p=1;q=2;big=Math.abs(a[1][2]);}
    if(big<1e-12) break;
    const th=(a[q][q]-a[p][p])/(2*a[p][q]), t=Math.sign(th||1)/(Math.abs(th)+Math.sqrt(th*th+1)), c=1/Math.sqrt(t*t+1), s=t*c;
    for(let k=0;k<3;k++){ const akp=a[k][p], akq=a[k][q]; a[k][p]=c*akp-s*akq; a[k][q]=s*akp+c*akq; }
    for(let k=0;k<3;k++){ const apk=a[p][k], aqk=a[q][k]; a[p][k]=c*apk-s*aqk; a[q][k]=s*apk+c*aqk; }
    for(let k=0;k<3;k++){ const vkp=v[k][p], vkq=v[k][q]; v[k][p]=c*vkp-s*vkq; v[k][q]=s*vkp+c*vkq; }
  }
  const vals=[a[0][0],a[1][1],a[2][2]]; const i=vals.indexOf(Math.min(...vals));
  return {val:vals[i], vec:unit([v[0][i],v[1][i],v[2][i]]), vals};
}

/* one merged mesh from occt meshes; tri -> CAD face id */
function merge(res){
  let nv=0, nt=0; res.meshes.forEach(m=>{ nv+=m.attributes.position.array.length/3; nt+=m.index.array.length/3; });
  const pos=new Float32Array(nv*3), nrm=new Float32Array(nv*3), idx=new Uint32Array(nt*3), tf=new Int32Array(nt); const faces=[];
  let vo=0, to=0;
  res.meshes.forEach((m,mi)=>{
    const p=m.attributes.position.array, n=m.attributes.normal&&m.attributes.normal.array, ix=m.index.array, nvm=p.length/3;
    pos.set(p,vo*3); if(n&&n.length===p.length) nrm.set(n,vo*3);
    for(let i=0;i<ix.length;i++) idx[to*3+i]=ix[i]+vo;
    tf.fill(-1,to,to+ix.length/3);
    (m.brep_faces||[]).forEach(f=>{ if(f.last<f.first) return; const id=faces.length; faces.push({id,mesh:mi}); for(let t=f.first;t<=f.last;t++) tf[to+t]=id; });
    for(let t=to;t<to+ix.length/3;t++) if(tf[t]<0){ tf[t]=faces.length; faces.push({id:faces.length,mesh:mi}); }   // no brep info: one face per triangle
    vo+=nvm; to+=ix.length/3;
  });
  return {pos,nrm,idx,tf,faces};
}
const vtx=(M,i)=>[M.pos[i*3],M.pos[i*3+1],M.pos[i*3+2]];
function triN(M,t){ const a=vtx(M,M.idx[t*3]), b=vtx(M,M.idx[t*3+1]), c=vtx(M,M.idx[t*3+2]); const n=cross(sub(b,a),sub(c,a)); return {n, area:len(n)/2, c:mul(add(add(a,b),c),1/3)}; }

/* classify every CAD face: plane (normal, point) or cylinder (axis, centre, radius, arc, convex) */
function analyze(M){
  const tris=M.faces.map(()=>[]); for(let t=0;t<M.tf.length;t++) tris[M.tf[t]].push(t);
  M.faces.forEach((F,i)=>{
    const ts=tris[i]; F.tris=ts; let area=0, N=[0,0,0], C=[0,0,0]; const ns=[];
    ts.forEach(t=>{ const r=triN(M,t); if(r.area<=0) return; area+=r.area; N=add(N,r.n); C=add(C,mul(r.c,r.area)); ns.push([unit(r.n),r.area]); });
    F.area=area; if(!area){ F.kind="other"; return; }
    C=mul(C,1/area); const nu=unit(N); F.c=C;
    let maxDev=0; ns.forEach(([n])=>{ maxDev=Math.max(maxDev,1-dot(n,nu)); });
    if(maxDev<1e-3){ F.kind="plane"; F.n=nu; F.p=C; return; }
    // cylinder? all normals perpendicular to one axis
    const cov=[[0,0,0],[0,0,0],[0,0,0]]; ns.forEach(([n,w])=>{ for(let r=0;r<3;r++) for(let c=0;c<3;c++) cov[r][c]+=w*n[r]*n[c]; });
    const e=eig3(cov); const ax=e.vec; let off=0; ns.forEach(([n])=>{ off=Math.max(off,Math.abs(dot(n,ax))); });
    if(off>0.02){ F.kind="other"; return; }
    // circle fit in the plane square to the axis (Kasa), on the face's vertices
    const u=unit(Math.abs(ax[0])<0.9?cross(ax,[1,0,0]):cross(ax,[0,1,0])), w=cross(ax,u);
    const seen=new Set(), pts=[]; let amin=1e18, amax=-1e18;
    ts.forEach(t=>{ for(let k=0;k<3;k++){ const vi=M.idx[t*3+k]; if(seen.has(vi)) continue; seen.add(vi); const p=vtx(M,vi); pts.push([dot(p,u),dot(p,w)]); const h=dot(p,ax); amin=Math.min(amin,h); amax=Math.max(amax,h); } });
    let sx=0,sy=0,sxx=0,syy=0,sxy=0,sxz=0,syz=0,sz=0; const n=pts.length;
    pts.forEach(([x,y])=>{ const z=x*x+y*y; sx+=x; sy+=y; sxx+=x*x; syy+=y*y; sxy+=x*y; sxz+=x*z; syz+=y*z; sz+=z; });
    // solve [sxx sxy sx; sxy syy sy; sx sy n] [A B Cc] = [sxz syz sz]; centre (A/2,B/2)
    const A=[[sxx,sxy,sx],[sxy,syy,sy],[sx,sy,n]], b=[sxz,syz,sz];
    const det=m=>m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
    const D=det(A); if(Math.abs(D)<1e-12){ F.kind="other"; return; }
    const col=(k)=>A.map((r,i)=>r.map((v,j)=>j===k?b[i]:v));
    const sa=det(col(0))/D, sb=det(col(1))/D, sc=det(col(2))/D; const cx=sa/2, cy=sb/2, R=Math.sqrt(Math.max(0,sc+cx*cx+cy*cy));
    let res=0; pts.forEach(([x,y])=>{ res=Math.max(res,Math.abs(Math.hypot(x-cx,y-cy)-R)); });
    if(!(R>0)||res>Math.max(0.02,R*0.03)){ F.kind="other"; return; }
    // arc covered: sort the angles, the biggest gap is the open part
    const ang=pts.map(([x,y])=>Math.atan2(y-cy,x-cx)).sort((p,q)=>p-q); let gap=0; for(let k=0;k<ang.length;k++){ const g=(k+1<ang.length?ang[k+1]:ang[0]+2*Math.PI)-ang[k]; gap=Math.max(gap,g); }
    const centre=add(mul(u,cx),mul(w,cy));   // in the plane, at axis height 0
    // convex (pin / outside of a bend) when the normals point away from the axis
    let cvx=0; ts.forEach(t=>{ const r=triN(M,t); const rad=sub(r.c,add(centre,mul(ax,dot(r.c,ax)))); cvx+=dot(r.n,rad); });
    const arc=(2*Math.PI-gap)*DEG; if(arc<2){ F.kind="other"; return; }
    Object.assign(F,{kind:"cyl", ax, r:R, arc, convex:cvx>0, h:amax-amin, ends:[add(centre,mul(ax,amin)),add(centre,mul(ax,amax))]});
  });
  // sheet thickness: biggest flat face to the nearest face that faces the other way
  const pl=M.faces.filter(F=>F.kind==="plane").sort((a,b)=>b.area-a.area); M.t=null;
  { const votes={};   // most common nearest-opposite-face distance over the biggest flat faces (one odd face can't fool it)
    for(const A of pl.slice(0,8)){ let best=null; pl.forEach(B=>{ if(dot(A.n,B.n)>-0.9998) return; const d=Math.abs(dot(sub(B.p,A.p),A.n)); if(d>0.1&&(best===null||d<best)) best=d; });
      if(best!==null){ const k=best.toFixed(2); votes[k]=(votes[k]||0)+A.area; } }
    const k=Object.keys(votes).sort((a,b)=>votes[b]-votes[a])[0]; if(k) M.t=+k; }
  // round faces: through the sheet (holes, cut corners) vs bends; Fusion splits a hole into two half faces - join them
  const cy=M.faces.filter(F=>F.kind==="cyl");
  cy.forEach(F=>{ F.cut=M.t!=null&&F.h<=M.t*1.08; F.full=F.arc>300; F.holeArc=F.arc; });
  cy.forEach(F=>{ if(F.full) return; const mates=!F.cut?[]:cy.filter(G=>G!==F&&G.cut&&Math.abs(G.r-F.r)<0.02&&Math.abs(dot(G.ax,F.ax))>0.9998&&
      (()=>{ const d=sub(G.ends[0],F.ends[0]); return len(sub(d,mul(F.ax,dot(d,F.ax))))<0.05; })());
    const tot=mates.reduce((s,G)=>s+G.arc,F.arc); if(tot>300){ F.full=true; F.holeArc=tot; } });
  return M;
}

/* CAD edges = triangle edges between two different faces (or open edges); snap points = their ends + hole centres */
function edges(M){
  const key=i=>Math.round(M.pos[i*3]*1000)+","+Math.round(M.pos[i*3+1]*1000)+","+Math.round(M.pos[i*3+2]*1000);
  const map=new Map(), lines=[];
  for(let t=0;t<M.tf.length;t++) for(let k=0;k<3;k++){
    const a=M.idx[t*3+k], b=M.idx[t*3+(k+1)%3], ka=key(a), kb=key(b), kk=ka<kb?ka+"|"+kb:kb+"|"+ka;
    const e=map.get(kk); if(e){ e.f2=M.tf[t]; } else map.set(kk,{a,b,f1:M.tf[t],f2:null}); }
  const cnt=new Map();   // vertices where edges meet at an angle = corners
  const vk=new Map();
  map.forEach(e=>{ if(e.f2!==null&&e.f2===e.f1) return; lines.push(e.a,e.b);
    [e.a,e.b].forEach((v,j)=>{ const k=key(v); const d=unit(sub(vtx(M,j?e.a:e.b),vtx(M,v))); const c=cnt.get(k)||{v,dirs:[]}; c.dirs.push(d); cnt.set(k,c); vk.set(k,v); }); });
  const snaps=[];
  cnt.forEach(c=>{ let corner=c.dirs.length!==2; if(!corner){ corner=dot(c.dirs[0],c.dirs[1])>-0.985; } if(corner) snaps.push({p:vtx(M,c.v),kind:"corner"}); });
  M.faces.forEach(F=>{ if(F.kind==="cyl"&&F.full) F.ends.forEach(p=>{ if(!snaps.some(s=>s.kind==="hole centre"&&len(sub(s.p,p))<0.05)) snaps.push({p,kind:"hole centre",face:F.id}); }); });
  M.lines=lines; M.snaps=snaps; return M;
}

/* numbers */
function frac32(inch){ const s=inch<0?"-":""; const n=Math.round(Math.abs(inch)*32); const w=Math.floor(n/32); let r=n%32, d=32; while(r&&r%2===0){ r/=2; d/=2; }
  return s+(w?w+(r?"-":""):"")+(r?r+"/"+d:"")+(!w&&!r?"0":"")+'"'; }
function fmt(mm,unitMM){ if(unitMM) return (+mm).toFixed(mm<100?2:1)+" mm"; const i=mm/25.4; return i.toFixed(3)+'" ('+frac32(i)+")"; }

/* measurements on faces / points */
function faceInfo(M,F,unitMM,thick){
  if(F.kind==="plane") return "Flat face"+(thick!=null?" · thickness "+fmt(thick,unitMM):"");
  if(F.kind==="cyl"){
    if(F.full) return (F.convex?"Round / pin":"Hole")+" Ø "+fmt(2*F.r,unitMM);
    if(F.cut) return (F.convex?"Rounded corner":"Inside corner")+" R "+fmt(F.r,unitMM);
    return "Bend · "+(F.convex?"outside":"inside")+" radius R "+fmt(F.r,unitMM)+" · bent "+F.arc.toFixed(1)+"°";
  }
  return "Curved face";
}
/* gap between two nearly parallel flat faces: from the middle of A straight across (along the average normal) to B's plane,
   plus the smallest / biggest gap over all the corners of both faces (each measured to the other face's plane) */
function faceVerts(M,F){ const seen=new Set(), out=[]; (F.tris||[]).forEach(t=>{ for(let k=0;k<3;k++){ const v=M.idx[t*3+k]; if(!seen.has(v)){ seen.add(v); out.push(vtx(M,v)); } } }); return out; }
function gapNear(M,A,B){
  const s=dot(A.n,B.n)<0?-1:1, n=unit(add(A.n,mul(B.n,s)));
  const den=dot(n,B.n)||1e-9, t=dot(sub(B.p,A.c),B.n)/den, a=A.c, b=add(A.c,mul(n,t));
  let mn=Infinity, mx=0; const toPlane=(p,F)=>Math.abs(dot(sub(p,F.p),F.n));
  faceVerts(M,B).forEach(p=>{ const d=toPlane(p,A); mn=Math.min(mn,d); mx=Math.max(mx,d); });
  faceVerts(M,A).forEach(p=>{ const d=toPlane(p,B); mn=Math.min(mn,d); mx=Math.max(mx,d); });
  return {mid:Math.abs(t), min:mn===Infinity?Math.abs(t):mn, max:Math.max(mx,Math.abs(t)), a, b};
}
/* the two points a face-to-face reading is taken between (to draw it), or null */
function twoFacesLine(M,A,B){
  if(A.kind==="plane"&&B.kind==="plane"){ const c=Math.abs(dot(A.n,B.n)); if(c<Math.cos(5.0001/DEG)) return null; const g=gapNear(M,A,B); return [g.a,g.b]; }
  const C=A.kind==="cyl"&&A.full?A:B.kind==="cyl"&&B.full?B:null, P=A.kind==="plane"?A:B.kind==="plane"?B:null;
  if(C&&P&&C!==P){ const q=C.ends[0], d=dot(sub(q,P.p),P.n); return [q,sub(q,mul(P.n,d))]; }
  return null;
}
/* holes in a DXF (inches): CIRCLEs and 2-point bulge-1 polylines on the cut layers (not ENGRAVE/BEND/text) */
function dxfHoles(ents){
  const out=[]; const skip=/ENGRAV|BEND|ETCH|TEXT|MARK/i;
  ents.forEach(e=>{ if(skip.test(e.ly||"")) return;
    if(e.t==="CIRCLE"&&e.r>0) out.push(2*e.r);
    else if(e.t==="LWPOLYLINE"&&e.v&&e.v.length===2&&Math.abs(Math.abs(e.v[0].b)-1)<0.01&&Math.abs(Math.abs(e.v[1].b)-1)<0.01) out.push(Math.hypot(e.v[0].x-e.v[1].x,e.v[0].y-e.v[1].y)); });
  return out.sort((a,b)=>a-b);
}
/* through-holes in the model (inches) - round faces that go through the sheet and close all the way round */
function modelHoles(M){
  const seen=[]; M.faces.forEach(F=>{ if(!(F.kind==="cyl"&&F.cut&&F.full&&!F.convex)) return;
    const c=F.ends[0]; if(seen.some(h=>Math.abs(h.r-F.r)<0.05&&len(sub(sub(h.c,c),mul(F.ax,dot(sub(h.c,c),F.ax))))<0.1)) return; seen.push({r:F.r,c}); });
  return seen.map(h=>2*h.r/25.4).sort((a,b)=>a-b); }
/* compare: returns {ok, dxf:[...], model:[...], missing:[d...], extra:[d...]} - sizes match within 0.04" */
function holeCompare(dx,mo){
  const m=[...mo], missing=[];
  dx.forEach(d=>{ const i=m.findIndex(x=>Math.abs(x-d)<=0.04); if(i>=0) m.splice(i,1); else missing.push(d); });
  return {ok:!missing.length&&!m.length, dxf:dx, model:mo, missing, extra:m};
}
const sizeList=a=>{ const g={}; a.forEach(d=>{ const k=frac32(d); g[k]=(g[k]||0)+1; }); return Object.entries(g).map(([k,n])=>n+" × Ø"+k).join(", "); };
function twoFaces(M,A,B,unitMM){
  if(A.kind==="plane"&&B.kind==="plane"){
    const c=dot(A.n,B.n);
    const th=Math.acos(Math.max(-1,Math.min(1,c)))*DEG, off=Math.min(th,180-th);
    if(off<0.01){ const gap=Math.abs(dot(sub(B.p,A.p),A.n)); return "Parallel faces · gap "+fmt(gap,unitMM); }
    if(off<=5){   // nearly parallel (Kyle, Nov 11: faces 1° off gave an angle, no gap) - the gap changes across the face, so give the middle + the range
      const g=gapNear(M,A,B);
      return "Nearly parallel ("+off.toFixed(1)+"° off) · gap "+fmt(g.mid,unitMM)+" at the middle of the blue face (yellow line) · ranges "+fmt(g.min,unitMM).split(" (")[0]+" to "+fmt(g.max,unitMM).split(" (")[0];
    }
    return "Angle between faces "+th.toFixed(1)+"° · flange angle "+(180-th).toFixed(1)+"° (a 90° bend reads 90° / 90°)";
  }
  if(A.kind==="cyl"&&B.kind==="cyl"&&A.full&&B.full){
    const d=sub(B.ends[0],A.ends[0]); const perp=sub(d,mul(A.ax,dot(d,A.ax)));
    return "Centre to centre "+fmt(len(perp),unitMM);
  }
  if((A.kind==="cyl"&&A.full&&B.kind==="plane")||(B.kind==="cyl"&&B.full&&A.kind==="plane")){
    const C=A.kind==="cyl"?A:B, P=A.kind==="plane"?A:B; const d=Math.abs(dot(sub(C.ends[0],P.p),P.n));
    return "Hole centre to face "+fmt(d,unitMM)+" · to edge of hole "+fmt(Math.max(0,d-C.r),unitMM);
  }
  return "Pick two flat faces (gap / angle) or two holes (centre to centre)";
}

/* fine enough that a 1/32" inside bend radius still gets several segments (tested on the 1086WT parts) */
const TESS={linearUnit:"millimeter",linearDeflectionType:"absolute_value",linearDeflection:0.1,angularDeflection:0.25};
const core={TESS,merge,analyze,edges,faceInfo,twoFaces,dxfHoles,modelHoles,holeCompare,twoFacesLine,gapNear,frac32,fmt,eig3};
window.GVC3D=core;
if(typeof document==="undefined") return;   // node tests stop here

/* ---------- loaders ---------- */
let libsP=null;
function loadLibs(){
  if(!libsP) libsP=(async()=>{
    const THREE=await import(CDN.three);
    await new Promise((ok,no)=>{ if(window.occtimportjs) return ok(); const s=document.createElement("script"); s.src=CDN.occt+"occt-import-js.js"; s.onload=ok; s.onerror=()=>no(new Error("STEP reader didn't load")); document.head.appendChild(s); });
    const occt=await window.occtimportjs({locateFile:f=>CDN.occt+f});
    return {THREE, occt};
  })().catch(e=>{ libsP=null; throw e; });
  return libsP;
}
const modelCache={};

/* ---------- orbit controls (Kyle, Nov 11: Trackball felt clunky; reworked Nov 15 after the gesture review) ----------
   Turntable about the up axis + tilt about the screen's sideways axis. The camera turns about a pivot without
   re-aiming (so a pivot that isn't in the middle of the screen stays put on screen).
   One finger / left mouse = spin · two fingers = move, and pinch = zoom · right/middle mouse or shift = move · wheel = zoom.
   - A touch only becomes a spin after it moves more than tapPx (the same distance the viewers use for a tap),
     so a tap to select / pick a face never nudges the model.
   - After a two-finger gesture nothing spins until every finger is off the glass (lifting one finger of a pinch
     used to start a spin from the other one).
   - Pinch: zooms toward the spot between the fingers, at a depth fixed when the pinch starts (sliding the fingers
     off a toolbox edge no longer makes the zoom jump). Small changes in finger spread are ignored until the
     spread changes by 8%, so a two-finger drag moves without creeping zoom.
   - A flick coasts briefly, slowing by time (not per frame, so it feels the same on a fast or slow phone);
     inertia() false turns it off (measuring).
   opts (all optional; the single-part viewer uses the defaults):
     tapPx (8), sens() rotation multiplier, viewportRot (true: a drag across the short side of the view turns ~200 deg;
     false: fixed 0.0085 rad/px as before), upright() true = keep the model upright (tilt stops just short of
     straight up/down - View menu Top/Bottom still go all the way), pivot() -> Vector3|null spin centre, asked ONCE
     when a one-finger spin starts and kept for that spin + its coast (null = the controls' target),
     inertia() -> bool.
   pick(x,y) -> THREE.Vector3 on the model or null (used to aim the zoom). */
function makeControls(THREE,cam,el,worldUp,pick,opts){
  opts=opts||{}; const target=new THREE.Vector3(); const up0=worldUp.clone().normalize();
  const C={target, enabled:true, listeners:[], addEventListener(t,f){ if(t==="change") this.listeners.push(f); }, handleResize(){}, TAP_PX:opts.tapPx||8};
  const changed=()=>C.listeners.forEach(f=>f());
  const ptrs=new Map(); let mode=null, prev=null, start=null, spin=null, samples=[], pinch=null, gp=null;   // gp: spin centre, fixed for one gesture
  const radPerPx=()=>opts.viewportRot?(1.1*Math.PI/Math.max(120,Math.min(el.clientWidth,el.clientHeight)))*(opts.sens?opts.sens():1):0.0085;
  const V=()=>new THREE.Vector3();
  function rotate(dx,dy){
    const k=radPerPx(); const upright=!!(opts.upright&&opts.upright());
    const s=!upright&&cam.up.dot(up0)<0?-1:1;   // free orbit upside down: keep left/right the same way round on screen
    const right=V().set(1,0,0).applyQuaternion(cam.quaternion).normalize();
    let a2=-dy*k;
    if(upright){   // elevation of the view direction moves linearly with a turn about a level sideways axis: clamp it
      const f=V().set(0,0,-1).applyQuaternion(cam.quaternion), el0=Math.asin(Math.max(-1,Math.min(1,f.dot(up0))));
      const probe=f.clone().applyAxisAngle(right,1e-3), c=Math.sign(Math.asin(Math.max(-1,Math.min(1,probe.dot(up0))))-el0)||1;
      const L=Math.max(89.5*Math.PI/180,Math.abs(el0)), want=Math.max(-L,Math.min(L,el0+c*a2)); a2=(want-el0)/c; }
    const q=new THREE.Quaternion().setFromAxisAngle(up0.clone().multiplyScalar(s),-dx*k).multiply(new THREE.Quaternion().setFromAxisAngle(right,a2));
    const P=gp||target;
    cam.position.sub(P).applyQuaternion(q).add(P);
    if(P!==target) target.sub(P).applyQuaternion(q).add(P);
    cam.quaternion.premultiply(q); cam.up.applyQuaternion(q).normalize(); cam.updateMatrixWorld(); changed(); }
  function worldPerPx(depth){ const d=depth||cam.position.distanceTo(target); return 2*d*Math.tan(cam.fov*Math.PI/360)/Math.max(1,el.clientHeight); }
  function pan(dx,dy,depth){   // depth: move things at that distance exactly with the fingers (the pinch anchor)
    const k=worldPerPx(depth), right=V().set(1,0,0).applyQuaternion(cam.quaternion), upv=V().set(0,1,0).applyQuaternion(cam.quaternion);
    const m=right.multiplyScalar(-dx*k).add(upv.multiplyScalar(dy*k)); cam.position.add(m); target.add(m); cam.updateMatrixWorld(); changed(); }
  /* world point under screen (x,y) at a given depth in front of the camera */
  function atDepth(x,y,depth){ const r=el.getBoundingClientRect(); const p=V().set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1,0.5).unproject(cam);
    const dir=p.sub(cam.position).normalize(), fwd=V(); cam.getWorldDirection(fwd); return cam.position.clone().addScaledVector(dir,depth/Math.max(1e-6,dir.dot(fwd))); }
  function depthOf(P){ const fwd=V(); cam.getWorldDirection(fwd); return P.clone().sub(cam.position).dot(fwd); }
  function zoomToward(f,P){   // f<1 = closer; P stays where it is on screen
    const minD=(cam.near||1)*4; if(f<1&&cam.position.distanceTo(P)*f<minD) f=minD/Math.max(minD,cam.position.distanceTo(P));
    cam.position.sub(P).multiplyScalar(f).add(P); target.sub(P).multiplyScalar(f).add(P); cam.updateMatrixWorld(); changed(); return f; }
  function zoomAt(f,x,y){ let P=pick&&pick(x,y); if(!P) P=atDepth(x,y,Math.max(1,depthOf(target))); zoomToward(f,P); }
  const pts=()=>[...ptrs.values()];
  const mid=a=>({x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2}), dist=a=>Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
  function startPinch(){ const a=pts(), m=mid(a); const P=pick&&pick(m.x,m.y); pinch={d0:dist(a),locked:true,depth:P?depthOf(P):Math.max(1,depthOf(target))}; prev={m,d:dist(a)}; }
  el.addEventListener("contextmenu",e=>e.preventDefault());
  el.addEventListener("pointerdown",e=>{ if(!C.enabled) return; el.setPointerCapture&&el.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY}); spin=null; samples=[]; if(ptrs.size===1) gp=null;
    const a=pts();
    if(a.length===1&&mode===null){ mode=(e.pointerType==="mouse"&&(e.button===1||e.button===2||e.shiftKey))?"panP":"rotP"; start={x:e.clientX,y:e.clientY}; prev={m:{...start}}; }
    else if(a.length>=2){ mode="pinch"; startPinch(); } });
  el.addEventListener("pointermove",e=>{ if(!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY}); const a=pts();
    if(mode==="pinch"&&a.length>=2){ pinch.dirty=true; return; }   // handled once per frame in update(): the two fingers' moves arrive
                                                                       // as separate events, and half-updated spreads looked like a pinch
    if(a.length!==1||!prev) return;
    if(mode==="rotP"||mode==="panP"){ if(Math.hypot(e.clientX-start.x,e.clientY-start.y)<=C.TAP_PX) return; mode=mode==="rotP"?"rot":"pan"; prev={m:{x:e.clientX,y:e.clientY}};
      if(mode==="rot"){ const p=opts.pivot&&opts.pivot(); gp=p&&isFinite(p.x+p.y+p.z)?p.clone():null; }   // picked once, at the start of the spin - never mid-drag
      return; }
    const dx=e.clientX-prev.m.x, dy=e.clientY-prev.m.y; prev={m:{x:e.clientX,y:e.clientY}};
    if(mode==="pan"){ pan(dx,dy); return; }
    if(mode==="rot"){ rotate(dx,dy); const t=e.timeStamp; samples.push({t,dx,dy}); while(samples.length&&t-samples[0].t>80) samples.shift(); } });
  const end=e=>{ if(!ptrs.has(e.pointerId)) return; if(mode==='pinch'&&pinch&&pinch.dirty) pinchStep(); ptrs.delete(e.pointerId); const a=pts();
    if(a.length===0){
      if(mode==="rot"&&(!opts.inertia||opts.inertia())&&samples.length>=2&&e.timeStamp-samples[samples.length-1].t<60){
        const T=Math.max(16,samples[samples.length-1].t-samples[0].t), vx=samples.reduce((s,x)=>s+x.dx,0)/T, vy=samples.reduce((s,x)=>s+x.dy,0)/T;
        const v=Math.hypot(vx,vy); if(v>0.35){ const k=Math.min(1,0.8/v); spin={vx:vx*k,vy:vy*k,t:performance.now()}; } }   // px per ms; only a real flick coasts, and never far (<= ~65 px)
      mode=null; prev=null; pinch=null; samples=[]; }
    else if(mode==="pinch"){ if(a.length>=2) startPinch(); else mode="hold"; } };   // one finger left after a pinch: do nothing until it lifts
  el.addEventListener("pointerup",end); el.addEventListener("pointercancel",end);
  el.addEventListener("wheel",e=>{ e.preventDefault(); spin=null; zoomAt(Math.pow(1.0015,e.deltaY),e.clientX,e.clientY); },{passive:false});
  function pinchStep(){ const a=pts(); if(a.length<2) return; pinch.dirty=false; const m=mid(a), d=dist(a);
    pan(m.x-prev.m.x,m.y-prev.m.y,pinch.depth);   // move first, so the spot that was between the fingers is between them again...
    if(pinch.locked&&Math.abs(d/Math.max(1,pinch.d0)-1)>0.08){ pinch.locked=false; prev.d=d; }   // ...then, once the spread has really changed, zoom on it
    if(!pinch.locked&&prev.d&&d>0){ const f=zoomToward(prev.d/d,atDepth(m.x,m.y,pinch.depth)); pinch.depth*=f; }
    prev={m,d}; }
  C.update=()=>{ if(pinch&&pinch.dirty&&mode==="pinch") pinchStep(); if(!spin) return; if(opts.inertia&&!opts.inertia()){ spin=null; return; }
    const now=performance.now(), dt=Math.min(50,now-spin.t); spin.t=now; const k=Math.exp(-dt/80);   // 80 ms time constant: a short, restrained coast
    spin.vx*=k; spin.vy*=k; if(Math.hypot(spin.vx,spin.vy)<0.03){ spin=null; return; } rotate(spin.vx*dt,spin.vy*dt); };
  C.stop=()=>{ spin=null; gp=null; };
  C.isGesture=()=>ptrs.size>1;
  C.spinning=()=>!!spin;
  return C;
}
window.GVC3DControls=makeControls;

/* ---------- viewer ---------- */
const css=document.createElement("style");
css.textContent=`
#v3d{position:fixed;inset:0;z-index:9999;background:#1d2126;display:flex;flex-direction:column;color:#eee;font-family:inherit}
#v3d .hd{display:flex;align-items:center;gap:6px;padding:8px 10px;padding-top:max(8px,env(safe-area-inset-top));background:#111418;flex-wrap:wrap}
#v3d .hd b{font-size:14px;flex:1;min-width:120px;word-break:break-word}
#v3d .cv{flex:1;position:relative;touch-action:none;overflow:hidden}
#v3d canvas{display:block;width:100%;height:100%}
#v3d .ft{background:#111418;padding:8px 10px;padding-bottom:max(8px,env(safe-area-inset-bottom));font-size:14px}
#v3d .out{min-height:2.6em;font-weight:600;font-size:15px;line-height:1.3}
#v3d .note{font-size:11px;color:#9aa;margin-top:4px}
#v3d .msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:20px;color:#bbb;font-size:14px;pointer-events:none}
#v3d .tp{position:absolute;top:0;right:0;bottom:0;width:min(380px,92%);overflow:auto;background:#111418f2;border-left:1px solid #2a2f36;padding:8px 8px 20px;font-size:14px;z-index:3}
#v3d .tph{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px}#v3d .tph b{flex:1;font-size:15px}
#v3d .tpk{display:flex;flex-direction:column;gap:2px;padding:6px;background:#1b1f25;border-radius:8px}
#v3d .tpk label,#v3d .tpr label{display:flex;gap:8px;align-items:center;min-height:36px;flex:1;cursor:pointer}
#v3d .tpk i,#v3d .tpr i{font-style:normal;color:#8c949e;font-size:12px;margin-left:auto}
#v3d .tpk input,#v3d .tpr input{width:20px;height:20px}
#v3d .tps{margin:12px 2px 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#8c949e}
#v3d .tpr{display:flex;align-items:center;gap:6px;border-bottom:1px solid #20252c}
#v3d .tw{width:28px;min-height:36px;background:none;border:0;color:#ccc;font-size:14px;flex:none}
#v3d .tpo{margin-top:8px;padding:8px;border-radius:8px;background:#0b3a73;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#v3d .tpe{color:#9aa;font-size:13px;padding:6px}
#v3d .btn.on{background:var(--blue,#4ea1ff);color:#000;border-color:transparent}
`;
document.head.appendChild(css);


/* whole-assembly viewer: moved to asm3d.js (Nov 15 redesign) */
window.open3D=async function(url,title,opts){
  opts=opts||{};
  let unitMM=false, mode="spin", picks=[];
  const W=document.createElement("div"); W.id="v3d";
  W.innerHTML=`<div class="hd"><b>${esc(title)}</b>
     <button class="btn sm on" data-m="spin" type="button">Spin</button><button class="btn sm" data-m="face" type="button">Faces</button><button class="btn sm" data-m="point" type="button">Points</button>
     <button class="btn sm" id="v3fit" type="button">Fit</button><button class="btn sm" id="v3u" type="button">in</button><button class="btn sm" id="v3x" type="button">Close</button></div>
   <div class="cv"><div class="msg" id="v3msg">Loading 3D…</div></div>
   <div class="ft"><div class="out" id="v3out">One finger spins, two fingers zoom and move. Pick Faces or Points to measure.</div>
   <div class="note" id="v3chk" style="font-size:12.5px;font-weight:600"></div><div class="note">Model reference - the bend drawing is the boss.</div></div>`;
  document.body.appendChild(W);
  const box=W.querySelector(".cv"), out=W.querySelector("#v3out"), msg=W.querySelector("#v3msg");
  let disposed=false, renderer=null, onResize=null;
  const close=()=>{ disposed=true; if(onResize) window.removeEventListener("resize",onResize); if(renderer){ renderer.dispose(); renderer.forceContextLoss&&renderer.forceContextLoss(); } W.remove(); window.removeEventListener("popstate",onPop); };
  const myId=window.__v3dDepth=(window.__v3dDepth||0)+1; const onPop=()=>{ if(((history.state&&history.state.v3d)||0)<myId) close(); };
  try{ history.pushState({v3d:myId},""); window.addEventListener("popstate",onPop); }catch(e){}
  W.querySelector("#v3x").onclick=()=>{ try{ if(history.state&&history.state.v3d) history.back(); else close(); }catch(e){ close(); } };

  let L, M;
  try{
    msg.textContent="Loading 3D tools… (first time can take a bit)";
    L=await loadLibs(); if(disposed) return;
    msg.textContent="Reading model…";
    if(!modelCache[url]){
      const r=await fetch(url); if(!r.ok) throw new Error("Couldn't download the model ("+r.status+")");
      const buf=new Uint8Array(await r.arrayBuffer());
      const res=L.occt.ReadStepFile(buf,TESS); if(!res.success||!res.meshes.length) throw new Error("Couldn't read the STEP file");
      modelCache[url]=edges(analyze(merge(res)));
    }
    M=modelCache[url]; if(disposed) return;
  }catch(e){ msg.textContent=(e.message||String(e))+" - check the connection and try again."; return; }
  msg.remove();
  /* Kyle, Nov 11: some 3D models (the AI picker truck) are missing holes - check against the part's real DXF */
  const chk=W.querySelector("#v3chk");
  (async()=>{ try{
    const p=opts.part; if(!p||!p.dxf_path||typeof sb==="undefined"||!window.gvcFlat||!chk) return;
    chk.textContent="Checking holes against the DXF…";
    const r=await sb.storage.from("gvc-parts").createSignedUrl(p.dxf_path,600); if(!r.data) { chk.textContent=""; return; }
    const t=await (await fetch(r.data.signedUrl)).text(); if(disposed) return;
    const c=holeCompare(dxfHoles(window.gvcFlat.parse(t)),modelHoles(M));
    if(c.ok){ chk.style.color="#7be29b"; chk.textContent=c.dxf.length?`✓ Holes match the DXF (${sizeList(c.dxf)})`:"✓ No holes in the DXF or the model"; }
    else { chk.style.color="#ffb070"; chk.textContent=`⚠ This 3D model doesn't match the DXF - the DXF has ${c.dxf.length} hole${c.dxf.length===1?"":"s"}${c.dxf.length?" ("+sizeList(c.dxf)+")":""}, the model has ${c.model.length}`+
      (c.missing.length?` · missing ${sizeList(c.missing)}`:"")+(c.extra.length?` · extra ${sizeList(c.extra)}`:"")+". Use the flat pattern / bend drawing for holes."; }
  }catch(e){ if(chk) chk.textContent=""; } })();

  const {THREE}=L;
  renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1));
  box.appendChild(renderer.domElement);
  const scene=new THREE.Scene(); scene.background=new THREE.Color(0x1d2126);
  const cam=new THREE.PerspectiveCamera(35,1,1,1e6);
  scene.add(new THREE.HemisphereLight(0xffffff,0x445566,1.6)); const dl=new THREE.DirectionalLight(0xffffff,1.8); cam.add(dl); dl.position.set(0.5,1,0.3); scene.add(cam);

  const g=new THREE.BufferGeometry();
  g.setAttribute("position",new THREE.BufferAttribute(M.pos,3)); g.setIndex(new THREE.BufferAttribute(M.idx,1));
  if(M.nrm.some(v=>v!==0)) g.setAttribute("normal",new THREE.BufferAttribute(M.nrm,3)); else g.computeVertexNormals();
  g.computeBoundingBox(); const bb=g.boundingBox, ctr=bb.getCenter(new THREE.Vector3()), size=bb.getSize(new THREE.Vector3()).length();
  const mesh=new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0xb9bec5,metalness:0.35,roughness:0.55,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}));
  scene.add(mesh);
  const eg=new THREE.BufferGeometry(); const ep=new Float32Array(M.lines.length*3); M.lines.forEach((v,i)=>{ ep[i*3]=M.pos[v*3]; ep[i*3+1]=M.pos[v*3+1]; ep[i*3+2]=M.pos[v*3+2]; });
  eg.setAttribute("position",new THREE.BufferAttribute(ep,3)); scene.add(new THREE.LineSegments(eg,new THREE.LineBasicMaterial({color:0x101010})));
  const hl=new THREE.Group(); scene.add(hl);

  cam.up.set(0,0,1);   // Z-up like Fusion, set before the controls are made
  const ctl=makeControls(THREE,cam,renderer.domElement,new THREE.Vector3(0,0,1),(x,y)=>{ const h=hit(x,y); return h?h.point.clone():null; });
  let need=true; const draw=()=>{ need=true; };
  ctl.addEventListener("change",draw);
  const fit=()=>{ cam.position.copy(ctr).add(new THREE.Vector3(1,0.8,1.2).normalize().multiplyScalar(size*1.25)); cam.near=size/500; cam.far=size*50; cam.updateProjectionMatrix(); cam.up.set(0,0,1); ctl.stop(); ctl.target.copy(ctr); cam.lookAt(ctr); cam.updateMatrixWorld(); draw(); };
  onResize=()=>{ const w=box.clientWidth, h=box.clientHeight; renderer.setSize(w,h,false); cam.aspect=w/Math.max(1,h); cam.updateProjectionMatrix(); ctl&&ctl.handleResize&&ctl.handleResize(); draw(); };
  window.addEventListener("resize",onResize); onResize();
  // Z-up like Fusion
  fit();
  const loop=()=>{ if(disposed) return; ctl.update(); if(need){ need=false; renderer.render(scene,cam); } requestAnimationFrame(loop); }; loop();

  W.querySelector("#v3fit").onclick=fit;
  W.querySelector("#v3u").onclick=e=>{ unitMM=!unitMM; e.target.textContent=unitMM?"mm":"in"; show(); };
  W.querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>{ mode=b.dataset.m; picks=[]; W.querySelectorAll("[data-m]").forEach(x=>x.classList.toggle("on",x===b)); clearHl(); show(); });

  const ray=new THREE.Raycaster(); const ndc=new THREE.Vector2();
  function hit(x,y){ const r=renderer.domElement.getBoundingClientRect(); ndc.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1); ray.setFromCamera(ndc,cam); const h=ray.intersectObject(mesh,false)[0]; return h||null; }
  function thicknessAt(p,n){   // shoot back into the part from just under the surface
    const o=new THREE.Vector3(...p).addScaledVector(new THREE.Vector3(...n),-1e-3*size); const r=new THREE.Raycaster(o,new THREE.Vector3(...n).negate(),0,size);
    const hs=r.intersectObject(mesh,false); return hs.length?hs[0].distance+1e-3*size:null; }
  function clearHl(){ while(hl.children.length){ const c=hl.children.pop(); c.geometry&&c.geometry.dispose(); } draw(); }
  function hlFace(F,color){ const ix=[]; F.tris.forEach(t=>ix.push(M.idx[t*3],M.idx[t*3+1],M.idx[t*3+2]));
    const fg=new THREE.BufferGeometry(); fg.setAttribute("position",g.getAttribute("position")); fg.setIndex(ix);
    hl.add(new THREE.Mesh(fg,new THREE.MeshBasicMaterial({color,transparent:true,opacity:0.55,side:THREE.DoubleSide,depthTest:true}))); draw(); }
  function dot3(p,color){ const s=new THREE.Mesh(new THREE.SphereGeometry(size/150,12,8),new THREE.MeshBasicMaterial({color,depthTest:false})); s.position.set(...p); s.renderOrder=5; hl.add(s); draw(); }
  function line3(a,b){ const lg=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...a),new THREE.Vector3(...b)]); const l=new THREE.Line(lg,new THREE.LineBasicMaterial({color:0xffd400,depthTest:false})); l.renderOrder=6; hl.add(l); draw(); }
  function snap(x,y,h){
    const r=renderer.domElement.getBoundingClientRect(); let best=null, bd=28*28; const v=new THREE.Vector3();
    M.snaps.forEach(s=>{ v.set(...s.p).project(cam); if(v.z>1) return; const sx=(v.x+1)/2*r.width+r.left, sy=(1-v.y)/2*r.height+r.top; const d=(sx-x)**2+(sy-y)**2; if(d<bd){ bd=d; best=s; } });
    if(best) return {p:best.p,kind:best.kind}; if(h) return {p:[h.point.x,h.point.y,h.point.z],kind:"surface"}; return null; }

  function show(){
    if(mode==="spin"){ out.textContent="One finger spins, two fingers zoom and move. Pick Faces or Points to measure."; return; }
    if(mode==="face"){
      if(!picks.length){ out.textContent="Tap a face: flat = thickness, round = hole Ø or bend radius. Tap a second face for gap or angle."; return; }
      const A=M.faces[picks[0].f]; let s=faceInfo(M,A,unitMM,A.kind==="plane"?picks[0].t:null);
      if(picks[1]){ const B=M.faces[picks[1].f]; s=twoFaces(M,A,B,unitMM); }
      out.textContent=s; return; }
    if(!picks.length){ out.textContent="Tap two points - it snaps to corners and hole centres."; return; }
    if(picks.length===1){ out.textContent="First point ("+picks[0].kind+"). Tap the second point."; return; }
    const a=picks[0].p, b=picks[1].p; const d=sub(b,a);
    out.textContent="Distance "+fmt(len(d),unitMM)+"  ·  model X "+fmt(Math.abs(d[0]),unitMM).split(" (")[0]+"  Y "+fmt(Math.abs(d[1]),unitMM).split(" (")[0]+"  Z "+fmt(Math.abs(d[2]),unitMM).split(" (")[0];
  }
  show();

  // a tap (not a drag) measures
  let down=null, moved=false, fingers=0;
  renderer.domElement.addEventListener("pointerdown",e=>{ fingers++; if(fingers===1){ down={x:e.clientX,y:e.clientY,t:e.timeStamp}; moved=false; } else down=null; });
  renderer.domElement.addEventListener("pointermove",e=>{ if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>8) moved=true; });
  const up=e=>{ fingers=Math.max(0,fingers-1); if(!down||moved||e.timeStamp-down.t>600||mode==="spin"){ if(fingers===0) down=null; return; } const x=down.x,y=down.y; down=null; tap(x,y); };
  renderer.domElement.addEventListener("pointerup",up); renderer.domElement.addEventListener("pointercancel",()=>{ fingers=0; down=null; });
  function tap(x,y){
    const h=hit(x,y);
    if(mode==="face"){
      if(!h){ picks=[]; clearHl(); show(); return; }
      const f=M.tf[h.faceIndex]; const F=M.faces[f];
      if(picks.length>=2) { picks=[]; clearHl(); }
      let t=null; if(F.kind==="plane"&&picks.length===0) t=thicknessAt([h.point.x,h.point.y,h.point.z],F.n);
      picks.push({f,t}); hlFace(F,picks.length===1?0x4ea1ff:0xffa64e);
      if(picks.length===2){ const ln=twoFacesLine(M,M.faces[picks[0].f],F); if(ln){ dot3(ln[0],0x4ea1ff); dot3(ln[1],0xffa64e); line3(ln[0],ln[1]); } }
      show(); return; }
    if(mode==="point"){
      const s=snap(x,y,h); if(!s) return;
      if(picks.length>=2){ picks=[]; clearHl(); }
      picks.push(s); dot3(s.p,picks.length===1?0x4ea1ff:0xffa64e); if(picks.length===2) line3(picks[0].p,picks[1].p); show(); }
  }
  void opts;
};
})();
