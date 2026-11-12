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
const core={TESS,merge,analyze,edges,faceInfo,twoFaces,twoFacesLine,gapNear,frac32,fmt,eig3};
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

/* ---------- orbit controls (Kyle, Nov 11: Trackball felt clunky) ----------
   Turntable about the up axis + tilt about the screen's sideways axis, with no stop at the top/bottom
   (the camera's up turns with it, so you can roll right over the part). A flick keeps spinning and slows down.
   Zoom (pinch / wheel) goes toward the point under your fingers / cursor, and the spin pivot moves with it,
   so after zooming into the headache rack it spins about the headache rack, not the middle of the truck.
   One finger / left mouse = spin · two fingers = pinch zoom + move · right/middle mouse or shift = move · wheel = zoom.
   pick(x,y) -> THREE.Vector3 on the model or null (used to aim the zoom). */
function makeControls(THREE,cam,el,worldUp,pick){
  const L={}; const target=new THREE.Vector3(); const up0=worldUp.clone().normalize();
  const C={target, enabled:true, listeners:[], addEventListener(t,f){ if(t==="change") this.listeners.push(f); }, handleResize(){}};
  const changed=()=>C.listeners.forEach(f=>f());
  const ptrs=new Map(); let vel={x:0,y:0}, lastT=0, spinning=false, prev=null, mode=null;
  const ROT=0.0085;   // radians per pixel
  function rotate(dx,dy){
    const off=cam.position.clone().sub(target);
    const s=cam.up.dot(up0)<0?-1:1;   // upside down: keep left/right the same way round on screen
    const q1=new THREE.Quaternion().setFromAxisAngle(up0.clone().multiplyScalar(s),-dx*ROT);
    const right=new THREE.Vector3(1,0,0).applyQuaternion(cam.quaternion).normalize();
    const q2=new THREE.Quaternion().setFromAxisAngle(right,-dy*ROT);
    const q=q1.multiply(q2);
    off.applyQuaternion(q); cam.up.applyQuaternion(q);
    cam.position.copy(target).add(off);
    const dir=off.clone().normalize().negate(); cam.up.sub(dir.multiplyScalar(cam.up.dot(dir))).normalize();
    cam.lookAt(target); cam.updateMatrixWorld(); changed(); }
  function worldPerPx(){ const d=cam.position.distanceTo(target); return 2*d*Math.tan(cam.fov*Math.PI/360)/Math.max(1,el.clientHeight); }
  function pan(dx,dy){
    const k=worldPerPx(), right=new THREE.Vector3(1,0,0).applyQuaternion(cam.quaternion), upv=new THREE.Vector3(0,1,0).applyQuaternion(cam.quaternion);
    const m=right.multiplyScalar(-dx*k).add(upv.multiplyScalar(dy*k)); cam.position.add(m); target.add(m); cam.updateMatrixWorld(); changed(); }
  function zoomAt(f,x,y){   // f<1 = closer
    const r=el.getBoundingClientRect(); let P=pick&&pick(x,y);
    if(!P){ const ndc=new THREE.Vector3((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1,0.5).unproject(cam);
      const dir=ndc.sub(cam.position).normalize(), n=new THREE.Vector3(); cam.getWorldDirection(n);
      const t=target.clone().sub(cam.position).dot(n)/Math.max(1e-6,dir.dot(n)); P=cam.position.clone().addScaledVector(dir,t); }
    const minD=(cam.near||1)*4; if(f<1&&cam.position.distanceTo(P)*f<minD) f=minD/Math.max(minD,cam.position.distanceTo(P));
    cam.position.sub(P).multiplyScalar(f).add(P); target.sub(P).multiplyScalar(f).add(P);
    // keep the pivot in front of the camera on the line of sight toward P, so the next spin turns about what you zoomed into
    cam.updateMatrixWorld(); changed(); }
  const pts=()=>[...ptrs.values()];
  const mid=a=>({x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2}), dist=a=>Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);
  el.addEventListener("contextmenu",e=>e.preventDefault());
  el.addEventListener("pointerdown",e=>{ if(!C.enabled) return; el.setPointerCapture&&el.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY}); spinning=false; vel={x:0,y:0};
    const a=pts(); if(a.length===1) mode=(e.pointerType==="mouse"&&(e.button===1||e.button===2||e.shiftKey))?"pan":"rot"; else mode="pinch";
    prev=a.length>=2?{m:mid(a),d:dist(a)}:{m:{x:e.clientX,y:e.clientY}}; lastT=performance.now(); });
  el.addEventListener("pointermove",e=>{ if(!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId,{x:e.clientX,y:e.clientY}); const a=pts(); const now=performance.now();
    if(mode==="pinch"&&a.length>=2){ const m=mid(a), d=dist(a); if(prev&&prev.d){ if(d>0) zoomAt(prev.d/d,m.x,m.y); pan(m.x-prev.m.x,m.y-prev.m.y); } prev={m,d}; return; }
    if(a.length!==1||!prev) return; const dx=e.clientX-prev.m.x, dy=e.clientY-prev.m.y; prev={m:{x:e.clientX,y:e.clientY}};
    if(mode==="pan"){ pan(dx,dy); return; }
    rotate(dx,dy); const dt=Math.max(1,now-lastT); vel={x:0.8*dx/dt*16+0.2*vel.x, y:0.8*dy/dt*16+0.2*vel.y}; lastT=now; });
  const end=e=>{ ptrs.delete(e.pointerId); const a=pts();
    if(a.length===0){ if(mode==="rot"&&performance.now()-lastT<60&&Math.hypot(vel.x,vel.y)>1.5) spinning=true; mode=null; prev=null; }
    else if(a.length===1){ mode="rot"; prev={m:{...a[0]}}; vel={x:0,y:0}; }   // lifted one finger of a pinch: carry on spinning from the other without a jump
    else { prev={m:mid(a),d:dist(a)}; } };
  el.addEventListener("pointerup",end); el.addEventListener("pointercancel",end);
  el.addEventListener("wheel",e=>{ e.preventDefault(); zoomAt(Math.pow(1.0015,e.deltaY),e.clientX,e.clientY); },{passive:false});
  C.update=()=>{ if(!spinning) return; vel.x*=0.92; vel.y*=0.92; if(Math.hypot(vel.x,vel.y)<0.05){ spinning=false; return; } rotate(vel.x,vel.y); };
  C.stop=()=>{ spinning=false; };
  C.isGesture=()=>ptrs.size>1;
  void L; return C;
}

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


