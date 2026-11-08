/* ---------- Robin's order tracker (Kyle, 2026-11-06) ----------
   Her own orders, separate from Kyle's job suppliers. Table gvc_porders (admin + parts only).
   Stages: Asked for quotes -> Comparing quotes -> On order -> On its way -> Ready to pick up -> Delivered -> Received (counted).
   Quotes come from email: "Read a quote from email" lists quote-looking emails (Robin's mailbox once connected - until then
   only what she forwarded to Kyle), Claude reads the one she taps (body + PDF/photo attachments) into lines, each matched to
   the order's items. Compare = items x vendors, cheapest green - worked out here, no second Claude call.
   Edge function gvc-quotes actions: rfq_mail, rfq_read, rfq_box, rfq_connect. Robin's mailbox = gvc_ms id 'robin'. */
(()=>{
const role=()=>window.ME&&ME.role;
const office=()=>role()==="admin"||role()==="parts"||!role();
const me=()=>(window.ME&&ME.name)||"Kyle";
const pv=()=>!!(window.ME&&ME.preview);
const PV="Preview - nothing is saved. Exit the preview to do that for real.";
const E=s=>esc(s==null?"":String(s));
const say=m=>{ if(typeof todoToast==="function"){ todoToast(m,null); const u=document.getElementById("toastUndo"); if(u) u.style.display="none"; } };
const ago=t=>{ if(!t) return ""; const s=(Date.now()-new Date(t))/1e3; if(s<90) return "just now"; if(s<3600) return Math.round(s/60)+" min ago"; if(s<86400) return Math.round(s/3600)+"h ago";
  const d=Math.round(s/86400); return d===1?"yesterday":d<7?d+" days ago":new Date(t).toLocaleDateString([], {month:"short",day:"numeric"}); };
const day=t=>t?new Date(t.length===10?t+"T12:00":t).toLocaleDateString([], {month:"short",day:"numeric"}):"";
const $$=n=>n==null||n===""||isNaN(n)?"":"$"+(+n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});

const ST=[["rfq","Asked for quotes","#9b7bff"],["compare","Comparing quotes","#22c3e6"],["ordered","On order","#ff8a2a"],["shipped","On its way","#f5b041"],["ready","Ready to pick up","#3ad06b"],["delivered","Delivered","#2f8ff0"],["received","Received ✓","#7d8794"]];
const SL=Object.fromEntries(ST.map(([k,t,c])=>[k,{t,c}]));
let PO=[], loaded=false, tab="active", poId=null, ch=null, BOX=null;
window.pordersOpen=()=>PO.filter(o=>!["received","cancelled"].includes(o.status)).length;
window.pordersBy=k=>PO.filter(o=>o.status===k).length;

async function load(){
  const r=await sb.from("gvc_porders").select("*").order("created_at",{ascending:false});
  if(!r.error) PO=r.data||[]; loaded=true;
  if(typeof cur!=="undefined"&&(cur==="porders"||cur==="home")) render();
}
let started=false;
setInterval(()=>{ if(!started&&typeof sb!=="undefined"&&sb&&window.ME&&office()&&role()!=="crew"){ started=true; load();
  try{ ch=sb.channel("gvc_porders").on("postgres_changes",{event:"*",schema:"public",table:"gvc_porders"},()=>load()).subscribe(); }catch(e){} } },1500);

async function call(body){ const r=await sb.functions.invoke("gvc-quotes",{body}); if(r.error){ let m=r.error.message; try{ const t=await r.error.context.text(); try{ m=JSON.parse(t).error||t||m; }catch(e2){ m=t||m; } }catch(e){} throw new Error(m); } return r.data; }
async function save(o,patch,note){
  if(pv()){ say(PV); return false; }
  const log=[...(o.log||[]),...(note?[{at:new Date().toISOString(),who:me(),t:note}]:[])].slice(-60);
  const r=await sb.from("gvc_porders").update({...patch,log,updated_at:new Date().toISOString()}).eq("id",o.id);
  if(r.error){ say("Couldn't save: "+r.error.message); return false; }
  Object.assign(o,patch,{log}); render(); return true;
}

const css=document.createElement("style");
css.textContent=`
.pov{max-width:1000px;margin-top:6px}
.pov h2{font-family:Oswald,sans-serif;letter-spacing:.05em;margin:0}
.pov .lbl{font-size:12.5px;color:var(--muted)}
.pov .stg{display:flex;gap:6px;overflow-x:auto;margin:10px 0 4px;padding-bottom:4px}
.pov .stg button{flex:none}
.pov .grp{margin-top:14px}
.pov .grp>h4{display:flex;align-items:center;gap:8px;margin:0 0 6px;font-size:12px;letter-spacing:.12em;color:var(--muted)}
.pov .grp>h4 i{width:10px;height:10px;border-radius:50%;background:var(--c)}
.poc{display:block;width:100%;text-align:left;font:inherit;color:inherit;background:var(--panel,#1d2025);border:1px solid var(--line);border-left:4px solid var(--c);border-radius:12px;padding:10px 12px;margin-bottom:8px;cursor:pointer}
.poc b{font-size:15px}.poc .m{font-size:12.5px;color:var(--muted);margin-top:3px}
.pod .psec{margin-top:16px}
.pod .psec>h3{font-family:Oswald,sans-serif;letter-spacing:.08em;font-size:14px;margin:0 0 8px;display:flex;align-items:center;gap:8px}
.pod .steps{display:flex;gap:5px;flex-wrap:wrap}
.pod .steps button{border-radius:999px}
.pod .steps button.on{background:var(--c);border-color:var(--c);color:#fff}
.pod .steps button.past{opacity:.55}
.pod .it{display:grid;grid-template-columns:52px 1fr auto;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)}
.pod .it .q{font-weight:700;text-align:right}
.pod .qc{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-bottom:8px}
.pod .qc.pick{border-color:#3ad06b;box-shadow:0 0 0 1px #3ad06b inset}
.pod .qc .m{font-size:12.5px;color:var(--muted);margin-top:2px}
.pod .qc details{margin-top:6px;font-size:13px}
.pod .qc table{width:100%;border-collapse:collapse;margin-top:4px}
.pod .qc td{padding:3px 4px;border-bottom:1px solid var(--line);vertical-align:top}
.pod .cmpw{overflow-x:auto;border:1px solid var(--line);border-radius:12px}
.pod table.cmp{border-collapse:collapse;width:100%;font-size:13px;min-width:520px}
.pod .cmp th,.pod .cmp td{padding:7px 8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
.pod .cmp th:first-child,.pod .cmp td:first-child{text-align:left;white-space:normal;min-width:160px}
.pod .cmp td.low{background:rgba(58,208,107,.16);color:#3ad06b;font-weight:700}
.pod .cmp td.na{color:var(--muted);font-style:italic}
.pod .cmp td small{display:block;font-weight:400;color:var(--muted)}
.pod .cmp tfoot td{font-weight:700}
.pod .sum{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}
.pod .sum div{border:1px solid var(--line);border-radius:10px;padding:6px 10px;font-size:12.5px}
.pod .sum b{display:block;font-size:15px}
.pod .lg{font-size:12px;color:var(--muted);margin:2px 0}
.pom .ml{display:block;width:100%;text-align:left;font:inherit;color:inherit;background:none;border:1px solid var(--line);border-radius:10px;padding:8px 10px;margin-bottom:6px;cursor:pointer}
.pom .ml .m{font-size:12px;color:var(--muted)}
.pom .ml.used{opacity:.5}
body.girly .poc,body.girly .pod .qc{background:#fffafd}
`;
document.head.appendChild(css);

const items=o=>Array.isArray(o.items)?o.items:[];
const quotes=o=>Array.isArray(o.quotes)?o.quotes:[];
const itemTxt=it=>[it.qty!=null&&it.qty!==""?it.qty+(it.unit?" "+it.unit:"")+" ×":"",it.desc].filter(Boolean).join(" ");
// "10 x 1/2-13 bolt", "1/2-13 bolt x 10", "24' 2x2x1/8 HSS" -> {qty, desc}
function parseLine(s){ if(s&&typeof s==="object") return s.desc?{qty:s.qty??null,unit:s.unit||null,desc:String(s.desc)}:null;
  s=String(s||"").trim(); if(!s) return null; let m=s.match(/^(\d+(?:\.\d+)?)\s*(?:pcs?|ea|qty|@|-)\s+(.+)$/i); if(m) return {qty:+m[1],desc:m[2].trim()};
  m=s.match(/^(\d+)\s*(?:x|×)\s+(\D.*)$/i); if(m&&!/\s(x|×)\s/i.test(m[2])) return {qty:+m[1],desc:m[2].trim()};   // "10 x bolt" - but "4 x 4 x .125 HSS" is a size
  m=s.match(/^(.+?)\s*\(?\s*qty:?\s*(\d+(?:\.\d+)?)\s*(?:pcs?|ea)?\s*\)?$/i); if(m) return {qty:+m[2],desc:m[1].trim()};
  m=s.match(/^(.+?)\s+(?:×|x)\s*(\d+)\s*(?:pcs?|ea)$/i); if(m) return {qty:+m[2],desc:m[1].trim()}; return {qty:null,desc:s}; }
const cheapest=o=>{ const t=quotes(o).map(q=>+q.total).filter(n=>n>0); return t.length?Math.min(...t):null; };

// the phone app scrolls an inner container, not the window - jump whatever is scrolled back to the top of the board
const toTop=()=>{ const B=$("#board"); try{ window.scrollTo(0,0); let e=B; while(e){ if(e.scrollTop) e.scrollTop=0; e=e.parentElement; } B.scrollIntoView({block:"start"}); }catch(x){} };
/* ================= list ================= */
function renderList(B){
  const act=PO.filter(o=>!["received","cancelled"].includes(o.status));
  const tabs=[["active","Open",act.length],...ST.map(([k,t])=>[k,t,PO.filter(o=>o.status===k).length])];
  const list=tab==="active"?act:PO.filter(o=>o.status===tab);
  const box=BOX?`<div class="lbl" style="margin-top:6px">${BOX.box==="robin"?`📧 Reading quotes from ${E(BOX.email||"Robin's email")}`:`📧 Robin's email isn't connected yet - for now it reads the quote emails ${role()==="parts"?"you forward":"Robin forwards"} to Kyle. <button class="btn sm" type="button" id="poCon" style="margin-left:4px">Connect Robin's email</button>`}</div>`:"";
  B.innerHTML=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h2>${role()==="parts"?"My orders":"Robin's orders"}</h2><span style="flex:1"></span><button class="btn primary" type="button" id="poNew">+ New order</button></div>
    <div class="lbl" style="margin-top:4px">Ask for quotes, compare them, order, then follow it until it's counted in.</div>${box}
    <div class="stg">${tabs.map(([k,t,n])=>`<button class="btn sm ${tab===k?"primary":""}" type="button" data-pot="${k}">${t}${n?` <span style="opacity:.7">${n}</span>`:""}</button>`).join("")}</div>
    ${tab==="active"?ST.filter(([k])=>k!=="received").map(([k,t,c])=>{ const L=act.filter(o=>o.status===k); return L.length?`<div class="grp" style="--c:${c}"><h4><i></i>${t.toUpperCase()} · ${L.length}</h4>${L.map(card).join("")}</div>`:""; }).join("")
      :list.map(card).join("")}
    ${!list.length?`<div class="empty" style="text-align:left;margin-top:12px">${loaded?(tab==="active"?"No open orders. Tap + New order to start one - or read a quote from email straight into a new order.":"Nothing here."):"Loading…"}</div>`:""}`;
  B.querySelector("#poNew").onclick=newOrder;
  B.querySelectorAll("[data-pot]").forEach(b=>b.onclick=()=>{ tab=b.dataset.pot; render(); });
  B.querySelectorAll("[data-po]").forEach(b=>b.onclick=()=>{ poId=b.dataset.po; render(); toTop(); });
  const cn=B.querySelector("#poCon"); if(cn) cn.onclick=connect;
}
function card(o){
  const s=SL[o.status]||{t:o.status,c:"#9aa1aa"}; const Q=quotes(o), lo=cheapest(o);
  const bits=[o.job?"Job "+o.job:"",`${items(o).length} item${items(o).length===1?"":"s"}`,
    Q.length?`${Q.length} quote${Q.length>1?"s":""}${lo&&!o.vendor?" · lowest "+$$(lo):""}`:(o.asked||[]).length?"asked "+o.asked.join(", "):"no quotes yet",
    o.vendor?"from "+o.vendor:"",o.po?(/^PO-/i.test(o.po)?o.po:"PO "+o.po):"",o.eta&&!["delivered","received"].includes(o.status)?"ETA "+o.eta:""].filter(Boolean);
  return `<button class="poc" type="button" data-po="${o.id}" style="--c:${s.c}"><b>${E(o.title)}</b>${tab!=="active"?` <span class="lbl">· ${E(s.t)}</span>`:""}
    <div class="m">${bits.map(E).join(" · ")}</div><div class="m">${E(s.t)} · updated ${ago(o.updated_at)}</div></button>`;
}

/* ================= one order ================= */
function renderOrder(B,o){
  const s=SL[o.status]||{t:o.status,c:"#9aa1aa"}; const I=items(o), Q=quotes(o);
  const si=ST.findIndex(x=>x[0]===o.status);
  B.innerHTML=`<div class="pod">
    <button class="btn sm" type="button" id="poBack">‹ All orders</button>
    <div style="display:flex;gap:8px;align-items:flex-start;margin-top:10px;flex-wrap:wrap"><div style="flex:1;min-width:200px"><h2 style="font-family:Oswald,sans-serif;letter-spacing:.04em;margin:0">${E(o.title)}</h2>
      <div class="lbl">${[o.job?"Job "+o.job:"","started "+day(o.created_at)+(o.created_by?" by "+o.created_by:"")].filter(Boolean).map(E).join(" · ")}</div></div>
      <button class="btn sm" type="button" id="poEd">✎ Edit</button></div>
    <div class="psec"><div class="steps">${ST.map(([k,t,c],i)=>`<button class="btn sm ${k===o.status?"on":i<si?"past":""}" type="button" data-pst="${k}" style="--c:${c}">${t}</button>`).join("")}</div>
      ${nextHint(o)}</div>
    <div class="psec"><h3>ITEMS <span class="lbl" style="font-family:inherit;letter-spacing:0">${I.length}</span><span style="flex:1"></span><button class="btn sm" type="button" id="poAddI">+ Items</button></h3>
      ${I.map((it,i)=>`<div class="it"><div class="q">${it.qty!=null&&it.qty!==""?E(it.qty):"-"}</div><div>${E(it.desc)}${it.unit?` <span class="lbl">${E(it.unit)}</span>`:""}${it.got!=null?` <span class="lbl" style="color:${+it.got>=+(it.qty||0)?"#3ad06b":"#e5483b"}">· got ${E(it.got)}</span>`:""}</div>
        <button class="btn sm" type="button" data-pix="${i}" aria-label="Remove">×</button></div>`).join("")||`<div class="lbl">No items yet - add them, or read a quote from email and the items come from it.</div>`}</div>
    <div class="psec"><h3>QUOTES <span class="lbl" style="font-family:inherit;letter-spacing:0">${Q.length}</span><span style="flex:1"></span><button class="btn sm primary" type="button" id="poRead">📧 Read a quote from email</button></h3>
      ${Q.length>1||(Q.length&&I.length)?compareTable(o):""}
      ${Q.map((q,i)=>quoteCard(o,q,i)).join("")||`<div class="lbl">No quotes yet.${(o.asked||[]).length?" Asked: "+E(o.asked.join(", "))+".":""}</div>`}</div>
    <div class="psec"><h3>ORDER</h3>
      <div class="sum"><div>Vendor<b>${E(o.vendor||"-")}</b></div><div>PO / order #<b>${E(o.po||"-")}</b></div><div>ETA<b>${E(o.eta||"-")}</b></div></div>
      ${o.notes?`<div class="lbl" style="white-space:pre-wrap">${E(o.notes)}</div>`:""}
      <div class="row" style="gap:8px;margin-top:8px;flex-wrap:wrap"><button class="btn sm" type="button" id="poInfo">✎ Vendor, PO, ETA, notes</button>${["delivered","ready","shipped","ordered"].includes(o.status)?`<button class="btn sm primary" type="button" id="poCount">Count it in</button>`:""}</div></div>
    <div class="psec"><h3>HISTORY</h3>${(o.log||[]).slice().reverse().slice(0,12).map(l=>`<div class="lg">${day(l.at)} · ${E(l.who)}: ${E(l.t)}</div>`).join("")||`<div class="lg">-</div>`}
      <div style="margin-top:12px"><button class="btn sm" type="button" id="poDel" style="color:#e5483b">Delete order</button></div></div>
  </div>`;
  B.querySelector("#poBack").onclick=()=>{ poId=null; render(); toTop(); };
  B.querySelector("#poEd").onclick=()=>editOrder(o);
  B.querySelector("#poAddI").onclick=()=>addItems(o);
  B.querySelector("#poRead").onclick=()=>mailPicker(o);
  B.querySelector("#poInfo").onclick=()=>infoSheet(o);
  const cnt=B.querySelector("#poCount"); if(cnt) cnt.onclick=()=>countSheet(o);
  B.querySelector("#poDel").onclick=async()=>{ if(pv()){ say(PV); return; } if(!confirm(`Delete "${o.title}"? This can't be undone.`)) return;
    const r=await sb.from("gvc_porders").delete().eq("id",o.id); if(r.error){ say("Couldn't delete: "+r.error.message); return; } PO=PO.filter(x=>x.id!==o.id); poId=null; render(); };
  B.querySelectorAll("[data-pst]").forEach(b=>b.onclick=()=>setStage(o,b.dataset.pst));
  B.querySelectorAll("[data-pix]").forEach(b=>b.onclick=()=>{ const i=+b.dataset.pix; const it=I[i]; if(!confirm(`Remove "${it.desc}"?`)) return;
    const n=I.filter((_,j)=>j!==i); const q=Q.map(x=>({...x,lines:(x.lines||[]).map(l=>({...l,match:l.match===i?-1:l.match>i?l.match-1:l.match}))}));
    save(o,{items:n,quotes:q},"removed "+it.desc); });
  B.querySelectorAll("[data-pq]").forEach(b=>b.onclick=()=>pickVendor(o,Q[+b.dataset.pq]));
  B.querySelectorAll("[data-pqx]").forEach(b=>b.onclick=()=>{ const q=Q[+b.dataset.pqx]; if(!confirm(`Remove ${q.vendor}'s quote?`)) return; save(o,{quotes:Q.filter(x=>x!==q)},"removed "+q.vendor+" quote"); });
}
function nextHint(o){
  const h={rfq:"Waiting on quotes. When they come in, tap 📧 Read a quote from email.",compare:"Look over the compare table, then tap Order from … on the one you want.",
    ordered:"Ordered. Move it along when the vendor says it's shipped or ready.",shipped:"On its way. Tap Delivered when it shows up.",ready:"Ready to pick up. Tap Delivered once it's here.",
    delivered:"It's here - tap Count it in to check it against the order.",received:"Counted in. Done."}[o.status];
  return h?`<div class="lbl" style="margin-top:6px">${h}</div>`:"";
}
async function setStage(o,k){
  if(k===o.status) return;
  if(k==="received"){ countSheet(o); return; }
  const patch={status:k}; if(k==="ordered"&&!o.vendor){ infoSheet(o,k); return; }
  save(o,patch,"→ "+SL[k].t);
}

function quoteCard(o,q,i){
  const L=q.lines||[]; const pick=o.vendor&&q.vendor&&o.vendor===q.vendor;
  return `<div class="qc ${pick?"pick":""}"><div style="display:flex;gap:8px;align-items:flex-start;flex-wrap:wrap"><div style="flex:1;min-width:180px"><b>${E(q.vendor||"?")}</b>${q.quote_no?` <span class="lbl">#${E(q.quote_no)}</span>`:""}${pick?` <span class="lbl" style="color:#3ad06b">· ORDERED</span>`:""}
      <div class="m">${[q.date?day(q.date):"",q.total?$$(q.total)+" before tax":"",q.lead,q.valid?"good for "+q.valid:""].filter(Boolean).map(E).join(" · ")}</div>
      ${q.terms?`<div class="m">${E(q.terms)}</div>`:""}${q.note?`<div class="m" style="color:#f5b041">${E(q.note)}</div>`:""}</div>
      <div style="display:flex;gap:6px">${!pick?`<button class="btn sm primary" type="button" data-pq="${i}">Order from ${E(String(q.vendor||"them").split(/\s/)[0])}</button>`:""}<button class="btn sm" type="button" data-pqx="${i}" aria-label="Remove quote">×</button></div></div>
    <details><summary>${L.length} line${L.length===1?"":"s"}${q.src?` · from email "${E(q.src.subject||"")}" ${q.src.at?day(q.src.at):""}`:""}</summary>
      <table>${L.map(l=>`<tr><td>${E(l.item)}${l.note?`<div class="lbl">${E(l.note)}</div>`:""}</td><td style="text-align:right">${l.qty!=null?E(l.qty)+(l.unit?" "+E(l.unit):""):""}</td><td style="text-align:right">${l.unit_price?$$(l.unit_price)+" / "+E(l.unit||"ea"):""}</td><td style="text-align:right;font-weight:700">${$$(l.line_total)}</td></tr>`).join("")}</table></details></div>`;
}
// items x vendors: each vendor's price for each of our items (lines matched by the reader), cheapest green
function compareTable(o){
  const I=items(o), Q=quotes(o); if(!Q.length) return "";
  const cell=(q,i)=>{ const L=(q.lines||[]).filter(l=>l.match===i); if(!L.length) return null; const t=L.reduce((a,l)=>a+(+l.line_total||0),0);
    return {t:t||null,u:L.length===1&&L[0].unit_price?L[0].unit_price:null,uu:L.length===1?(L[0].unit||"ea"):"ea",note:L.map(l=>l.note).filter(Boolean).join("; ")}; };
  const rows=I.map((it,i)=>{ const c=Q.map(q=>cell(q,i)); const ps=c.map(x=>x&&x.t).filter(n=>n>0); return {it,c,lo:ps.length>1?Math.min(...ps):null,hi:ps.length>1?Math.max(...ps):null}; });
  const all=rows.filter(r=>r.c.every(x=>x&&x.t>0)); const tot=Q.map((q,qi)=>all.reduce((a,r)=>a+r.c[qi].t,0));
  const cnt=Q.map((q,qi)=>rows.filter(r=>r.c[qi]&&r.c[qi].t>0).length);
  const extra=Q.map(q=>(q.lines||[]).filter(l=>l.match==null||l.match<0));
  const mix=rows.reduce((a,r)=>{ const ps=r.c.map(x=>x&&x.t).filter(n=>n>0); return a+(ps.length?Math.min(...ps):0); },0);
  const loT=all.length&&Q.length>1?Math.min(...tot):null;
  const sums=Q.length>1&&I.length?`<div class="sum">${Q.map((q,qi)=>`<div style="${loT!=null&&tot[qi]===loT?"border-color:#3ad06b":""}">${E(q.vendor)}<b>${all.length?$$(tot[qi]):"-"}</b><span class="lbl">${cnt[qi]} of ${I.length} items priced</span></div>`).join("")}
      <div>Cheapest mix<b>${$$(mix)}</b><span class="lbl">each item from whoever is lowest</span></div></div>
      <div class="lbl">${all.length?`Totals above are on the ${all.length} item${all.length>1?"s":""} every vendor priced, so they compare fairly.`:"No item was priced by every vendor yet - compare row by row."}</div>`:"";
  if(!I.length) return "";
  return `${sums}<div class="cmpw" style="margin:8px 0 10px"><table class="cmp"><thead><tr><th>Item</th>${Q.map(q=>`<th>${E(q.vendor)}</th>`).join("")}</tr></thead><tbody>
    ${rows.map(r=>`<tr><td>${E(itemTxt(r.it))}${r.lo&&r.hi>r.lo?`<small>${$$(r.hi-r.lo)} spread (${Math.round((r.hi/r.lo-1)*100)}%)</small>`:""}</td>${r.c.map(x=>!x?`<td class="na">not quoted</td>`:!(x.t>0)?`<td class="na">no price${x.note?`<small>${E(x.note)}</small>`:""}</td>`
      :`<td class="${r.lo!=null&&x.t===r.lo?"low":""}">${$$(x.t)}${x.u&&Math.abs(x.u-x.t)>0.005?`<small>${$$(x.u)} / ${E(x.uu)}</small>`:""}${x.note?`<small>${E(x.note)}</small>`:""}</td>`).join("")}</tr>`).join("")}
    ${extra.some(x=>x.length)?`<tr><td>Other lines (freight, extras, not on our list)</td>${extra.map(x=>`<td>${x.length?$$(x.reduce((a,l)=>a+(+l.line_total||0),0))+`<small>${x.length} line${x.length>1?"s":""}</small>`:""}</td>`).join("")}</tr>`:""}
    </tbody><tfoot><tr><td>Quote total (before tax)</td>${Q.map(q=>`<td>${$$(q.total)}</td>`).join("")}</tr></tfoot></table></div>`;
}

/* ================= sheets ================= */
function sheetUI(html,onReady,cls=""){
  const ov=document.createElement("div"); ov.className="shov"; ov.innerHTML=`<div class="shsheet ${cls}" role="dialog" aria-modal="true" style="max-height:88vh;overflow:auto">${html}</div>`;
  document.body.appendChild(ov); requestAnimationFrame(()=>ov.classList.add("on"));
  const close=()=>{ ov.classList.remove("on"); setTimeout(()=>ov.remove(),260); };
  ov.onclick=e=>{ if(e.target===ov) close(); };
  onReady(ov.querySelector(".shsheet"),close); return close;
}
const jobNames=()=>(typeof jobs!=="undefined"?jobs:[]).filter(j=>j.stage!=="done"&&!j.archived).map(j=>j.name);
function newOrder(pre={}){
  if(pv()){ say(PV); return; }
  sheetUI(`<h3>NEW ORDER</h3>
    <label>What's it for<input id="noT" value="${E(pre.title||"")}" placeholder="e.g. Steel for 1086 / 1087, Grade 8 bolt restock"></label>
    <label>Job (optional)<input id="noJ" list="noJL" placeholder="e.g. 1086WT"><datalist id="noJL">${jobNames().map(n=>`<option value="${E(n)}">`).join("")}</datalist></label>
    <label>Items - one per line (optional - they can come from the first quote)<textarea id="noI" rows="5" placeholder="10 pcs 1/2-13 x 1-1/2 Gr 8 bolt&#10;2x2x1/8 HSS 24' (qty 2)"></textarea></label>
    <label>Who you asked for quotes (optional)<input id="noA" placeholder="e.g. Fastenal, Gregg's, RPSI"></label>
    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" type="button" id="noX">Cancel</button><button class="btn primary" type="button" id="noGo" style="min-height:44px">Create</button></div>`,(el,close)=>{
    el.querySelector("#noX").onclick=close;
    el.querySelector("#noGo").onclick=async()=>{ const t=el.querySelector("#noT").value.trim(); if(!t){ el.querySelector("#noT").focus(); return; }
      const it=el.querySelector("#noI").value.split("\n").map(parseLine).filter(Boolean);
      const asked=el.querySelector("#noA").value.split(/[,;]/).map(x=>x.trim()).filter(Boolean);
      const r=await sb.from("gvc_porders").insert({title:t,job:el.querySelector("#noJ").value.trim()||null,items:it,asked,created_by:me(),log:[{at:new Date().toISOString(),who:me(),t:"started"+(asked.length?", asked "+asked.join(", "):"")}]}).select().single();
      if(r.error){ say("Couldn't save: "+r.error.message); return; } close(); PO.unshift(r.data); poId=r.data.id; if(cur!=="porders") shellGo("porders"); else render(); };
  });
}
function editOrder(o){
  sheetUI(`<h3>EDIT ORDER</h3><label>What's it for<input id="eoT" value="${E(o.title)}"></label>
    <label>Job (optional)<input id="eoJ" list="eoJL" value="${E(o.job||"")}"><datalist id="eoJL">${jobNames().map(n=>`<option value="${E(n)}">`).join("")}</datalist></label>
    <label>Who you asked for quotes<input id="eoA" value="${E((o.asked||[]).join(", "))}"></label>
    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" type="button" id="eoX">Cancel</button><button class="btn primary" type="button" id="eoGo">Save</button></div>`,(el,close)=>{
    el.querySelector("#eoX").onclick=close;
    el.querySelector("#eoGo").onclick=async()=>{ const t=el.querySelector("#eoT").value.trim()||o.title;
      if(await save(o,{title:t,job:el.querySelector("#eoJ").value.trim()||null,asked:el.querySelector("#eoA").value.split(/[,;]/).map(x=>x.trim()).filter(Boolean)},"edited")) close(); };
  });
}
function addItems(o){
  sheetUI(`<h3>ADD ITEMS</h3><label>One per line<textarea id="aiI" rows="6" placeholder="10 pcs 1/2-13 x 1-1/2 Gr 8 bolt"></textarea><div class="lbl">Quantity first with pcs (10 pcs …) or at the end (… qty 10).</div></label>
    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" type="button" id="aiX">Cancel</button><button class="btn primary" type="button" id="aiGo">Add</button></div>`,(el,close)=>{
    el.querySelector("#aiX").onclick=close;
    el.querySelector("#aiGo").onclick=async()=>{ const n=el.querySelector("#aiI").value.split("\n").map(parseLine).filter(Boolean); if(!n.length){ close(); return; }
      if(await save(o,{items:[...items(o),...n]},`added ${n.length} item${n.length>1?"s":""}`)) close(); };
  });
}
function infoSheet(o,toStage,def={}){
  if(pv()){ say(PV); return; }
  const vs=[...new Set([...quotes(o).map(q=>q.vendor),...(o.asked||[])].filter(Boolean))];
  const V=k=>def[k]!=null?def[k]:(o[k]||"");
  sheetUI(`<h3>${toStage==="ordered"?"ORDERED":"ORDER DETAILS"}</h3>
    <label>Vendor<input id="oiV" list="oiVL" value="${E(V("vendor"))}" placeholder="who it's ordered from"><datalist id="oiVL">${vs.map(v=>`<option value="${E(v)}">`).join("")}</datalist></label>
    <label>PO / order # (optional)<input id="oiP" value="${E(V("po"))}"></label>
    <label>ETA (optional)<input id="oiE" value="${E(V("eta"))}" placeholder="e.g. Tuesday, back-ordered 2 weeks, pick up Fri pm"></label>
    <label>Notes<textarea id="oiN" rows="3">${E(V("notes"))}</textarea></label>
    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" type="button" id="oiX">Cancel</button><button class="btn primary" type="button" id="oiGo" style="min-height:44px">Save</button></div>`,(el,close)=>{
    el.querySelector("#oiX").onclick=close;
    el.querySelector("#oiGo").onclick=async()=>{ const v=el.querySelector("#oiV").value.trim(); const patch={vendor:v||null,po:el.querySelector("#oiP").value.trim()||null,eta:el.querySelector("#oiE").value.trim()||null,notes:el.querySelector("#oiN").value.trim()||null};
      if(toStage) patch.status=toStage;
      if(await save(o,patch,def.log||(toStage?`→ ${SL[toStage].t}${v?" from "+v:""}`:"updated order details"))) close(); };
  });
}
function pickVendor(o,q){ infoSheet(o,"ordered",{vendor:q.vendor,po:o.po||q.quote_no||"",log:`ordered from ${q.vendor}${q.quote_no?" (quote "+q.quote_no+")":""}`}); }
function countSheet(o){
  if(pv()){ say(PV); return; }
  const I=items(o);
  sheetUI(`<h3>COUNT IT IN</h3><div class="tnote" style="margin:-4px 0 8px">${E(o.title)}${o.vendor?" · "+E(o.vendor):""} - put in what actually came. Leave it as is if it all came.</div>
    ${I.map((it,i)=>`<div class="it" style="display:grid;grid-template-columns:1fr 80px;gap:8px;align-items:center;padding:6px 0;border-bottom:1px solid var(--line)"><div>${E(it.desc)}${it.qty!=null?` <span class="lbl">ordered ${E(it.qty)}</span>`:""}</div>
      <input type="number" inputmode="decimal" min="0" data-cg="${i}" value="${E(it.got!=null?it.got:(it.qty!=null?it.qty:""))}" style="font-size:16px;text-align:right"></div>`).join("")||`<div class="lbl">No item list on this order - it'll just be marked received.</div>`}
    <label style="margin-top:8px">Note (back-ordered, damaged, wrong part…)<input id="cgN" placeholder="optional"></label>
    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" type="button" id="cgX">Cancel</button><button class="btn primary" type="button" id="cgGo" style="min-height:44px">Received ✓</button></div>`,(el,close)=>{
    el.querySelector("#cgX").onclick=close;
    el.querySelector("#cgGo").onclick=async()=>{ const n=I.map((it,i)=>{ const v=el.querySelector(`[data-cg="${i}"]`).value; return {...it,got:v===""?null:+v}; });
      const short=n.filter(it=>it.qty!=null&&it.got!=null&&+it.got<+it.qty); const note=el.querySelector("#cgN").value.trim();
      const notes=[o.notes,note?`${day(new Date().toISOString())}: ${note}`:""].filter(Boolean).join("\n")||null;
      if(await save(o,{items:n,status:"received",notes},`received${short.length?` - short ${short.length} item${short.length>1?"s":""}: `+short.map(s=>`${s.desc} (${s.got}/${s.qty})`).join(", "):", all there"}${note?" · "+note:""}`)) close(); };
  });
}

