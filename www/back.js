/* ---------- Back button that steps back one screen (Colton, 2026-11-06) ----------
   The job card, Parts & drawings, a bend drawing, a count sheet... all show in the same pop-up (#dlg). Before this,
   the phone's Back button closed the whole app and tapping outside a drawing closed everything.
   Now every screen shown in the pop-up is remembered, and Back (phone Back button, Esc, tapping outside) goes to the
   one before: drawing -> parts list -> job card -> closed. Sheets (menus, My time, messages) and Ask Claude close first.
   On the phone, Back on a tab other than Home goes Home; Back on Home puts the app in the background (MainActivity
   calls window.gvcBack() and only leaves the app when it returns false). */
(()=>{
const D=()=>document.getElementById("dlg"), S=()=>document.getElementById("scrim");
const isOn=()=>{ const s=S(); return !!(s&&s.classList.contains("on")); };
let stack=[], curKey=null, curFn=null, pending=null, goingBack=false, replay=null;

/* what's showing in the pop-up right now */
function keyNow(){
  const d=D(); if(!d) return null;
  if(typeof openId!=="undefined"&&openId) return "job:"+openId;
  // a drawing is named by its title, not the picture: the sharp PDF canvas replaces the picture a moment later,
  // which used to look like a new screen - Back then re-opened the same drawing (Kyle, Nov 9)
  const zb=d.querySelector("#zBox"); if(zb){ const t=d.querySelector("b"); return "draw:"+(t?t.textContent.trim():""); }
  const f=d.firstElementChild; const z=f&&f.tagName==="IMG"?f:null; if(z) return "img:"+(z.getAttribute("src")||"").split("?")[0];
  const jp=d.querySelector(".jp h3"); if(jp) return "parts:"+jp.textContent.trim();
  const c=d.querySelector(".cnt h3"); if(c) return "count:"+c.textContent.trim();
  const h=d.querySelector("h2,h3"); return "x:"+(h?h.textContent.trim().slice(0,60):d.textContent.trim().slice(0,30));
}
/* the screens we know how to open again */
function wrap(name,mk){
  const f=window[name]; if(typeof f!=="function") return;
  const w=function(...a){ pending=mk?mk(f,a):()=>f.apply(this,a); return f.apply(this,a); };
  try{ window[name]=w; }catch(e){}
  try{ if(name==="openJob") openJob=w; else if(name==="viewDrawing") viewDrawing=w; else if(name==="zoomImg") zoomImg=w; }catch(e){}
}
wrap("openJob"); wrap("openJobParts"); wrap("viewDrawing"); wrap("zoomImg"); wrap("openCount"); wrap("openPrices");

function check(){
  if(!isOn()){ stack=[]; curKey=null; curFn=null; pending=null; replay=null; goingBack=false; return; }
  const k=keyNow(); if(!k||k===curKey){ if(pending&&k===curKey&&!curFn) curFn=pending; pending=null; return; }
  const i=stack.findIndex(x=>x.key===k);
  let keep=null;
  if(i>=0){ keep=stack[i].fn; stack.length=i; }     // went back with an in-app Back button
  else if(curKey&&!goingBack) stack.push({key:curKey,fn:curFn});
  // coming back to a screen re-drawn by its own code (not one of the wrapped openers) keeps the way to open it again;
  // before, it lost it and the next Back skipped right past it - "goes back too far" (Kyle, Nov 9)
  curKey=k; curFn=pending||keep||replay; pending=null; replay=null; goingBack=false;
  tidy();
}
/* a drawing or picture opened from another screen: its Close button becomes Back (one step), the ✕ closes everything */
function tidy(){
  if(!stack.length) return; const d=D(); if(!d) return;
  if(!/^(draw|img):/.test(curKey||"")) return;
  d.querySelectorAll("button[onclick='closeDlg()']").forEach(x=>{ if(x.dataset.bk) return; x.dataset.bk="1"; x.removeAttribute("onclick"); x.textContent="Back";
    x.onclick=e=>{ e.preventDefault(); e.stopPropagation(); window.gvcDlgBack(); };
    const c=document.createElement("button"); c.type="button"; c.className=x.className; c.textContent="✕"; c.title="Close"; c.setAttribute("aria-label","Close");
    c.onclick=e=>{ e.preventDefault(); e.stopPropagation(); closeDlg(); }; x.after(c); });
}
const mo=new MutationObserver(check);
const start=()=>{ if(D()) mo.observe(D(),{childList:true}); if(S()) mo.observe(S(),{attributes:true,attributeFilter:["class"]}); };
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",start); else start();

/* one step back inside the pop-up */
window.gvcBackDebug=()=>({stack:stack.map(x=>[x.key,!!x.fn]),curKey,curFn:!!curFn});
window.gvcDlgBack=()=>{
  check();
  while(stack.length){
    const t=stack.pop();
    if(t.fn){ goingBack=true; replay=t.fn; try{ t.fn(); check(); return; }catch(e){ goingBack=false; replay=null; } }
  }
  if(typeof window.closeJob==="function") window.closeJob(); else if(typeof closeDlg==="function") closeDlg();
};
// tapping outside the pop-up and Esc step back instead of closing everything
document.addEventListener("click",e=>{ const s=S(); if(s&&e.target===s){ e.stopImmediatePropagation(); window.gvcDlgBack(); } },true);
document.addEventListener("keydown",e=>{ if(e.key==="Escape"&&isOn()&&!document.querySelector(".shov")){ e.stopImmediatePropagation(); window.gvcDlgBack(); } },true);

/* phone Back button. Returns true when it handled it (false = nothing left, let the app go to the background) */
window.gvcBack=()=>{
  try{
    const whl=document.querySelector(".whl.on"); if(whl){ whl.dispatchEvent(new MouseEvent("click",{bubbles:true})); return true; }
    const sh=[...document.querySelectorAll(".shov")].filter(x=>x.classList.contains("on")).pop();
    if(sh){ sh.dispatchEvent(new MouseEvent("click",{bubbles:true})); return true; }
    const cp=document.getElementById("chatP"); if(cp&&cp.classList.contains("on")){ const x=document.getElementById("chatX"); if(x) x.click(); else cp.classList.remove("on"); return true; }
    if(isOn()){ window.gvcDlgBack(); return true; }
    if(window.ME&&ME.preview&&window.crewPreview){ window.crewPreview(false); return true; }
    const login=document.getElementById("app"); if(login&&login.hidden) return false;
    const atHome=cur==="home"||(window.gvcHomeView&&cur===window.gvcHomeView());   // Kyle's Home is To do, the crew's is their task list   // Kyle's Home is the To do list
    if(typeof cur!=="undefined"&&!atHome){ if(typeof shellGo==="function") shellGo("home"); else { cur="home"; render(); } return true; }
  }catch(e){}
  return false;
};
})();
