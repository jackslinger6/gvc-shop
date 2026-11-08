/* ---------- Flat patterns from the DXF (Kyle, 2026-11-08) ----------
   Draws a part's flat pattern straight from its laser DXF (inches): cut lines black, BEND layer dashed red, ENGRAVE blue,
   with the overall width x height dimensioned. Used by the Count screen (thumbnails + tap to enlarge, pinch to zoom).
   Handles LINE, ARC, CIRCLE, LWPOLYLINE (bulges), POLYLINE/VERTEX, SPLINE (control points or fit points), ELLIPSE.
   window.gvcFlat = { fromDxf(text) -> {svg, thumb, W, H} , view({title, sub, svg, W, H}) }                     */
(()=>{
function parse(text){
  const L=text.split(/\r?\n/); const ents=[]; let inE=false, cur=null, poly=null;
  const push=()=>{ if(cur){ if(cur.t==="VERTEX"&&poly){ poly.v.push({x:cur.x,y:cur.y,b:cur.b||0}); } else if(cur.t==="POLYLINE"){ poly=cur; ents.push(cur); } else if(cur.t==="SEQEND"){ poly=null; } else ents.push(cur); } cur=null; };
  for(let i=0;i<L.length-1;i+=2){
    const c=+L[i].trim(), v=L[i+1].trim();
    if(c===2&&v==="ENTITIES"){ inE=true; continue; }
    if(!inE) continue;
    if(c===0){ push(); if(v==="ENDSEC"){ inE=false; continue; } cur={t:v,ly:"0",v:[],k:[],cp:[],fp:[],w:[]}; continue; }
    if(!cur) continue; const n=parseFloat(v);
    switch(cur.t){
      case "LWPOLYLINE":
        if(c===10) cur.v.push({x:n,y:0,b:0}); else if(c===20&&cur.v.length) cur.v[cur.v.length-1].y=n; else if(c===42&&cur.v.length) cur.v[cur.v.length-1].b=n; else if(c===70) cur.fl=n; break;
      case "SPLINE":
        if(c===10) cur.cp.push([n,0]); else if(c===20&&cur.cp.length) cur.cp[cur.cp.length-1][1]=n;
        else if(c===11) cur.fp.push([n,0]); else if(c===21&&cur.fp.length) cur.fp[cur.fp.length-1][1]=n;
        else if(c===40) cur.k.push(n); else if(c===41) cur.w.push(n); else if(c===71) cur.deg=n; else if(c===70) cur.fl=n; break;
      default:
        if(cur.t==="ELLIPSE"&&(c===40||c===41||c===42)){ if(c===40) cur.r=n; else if(c===41) cur.p1=n; else cur.p2=n; break; }
        if(c===10) cur.x=n; else if(c===20) cur.y=n; else if(c===11) cur.x2=n; else if(c===21) cur.y2=n;
        else if(c===40) cur.r=n; else if(c===50) cur.a1=n; else if(c===51) cur.a2=n; else if(c===42) cur.b=n; else if(c===70) cur.fl=n;
    }
    if(c===8) cur.ly=v;
  }
  push(); return ents;
}
// B-spline (de Boor), rational when weights are given
function spline(e){
  const p=e.deg||3, P=e.cp, K=e.k, W=e.w.length===P.length?e.w:null;
  if(P.length<p+1||K.length!==P.length+p+1) return (e.fp.length?e.fp:P).map(q=>[q[0],q[1]]);
  const N=Math.max(24,P.length*8), out=[], t0=K[p], t1=K[K.length-p-1];
  for(let s=0;s<=N;s++){ let t=t0+(t1-t0)*s/N; if(s===N) t=t1-1e-9;
    let k=p; while(k<K.length-p-2&&t>=K[k+1]) k++;
    const d=[]; for(let j=0;j<=p;j++){ const q=P[j+k-p], w=W?W[j+k-p]:1; d.push([q[0]*w,q[1]*w,w]); }
    for(let r=1;r<=p;r++) for(let j=p;j>=r;j--){ const i=j+k-p, den=K[i+p-r+1]-K[i]; const a=den?(t-K[i])/den:0;
      d[j]=[(1-a)*d[j-1][0]+a*d[j][0],(1-a)*d[j-1][1]+a*d[j][1],(1-a)*d[j-1][2]+a*d[j][2]]; }
    out.push([d[p][0]/d[p][2],d[p][1]/d[p][2]]); }
  return out;
}
const arcPts=(cx,cy,r,a1,a2)=>{ while(a2<=a1) a2+=360; const n=Math.max(4,Math.ceil((a2-a1)/6)); const o=[]; for(let i=0;i<=n;i++){ const a=(a1+(a2-a1)*i/n)*Math.PI/180; o.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]); } return o; };
function bulgePts(a,b,bu){ if(!bu) return [[b.x,b.y]];
  const th=4*Math.atan(bu), dx=b.x-a.x, dy=b.y-a.y, c=Math.hypot(dx,dy); if(!c) return [[b.x,b.y]];
  const r=c/(2*Math.sin(th/2)), mx=(a.x+b.x)/2, my=(a.y+b.y)/2, h=r*Math.cos(th/2);
  const cx=mx-h*dy/c, cy=my+h*dx/c; let s=Math.atan2(a.y-cy,a.x-cx), n=Math.max(4,Math.ceil(Math.abs(th)*180/Math.PI/6)); const o=[];
  for(let i=1;i<=n;i++){ const t=s+th*i/n; o.push([cx+Math.abs(r)*Math.cos(t),cy+Math.abs(r)*Math.sin(t)]); }
  o[o.length-1]=[b.x,b.y]; return o; }