/* ---------- whole assembly (Draco GLB made from the Fusion model) ----------
   Each body is its own node; node.userData = {comp, body, path, mat, pn:[part numbers] or null}.
   Tap a part to see what it is; if it's a laser part with its own STEP, "Open part" goes to the exact-measure viewer. */
let asmLibsP=null, v3dDepth=0;   // stacked viewers (assembly -> part): Back closes only the top one
function loadAsmLibs(){
  if(!asmLibsP) asmLibsP=(async()=>{
    const [THREE,gl,dr]=await Promise.all([import(CDN.three),import(CDN.gltf),import(CDN.draco)]);
    const loader=new gl.GLTFLoader(); const dl=new dr.DRACOLoader(); dl.setDecoderPath(CDN.dracoDec); loader.setDRACOLoader(dl);
    return {THREE,loader};
  })().catch(e=>{ asmLibsP=null; throw e; });
  return asmLibsP;
}
/* Assembly tree + filters (Kyle, Nov 11): hide/show whole assemblies (headache rack, apron, subframe...),
   hide all covers / hardware / the winch / bought parts to look at just the fab parts, and get hidden parts back.
   Groups come from each body's Fusion path; the kinds are guessed from names, material and part number. */
const HW_RE=/\b(bolt|nut|nyloc|nylock|washer|screw|rivet|cotter|clevis|pin|hinge|latch|shackle|bushing|grease|zerk|stud|spring|gas ?strut|strut|grommet|clamp|u-?bolt|lag|hex|shcs|fhcs|bhcs|socket head|keeper|lanyard|handle|lock|catch|bumper|gasket|seal|weatherstrip|plug|fitting|mcmaster|hardware|fastener)s?\b|^\d{4,5}[a-z]\d{2,4}/i;
const COVER_RE=/\b(cover|covers|lid|shroud|guard plate|cap|trim|closeout|close-out|filler)\b/i;
const WINCH_RE=/\bwinch\b/i, WINCH_FAB_RE=/\b(rack|mount|bracket|plate|tab|frame|support|gusset|base|guard|cradle)\b/i;
const TUBE_RE=/\b(tube|tubing|hss|pipe|angle|channel|flat ?bar|bar|beam|rect|square|sq)\b/i;
const clean=s=>String(s||"").replace(/:\d+$/,"").replace(/\s+v\d+$/i,"").trim();
function partKinds(u){
  const name=(u.comp||"")+" "+(u.body||""), pn=(u.pn||[]).length>0, mat=u.mat||"", path=u.path||"";
  const k=new Set();
  if(WINCH_RE.test(name)&&!WINCH_FAB_RE.test(name)&&!pn) k.add("winch");
  else if(/\bwinch\b/i.test(path)&&!pn&&!WINCH_FAB_RE.test(name)&&/\bwinch\b/i.test(clean(String(path).split(/[\/>|]/).pop()))) k.add("winch");
  if(!pn&&HW_RE.test(name)) k.add("hardware");
  if(COVER_RE.test(name)&&(/alum|\bal\b|5052|3003|6061|checker|tread/i.test(mat)||/alum|\bal\b/i.test(name)||!mat)) k.add("covers");
  if(!pn&&!k.size&&!TUBE_RE.test(name+" "+mat)) k.add("bought");
  return k;
}
const KINDS=[["covers","Covers"],["hardware","Hardware"],["winch","Winch"],["bought","Other bought parts"]];

