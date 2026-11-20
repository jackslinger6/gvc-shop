/* ---------- Shared photo attach + form drafts (Kyle, Nov 19 2026) ----------
   Problem: the NCR form had no photo button, so Kyle left the app to take a photo and came back to an empty form.
   Every photo button in the app now uses GVCPhotos.pick(): a small sheet with
     Take photo            -> <input capture="environment">: Capacitor's web view opens the phone camera straight away
     Choose existing photo -> the gallery / file picker
   and returns the photos to the SAME screen, shrunk to <= 1600 px JPEG.
   Forms keep a draft on this phone (GVCDraft, IndexedDB - works offline, survives closing the app) that is saved
   as you type and saved again right BEFORE the camera or picker opens, so even if Android closes the app while the
   camera is up, the form comes back. A draft is only cleared after a successful save or an explicit Discard.
   Photos inside a draft are kept as image Blobs (IndexedDB stores them), so they survive too.

   API
     GVCPhotos.pick({multiple, before}) -> Promise<File[]>   (before: async fn run just before the camera/picker opens)
     GVCPhotos.shrink(file) -> Promise<Blob>
     GVCPhotos.strip(list, key) -> html  (thumbnails; list = [{blob|url}], buttons data-phx="key|i" remove, data-phr="key|i" retake)
     GVCPhotos.url(item) -> object URL for a {blob} item (cached on the item)
     GVCDraft.save(key,obj) / load(key) / clear(key) / has(key) / keys(prefix) / at(key)   (has/keys/at are synchronous)
     GVCDraft.mark(el, state)   quiet "Draft saved" label */
