/* ---------- Dialog layers (usability pass, Nov 15) ----------
   One behaviour for every pop-up: the job/count dialog (#scrim), the order panel (.opanel), bottom sheets (.shov),
   the drawing viewer (#gFlat) and its "unsaved count" prompt (.cfp), the scanner, the 3D viewer, Ask Claude.
   - opening moves focus inside (unless the screen already put it in a field) and remembers what opened it
   - Tab / Shift+Tab stay inside the top layer; everything behind it is `inert` (no taps, no focus, hidden from readers)
   - each layer has role=dialog + aria-modal + an accessible name (its heading, or a fallback)
   - Escape and Android Back close ONLY the top layer, through that layer's own close path, so the existing
     protections still run (count Back-to-job "not saved" hold, drawing viewer "confirm count?", job card Close keeps edits)
   - closing returns focus to the control that opened it
   - with the phone keyboard up, the focused field is scrolled into view and pop-ups get bottom room (--kb)
   Layers are found from the DOM (MutationObserver), so screens don't need to register themselves. */
(()=>{
const $=s=>document.querySelector(s);
const click=el=>{ if(el){ el.click(); return true; } return false; };
const L=[
  { k:"scan",  el:()=>$("#gScan"), open:e=>!!e, box:e=>e, name:"Scan a part", close:()=>click($("#gsX")) },
  { k:"v3d",   el:()=>[...document.querySelectorAll("#v3d")].pop()||null, open:e=>!!e, box:e=>e, name:"3D model",
    close:e=>{ if(e.classList.contains("a3v")&&window.__v3dBack&&window.__v3dBack()) return; click(e.querySelector("#v3x")); } },   // assembly viewer: menu / drawing / measure / phone panel close first
  { k:"cfp",   el:()=>$("#gFlat .cfp"), open:e=>!!e, box:e=>e.querySelector(".cfpa")?e:e, name:"Unconfirmed count", alert:true,
    close:()=>click($("#gFlat .cfp [data-k]")) },
  { k:"flat",  el:()=>$("#gFlat"), open:e=>!!e, box:e=>e, name:"Drawing", close:()=>click($("#gfX")) },
  { k:"chat",  el:()=>$("#chatP"), open:e=>!!e&&e.classList.contains("on"), box:e=>e, name:"Ask Claude", close:()=>click($("#chatX")) },
  { k:"sheet", multi:true, el:()=>[...document.querySelectorAll(".shov.on")], open:e=>!!e, box:e=>e.querySelector(".shsheet")||e, name:"Menu",
    close:e=>{ const x=e.querySelector(".shx"); if(x) x.click(); else e.click(); } },
  { k:"dlg",   el:()=>$("#scrim"), open:e=>!!e&&e.classList.contains("on"), box:()=>$("#dlg"), name:"Details",
    // the count screen has its own guarded Back to job (holds while counts aren't saved); everything else steps back
    close:()=>{ if(click($("#dlg #cBack"))) return; if(window.gvcDlgBack) window.gvcDlgBack(); else if(window.closeDlg) closeDlg(); } },
  { k:"panel", el:()=>$(".opanel.on"), open:e=>!!e, box:e=>e.querySelector(".opbox")||e, name:"Order", close:()=>click($("#pBack")) },
];
let stack=[];          // [{def, el, opener}]
let lastFocus=null;
const FOC='a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"]),summary,[contenteditable="true"]';
const vis=el=>!!(el.offsetWidth||el.offsetHeight||el.getClientRects().length)&&getComputedStyle(el).visibility!=="hidden";
const focusables=box=>[...box.querySelectorAll(FOC)].filter(x=>vis(x)&&!x.closest("[inert]"));

function openLayers(){
  const out=[];
  for(const d of L){ const r=d.el(); (d.multi?r:[r]).forEach(e=>{ if(e&&d.open(e)) out.push({def:d,el:e}); }); }
  return out;
}
function label(def,el){
  const b=def.box(el)||el; if(!b) return;
  const host=def.k==="dlg"?el:b;   // #scrim carries role=dialog for the job/count dialog
  if(!host.getAttribute("role")) host.setAttribute("role",def.alert?"alertdialog":"dialog");
  host.setAttribute("aria-modal","true");
  const h=b.querySelector("h1,h2,h3,[data-dlgtitle],#gFlat .hd b,.ophd b,.tt");
  if(h&&(h.textContent||"").trim()){ if(!h.id) h.id="dlgh"+Math.random().toString(36).slice(2,7); host.setAttribute("aria-labelledby",h.id); host.removeAttribute("aria-label"); }
  else if(!host.getAttribute("aria-labelledby")||!document.getElementById(host.getAttribute("aria-labelledby"))){ host.removeAttribute("aria-labelledby"); host.setAttribute("aria-label",def.name); }
  if(!b.hasAttribute("tabindex")) b.setAttribute("tabindex","-1");
  b.dataset.a11ydlg="1";
}
function setInert(){
  document.querySelectorAll("[data-a11yinert]").forEach(x=>{ x.inert=false; x.removeAttribute("inert"); delete x.dataset.a11yinert; });
  const top=stack[stack.length-1]; if(!top) return;
  // inert every sibling along the path from the top layer up to <body>
  let n=top.def.k==="dlg"?top.el:top.el;
  while(n&&n!==document.body&&n.parentElement){
    for(const s of n.parentElement.children){
      if(s===n||s.inert||/^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(s.tagName)) continue;
      if(s.id==="toast"||s.classList.contains("toast")) continue;   // the Undo toast stays reachable
      s.inert=true; s.dataset.a11yinert="1";
    }
    n=n.parentElement;
  }
}
let pend=false;
function sync(){ pend=false;
  const now=openLayers();
  const same=(a,b)=>a.def===b.def&&a.el===b.el;
  // closed layers: drop from the stack, return focus to whatever opened them
  const closed=stack.filter(s=>!now.some(n=>same(n,s)));
  stack=stack.filter(s=>now.some(n=>same(n,s)));
  // newly opened layers go on top in the order the DOM lists them (most-nested prompt last)
  const added=now.filter(n=>!stack.some(s=>same(n,s)));
  added.sort((a,b)=>L.indexOf(b.def)-L.indexOf(a.def));
  for(const a of added){
    const act=document.activeElement;
    const opener=act&&act!==document.body&&!a.el.contains(act)?act:lastFocus;
    stack.push({...a,opener}); label(a.def,a.el);
    const b=a.def.box(a.el)||a.el;
    setTimeout(()=>{ if(!b.isConnected) return; if(b.contains(document.activeElement)) return;
      const af=b.querySelector("[autofocus]"); (af&&vis(af)?af:b).focus({preventScroll:true}); },60);
  }
  stack.forEach(s=>label(s.def,s.el));
  setInert();
  if(closed.length&&!added.length){
    const o0=closed[0].opener, top=stack[stack.length-1];   // several closed at once: go back to what opened the lowest one
    const back=()=>{ const o=refind(o0);
      if(o&&o.isConnected&&vis(o)&&!o.closest("[inert]")&&(!top||top.def.box(top.el).contains(o))) o.focus({preventScroll:true});
      else if(top){ const b=top.def.box(top.el); if(b&&!b.contains(document.activeElement)) b.focus({preventScroll:true}); } };
    setTimeout(back,30);
    // the screen behind may re-draw just after the pop-up goes (count list): put focus back on the new copy of the control
    setTimeout(()=>{ const a=document.activeElement, t=stack[stack.length-1], b=t&&t.def.box(t.el);
      if(!a||a===document.body||a===b) back(); },350);
  }
  document.body.classList.toggle("haslayer",stack.length>0);
}
const mo=new MutationObserver(()=>{ if(!pend){ pend=true; queueMicrotask(sync); } });
const start=()=>{ mo.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["class","hidden"]}); sync(); };
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",start); else start();

