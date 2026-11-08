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
  let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; B.forEach(g=>g.pl.forEach(([x,y])=>{ if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }));
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
  return {svg,thumb,W,H,vw:W+pad*1.6,vh:H+pad*1.6};
}

/* full-screen viewer: pinch / buttons / double-tap to zoom, drag to pan, Back closes */
const css=document.createElement("style");
css.textContent=`#gFlat{position:fixed;inset:0;z-index:8500;background:#0d0e10f2;display:flex;flex-direction:column;color:#fff;font-family:Inter,system-ui,sans-serif}
#gFlat .hd{display:flex;gap:8px;align-items:center;padding:calc(env(safe-area-inset-top,0px) + 10px) 12px 8px}
#gFlat .hd .t{flex:1;min-width:0}#gFlat .hd b{display:block;font-size:15px;word-break:break-word}#gFlat .hd small{font-size:12.5px;opacity:.75}
#gFlat .dm{font:600 20px Oswald,sans-serif;color:#3ad06b;white-space:nowrap}
#gFlat button{font:inherit;font-weight:600;border:0;border-radius:999px;padding:9px 14px;background:rgba(255,255,255,.16);color:#fff;min-height:40px;cursor:pointer}
#gFlat .bx{flex:1;overflow:auto;background:#fff;margin:0 8px calc(env(safe-area-inset-bottom,0px) + 8px);border-radius:10px;touch-action:pan-x pan-y}
#gFlat .bx{display:grid}#gFlat .bx img{display:block;margin:auto;max-width:none}
#gFlat .lg{font-size:11.5px;opacity:.7;padding:0 14px 6px}`;
document.head.appendChild(css);
let closeView=null;
function view(o){
  if(closeView) closeView();
  const url=URL.createObjectURL(new Blob([o.svg],{type:"image/svg+xml"}));
  const ov=document.createElement("div"); ov.id="gFlat";
  ov.innerHTML=`<div class="hd"><div class="t"><b>${esc(o.title||"Flat pattern")}</b>${o.sub?`<small>${esc(o.sub)}</small>`:""}</div>
    <span class="dm">${inch(o.W)} × ${inch(o.H)}</span><button type="button" data-z="-">−</button><button type="button" data-z="+">+</button><button type="button" id="gfX">Close</button></div>
    ${o.warn?`<div class="lg" style="color:#f5b041;opacity:1;font-size:13px">⚠ ${esc(o.warn)}</div>`:""}
    <div class="lg">Flat pattern from the laser DXF · black = cut · <span style="color:#7fb4ff">blue = engrave</span> · <span style="color:#ff8a80">red dashed = bend</span> · pinch or double-tap to zoom</div>
    <div class="bx"><img alt="Flat pattern" src="${url}"></div>`;
  document.body.appendChild(ov);
  const img=ov.querySelector("img"), bx=ov.querySelector(".bx"); let z=1;
  const ar=(o.vw&&o.vh)?o.vw/o.vh:(o.W&&o.H?o.W/o.H:1);
  const set=n=>{ const cx=bx.scrollLeft+bx.clientWidth/2, cy=bx.scrollTop+bx.clientHeight/2, oldW=img.offsetWidth||1;
    z=Math.max(1,Math.min(10,n)); const bw=bx.clientWidth-8, bh=bx.clientHeight-8; const fw=Math.min(bw,bh*ar);   // fitted width at zoom 1
    img.style.width=Math.round(fw*z)+"px"; img.style.height=Math.round(fw*z/ar)+"px";
    const k=(fw*z)/oldW; bx.scrollLeft=cx*k-bx.clientWidth/2; bx.scrollTop=cy*k-bx.clientHeight/2; };
  requestAnimationFrame(()=>set(1)); window.addEventListener("resize",()=>set(z));
  ov.querySelectorAll("[data-z]").forEach(b=>b.onclick=()=>set(b.dataset.z==="+"?z*1.6:z/1.6));
  img.ondblclick=()=>set(z>1?1:3);
  let d0=null,z0=1;
  bx.addEventListener("touchstart",e=>{ if(e.touches.length===2){ d0=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY); z0=z; } },{passive:true});
  bx.addEventListener("touchmove",e=>{ if(e.touches.length===2&&d0){ e.preventDefault(); set(z0*Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY)/d0); } },{passive:false});
  bx.addEventListener("touchend",()=>{ d0=null; });
  let drag=null; bx.addEventListener("mousedown",e=>{ drag={x:e.clientX,y:e.clientY,l:bx.scrollLeft,t:bx.scrollTop}; e.preventDefault(); });
  window.addEventListener("mousemove",e=>{ if(drag){ bx.scrollLeft=drag.l-(e.clientX-drag.x); bx.scrollTop=drag.t-(e.clientY-drag.y); } });
  window.addEventListener("mouseup",()=>{ drag=null; });
  closeView=()=>{ ov.remove(); URL.revokeObjectURL(url); closeView=null; };
  ov.querySelector("#gfX").onclick=closeView;
  if(!window.__gfBack){ window.__gfBack=1; const ob=window.gvcBack; window.gvcBack=()=>{ if(closeView){ closeView(); return true; } return ob?ob():false; }; }
}
// the drawing's flat size vs what's in the DXF (either orientation). Returns a warning or "".
function check(x,w,h){ if(!x||!(+w>0)||!(+h>0)) return ""; const a=[x.W,x.H].sort((m,n)=>m-n), b=[+w,+h].sort((m,n)=>m-n);
  if(Math.abs(a[0]-b[0])<=0.06&&Math.abs(a[1]-b[1])<=0.06) return "";
  return `The drawing says ${inch(+w)} × ${inch(+h)} but the DXF measures ${inch(x.W)} × ${inch(x.H)} - the DXF has something outside the part (a stray hole or line?). Check before it's cut.`; }
window.gvcFlat={fromDxf,view,inch,parse,geom,check};
})();