window.openAsm3D=async function(url,title,opts){
  opts=opts||{}; let unitMM=false, mode="part", picks=[], sel=null;
  const manual=[];   // parts hidden one at a time, newest last (Undo brings back the last one)
  const offKinds=new Set(), offGroups=new Set(); let only=null;   // filters, assemblies switched off, "Only" this assembly
  const W=document.createElement("div"); W.id="v3d";
  W.innerHTML=`<div class="hd"><b>${esc(title)}</b>
     <button class="btn sm on" data-m="part" type="button">Parts</button><button class="btn sm" data-m="point" type="button">Measure</button>
     <button class="btn sm" id="v3tree" type="button">Show / hide</button>
     <button class="btn sm" id="v3fit" type="button">Fit</button><button class="btn sm" id="v3u" type="button">in</button><button class="btn sm" id="v3x" type="button">Close</button></div>
   <div class="cv"><div class="msg" id="v3msg">Loading 3D…</div><div class="tp" id="v3tp" hidden></div></div>
   <div class="ft"><div class="out" id="v3out"></div><div id="v3act" style="margin-top:4px;display:flex;flex-wrap:wrap;gap:6px"></div>
   <div class="note">Model reference - drawings and the parts list are the boss. Measure here snaps to mesh points (close, not exact) - open a part for exact sizes.</div></div>`;
  document.body.appendChild(W);
  const box=W.querySelector(".cv"), out=W.querySelector("#v3out"), act=W.querySelector("#v3act"), msg=W.querySelector("#v3msg"), tp=W.querySelector("#v3tp");
  let disposed=false, renderer=null, onResize=null;
  const myId=++v3dDepth; const onPop=()=>{ if(((history.state&&history.state.v3d)||0)<myId) close(); };
  const close=()=>{ disposed=true; if(onResize) window.removeEventListener("resize",onResize); if(renderer){ renderer.dispose(); renderer.forceContextLoss&&renderer.forceContextLoss(); } W.remove(); window.removeEventListener("popstate",onPop); };
  try{ history.pushState({v3d:myId},""); window.addEventListener("popstate",onPop); }catch(e){}
  const back=()=>{ try{ if(history.state&&history.state.v3d) history.back(); else close(); }catch(e){ close(); } };
  W.querySelector("#v3x").onclick=back;
  let L, gltf;
  try{
    msg.textContent="Loading 3D tools…"; L=await loadAsmLibs(); if(disposed) return;
    msg.textContent="Downloading model…";
    gltf=await new Promise((ok,no)=>L.loader.load(url,ok,ev=>{ if(ev.total) msg.textContent=`Downloading model… ${Math.round(ev.loaded/ev.total*100)}%`; },no));
    if(disposed) return;
  }catch(e){ msg.textContent=(e.message||String(e))+" - check the connection and try again."; return; }
  msg.remove();
  const {THREE}=L;
  renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setPixelRatio(Math.min(2,window.devicePixelRatio||1)); box.appendChild(renderer.domElement);
  const scene=new THREE.Scene(); scene.background=new THREE.Color(0x1d2126);
  const cam=new THREE.PerspectiveCamera(35,1,1,1e7);
  scene.add(new THREE.HemisphereLight(0xffffff,0x445566,1.5)); const dl=new THREE.DirectionalLight(0xffffff,1.7); cam.add(dl); dl.position.set(0.5,1,0.3); scene.add(cam);
  const root=gltf.scene; scene.add(root);
  const meshes=[]; root.traverse(o=>{ if(o.isMesh){ meshes.push(o); o.userData=Object.assign({},o.parent&&o.parent.userData,o.userData); } });

  /* groups: the body's path inside the truck, e.g. ["Headache Rack","Top Box"] (top level first) */
  const tree={name:"",kids:new Map(),meshes:[]};
  const nodePath=m=>{ const a=[]; let o=m.parent; while(o&&o!==root){ if(o.name) a.unshift(o.name); o=o.parent; } return a; };
  meshes.forEach(m=>{ const u=m.userData; let segs=String(u.path||"").split(/\s*[\/>|]\s*/).map(clean).filter(Boolean);
    if(!segs.length) segs=nodePath(m).map(clean).filter(Boolean);   // no path saved: use how the nodes are nested in the file
    if(segs.length&&clean(u.comp)&&segs[segs.length-1]===clean(u.comp)) segs=segs.slice(0,-1);   // the part's own name isn't a group
    if(segs.length>1&&meshes.length>1&&segs[0]===clean(title.split(" ·")[0])) segs=segs.slice(1);
    m.userData._segs=segs; m.userData._kinds=partKinds(u);
    let n=tree; const key=[]; segs.forEach(s=>{ key.push(s); if(!n.kids.has(s)) n.kids.set(s,{name:s,key:key.join(" / "),kids:new Map(),meshes:[]}); n=n.kids.get(s); }); n.meshes.push(m); });
  // a single wrapper group at the top (the whole truck) adds nothing - open it up
  let top=tree; while(top.kids.size===1&&!top.meshes.length) top=[...top.kids.values()][0];
  const allIn=n=>{ const a=[...n.meshes]; n.kids.forEach(k=>a.push(...allIn(k))); return a; };
  const groupOff=m=>{ const s=m.userData._segs; for(let i=1;i<=s.length;i++) if(offGroups.has(s.slice(0,i).join(" / "))) return true; return false; };
  const kindOff=m=>{ for(const k of m.userData._kinds) if(offKinds.has(k)) return true; return false; };
  function apply(){ meshes.forEach(m=>{ m.visible=!manual.includes(m)&&!groupOff(m)&&!kindOff(m)&&(!only||(m.userData._segs.join(" / ")+" / ").startsWith(only+" / ")); }); if(sel&&!sel.visible){ select(null); } draw(); show(); if(!tp.hidden) drawTree(); }

  const bb=new THREE.Box3().setFromObject(root), ctr=bb.getCenter(new THREE.Vector3()), size=bb.getSize(new THREE.Vector3()).length();
  const hl=new THREE.Group(); scene.add(hl);
  const upY=(opts.up||"y")==="y"; cam.up.set(0,upY?1:0,upY?0:1);
  const ray=new THREE.Raycaster(), ndc=new THREE.Vector2();
  function hit(x,y){ const r=renderer.domElement.getBoundingClientRect(); ndc.set((x-r.left)/r.width*2-1,-(y-r.top)/r.height*2+1); ray.setFromCamera(ndc,cam); return ray.intersectObjects(meshes.filter(m=>m.visible),false)[0]||null; }
  const ctl=makeControls(THREE,cam,renderer.domElement,new THREE.Vector3(0,upY?1:0,upY?0:1),(x,y)=>{ const h=hit(x,y); return h?h.point.clone():null; });
  let need=true; const draw=()=>{ need=true; }; ctl.addEventListener("change",draw);
  const fit=()=>{ ctl.stop(); const vis=meshes.filter(m=>m.visible); const b=vis.length?new THREE.Box3():bb; vis.forEach(m=>b.expandByObject(m));
    const c=b.getCenter(new THREE.Vector3()), sz=Math.max(1e-6,b.getSize(new THREE.Vector3()).length());
    const dir=upY?new THREE.Vector3(1.2,0.8,1):new THREE.Vector3(1,1.2,0.8); cam.position.copy(c).add(dir.normalize().multiplyScalar(sz*1.1)); cam.near=size/4000; cam.far=size*50; cam.updateProjectionMatrix(); cam.up.set(0,upY?1:0,upY?0:1); ctl.target.copy(c); cam.lookAt(c); cam.updateMatrixWorld(); draw(); };
  onResize=()=>{ const w=box.clientWidth, h=box.clientHeight; renderer.setSize(w,h,false); cam.aspect=w/Math.max(1,h); cam.updateProjectionMatrix(); draw(); };
  window.addEventListener("resize",onResize); onResize(); fit();
  const loop=()=>{ if(disposed) return; ctl.update(); if(need){ need=false; renderer.render(scene,cam); } requestAnimationFrame(loop); }; loop();
  const selMat=new THREE.MeshStandardMaterial({color:0x4ea1ff,emissive:0x0b3a73,metalness:0.2,roughness:0.5,side:THREE.DoubleSide});
  const select=m=>{ if(sel){ sel.material=sel.userData._mat; } sel=m; if(m){ m.userData._mat=m.userData._mat||m.material; m.material=selMat; } draw(); };
  W.querySelector("#v3fit").onclick=fit;
  W.querySelector("#v3u").onclick=e=>{ unitMM=!unitMM; e.target.textContent=unitMM?"mm":"in"; show(); };
  W.querySelector("#v3tree").onclick=e=>{ tp.hidden=!tp.hidden; e.target.classList.toggle("on",!tp.hidden); if(!tp.hidden) drawTree(); };
  W.querySelectorAll("[data-m]").forEach(b=>b.onclick=()=>{ mode=b.dataset.m; picks=[]; clearHl(); W.querySelectorAll("[data-m]").forEach(x=>x.classList.toggle("on",x===b)); show(); });
  function clearHl(){ while(hl.children.length){ const c=hl.children.pop(); c.geometry&&c.geometry.dispose(); } draw(); }
  function dot3(p,color){ const s=new THREE.Mesh(new THREE.SphereGeometry(size/400,12,8),new THREE.MeshBasicMaterial({color,depthTest:false})); s.position.copy(p); s.renderOrder=5; hl.add(s); draw(); }
  function line3(a,b){ const l=new THREE.Line(new THREE.BufferGeometry().setFromPoints([a,b]),new THREE.LineBasicMaterial({color:0xffd400,depthTest:false})); l.renderOrder=6; hl.add(l); draw(); }
  function snapPt(h,x,y){   // nearest corner of the tapped triangle if it's close on screen
    const r=renderer.domElement.getBoundingClientRect(), pos=h.object.geometry.getAttribute("position"); let best=h.point.clone(), bd=24*24;
    [h.face.a,h.face.b,h.face.c].forEach(i=>{ const v=new THREE.Vector3().fromBufferAttribute(pos,i).applyMatrix4(h.object.matrixWorld); const s=v.clone().project(cam); const d=(((s.x+1)/2*r.width+r.left)-x)**2+(((1-s.y)/2*r.height+r.top)-y)**2; if(d<bd){ bd=d; best=v; } });
    return best; }
  const nm=m=>{ const u=m.userData, pns=u.pn||[]; return (pns.length?pns.join(", ")+" · ":"")+clean(u.comp)+(u.body&&u.body!==u.comp?" "+u.body:""); };
  const btn=(label,fn,cls)=>{ const b=document.createElement("button"); b.className="btn sm"+(cls?" "+cls:""); b.type="button"; b.textContent=label; b.onclick=fn; act.appendChild(b); return b; };
  function show(){
    act.innerHTML="";
    if(manual.length) btn(`Undo hide (${manual.length})`,()=>{ manual.pop(); apply(); });
    if(only) btn("Show all assemblies",()=>{ only=null; apply(); fit(); });
    if(mode==="point"){
      if(picks.length<2){ out.textContent=picks.length?"Tap the second point.":"Tap two points to measure (snaps to the nearest mesh corner)."; return; }
      const d=picks[1].clone().sub(picks[0]); out.textContent="Distance "+fmt(d.length(),unitMM); return; }
    const nh=meshes.filter(m=>!m.visible).length;
    if(!sel){ out.textContent="Tap a part to see what it is. One finger spins, two fingers zoom and move."+(nh?` (${nh} hidden - Show / hide to bring them back)`:""); return; }
    const u=sel.userData, pns=u.pn||[];
    out.textContent=nm(sel)+(u.mat?" · "+u.mat:"")+(u._segs.length?"  —  in "+u._segs.join(" › "):"");
    btn("Hide part",()=>{ const m=sel; select(null); manual.push(m); apply(); });
    if(u._segs.length){ const g=u._segs.join(" / "); btn("Hide "+u._segs[u._segs.length-1],()=>{ offGroups.add(g); apply(); });
      btn("Only "+u._segs[u._segs.length-1],()=>{ isolate(g); }); }
    if(pns.length&&opts.onPart) pns.forEach(pn=>btn("Open "+pn,()=>opts.onPart(pn)));
    if(!pns.length){ const s=document.createElement("span"); s.style.cssText="font-size:12px;color:#9aa;align-self:center"; s.textContent="Not a laser part on the parts list (bought part, tube, or not matched)."; act.appendChild(s); }
  }
  function isolate(key){ only=key; apply(); fit(); }   // show only this group (filters and single hides still apply)
  /* the Show / hide panel */
  const open=new Set();
  function drawTree(){
    const cnt=n=>{ const a=allIn(n); return [a.filter(m=>m.visible).length,a.length]; };
    const kindN=k=>meshes.filter(m=>m.userData._kinds.has(k)).length;
    let h=`<div class="tph"><b>Show / hide</b><button class="btn sm" type="button" data-a="all">Show everything</button><button class="btn sm" type="button" data-a="fab">Fab parts only</button><button class="btn sm" type="button" data-a="x">Done</button></div>
      <div class="tpk">${KINDS.map(([k,l])=>kindN(k)?`<label><input type="checkbox" data-k="${k}" ${offKinds.has(k)?"":"checked"}> ${l} <i>${kindN(k)}</i></label>`:"").join("")}</div>
      ${only?`<div class="tpo">Showing only <b>${esc(only.split(" / ").pop())}</b> <button class="btn sm" type="button" data-a="only">Show all assemblies</button></div>`:""}<div class="tps">Assemblies</div>`;
    const row=(n,d)=>{ const [v,t]=cnt(n); if(!t) return ""; const on=!offGroups.has(n.key), kids=[...n.kids.values()].filter(k=>allIn(k).length);
      let s=`<div class="tpr" style="padding-left:${6+d*16}px">${kids.length?`<button type="button" class="tw" data-o="${esc(n.key)}">${open.has(n.key)?"▾":"▸"}</button>`:`<span class="tw"></span>`}
        <label><input type="checkbox" data-g="${esc(n.key)}" ${on?"checked":""}> ${esc(n.name)}</label><i>${v}/${t}</i><button type="button" class="btn sm" data-iso="${esc(n.key)}">Only</button></div>`;
      if(open.has(n.key)) kids.forEach(k=>{ s+=row(k,d+1); });
      return s; };
    const groups=[...top.kids.values()];
    h+=groups.length?groups.map(g=>row(g,0)).join(""):`<div class="tpe">This model has no assembly groups saved in it.</div>`;
    if(manual.length) h+=`<div class="tps">Hidden one at a time (${manual.length})</div>`+manual.map((m,i)=>`<div class="tpr"><span class="tw"></span><span style="flex:1">${esc(nm(m))}</span><button type="button" class="btn sm" data-un="${i}">Show</button></div>`).join("");
    tp.innerHTML=h;
    tp.querySelectorAll("[data-k]").forEach(c=>c.onchange=()=>{ c.checked?offKinds.delete(c.dataset.k):offKinds.add(c.dataset.k); apply(); });
    tp.querySelectorAll("[data-g]").forEach(c=>c.onchange=()=>{ const k=c.dataset.g; c.checked?offGroups.delete(k):offGroups.add(k); apply(); });
    tp.querySelectorAll("[data-o]").forEach(b=>b.onclick=()=>{ const k=b.dataset.o; open.has(k)?open.delete(k):open.add(k); drawTree(); });
    tp.querySelectorAll("[data-iso]").forEach(b=>b.onclick=()=>isolate(b.dataset.iso));
    tp.querySelectorAll("[data-un]").forEach(b=>b.onclick=()=>{ manual.splice(+b.dataset.un,1); apply(); });
    tp.querySelector('[data-a="all"]').onclick=()=>{ manual.length=0; offKinds.clear(); offGroups.clear(); only=null; apply(); fit(); };
    const ob=tp.querySelector('[data-a="only"]'); if(ob) ob.onclick=()=>{ only=null; apply(); fit(); };
    tp.querySelector('[data-a="fab"]').onclick=()=>{ KINDS.forEach(([k])=>offKinds.add(k)); apply(); };
    tp.querySelector('[data-a="x"]').onclick=()=>{ tp.hidden=true; W.querySelector("#v3tree").classList.remove("on"); };
  }
  show();
  let down=null, moved=false, fingers=0;
  renderer.domElement.addEventListener("pointerdown",e=>{ fingers++; if(fingers===1){ down={x:e.clientX,y:e.clientY,t:Date.now()}; moved=false; } else down=null; });
  renderer.domElement.addEventListener("pointermove",e=>{ if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>8) moved=true; });
  renderer.domElement.addEventListener("pointerup",()=>{ fingers=Math.max(0,fingers-1); if(!down||moved||Date.now()-down.t>600){ if(fingers===0) down=null; return; } const x=down.x,y=down.y; down=null; tap(x,y); });
  renderer.domElement.addEventListener("pointercancel",()=>{ fingers=0; down=null; });
  function tap(x,y){
    const h=hit(x,y);
    if(mode==="part"){ select(h?h.object:null); show(); return; }
    if(!h) return; if(picks.length>=2){ picks=[]; clearHl(); }
    const p=snapPt(h,x,y); picks.push(p); dot3(p,picks.length===1?0x4ea1ff:0xffa64e); if(picks.length===2) line3(picks[0],picks[1]); show();
  }
};