document.addEventListener("focusin",e=>{ if(!stack.length||!stack[stack.length-1].el.contains(e.target)) lastFocus=e.target;
  // phone keyboard: keep the field (and the buttons under it) on screen
  if(/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)&&stack.length) setTimeout(()=>{ if(document.activeElement===e.target) e.target.scrollIntoView({block:"center",behavior:"smooth"}); },320);
},true);

/* the screen behind often re-draws while a pop-up is open (a count row after confirming): find the same control again */
function refind(o){ if(!o) return null; if(o.isConnected) return o;
  if(o.id){ const x=document.getElementById(o.id); if(x) return x; }
  const ds=Object.entries(o.dataset||{}).filter(([k])=>!/^a11y/.test(k));
  if(!ds.length) return null;
  const sel=o.tagName.toLowerCase()+ds.map(([k,v])=>`[data-${k.replace(/[A-Z]/g,m=>"-"+m.toLowerCase())}="${CSS.escape(v)}"]`).join("");
  try{ return document.querySelector(sel); }catch(e){ return null; } }
function closeTop(){ const t=stack[stack.length-1]; if(!t) return false; t.def.close(t.el); return true; }
window.gvcLayers={ openers:()=>stack.map(s=>s.def.k+": "+(s.opener?s.opener.outerHTML.slice(0,70):"none")), top:()=>stack.length?stack[stack.length-1].def.k:null, depth:()=>stack.length, closeTop, sync };

window.addEventListener("keydown",e=>{
  if(!stack.length) return;
  const t=stack[stack.length-1], b=t.def.box(t.el)||t.el;
  if(e.key==="Escape"){
    // a field with its own Escape (inline rename etc.) handles it first
    if(e.target&&e.target.onkeydown&&/INPUT|TEXTAREA/.test(e.target.tagName)&&e.target.dataset.esc!=="layer") return;
    e.preventDefault(); e.stopImmediatePropagation(); closeTop(); return;
  }
  if(e.key==="Tab"){
    const f=focusables(b); if(!f.length){ e.preventDefault(); b.focus(); return; }
    const i=f.indexOf(document.activeElement);
    if(e.shiftKey&&(i<=0)){ e.preventDefault(); e.stopImmediatePropagation(); f[f.length-1].focus(); }
    else if(!e.shiftKey&&(i===-1||i===f.length-1)){ e.preventDefault(); e.stopImmediatePropagation(); f[0].focus(); }
  }
},true);

// Android Back: the top layer first (order 1 runs before every other "back" step)
if(window.GVC&&GVC.on) GVC.on("back",()=>{ sync(); return closeTop(); },{order:1});

// phone keyboard height -> --kb, so pop-ups leave room for their buttons
const vv=window.visualViewport;
if(vv){ const upd=()=>{ const kb=Math.max(0,Math.round(innerHeight-vv.height-vv.offsetTop)); document.documentElement.style.setProperty("--kb",kb+"px"); document.documentElement.style.setProperty("--vvh",Math.round(vv.height)+"px"); };
  vv.addEventListener("resize",upd); vv.addEventListener("scroll",upd); upd(); }

const st=document.createElement("style"); st.textContent=`
[data-a11ydlg]:focus{outline:none}
.scrim{padding-bottom:calc(28px + var(--kb,0px))!important}
.shov .shsheet{margin-bottom:var(--kb,0px);max-height:calc(var(--vvh,100vh) - 24px)}
.opbox{padding-bottom:calc(16px + var(--kb,0px))}
:focus-visible{outline:2px solid var(--accent,#ff8a2a);outline-offset:2px}
`; document.head.appendChild(st);
})();