// every entity -> list of polylines (arrays of [x,y]) + its kind
function geom(ents){
  const G=[];
  for(const e of ents){ const ly=String(e.ly||"").toUpperCase(); const kind=/BEND/.test(ly)?"bend":/ENGRAV|ETCH|MARK|TEXT/.test(ly)?"eng":"cut";
    let pl=null;
    if(e.t==="LINE") pl=[[e.x,e.y],[e.x2,e.y2]];
    else if(e.t==="CIRCLE") pl=arcPts(e.x,e.y,e.r,0,360);
    else if(e.t==="ARC") pl=arcPts(e.x,e.y,e.r,e.a1||0,e.a2||0);
    else if(e.t==="LWPOLYLINE"||e.t==="POLYLINE"){ const v=e.v; if(v.length<2) continue; pl=[[v[0].x,v[0].y]];
      for(let i=1;i<v.length;i++) pl.push(...bulgePts(v[i-1],v[i],v[i-1].b));
      if(e.fl&1) pl.push(...bulgePts(v[v.length-1],v[0],v[v.length-1].b)); }
    else if(e.t==="SPLINE") pl=spline(e);
    else if(e.t==="ELLIPSE"){ const mx=e.x2, my=e.y2, ra=Math.hypot(mx,my), rb=ra*(e.r||1), rot=Math.atan2(my,mx); let a=e.p1||0, b=e.p2||Math.PI*2; if(b<=a) b+=Math.PI*2; pl=[];
      for(let i=0;i<=48;i++){ const t=a+(b-a)*i/48, x=ra*Math.cos(t), y=rb*Math.sin(t); pl.push([e.x+x*Math.cos(rot)-y*Math.sin(rot),e.y+x*Math.sin(rot)+y*Math.cos(rot)]); } }
    if(pl&&pl.length>1&&pl.every(p=>isFinite(p[0])&&isFinite(p[1]))) G.push({kind,pl});
  }
  return G;
}
const f=n=>(Math.round(n*1000)/1000).toString();
const inch=n=>{ const r=Math.round(n*100)/100; return r.toFixed(r%1?((r*10)%1?2:1):0)+'"'; };
function fromDxf(text){
  const G=geom(parse(text)); if(!G.length) return null;
  const cut=G.filter(g=>g.kind!=="eng"&&g.kind!=="bend"); const B=(cut.length?cut:G);
  const ext=()=>{ let a=1e9,b=1e9,c=-1e9,d=-1e9; B.forEach(g=>g.pl.forEach(([x,y])=>{ if(x<a)a=x; if(x>c)c=x; if(y<b)b=y; if(y>d)d=y; })); return [a,b,c,d]; };
  const E0=ext(), W0=E0[2]-E0[0], H0=E0[3]-E0[1];          // as drawn in the DXF (what the drawing's flat size is)
  // parts drawn at an angle: turn them square to their smallest box so the overall size is what a tape measure reads
  const pts=[]; B.forEach(g=>g.pl.forEach(p=>pts.push(p)));
  const hull=(P=>{ P=P.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]); const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]); const lo=[],up=[];
    for(const p of P){ while(lo.length>1&&cr(lo[lo.length-2],lo[lo.length-1],p)<=0) lo.pop(); lo.push(p); }
    for(let i=P.length-1;i>=0;i--){ const p=P[i]; while(up.length>1&&cr(up[up.length-2],up[up.length-1],p)<=0) up.pop(); up.push(p); }
    return lo.slice(0,-1).concat(up.slice(0,-1)); })(pts);
  let bestA=0, bestArea=W0*H0;
  for(let i=0;i<hull.length;i++){ const a=hull[i], b=hull[(i+1)%hull.length]; const t=-Math.atan2(b[1]-a[1],b[0]-a[0]); const c=Math.cos(t), sn=Math.sin(t);
    let mx=1e9,my=1e9,Mx=-1e9,My=-1e9; for(const p of hull){ const x=p[0]*c-p[1]*sn, y=p[0]*sn+p[1]*c; if(x<mx)mx=x; if(x>Mx)Mx=x; if(y<my)my=y; if(y>My)My=y; }
    const ar=(Mx-mx)*(My-my); if(ar<bestArea*0.97){ bestArea=ar; bestA=t; } }
  if(bestA){ const c=Math.cos(bestA), sn=Math.sin(bestA); G.forEach(g=>{ g.pl=g.pl.map(([x,y])=>[x*c-y*sn,x*sn+y*c]); });
    const e=ext(); if(e[3]-e[1]>e[2]-e[0]) G.forEach(g=>{ g.pl=g.pl.map(([x,y])=>[y,-x]); }); }   // long side across
  let [x0,y0,x1,y1]=ext();
  const W=x1-x0, H=y1-y0, S=Math.max(W,H)||1;
  // rot: tall parts are turned sideways in the small thumbnails so they fill the box
  const path=(k,rot)=>G.filter(g=>g.kind===k).map(g=>"M"+g.pl.map(([x,y])=>rot?f(y1-y)+" "+f(W-(x-x0)):f(x-x0)+" "+f(y1-y)).join("L")).join("");
  const body=(sw,rot)=>`<path d="${path("cut",rot)}" fill="none" stroke="#111" stroke-width="${sw}" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    <path d="${path("eng",rot)}" fill="none" stroke="#1f6fd1" stroke-width="${sw*0.8}" vector-effect="non-scaling-stroke"/>
    <path d="${path("bend",rot)}" fill="none" stroke="#d0342c" stroke-width="${sw}" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/>`;
  // thumbnail: just the part
  const m=S*0.04;
  const rot=H>W*1.2, TW=rot?H:W, TH=rot?W:H;
  const thumb=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(-m)} ${f(-m)} ${f(TW+2*m)} ${f(TH+2*m)}" preserveAspectRatio="xMidYMid meet">${body(1.2,rot)}</svg>`;
  // big view: part + overall width (below) and height (right)
  const th=Math.min(S*0.045, Math.max(W,H)*0.045), gap=th*1.4, tx=th*0.9;
  const fs=Math.max(th,S*0.03), pad=fs*3.2;
  const ln='stroke="#444" stroke-width="1" vector-effect="non-scaling-stroke" fill="none"';
  const dimH=`<path ${ln} d="M0 ${f(H+gap*0.3)}V${f(H+gap+tx)}M${f(W)} ${f(H+gap*0.3)}V${f(H+gap+tx)}M0 ${f(H+gap)}H${f(W)}"/>
      <path ${ln} d="M${f(W+gap*0.3)} 0H${f(W+gap+tx)}M${f(W+gap*0.3)} ${f(H)}H${f(W+gap+tx)}M${f(W+gap)} 0V${f(H)}"/>
    <g fill="#444"><path d="M0 ${f(H+gap)}l${f(tx)} ${f(-tx*0.35)}v${f(tx*0.7)}zM${f(W)} ${f(H+gap)}l${f(-tx)} ${f(-tx*0.35)}v${f(tx*0.7)}z"/>
      <path d="M${f(W+gap)} 0l${f(-tx*0.35)} ${f(tx)}h${f(tx*0.7)}zM${f(W+gap)} ${f(H)}l${f(-tx*0.35)} ${f(-tx)}h${f(tx*0.7)}z"/></g>
    <text x="${f(W/2)}" y="${f(H+gap+fs*1.25)}" font-size="${f(fs)}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" fill="#111">${inch(W)}</text>
    <text x="${f(W+gap+fs*0.5)}" y="${f(H/2)}" font-size="${f(fs)}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" fill="#111" transform="rotate(-90 ${f(W+gap+fs*0.5)} ${f(H/2)})" dy="${f(fs*0.35)}">${inch(H)}</text>`;
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(-pad*0.5)} ${f(-pad*0.5)} ${f(W+pad*1.6)} ${f(H+pad*1.6)}" preserveAspectRatio="xMidYMid meet"><rect x="${f(-pad*0.5)}" y="${f(-pad*0.5)}" width="${f(W+pad*1.6)}" height="${f(H+pad*1.6)}" fill="#fff"/>${body(1.6,false)}${dimH}</svg>`;
  return {svg,thumb,W,H,W0,H0,turned:!!bestA,vw:W+pad*1.6,vh:H+pad*1.6};
}