/* ---------- read a quote from email ---------- */
function mailPicker(o){
  if(pv()){ say(PV); return; }
  const used=new Set(PO.flatMap(x=>quotes(x).map(q=>q.src&&q.src.msg)).filter(Boolean));
  let q="", all=false;
  sheetUI(`<div class="pom"><h3>READ A QUOTE FROM EMAIL</h3>
    <div class="tnote" style="margin:-4px 0 8px">Tap the supplier's quote email. Claude reads the prices (from the email and any PDF) and lines them up with this order's items.</div>
    <div class="row" style="gap:6px"><input id="pmQ" type="search" placeholder="Search: Fastenal, steel, quote #…" style="flex:1"><button class="btn sm" type="button" id="pmGo">Search</button></div>
    <label style="display:flex;gap:6px;align-items:center;margin-top:6px;font-size:13px"><input type="checkbox" id="pmAll" style="width:auto"> Show all emails, not just ones that look like quotes</label>
    <div id="pmL" style="margin-top:10px"><div class="lbl">Loading…</div></div></div>`,(el,close)=>{
    const L=el.querySelector("#pmL");
    const list=async()=>{ L.innerHTML=`<div class="lbl">Loading…</div>`;
      try{ const r=await call({action:"rfq_mail",q,all}); BOX={box:r.box,email:r.email};
        L.innerHTML=(r.msgs||[]).map(m=>`<button class="ml ${used.has(m.id)?"used":""}" type="button" data-pm="${E(m.id)}"><b>${E(m.subject)}</b>${m.att?" 📎":""}<div class="m">${E(m.from)} · ${day(m.at)}${used.has(m.id)?" · already read":""}</div><div class="m">${E(m.preview)}</div></button>`).join("")
          ||`<div class="lbl">No ${all?"":"quote-looking "}emails found${q?` for "${E(q)}"`:" in the last 60 days"}.${r.box==="main"?" (Robin's email isn't connected yet, so only emails she forwarded to Kyle show here.)":""}</div>`;
        L.querySelectorAll("[data-pm]").forEach(b=>b.onclick=()=>read(b.dataset.pm,b));
      }catch(e){ L.innerHTML=`<div class="lbl" style="color:#e5483b">${E(e.message)}</div>`; } };
    const read=async(id,b)=>{ if(pv()){ say(PV); return; }
      L.querySelectorAll("button").forEach(x=>x.disabled=true); b.insertAdjacentHTML("beforeend",`<div class="m" style="color:#22c3e6">Reading the quote… (about 20-40 seconds)</div>`);
      try{ const x=await call({action:"rfq_read",msg:id,items:items(o).map(itemTxt)}); close(); await addQuote(o,x); }
      catch(e){ L.querySelectorAll("button").forEach(x=>x.disabled=false); say("Couldn't read it: "+e.message); } };
    el.querySelector("#pmGo").onclick=()=>{ q=el.querySelector("#pmQ").value.trim(); list(); };
    el.querySelector("#pmQ").onkeydown=e=>{ if(e.key==="Enter"){ q=e.target.value.trim(); list(); } };
    el.querySelector("#pmAll").onchange=e=>{ all=e.target.checked; list(); };
    list();
  });
}
async function addQuote(o,x){
  let I=items(o), lines=(x.lines||[]).map(l=>({item:l.item,qty:l.qty??null,unit:l.unit||null,unit_price:l.unit_price??null,line_total:l.line_total??null,note:l.note||null,match:Number.isInteger(l.match)?l.match:-1}));
  let seeded="";
  if(!I.length){   // first quote on an order with no item list: use what was asked for (if the request is in the thread), else the quote's own lines
    if((x.requested||[]).length){ I=x.requested.map(parseLine).filter(Boolean); seeded=`items from the original request (${I.length})`; }
    else { I=lines.filter(l=>!/freight|shipping|delivery|cut(ting)? charge|fuel|surcharge|environmental/i.test(l.item)).map(l=>({qty:l.qty,unit:l.unit,desc:l.item}));
      let k=0; lines=lines.map(l=>/freight|shipping|delivery|cut(ting)? charge|fuel|surcharge|environmental/i.test(l.item)?{...l,match:-1}:{...l,match:k++}); seeded=`items from ${x.vendor}'s quote (${I.length})`; }
  }
  lines=lines.map(l=>({...l,match:l.match>=0&&l.match<I.length?l.match:-1}));
  const q={vendor:x.vendor||"?",contact:x.contact||null,quote_no:x.quote_no||null,date:x.date||null,total:x.total??null,valid:x.valid||null,lead:x.lead||null,terms:x.terms||null,note:x.note||null,lines,src:x.src||null,read_at:new Date().toISOString()};
  const Q=quotes(o).filter(z=>!(z.src&&q.src&&z.src.msg===q.src.msg));   // reading the same email again replaces it
  const patch={items:I,quotes:[...Q,q]}; if(o.status==="rfq") patch.status="compare";
  const asked=new Set(o.asked||[]); if(q.vendor&&![...asked].some(a=>q.vendor.toLowerCase().includes(a.toLowerCase().split(/\W/)[0]))) patch.asked=[...asked,q.vendor];
  if(await save(o,patch,`read ${q.vendor} quote${q.quote_no?" #"+q.quote_no:""}${q.total?" - "+$$(q.total):""}${seeded?"; "+seeded:""}`)){
    const m=lines.filter(l=>l.match>=0).length; say(`${q.vendor}: ${lines.length} line${lines.length===1?"":"s"}${I.length?`, ${m} matched to your items`:""}`); }
}
async function connect(){
  if(pv()){ say(PV); return; }
  try{ const r=await call({action:"rfq_connect"}); if(!r.url) throw new Error("no sign-in link");
    if(confirm("This opens Microsoft sign-in. Robin signs in with robin.gvc@hotmail.com and allows read access. The app only reads quotes - it never sends anything. Go?")) window.open(r.url,"_blank"); }
  catch(e){ say("Couldn't start: "+e.message); }
}

