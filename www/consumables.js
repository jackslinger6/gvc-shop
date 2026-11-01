/* ---------- Consumables (Inventory tab → Consumables) - table gvc_consumables ----------
   Weld wire, contact tips, diffusers, gas, discs... counted every week or so; low items alert on To do.
   The in-app Claude can add/update items with its set_consumable tool ("we've got 3 spools of T91"). */
(()=>{
let items=[], loaded=false, ch=null, mode="parts", adding=false;
const CATS=["Welding wire","Contact tips","Nozzles & diffusers","Gas","Grinding & cutting discs","Rod","Safety","Other"];
const COUNT_DAYS=7;
const css=document.createElement("style");
css.textContent=`
.invmode{display:flex;gap:6px;margin:10px 0 2px}
.csv{margin-top:6px;max-width:900px}
.csv .lbl{font-size:12px;color:var(--muted)}
.csv h3{font-family:Oswald,sans-serif;letter-spacing:.05em;font-size:15px;margin:14px 0 4px;color:var(--muted)}
.csv .ci{display:grid;grid-template-columns:1fr auto auto;gap:8px;align-items:center;border:1px solid var(--line);border-left:4px solid var(--c,#555);border-radius:8px;padding:8px 10px;margin:5px 0;background:rgba(0,0,0,.28)}
.csv .cq{display:flex;gap:4px;align-items:center}
.csv .cq input{width:64px;text-align:center;font:inherit;font-size:15px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:4px}
.csv .cq button{width:34px;height:34px;padding:0}
.csv .form{border:1px solid var(--orange);border-radius:8px;padding:10px 12px;margin:8px 0;display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end}
.csv .form label{font-size:12px;color:var(--muted);display:flex;flex-direction:column;gap:3px}
.csv .form input,.csv .form select{font:inherit;font-size:13px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:5px 7px}
`;
document.head.appendChild(css);
async function load(){
  if(!db) return; const {data,error}=await sb.from("gvc_consumables").select("*").order("category").order("sort").order("name");
  if(!error){ items=data||[]; loaded=true; }
  if(!ch) ch=sb.channel("gvc_consumables").on("postgres_changes",{event:"*",schema:"public",table:"gvc_consumables"},()=>load()).subscribe();
  if(cur==="inv"||cur==="todo") render();
}
setInterval(()=>{ if(db&&!loaded){ loaded=true; load(); } },1300);
const low=i=>i.min_qty!=null&&i.qty!=null&&Number(i.qty)<=Number(i.min_qty);
const ago=t=>{ if(!t) return "never"; const d=Math.floor((Date.now()-new Date(t).getTime())/864e5); return d<1?"today":d===1?"yesterday":d+" days ago"; };
const lastCount=()=>{ const c=items.map(i=>i.counted_at).filter(Boolean).sort(); return c.length?c[0]:null; };
async function save(id,patch){ const it=items.find(x=>x.id===id); Object.assign(it,patch); const {error}=await sb.from("gvc_consumables").update(patch).eq("id",id); if(error) alert("Couldn't save: "+error.message); }

function renderCons(){
  const B=$("#board"); B.className="csv"; B.style.gridTemplateColumns="";
  const cats=[...new Set([...CATS.filter(c=>items.some(i=>i.category===c)),...items.map(i=>i.category||"Other")])];
  const lows=items.filter(low);
  let h=modeBar()+`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:6px"><h2 style="font-family:Oswald,sans-serif;letter-spacing:.05em;margin:0">Consumables</h2><span style="flex:1"></span>
     <button class="btn sm" type="button" id="csAdd">+ Item</button></div>
   <div class="lbl" style="margin-top:4px">${items.length?`${items.length} items · oldest count ${ago(lastCount())}${lows.length?` · <span style="color:#ff9b91">${lows.length} low</span>`:""}. Change a number to record a count. Count every ${COUNT_DAYS} days or so.`:`Nothing tracked yet. Easiest way to set it up: walk the shop and tell Ask Claude what you've got, e.g. "we have 3 spools of T91 flux core, keep at least 4" - it adds them here. Or tap + Item.`}</div>`;
  if(adding) h+=`<div class="form"><label>Name<input id="csN" placeholder="e.g. T91 flux core .045" style="min-width:200px"></label>
     <label>Category<select id="csC">${CATS.map(c=>`<option>${c}</option>`).join("")}</select></label>
     <label>Unit<input id="csU" placeholder="spools / boxes / each" style="width:120px"></label>
     <label>Have<input id="csQ" type="number" min="0" step="any" style="width:80px"></label>
     <label>Keep at least<input id="csM" type="number" min="0" step="any" style="width:90px"></label>
     <button class="btn sm" type="button" id="csX">Cancel</button><button class="btn sm primary" type="button" id="csS">Add</button></div>`;
  h+=cats.map(c=>{ const l=items.filter(i=>(i.category||"Other")===c); return `<h3>${esc(c)}</h3>`+l.map(i=>`<div class="ci" style="--c:${low(i)?"#e5483b":i.qty==null?"#6c727a":"#3ad06b"}">
     <div><b style="font-weight:600">${esc(i.name)}</b><div class="lbl">${i.min_qty!=null?`keep at least ${+i.min_qty} ${esc(i.unit||"")} · `:""}counted ${ago(i.counted_at)}${low(i)?` · <span style="color:#ff9b91">LOW - order more</span>`:""}${i.notes?" · "+esc(i.notes):""}</div></div>
     <div class="cq"><button class="btn" type="button" data-cm="${i.id}" aria-label="One less">−</button><input type="number" min="0" step="any" value="${i.qty??""}" data-cq="${i.id}" aria-label="How many ${esc(i.name)}"><button class="btn" type="button" data-cp="${i.id}" aria-label="One more">+</button><span class="lbl" style="min-width:44px">${esc(i.unit||"")}</span></div>
     <div style="display:flex;gap:4px"><button class="btn sm ghost" type="button" data-cmin="${i.id}" title="Minimum to keep">Min</button><button class="btn sm ghost" type="button" data-cdel="${i.id}" aria-label="Remove ${esc(i.name)}">✕</button></div></div>`).join(""); }).join("");
  B.innerHTML=h; wireMode();
  $("#csAdd").onclick=()=>{ adding=true; render(); setTimeout(()=>{ const n=$("#csN"); if(n) n.focus(); },30); };
  if(adding){ $("#csX").onclick=()=>{ adding=false; render(); };
    $("#csS").onclick=async()=>{ const name=$("#csN").value.trim(); if(!name) return; const q=$("#csQ").value, m=$("#csM").value;
      const {error}=await sb.from("gvc_consumables").insert({name,category:$("#csC").value,unit:$("#csU").value.trim()||null,qty:q===""?null:+q,min_qty:m===""?null:+m,counted_at:q===""?null:new Date().toISOString()});
      if(error){ alert("Couldn't add: "+error.message); return; } adding=false; load(); }; }
  const setQ=(id,v)=>{ save(id,{qty:Math.max(0,v),counted_at:new Date().toISOString()}).then(()=>render()); };
  B.querySelectorAll("[data-cq]").forEach(el=>el.onchange=()=>setQ(el.dataset.cq,el.value===""?0:+el.value));
  B.querySelectorAll("[data-cm]").forEach(el=>el.onclick=()=>{ const i=items.find(x=>x.id===el.dataset.cm); setQ(i.id,(+i.qty||0)-1); });
  B.querySelectorAll("[data-cp]").forEach(el=>el.onclick=()=>{ const i=items.find(x=>x.id===el.dataset.cp); setQ(i.id,(+i.qty||0)+1); });
  B.querySelectorAll("[data-cmin]").forEach(el=>el.onclick=()=>{ const i=items.find(x=>x.id===el.dataset.cmin); const v=prompt(`Keep at least how many ${i.unit||""} of ${i.name}? (blank = no minimum)`,i.min_qty??""); if(v!==null) save(i.id,{min_qty:v.trim()===""?null:+v}).then(()=>render()); });
  B.querySelectorAll("[data-cdel]").forEach(el=>el.onclick=async()=>{ const i=items.find(x=>x.id===el.dataset.cdel); items=items.filter(x=>x!==i); render(); await sb.from("gvc_consumables").delete().eq("id",i.id);
    todoToast(`Removed ${i.name}`,async()=>{ await sb.from("gvc_consumables").insert(i); load(); }); });
}
function modeBar(){ return `<div class="invmode"><button class="btn sm ${mode==="parts"?"primary":""}" type="button" data-im="parts">Truck parts</button><button class="btn sm ${mode==="cons"?"primary":""}" type="button" data-im="cons">Consumables${items.some(low)?` (${items.filter(low).length} low)`:""}</button></div>`; }
function wireMode(){ document.querySelectorAll("[data-im]").forEach(b=>b.onclick=()=>{ mode=b.dataset.im; try{localStorage.setItem("gvc_inv_mode",mode)}catch(e){} render(); }); }
try{ mode=localStorage.getItem("gvc_inv_mode")||"parts"; }catch(e){}
const _inv=renderInv;
renderInv=function(){ if(mode==="cons") return renderCons(); _inv(); const B=$("#board"); B.insertAdjacentHTML("afterbegin",modeBar()); wireMode(); };
const _auto=autoTodos;
autoTodos=function(){ const out=_auto(); try{ if(!loaded||!items.length) return out; const hidden=new Set(todos.filter(t=>t.source==="auto").map(t=>t.text));
  const lows=items.filter(low); if(lows.length){ const text=`Low on consumables: ${lows.map(i=>`${i.name} (${+i.qty}${i.unit?" "+i.unit:""}, keep ${+i.min_qty})`).join(", ")}`; if(!hidden.has(text)) out.unshift({text,c:"#e5483b",view:"inv"}); }
  const lc=lastCount(); const stale=items.some(i=>!i.counted_at||Date.now()-new Date(i.counted_at).getTime()>COUNT_DAYS*864e5);
  if(stale){ const text=`Do the consumables count (oldest count ${ago(lc)})`; if(!hidden.has(text)) out.push({text,c:"#f5b041",view:"inv",low:true}); }
}catch(e){} return out; };
window.consLines=()=>items.map(i=>`[consumable] ${i.name} (${i.category||"Other"}): ${i.qty??"?"} ${i.unit||""}${i.min_qty!=null?`, keep at least ${+i.min_qty}`:""}, counted ${ago(i.counted_at)}${low(i)?" - LOW":""}`);
})();