window.open3D=async function(url,title,opts){
  opts=opts||{};
  let unitMM=false, mode="spin", picks=[];
  const W=document.createElement("div"); W.id="v3d";
  W.innerHTML=`<div class="hd"><b>${esc(title)}</b>
     <button class="btn sm on" data-m="spin" type="button">Spin</button><button class="btn sm" data-m="face" type="button">Faces</button><button class="btn sm" data-m="point" type="button">Points</button>
     <button class="btn sm" id="v3fit" type="button">Fit</button><button class="btn sm" id="v3u" type="button">in</button><button class="btn sm" id="v3x" type="button">Close</button></div>
   <div class="cv"><div class="msg" id="v3msg">Loading 3D…</div></div>
   <div class="ft"><div class="out" id="v3out">One finger spins, two fingers zoom and move. Pick Faces or Points to measure.</div>
   <div class="note">Model reference - the bend drawing is the boss.</div></div>`;
  document.body.appendChild(W);
  const box=W.querySelector(".cv"), out=W.querySelector("#v3out"), msg=W.querySelector("#v3msg");
  let disposed=false, renderer=null, onResize=null;
  const close=()=>{ disposed=true; if(onResize) window.removeEventListener("resize",onResize); if(renderer){ renderer.dispose(); renderer.forceContextLoss&&renderer.forceContextLoss(); } W.remove(); window.removeEventListener("popstate",onPop); };
  const myId=++v3dDepth; const onPop=()=>{ if(((history.state&&history.state.v3d)||0)<myId) close(); };
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
  renderer.domElement.addEventListener("pointerdown",e=>{ fingers++; if(fingers===1){ down={x:e.clientX,y:e.clientY,t:Date.now()}; moved=false; } else down=null; });
  renderer.domElement.addEventListener("pointermove",e=>{ if(down&&Math.hypot(e.clientX-down.x,e.clientY-down.y)>8) moved=true; });
  const up=e=>{ fingers=Math.max(0,fingers-1); if(!down||moved||Date.now()-down.t>600||mode==="spin"){ if(fingers===0) down=null; return; } const x=down.x,y=down.y; down=null; tap(x,y); };
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