/* ================= view + hooks ================= */
function renderPorders(){
  const B=$("#board"); B.className="pov"; B.style.gridTemplateColumns="";
  if(!BOX&&!pv()){ BOX={box:"?"}; call({action:"rfq_box"}).then(r=>{ BOX=r; if(cur==="porders"&&!poId) render(); }).catch(()=>{ BOX=null; }); }
  const o=poId&&PO.find(x=>x.id===poId);
  if(o) renderOrder(B,o); else { poId=null; renderList(B); }
}
window.extraViews=Object.assign(window.extraViews||{},{porders:renderPorders});
window.pordersGo=k=>{ tab=k||"active"; poId=null; shellGo("porders"); };
const _back=window.gvcBack;
window.gvcBack=()=>{ try{ const sh=[...document.querySelectorAll(".shov.on")].length; if(!sh&&typeof cur!=="undefined"&&cur==="porders"&&poId&&!document.querySelector("#scrim.on")){ poId=null; render(); return true; } }catch(e){} return _back?_back():false; };

/* Robin's Home: her orders on top */
const _ph=window.partsHome;
window.partsHome=B=>{ _ph(B); const hm=B.querySelector(".hm"); if(!hm) return;
  const sec=document.createElement("section"); sec.setAttribute("aria-label","My orders");
  const n=k=>PO.filter(o=>o.status===k).length;
  sec.innerHTML=`<h4><span>MY ORDERS</span><span>${window.pordersOpen()} OPEN</span></h4>
    <div class="pnums" style="grid-template-columns:repeat(3,minmax(0,1fr))">${ST.filter(([k])=>k!=="received").map(([k,t,c])=>`<button type="button" data-pok="${k}" style="--c:${c}"><b>${n(k)}</b><span>${t.toUpperCase()}</span></button>`).join("")}</div>
    <div class="row" style="gap:8px;margin-top:8px"><button class="btn" type="button" id="poHN" style="flex:1">+ New order</button><button class="btn" type="button" id="poHA" style="flex:1">All my orders ›</button></div>`;
  hm.insertBefore(sec,hm.firstChild);
  sec.querySelectorAll("[data-pok]").forEach(b=>b.onclick=()=>window.pordersGo(b.dataset.pok));
  sec.querySelector("#poHN").onclick=()=>newOrder();
  sec.querySelector("#poHA").onclick=()=>window.pordersGo("active");
};
})();