/* full-screen viewer: material + size up top, the flat pattern fitted to the screen (pinch / +− / double-tap to zoom,
   drag to pan), piece check boxes at the bottom (when opened from a count), Back closes */
const css=document.createElement("style");
css.textContent=`#gFlat{position:fixed;inset:0;z-index:8500;background:#0d0e10;display:flex;flex-direction:column;color:#fff;font-family:Inter,system-ui,sans-serif}
#gFlat .hd{display:grid;grid-template-columns:1fr auto;gap:6px 12px;align-items:start;padding:calc(env(safe-area-inset-top,0px) + 12px) 14px 10px}
#gFlat .pn{font-weight:700;font-size:16px;line-height:1.25;overflow-wrap:anywhere;align-self:center}
#gFlat .mt{grid-column:1/-1;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
#gFlat .mat{font:600 20px Oswald,sans-serif;letter-spacing:.03em;padding:4px 12px;border-radius:8px;background:#f5b041;color:#1a1204;text-transform:uppercase}
#gFlat .mat.al{background:#9fd3ff;color:#06223a}#gFlat .mat.ss{background:#d9dde3;color:#15181c}
#gFlat .dm{font:600 24px Oswald,sans-serif;color:#3ad06b;letter-spacing:.01em;white-space:nowrap}
#gFlat .sb{grid-column:1/-1;font-size:12.5px;color:#aab0b8;line-height:1.35}
#gFlat .wn{grid-column:1/-1;font-size:12.5px;color:#f5b041;line-height:1.35}
#gFlat button{font:inherit;font-weight:600;border:0;border-radius:999px;padding:8px 16px;background:rgba(255,255,255,.14);color:#fff;min-height:40px;cursor:pointer}
#gFlat .bx{position:relative;flex:1;min-height:0;overflow:auto;background:#fff;margin:0 10px;border-radius:12px;touch-action:pan-x pan-y;display:grid}
#gFlat .bx img{display:block;margin:auto;max-width:none}
#gFlat .zm{position:absolute;right:20px;top:12px;display:flex;flex-direction:column;gap:8px;z-index:2}
#gFlat .zm button{width:44px;height:44px;padding:0;font-size:22px;background:#1d2025e6;box-shadow:0 2px 8px #0005}
#gFlat .lg{position:absolute;left:20px;top:12px;font-size:11px;color:#444;background:#ffffffe0;border-radius:8px;padding:4px 8px;z-index:2}
#gFlat .lg i{display:inline-block;width:14px;height:0;border-top:2px solid;vertical-align:middle;margin:0 3px 0 6px}
#gFlat .stage{position:relative;flex:1;min-height:0;display:flex;flex-direction:column}
#gFlat .ct{padding:10px 14px calc(env(safe-area-inset-bottom,0px) + 12px)}
#gFlat .ct .tt{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px}
#gFlat .ct .tt b{font:600 22px Oswald,sans-serif}#gFlat .ct .tt b.full{color:#3ad06b}
#gFlat .bxs{display:flex;flex-wrap:wrap;gap:8px}
#gFlat .pc{width:46px;height:46px;border-radius:10px;border:2px solid #5a5f68;background:transparent;color:transparent;font-size:24px;padding:0;min-height:0}
#gFlat .pc.on{background:#3ad06b;border-color:#3ad06b;color:#0d1a10}
#gFlat .stp{display:flex;gap:8px;align-items:center}#gFlat .stp button{min-width:56px;height:48px;font-size:20px}#gFlat .stp .all{flex:1;font-size:16px}`;
document.head.appendChild(css);
let closeView=null;
const matCls=m=>/alum|\bal\b|5052|6061/i.test(m)?"al":/stainless|\bss\b|304|316/i.test(m)?"ss":"";
function view(o){
  if(closeView) closeView();
  const url=URL.createObjectURL(new Blob([o.svg],{type:"image/svg+xml"}));
  const eng=/<path d="M[^"]*" fill="none" stroke="#1f6fd1"/.test(o.svg), bend=/<path d="M[^"]*" fill="none" stroke="#d0342c"/.test(o.svg);
  const ov=document.createElement("div"); ov.id="gFlat";
  ov.innerHTML=`<div class="hd"><div class="pn">${esc(o.title||"Flat pattern")}</div><button type="button" id="gfX">Close</button>
      <div class="mt">${o.mat?`<span class="mat ${matCls(o.mat)}">${esc(o.mat)}</span>`:""}<span class="dm">${inch(Math.max(o.W,o.H))} × ${inch(Math.min(o.W,o.H))}</span></div>
      ${o.sub?`<div class="sb">${esc(o.sub)}</div>`:""}${o.warn?`<div class="wn">⚠ ${esc(o.warn)}</div>`:""}</div>
    <div class="stage"><div class="bx"><img alt="Flat pattern" src="${url}"></div>
      <div class="zm"><button type="button" data-z="+" aria-label="Zoom in">+</button><button type="button" data-z="-" aria-label="Zoom out">−</button></div>
      ${eng||bend?`<div class="lg"><i style="color:#111"></i>cut${eng?`<i style="color:#1f6fd1"></i>engrave`:""}${bend?`<i style="color:#d0342c;border-top-style:dashed"></i>bend`:""}</div>`:""}</div>
    ${o.count?`<div class="ct" id="gfC"></div>`:`<div style="height:calc(env(safe-area-inset-bottom,0px) + 10px)"></div>`}`;
  document.body.appendChild(ov);
  // piece check boxes (same rules as the count list: tap box n = n pieces found)
  const C=ov.querySelector("#gfC");
  const drawC=()=>{ if(!C) return; const q=o.count.qty||0, g=Math.min(o.count.got()||0,q), full=q>0&&g>=q;
    C.innerHTML=`<div class="tt"><span style="font-size:13px;color:#aab0b8">Tick one box per piece</span><b class="${full?"full":""}">${g} of ${q}${full?" ✓":""}</b></div>`+
      (q<=24?`<div class="bxs">${Array.from({length:q},(_,k)=>`<button type="button" class="pc ${k<g?"on":""}" data-k="${k}" aria-label="piece ${k+1}">✓</button>`).join("")}</div>`
        :`<div class="stp"><button type="button" data-s="-1">−</button><button type="button" data-s="+1">+</button><button type="button" class="all" data-s="all">All ${q} here</button></div>`);
    C.querySelectorAll("[data-k]").forEach(b=>b.onclick=()=>{ const k=+b.dataset.k; o.count.set(g>=k+1?k:k+1); drawC(); });
    C.querySelectorAll("[data-s]").forEach(b=>b.onclick=()=>{ const s=b.dataset.s; o.count.set(s==="all"?q:Math.max(0,Math.min(q,g+(+s)))); drawC(); }); };
  drawC();
  const img=ov.querySelector("img"), bx=ov.querySelector(".bx"); let z=1;
  const ar=(o.vw&&o.vh)?o.vw/o.vh:(o.W&&o.H?o.W/o.H:1);
  const set=n=>{ const cx=bx.scrollLeft+bx.clientWidth/2, cy=bx.scrollTop+bx.clientHeight/2, oldW=img.offsetWidth||1;
    z=Math.max(1,Math.min(10,n)); const bw=bx.clientWidth-8, bh=bx.clientHeight-8; const fw=Math.min(bw,bh*ar);
    img.style.width=Math.round(fw*z)+"px"; img.style.height=Math.round(fw*z/ar)+"px";
    const k=(fw*z)/oldW; bx.scrollLeft=cx*k-bx.clientWidth/2; bx.scrollTop=cy*k-bx.clientHeight/2; };
  requestAnimationFrame(()=>set(1)); const onR=()=>set(z); window.addEventListener("resize",onR);
  ov.querySelectorAll("[data-z]").forEach(b=>b.onclick=()=>set(b.dataset.z==="+"?z*1.6:z/1.6));
  img.ondblclick=()=>set(z>1?1:3);
  let d0=null,z0=1;
  bx.addEventListener("touchstart",e=>{ if(e.touches.length===2){ d0=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY); z0=z; } },{passive:true});
  bx.addEventListener("touchmove",e=>{ if(e.touches.length===2&&d0){ e.preventDefault(); set(z0*Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY)/d0); } },{passive:false});
  bx.addEventListener("touchend",()=>{ d0=null; });
  let drag=null; const mm=e=>{ if(drag){ bx.scrollLeft=drag.l-(e.clientX-drag.x); bx.scrollTop=drag.t-(e.clientY-drag.y); } }, mu=()=>{ drag=null; };
  bx.addEventListener("mousedown",e=>{ drag={x:e.clientX,y:e.clientY,l:bx.scrollLeft,t:bx.scrollTop}; e.preventDefault(); });
  window.addEventListener("mousemove",mm); window.addEventListener("mouseup",mu);
  closeView=()=>{ ov.remove(); URL.revokeObjectURL(url); window.removeEventListener("resize",onR); window.removeEventListener("mousemove",mm); window.removeEventListener("mouseup",mu); closeView=null; o.onClose&&o.onClose(); };
  ov.querySelector("#gfX").onclick=()=>closeView();
  if(!window.__gfBack){ window.__gfBack=1; const ob=window.gvcBack; window.gvcBack=()=>{ if(closeView){ closeView(); return true; } return ob?ob():false; }; }
}
// the drawing's flat size vs what's in the DXF (either orientation). Returns a warning or "".
function check(x,w,h){ if(!x||!(+w>0)||!(+h>0)) return ""; const a=[x.W0??x.W,x.H0??x.H].sort((m,n)=>m-n), b=[+w,+h].sort((m,n)=>m-n);
  if(Math.abs(a[0]-b[0])<=0.06&&Math.abs(a[1]-b[1])<=0.06) return "";
  return `The drawing says ${inch(+w)} × ${inch(+h)} but the DXF measures ${inch(x.W0??x.W)} × ${inch(x.H0??x.H)} - the DXF has something outside the part (a stray hole or line?). Check before it's cut.`; }
window.gvcFlat={fromDxf,view,inch,parse,geom,check};
})();