(()=>{
/* ---------- drafts ---------- */
const DB="gvc-drafts", ST="drafts";
let dbP=null; const idx=new Map();   // key -> saved time (ms), kept in memory so has() is instant
function open(){ if(!dbP) dbP=new Promise((ok,no)=>{ try{ const r=indexedDB.open(DB,1); r.onupgradeneeded=()=>r.result.createObjectStore(ST); r.onsuccess=()=>ok(r.result); r.onerror=()=>no(r.error); }catch(e){ no(e); } }); return dbP; }
const tx=async(mode,fn)=>{ const d=await open(); return new Promise((ok,no)=>{ const t=d.transaction(ST,mode); const s=t.objectStore(ST); const r=fn(s); t.oncomplete=()=>ok(r&&r.result); t.onerror=()=>no(t.error); t.onabort=()=>no(t.error); }); };
const LSK="gvc_draft_idx";   // fallback index if IndexedDB is unavailable
const ready=(async()=>{ try{ const d=await open(); await new Promise(ok=>{ const t=d.transaction(ST,"readonly"); const c=t.objectStore(ST).openCursor();
      c.onsuccess=()=>{ const cur=c.result; if(cur){ idx.set(cur.key,(cur.value&&cur.value._at)||0); cur.continue(); } else ok(); }; c.onerror=()=>ok(); }); }catch(e){} })();
const Draft={
  ready,
  async save(key,obj){ const v=Object.assign({},obj,{_at:Date.now()}); idx.set(key,v._at);
    try{ await tx("readwrite",s=>s.put(v,key)); }catch(e){ try{ localStorage.setItem("gvc_draft:"+key,JSON.stringify(v,(k,x)=>x instanceof Blob?undefined:x)); }catch(e2){} }
    document.dispatchEvent(new CustomEvent("gvc:draft",{detail:{key}})); return v._at; },
  async load(key){ await ready; try{ const v=await tx("readonly",s=>s.get(key)); if(v) return v; }catch(e){} try{ const s=localStorage.getItem("gvc_draft:"+key); return s?JSON.parse(s):null; }catch(e){ return null; } },
  async clear(key){ idx.delete(key); try{ await tx("readwrite",s=>s.delete(key)); }catch(e){} try{ localStorage.removeItem("gvc_draft:"+key); }catch(e){} document.dispatchEvent(new CustomEvent("gvc:draft",{detail:{key}})); },
  has:key=>idx.has(key), at:key=>idx.get(key)||0,
  keys:prefix=>[...idx.keys()].filter(k=>!prefix||k.startsWith(prefix)),
  /* debounced saver for a form: const s=GVCDraft.saver(key,()=>form,el=>label); s() on every change, await s.now() before the camera */
  saver(key,get,label){ let t=0; const run=async()=>{ clearTimeout(t); const f=get(); if(!f) return; const lab=label&&label(); if(lab) Draft.mark(lab,"saving"); await Draft.save(typeof key==="function"?key():key,f); const l2=label&&label(); if(l2) Draft.mark(l2,"saved"); };
    const s=()=>{ clearTimeout(t); t=setTimeout(run,350); }; s.now=run; return s; },
  mark(el,state){ if(!el) return; el.textContent=state==="saving"?"Saving draft…":state==="saved"?"Draft saved on this phone":state||""; el.dataset.st=state||""; },
  ago(ms){ if(!ms) return ""; const m=Math.round((Date.now()-ms)/60000); if(m<1) return "just now"; if(m<60) return m+" min ago"; const d=new Date(ms); return d.toLocaleDateString(undefined,{month:"short",day:"numeric"})+" "+d.toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"}); }
};
window.GVCDraft=Draft;

/* ---------- photos ---------- */
const css=document.createElement("style");
css.textContent=`
.gph-sheet{position:fixed;inset:0;z-index:10050;background:rgba(0,0,0,.55);display:flex;align-items:flex-end;justify-content:center}
.gph-sheet .in{width:100%;max-width:440px;background:var(--panel,#16181b);border:1px solid var(--line,#2c333b);border-radius:16px 16px 0 0;padding:14px;padding-bottom:max(14px,env(safe-area-inset-bottom));display:flex;flex-direction:column;gap:8px}
@media (min-width:700px){ .gph-sheet{align-items:center} .gph-sheet .in{border-radius:14px} }
.gph-sheet b{font-size:15px;margin:2px 4px 4px}
.gph-sheet button{min-height:52px;font:600 16px var(--font-ui,inherit);border-radius:10px;border:1px solid var(--line,#2c333b);background:var(--panel2,#1f2328);color:var(--text,#eef1f4);cursor:pointer;display:flex;align-items:center;gap:10px;padding:0 14px;text-align:left}
.gph-sheet button.pri{background:var(--orange,#ff8a2a);border-color:var(--orange,#ff8a2a);color:#111}
.gph-sheet button.x{justify-content:center;background:transparent}
.gph-strip{display:flex;gap:8px;flex-wrap:wrap;margin-top:6px}
.gph-strip .t{position:relative;width:84px;height:84px;border-radius:8px;overflow:hidden;border:1px solid var(--line,#2c333b);background:#000}
.gph-strip .t img{width:100%;height:100%;object-fit:cover;display:block}
.gph-strip .t .acts{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:space-between;background:linear-gradient(transparent,rgba(0,0,0,.75))}
.gph-strip .t button{min-width:36px;min-height:32px;background:none;border:0;color:#fff;font-size:15px;cursor:pointer}
.gph-add{display:inline-flex;align-items:center;gap:6px}
.gph-draft{font-size:12px;color:var(--muted,#a6b0bb);min-height:16px}
.gph-draft[data-st=saved]::before{content:"✓ ";color:#5fd38d}
`;
document.head.appendChild(css);

async function shrink(file){
  try{ const img=await new Promise((res,rej)=>{ const i=new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=URL.createObjectURL(file); });
    const s=Math.min(1,1600/Math.max(img.width,img.height)); const c=document.createElement("canvas"); c.width=Math.round(img.width*s); c.height=Math.round(img.height*s);
    c.getContext("2d").drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(img.src); return await new Promise(res=>c.toBlob(b=>res(b||file),"image/jpeg",0.82));
  }catch(e){ return file; }
}
/* open the camera or the picker. Resolves with the chosen files, or [] if cancelled (nothing on the screen changes). */
function chooseFrom(capture,multiple){
  return new Promise(ok=>{
    const inp=document.createElement("input"); inp.type="file"; inp.accept="image/*"; if(multiple&&!capture) inp.multiple=true; if(capture) inp.setAttribute("capture","environment");
    inp.style.cssText="position:fixed;left:-9999px;top:0;opacity:0"; document.body.appendChild(inp);
    let done=false; const fin=files=>{ if(done) return; done=true; window.removeEventListener("focus",onFocus); setTimeout(()=>inp.remove(),0); ok(files); };
    inp.onchange=()=>fin([...(inp.files||[])]);
    inp.addEventListener("cancel",()=>fin([]));   // Chrome / Android web view tell us when the camera or picker is backed out of
    // older web views don't send "cancel": when the app comes back with nothing chosen, treat it as cancelled
    const onFocus=()=>setTimeout(()=>{ if(!done&&!(inp.files&&inp.files.length)) fin([]); },1200);
    setTimeout(()=>window.addEventListener("focus",onFocus),300);
    inp.click(); });
}
function sheet(title,multiple){
  return new Promise(ok=>{
    const S=document.createElement("div"); S.className="gph-sheet"; S.setAttribute("role","dialog"); S.setAttribute("aria-modal","true"); S.setAttribute("aria-label",title);
    S.innerHTML=`<div class="in"><b>${title}</b>
      <button type="button" class="pri" data-g="cam"><span aria-hidden="true">📷</span>Take photo</button>
      <button type="button" data-g="pick"><span aria-hidden="true">🖼</span>Choose existing photo${multiple?"s":""}</button>
      <button type="button" class="x" data-g="x">Cancel</button></div>`;
    const end=v=>{ S.remove(); document.removeEventListener("keydown",esc,true); window.__gphBack=null; ok(v); };
    const esc=e=>{ if(e.key==="Escape"){ e.stopPropagation(); end(null); } };
    S.onclick=e=>{ if(e.target===S) end(null); };
    S.querySelectorAll("[data-g]").forEach(b=>b.onclick=()=>end(b.dataset.g==="x"?null:b.dataset.g));
    document.addEventListener("keydown",esc,true); window.__gphBack=()=>{ end(null); return true; };   // Android Back closes just this sheet (a11y.js also lists it as the top layer)
    document.body.appendChild(S); setTimeout(()=>S.querySelector("[data-g=cam]").focus(),30); });
}
const Photos={
  shrink,
  async pick(o={}){ const how=await sheet(o.title||"Add photo",o.multiple!==false); if(!how) return [];
    if(o.before){ try{ await o.before(); }catch(e){} }    // save the draft BEFORE leaving for the camera
    const files=await chooseFrom(how==="cam",o.multiple!==false);
    const out=[]; for(const f of files) out.push(await shrink(f)); return out; },
  url(it){ if(it.url) return it.url; if(it.blob){ if(!it._u) Object.defineProperty(it,"_u",{value:URL.createObjectURL(it.blob),enumerable:false,writable:true}); return it._u; } return ""; },
  strip(list,key,o={}){ if(!list||!list.length) return ""; const e=s=>String(s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
    return `<div class="gph-strip">${list.map((it,i)=>`<div class="t"><img src="${e(Photos.url(it))}" alt="Photo ${i+1}">${o.readonly?"":`<div class="acts"><button type="button" data-phr="${e(key)}|${i}" aria-label="Retake photo ${i+1}" title="Retake">↻</button><button type="button" data-phx="${e(key)}|${i}" aria-label="Remove photo ${i+1}" title="Remove">✕</button></div>`}</div>`).join("")}</div>`; },
  /* wire the remove / retake buttons of a strip: list is the live array; changed() re-renders and saves the draft */
  wire(root,key,list,changed,before){
    root.querySelectorAll(`[data-phx^="${CSS.escape(key)}|"]`).forEach(b=>b.onclick=()=>{ const i=+b.dataset.phx.split("|").pop(); list.splice(i,1); changed(); });
    root.querySelectorAll(`[data-phr^="${CSS.escape(key)}|"]`).forEach(b=>b.onclick=async()=>{ const i=+b.dataset.phr.split("|").pop();
      const got=await Photos.pick({title:"Retake photo",multiple:false,before}); if(got.length){ list.splice(i,1,{blob:got[0]}); changed(); } }); }
};
window.GVCPhotos=Photos;
// Android Back while the photo sheet is open closes only the sheet
if(window.GVC&&GVC.on) GVC.on("back",()=>window.__gphBack?window.__gphBack():false,{order:0});
})();
