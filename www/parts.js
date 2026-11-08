/* ---------- Robin (parts role), supply requests, hardware inventory, staging placeholder (Kyle, 2026-11-06) ----------
   ROLES: admin = Kyle, crew = Colton..., parts = Robin (orders hardware, lights, consumables; stages parts; payroll later).
   Robin uses the shop-side layout like the crew (body.crew + body.parts) with her own Home, wheel and More menu.
   SUPPLY REQUESTS (table gvc_requests): crew "Need supplies" -> status review (waiting for Kyle) -> Kyle approves (approved =
   on Robin's order list) or says no (rejected, the person gets a message with the reason) -> Robin marks ordered (vendor, ETA)
   -> received (the person gets a message). Robin's own restocks and Kyle's go straight to "To order". Robin can see what's
   still waiting for Kyle before she orders, but can't approve it. The database enforces this (gvc_requests_guard).
   HARDWARE (table gvc_hardware): Robin's "Complete Inventory" sheet (bolts, nuts, lights, electrical, ...) synced daily by the
   GVC inventory sync scheduled task; her spreadsheet stays the master. Inventory -> Hardware. Min qty is set here.
   STAGING: placeholder until the kit lists exist (see claude/gvc-robin-plan.md). */
(()=>{
const role=()=>window.ME&&ME.role;
const isAdmin=()=>role()==="admin"||!role();
const isParts=()=>role()==="parts";
const office=()=>isAdmin()||isParts();
const me=()=>(window.ME&&ME.name)||"Kyle";
const pv=()=>!!(window.ME&&ME.preview);
const PV="Preview - nothing is saved. Exit the preview to do that for real.";
const E=s=>esc(s==null?"":String(s));
const say=m=>{ if(typeof todoToast==="function"){ todoToast(m,null); const u=document.getElementById("toastUndo"); if(u) u.style.display="none"; } };
const ago=t=>{ if(!t) return ""; const s=(Date.now()-new Date(t))/1e3; if(s<90) return "just now"; if(s<3600) return Math.round(s/60)+" min ago"; if(s<86400) return Math.round(s/3600)+"h ago";
  const d=Math.round(s/86400); return d===1?"yesterday":d<7?d+" days ago":new Date(t).toLocaleDateString([], {month:"short",day:"numeric"}); };
window.isLtd=()=>role()==="crew"||role()==="parts";

const css=document.createElement("style");
css.textContent=`
.rqv{max-width:900px;margin-top:6px}
.rqv h2{font-family:Oswald,sans-serif;letter-spacing:.05em;margin:0}
.rqv .lbl{font-size:12.5px;color:var(--muted)}
.rqv .tabs2{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}
.rqc{border:1px solid var(--line);border-left:4px solid var(--c);border-radius:12px;padding:10px 12px;margin:8px 0;background:rgba(0,0,0,.28)}
.rqc .t{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.rqc .t b{font-size:15px}
.rqc .pill{font-size:11px;padding:1px 8px;border-radius:999px;border:1px solid var(--c);color:var(--c);white-space:nowrap}
.rqc .m{font-size:12.5px;color:var(--muted);margin-top:3px}
.rqc .a{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.rqc .a button{min-height:38px}
.rqc input[type=checkbox]{width:20px;height:20px;margin:0}
.hwv{margin-top:6px}
.hwv .top{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.hwv input[type=search]{flex:1;min-width:200px;font:inherit;font-size:14px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:8px 10px}
.hwv select{font:inherit;font-size:13px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:8px;padding:7px 8px}
.hwv .chips{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}
.hwr{display:grid;grid-template-columns:1fr auto;gap:4px 10px;border:1px solid var(--line);border-left:4px solid var(--c,#4a4f56);border-radius:10px;padding:8px 10px;margin:5px 0;background:rgba(0,0,0,.25);cursor:pointer}
.hwr.low{--c:#e5483b}.hwr.out{opacity:.6}
.hwr .d{font-size:14px;font-weight:600;min-width:0}.hwr .s{font-size:12px;color:var(--muted);grid-column:1/-1}
.hwr .q{text-align:right;font:600 17px Oswald,sans-serif;white-space:nowrap}.hwr .q small{display:block;font:500 11px Inter,sans-serif;color:var(--muted)}
.hwr .tg{font-size:10.5px;letter-spacing:.06em;border-radius:6px;padding:1px 6px;margin-left:6px;background:rgba(229,72,59,.18);color:#ff9b91;border:1px solid rgba(229,72,59,.5);vertical-align:2px}
.pcard{display:flex;gap:12px;align-items:center;width:100%;text-align:left;background:#1d2025;border:1px solid var(--line);border-left:4px solid var(--c);border-radius:14px;padding:12px 14px;color:inherit;cursor:pointer;margin-bottom:8px;font:inherit}
.pcard b{display:block;font:600 22px Oswald,sans-serif}.pcard span{display:block;font-size:12px;letter-spacing:.06em;color:var(--muted)}.pcard div{flex:1}
.pnums{display:flex;gap:8px;margin-bottom:8px}.pnums button{flex:1;background:#1d2025;border:1px solid var(--line);border-top:3px solid var(--c);border-radius:12px;padding:10px 6px;color:inherit;cursor:pointer;font:inherit;text-align:center}
.pnums b{display:block;font:600 26px Oswald,sans-serif}.pnums span{font-size:11px;letter-spacing:.08em;color:var(--muted)}
.soon{border:1px dashed #3a3e45;border-radius:14px;padding:12px 14px;margin-bottom:8px;color:var(--muted)}
.soon b{display:block;color:#cfd3d8;font-size:14.5px}.soon i{font-style:normal;font-size:10.5px;letter-spacing:.1em;border:1px solid #4a4f56;border-radius:6px;padding:1px 6px;margin-left:6px;color:#9aa1aa}
.stg{max-width:760px;margin-top:10px}
.stg .box{border:1px dashed #4a4f56;border-radius:16px;padding:18px;background:rgba(0,0,0,.25)}
.stg ol{margin:8px 0 0 18px;padding:0;line-height:1.6}
`;
document.head.appendChild(css);

/* ================= supply requests ================= */
const ST={review:["Waiting for Kyle","#9b7bff"],approved:["To order","#22c3e6"],ordered:["Ordered","#ff8a2a"],received:["In the stock room","#3ad06b"],rejected:["Not approved","#6c727a"],cancelled:["Cancelled","#6c727a"]};
let REQ=[], rqLoaded=false, rqTab=null, rqSel=new Set();
async function loadReq(){
  const r=await sb.from("gvc_requests").select("*").order("created_at",{ascending:false}).limit(400);
  if(!r.error){ REQ=r.data||[]; rqLoaded=true; } else if(/relation|does not exist/i.test(r.error.message)) rqLoaded=true;
  if(["requests","home","todo"].includes(cur)) render();
}
let rqStarted=false;
setInterval(()=>{ if(!rqStarted&&typeof db!=="undefined"&&db&&window.ME){ rqStarted=true; loadReq();
  try{ sb.channel("gvc_requests").on("postgres_changes",{event:"*",schema:"public",table:"gvc_requests"},()=>loadReq()).subscribe(); }catch(e){} } },1000);
const mine=()=>REQ.filter(r=>r.who===me());
const by=s=>REQ.filter(r=>r.status===s);
window.reqList=()=>REQ; window.reqLine=r=>`${r.what}${r.qty?" × "+r.qty:""}`; window.reqGo=t=>{ rqTab=t; shellGo("requests"); };
window.reqCount=()=>isAdmin()?by("review").length:isParts()?by("approved").length:0;
window.myRequests=()=>mine();

async function msg(to,text){ if(!to||to===me()) return; try{ await sb.from("gvc_messages").insert({from_name:me(),to_name:to,text}); }catch(e){} }
async function setReq(r,patch,logText){
  if(pv()){ say(PV); return false; }
  const log=[...(r.log||[]),{at:new Date().toISOString(),by:me(),text:logText||patch.status||"updated"}];
  const res=await sb.from("gvc_requests").update({...patch,log}).eq("id",r.id).select().single();
  if(res.error){ say("Couldn't save: "+res.error.message); return false; }
  Object.assign(r,res.data); render(); return true;
}
const line=r=>`${r.what}${r.qty?" × "+r.qty:""}`;

function card(r,opts={}){
  const s=ST[r.status]||ST.approved; const j=r.job_id&&jobs.find(x=>x.id===r.job_id);
  const A=[];
  if(r.status==="review"){
    if(isAdmin()) A.push(`<button class="btn sm primary" type="button" data-rqa="${r.id}">✓ Approve</button>`,`<button class="btn sm" type="button" data-rqr="${r.id}">Not approved</button>`);
    else if(r.who===me()) A.push(`<button class="btn sm ghost" type="button" data-rqx="${r.id}">Cancel my request</button>`);
  }
  if(office()&&r.status==="approved") A.push(`<button class="btn sm primary" type="button" data-rqo="${r.id}">Ordered…</button>`,`<button class="btn sm" type="button" data-rqh="${r.id}">Had it in stock</button>`);
  if(office()&&r.status==="ordered") A.push(`<button class="btn sm primary" type="button" data-rqg="${r.id}">✓ It's here</button>`,`<button class="btn sm" type="button" data-rqo="${r.id}">Change vendor / ETA</button>`);
  if(isAdmin()&&["rejected","cancelled","received"].includes(r.status)) A.push(`<button class="btn sm ghost" type="button" data-rqre="${r.id}">Reopen</button>`);
  return `<div class="rqc" style="--c:${s[1]}"><div class="t">${opts.sel&&r.status==="review"&&isAdmin()?`<input type="checkbox" data-rqs="${r.id}" ${rqSel.has(r.id)?"checked":""} aria-label="Select">`:""}
    <b>${r.how==="out"?"OUT: ":""}${E(line(r))}</b><span class="pill">${s[0]}</span></div>
    <div class="m">${E(r.who||"")} · ${ago(r.created_at)}${j?" · "+E(j.name):""}${r.how==="low"?" · running low":""}</div>
    ${r.note?`<div class="m" style="color:var(--text)">${E(r.note)}</div>`:""}
    ${r.status==="rejected"&&r.reason?`<div class="m">Kyle: ${E(r.reason)}</div>`:""}
    ${r.reviewed_by&&r.status!=="review"&&r.status!=="rejected"&&r.who!==r.reviewed_by?`<div class="m">Approved by ${E(r.reviewed_by)} ${ago(r.reviewed_at)}</div>`:""}
    ${r.vendor||r.eta?`<div class="m">${r.vendor?"From "+E(r.vendor):""}${r.eta?" · ETA "+E(r.eta):""}${r.ordered_at?" · ordered "+ago(r.ordered_at):""}</div>`:""}
    ${r.status==="received"&&r.received_at?`<div class="m">In the stock room ${ago(r.received_at)}</div>`:""}
    ${A.length?`<div class="a">${A.join("")}</div>`:""}</div>`;
}

function renderRequests(){
  const B=$("#board"); B.className="rqv"; B.style.gridTemplateColumns="";
  if(!window.isLtd()||isParts()){
    const tabs=[["review",`For Kyle`,by("review").length],["approved","To order",by("approved").length],["ordered","Ordered",by("ordered").length],["done","Done",0]];
    if(!rqTab) rqTab=isAdmin()&&by("review").length?"review":"approved";
    const list=rqTab==="done"?REQ.filter(r=>["received","rejected","cancelled"].includes(r.status)&&Date.now()-new Date(r.updated_at||r.created_at)<45*864e5):by(rqTab);
    const note={review:isAdmin()?"Crew requests wait here for you. Approve to put them on Robin's order list, or say no with a reason (they get a message).":"These are still waiting for Kyle - shown so you can see what might be coming before you place an order. Kyle approves them.",
      approved:"Approved and ready to order. Mark each one Ordered (vendor + ETA) when it's on an order.",ordered:"On order. Tap It's here when it lands in the stock room - the person who asked gets a message.",done:"Finished in the last 45 days."}[rqTab];
    B.innerHTML=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h2>Supply requests</h2><span style="flex:1"></span><button class="btn primary" type="button" id="rqNew">+ Add to order list</button></div>
      <div class="tabs2">${tabs.map(([k,t,n])=>`<button class="btn sm ${rqTab===k?"primary":""}" type="button" data-rqt="${k}">${t}${n?` (${n})`:""}</button>`).join("")}</div>
      <div class="lbl">${note}</div>
      ${rqTab==="review"&&isAdmin()&&list.length>1?`<div class="a" style="display:flex;gap:6px;margin-top:8px"><button class="btn sm primary" type="button" id="rqAll">✓ Approve ${rqSel.size?rqSel.size+" selected":"all "+list.length}</button><span class="lbl" style="align-self:center">Tick some to approve only those.</span></div>`:""}
      ${list.map(r=>card(r,{sel:true})).join("")||`<div class="empty" style="text-align:left;margin-top:10px">${rqLoaded?"Nothing here.":"Loading…"}</div>`}`;
  } else {
    const L=mine();
    B.innerHTML=`<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><h2>My supply requests</h2><span style="flex:1"></span><button class="btn primary" type="button" id="rqNew">+ Need supplies</button></div>
      <div class="lbl" style="margin-top:4px">What you asked for and where it's at: Kyle checks it first, then Robin orders it.</div>
      ${L.map(r=>card(r)).join("")||`<div class="empty" style="text-align:left;margin-top:10px">${rqLoaded?"You haven't asked for anything yet.":"Loading…"}</div>`}`;
  }
  wireReq(B);
}
function wireReq(B){
  const nb=B.querySelector("#rqNew"); if(nb) nb.onclick=()=>window.isLtd()&&!isParts()?window.needSupplies():newRequest();
  B.querySelectorAll("[data-rqt]").forEach(b=>b.onclick=()=>{ rqTab=b.dataset.rqt; rqSel.clear(); render(); });
  B.querySelectorAll("[data-rqs]").forEach(c=>c.onchange=()=>{ c.checked?rqSel.add(c.dataset.rqs):rqSel.delete(c.dataset.rqs); render(); });
  const f=id=>REQ.find(x=>x.id===id);
  B.querySelectorAll("[data-rqa]").forEach(b=>b.onclick=()=>approve([f(b.dataset.rqa)]));
  const all=B.querySelector("#rqAll"); if(all) all.onclick=()=>approve(rqSel.size?by("review").filter(r=>rqSel.has(r.id)):by("review"));
  B.querySelectorAll("[data-rqr]").forEach(b=>b.onclick=async()=>{ const r=f(b.dataset.rqr); if(pv()){ say(PV); return; }
    const why=prompt(`Why not? ${r.who} gets this as a message.`,""); if(why===null) return;
    if(await setReq(r,{status:"rejected",reason:why.trim()||null},"not approved"+(why.trim()?": "+why.trim():""))) msg(r.who,`About your request for ${line(r)}: not approved${why.trim()?" - "+why.trim():""}.`); });
  B.querySelectorAll("[data-rqx]").forEach(b=>b.onclick=async()=>{ const r=f(b.dataset.rqx); if(pv()){ say(PV); return; } if(!confirm(`Cancel your request for ${line(r)}?`)) return;
    const res=await sb.from("gvc_requests").delete().eq("id",r.id); if(res.error){ say("Couldn't cancel: "+res.error.message); return; } loadReq(); });
  B.querySelectorAll("[data-rqo]").forEach(b=>b.onclick=()=>orderedSheet(f(b.dataset.rqo)));
  B.querySelectorAll("[data-rqh]").forEach(b=>b.onclick=async()=>{ const r=f(b.dataset.rqh); if(await setReq(r,{status:"received",note:[r.note,"had it in stock"].filter(Boolean).join(" · ")},"had it in stock")) msg(r.who,`${line(r)} - we had it in stock. It's in the stock room.`); });
  B.querySelectorAll("[data-rqg]").forEach(b=>b.onclick=async()=>{ const r=f(b.dataset.rqg); if(await setReq(r,{status:"received"},"arrived")) msg(r.who,`${line(r)} is in the stock room.`); });
  B.querySelectorAll("[data-rqre]").forEach(b=>b.onclick=()=>{ const r=f(b.dataset.rqre); setReq(r,{status:"approved",reason:null},"reopened"); });
}
async function approve(list){
  if(pv()){ say(PV); return; } if(!list.length) return;
  let ok=0; for(const r of list){ if(await setReq(r,{status:"approved"},"approved")) ok++; }
  rqSel.clear(); say(`Approved ${ok} - on Robin's order list now.`);
}
function sheetUI(html,onReady){
  const ov=document.createElement("div"); ov.className="shov"; ov.innerHTML=`<div class="shsheet" role="dialog" aria-modal="true" style="max-height:88vh;overflow:auto">${html}</div>`;
  document.body.appendChild(ov); requestAnimationFrame(()=>ov.classList.add("on"));
  const close=()=>{ ov.classList.remove("on"); setTimeout(()=>ov.remove(),260); };
  ov.onclick=e=>{ if(e.target===ov) close(); };
  onReady(ov.querySelector(".shsheet"),close); return close;
}
const VENDORS=["Resource","Gregg's","Fastenal","CFS (Canada Fastener & Supply)","LGM Hardware","First Choice","Surepoint","Princess Auto","Amazon"];
function orderedSheet(r){
  if(pv()){ say(PV); return; }
  sheetUI(`<h3>ORDERED</h3><div class="tnote" style="margin:-4px 0 10px">${E(line(r))}</div>
    <label>From<input id="roV" list="roVL" value="${E(r.vendor||"")}" placeholder="e.g. Resource"><datalist id="roVL">${VENDORS.map(v=>`<option value="${E(v)}">`).join("")}</datalist></label>
    <label>When it should come in (optional)<input id="roE" value="${E(r.eta||"")}" placeholder="e.g. Tuesday, next week, back-ordered"></label>
    <div class="row" style="justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn" type="button" id="roX">Cancel</button><button class="btn primary" type="button" id="roGo" style="min-height:44px">Save</button></div>`,(el,close)=>{
    el.querySelector("#roX").onclick=close;
    el.querySelector("#roGo").onclick=async()=>{ const v=el.querySelector("#roV").value.trim(), e=el.querySelector("#roE").value.trim();
      if(await setReq(r,{status:"ordered",vendor:v||null,eta:e||null},`ordered${v?" from "+v:""}${e?", ETA "+e:""}`)){ close(); if(r.who&&r.who!==me()) msg(r.who,`${line(r)} is ordered${v?" from "+v:""}${e?" - should be in "+e:""}.`); } };
  });
}
/* Robin / Kyle: put something on the order list directly (no approval needed) */
async function newRequest(pre={}){
  if(pv()){ say(PV); return; }
  let cons=[]; try{ const r=await sb.from("gvc_consumables").select("id,name").order("name"); cons=r.data||[]; }catch(e){}
  const act=jobs.filter(j=>j.stage!=="done"&&!j.archived);
  sheetUI(`<h3>ADD TO ORDER LIST</h3>
    <label>What<input id="nrW" value="${E(pre.what||"")}" placeholder="e.g. 1/2-13 x 1-1/2 Gr 8 bolts, ER70S-6 .035 wire" list="nrWL"><datalist id="nrWL">${cons.map(c=>`<option value="${E(c.name)}">`).join("")}</datalist></label>
    <label>How many (optional)<input id="nrQ" value="${E(pre.qty||"")}" placeholder="e.g. 50, 2 boxes, 1 spool"></label>
    <label>For a job (optional)<select id="nrJ"><option value="">Shop stock</option>${act.map(j=>`<option value="${E(j.id)}">${E(j.name)}</option>`).join("")}</select></label>
    <label>Note (optional)<input id="nrN" value="${E(pre.note||"")}"></label>
    <div class="tnote" id="nrM" style="margin:8px 0"></div>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" type="button" id="nrX">Cancel</button><button class="btn primary" type="button" id="nrGo" style="min-height:44px">Add</button></div>`,(el,close)=>{
    el.querySelector("#nrX").onclick=close;
    el.querySelector("#nrGo").onclick=async()=>{
      const what=el.querySelector("#nrW").value.trim(); if(!what){ el.querySelector("#nrM").textContent="Say what to order."; return; }
      const c=cons.find(x=>x.name.toLowerCase()===what.toLowerCase());
      const row={who:me(),what,qty:el.querySelector("#nrQ").value.trim()||null,job_id:el.querySelector("#nrJ").value||null,note:el.querySelector("#nrN").value.trim()||null,consumable_id:c?c.id:null,hardware_key:pre.hardware_key||null,status:"approved",
        log:[{at:new Date().toISOString(),by:me(),text:"added to the order list"}]};
      const r=await sb.from("gvc_requests").insert(row); if(r.error){ el.querySelector("#nrM").textContent="Couldn't save: "+r.error.message; return; }
      close(); say(`On the order list: ${what}`); loadReq();
    };
  });
}
window.newRequest=newRequest;

/* crew "Need supplies" -> a request for Kyle to approve (was a to-do on Kyle's list) */
window.needSupplies=async function(){
  let cons=[]; try{ const r=await sb.from("gvc_consumables").select("id,name,category,unit,qty,min_qty").order("category").order("name"); cons=r.data||[]; }catch(e){}
  if(office()&&!window.isLtd()) return newRequest();
  const L=mine().filter(r=>!["received","rejected","cancelled"].includes(r.status)||Date.now()-new Date(r.updated_at||r.created_at)<3*864e5).slice(0,8);
  sheetUI(`<h3>NEED SUPPLIES</h3>
    <div class="tnote" style="margin:-4px 0 10px">Kyle checks it, then Robin orders it. You'll see where it's at here.</div>
    <label>What do we need<input id="nsWhat" placeholder="e.g. 0.035 wire, 4.5&quot; flap discs, argon"></label>
    ${cons.length?`<div class="tnote" style="margin:4px 0 6px">or tap one</div><div class="chips" id="nsChips" style="margin-bottom:10px">${cons.map(c=>`<button type="button" data-ns="${E(c.id)}">${E(c.name)}</button>`).join("")}</div>`:""}
    <div style="display:flex;gap:18px;align-items:center;margin:8px 0">${[["low","Running low"],["out","Out"]].map(([v,t],i)=>`<label style="display:flex;gap:6px;align-items:center;margin:0;width:auto"><input type="radio" name="nsHow" value="${v}" ${i===0?"checked":""} style="width:20px;height:20px;margin:0"> ${t}</label>`).join("")}</div>
    <label>How many (optional)<input id="nsQty" placeholder="e.g. 2 spools"></label>
    <label>Note (optional)<input id="nsNote" placeholder="e.g. last spool on the Miller"></label>
    <div class="tnote" id="nsMsg" style="margin:8px 0"></div>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" type="button" id="nsX">Cancel</button><button class="btn primary" type="button" id="nsGo" style="min-height:44px">Send to Kyle</button></div>
    ${L.length?`<div class="pkh" style="font:600 11.5px Oswald,sans-serif;letter-spacing:.16em;color:#ffb36b;margin:16px 2px 4px">MY REQUESTS</div>${L.map(r=>{ const s=ST[r.status]||ST.approved; return `<div class="rqc" style="--c:${s[1]};padding:8px 10px;margin:6px 0"><div class="t"><b style="font-size:14px">${E(line(r))}</b><span class="pill">${s[0]}</span></div><div class="m">${ago(r.created_at)}${r.vendor?" · from "+E(r.vendor):""}${r.eta?" · ETA "+E(r.eta):""}${r.status==="rejected"&&r.reason?" · "+E(r.reason):""}</div></div>`; }).join("")}`:""}`,(el,close)=>{
    let pick=null;
    el.querySelector("#nsX").onclick=close;
    el.querySelectorAll("[data-ns]").forEach(b=>b.onclick=()=>{ pick=cons.find(c=>c.id===b.dataset.ns); el.querySelector("#nsWhat").value=pick.name; el.querySelectorAll("[data-ns]").forEach(x=>x.classList.toggle("on",x===b)); });
    el.querySelector("#nsGo").onclick=async()=>{
      const what=el.querySelector("#nsWhat").value.trim(); if(!what){ el.querySelector("#nsMsg").textContent="Say what we need."; return; }
      if(pv()){ say(PV); close(); return; }
      const how=(el.querySelector("[name=nsHow]:checked")||{}).value||"low";
      if(!pick||pick.name!==what) pick=cons.find(c=>c.name.toLowerCase()===what.toLowerCase())||null;
      const r=await sb.from("gvc_requests").insert({who:me(),what,how,qty:el.querySelector("#nsQty").value.trim()||null,note:el.querySelector("#nsNote").value.trim()||null,consumable_id:pick?pick.id:null,status:"review",
        log:[{at:new Date().toISOString(),by:me(),text:"asked"}]});
      if(r.error){ el.querySelector("#nsMsg").textContent="Couldn't send: "+r.error.message; return; }
      if(pick&&how==="out") try{ await sb.from("gvc_consumables").update({qty:0,counted_at:new Date().toISOString()}).eq("id",pick.id); }catch(e){}
      close(); say(`Sent to Kyle: ${how==="out"?"out of":"low on"} ${what}`); loadReq();
    };
  });
};

/* Kyle's To do: requests waiting for him */
const _auto=autoTodos;
autoTodos=function(){ const out=_auto(); try{ if(isAdmin()){ const w=by("review"); if(w.length){
  const hidden=new Set((typeof todos!=="undefined"?todos:[]).filter(t=>t.source==="auto").map(t=>t.text));
  const text=`Approve ${w.length} supply request${w.length>1?"s":""} (${[...new Set(w.map(r=>r.who))].join(", ")}): ${w.slice(0,3).map(r=>r.what).join(", ")}${w.length>3?"…":""}`;
  if(!hidden.has(text)) out.unshift({text,c:"#9b7bff",view:"requests"}); } } }catch(e){} return out; };

/* ================= hardware inventory (Inventory -> Hardware) ================= */
let HW=[], hwLoaded=false, hwQ="", hwKind="", hwVendor="", hwLow=false, hwMax=150, hwMeta=null;
const KINDS=["Bolts & screws","Nuts","Washers","Lights & electrical","Hydraulic","Hardware","Shop supplies","Safety","Grill parts"];
async function loadHw(){
  const r=await sb.from("gvc_hardware").select("*").eq("in_sheet",true).order("sort");
  if(!r.error){ HW=r.data||[]; } hwLoaded=true;
  try{ const m=await sb.from("gvc_meta").select("value").eq("key","hardware_sync").maybeSingle(); hwMeta=m.data&&m.data.value; }catch(e){}
  if(cur==="inv"||cur==="home") render();
}
let hwStarted=false;
setInterval(()=>{ if(!hwStarted&&typeof db!=="undefined"&&db&&window.ME){ hwStarted=true; loadHw(); } },1500);
const lowHw=h=>h.min_qty!=null&&(h.qty??0)<=h.min_qty;
window.hwLowCount=()=>HW.filter(lowHw).length;
const money=n=>n==null?"":"$"+(+n<1?(+n).toFixed(3).replace(/0$/,""):(+n).toFixed(2));
window.renderHw=function(){
  const B=$("#board"); B.className="hwv"; B.style.gridTemplateColumns="";
  const words=hwQ.toLowerCase().split(/\s+/).filter(Boolean);
  const vendors=[...new Set(HW.map(h=>h.vendor).filter(Boolean))].sort((a,b)=>HW.filter(h=>h.vendor===b).length-HW.filter(h=>h.vendor===a).length);
  const list=HW.filter(h=>(!hwKind||h.kind===hwKind)&&(!hwVendor||(hwVendor==="-"?!h.vendor:h.vendor===hwVendor))&&(!hwLow||lowHw(h))&&words.every(w=>[h.description,h.size,h.spec,h.part_no,h.vendor,h.grp,h.sub,h.kind].join(" ").toLowerCase().includes(w)));
  const val=HW.reduce((a,h)=>a+(h.qty||0)*(h.unit_cost||0),0);
  B.innerHTML=(window.invModeBar?window.invModeBar():"")+`<div class="top"><input id="hwQ" type="search" placeholder="Search bolts, lights, part numbers, vendors…" value="${E(hwQ)}">
      <select id="hwV"><option value="">All vendors</option>${vendors.map(v=>`<option ${hwVendor===v?"selected":""}>${E(v)}</option>`).join("")}<option value="-" ${hwVendor==="-"?"selected":""}>No vendor in the sheet</option></select></div>
    <div class="chips"><button class="btn sm ${!hwKind?"primary":""}" data-hk="">All (${HW.length})</button>${KINDS.filter(k=>HW.some(h=>h.kind===k)).map(k=>`<button class="btn sm ${hwKind===k?"primary":""}" data-hk="${E(k)}">${E(k)} <span style="opacity:.6">${HW.filter(h=>h.kind===k).length}</span></button>`).join("")}
      <button class="btn sm ${hwLow?"primary":""}" id="hwL">Low${window.hwLowCount()?` (${window.hwLowCount()})`:""}</button></div>
    <div class="tnote">${list.length} item${list.length===1?"":"s"}${val?` · about $${Math.round(val).toLocaleString()} on the shelf (qty × unit cost)`:""} · from Robin's spreadsheet (Complete Inventory)${hwMeta&&hwMeta.at?", synced "+ago(hwMeta.at):""} - her sheet is still the master; change counts there. Min qty is set here.</div>
    ${list.slice(0,hwMax).map(h=>{ const pic=window.hwPic?window.hwPic(h):""; return `<div class="hwr ${pic?"pic":""} ${lowHw(h)?"low":""} ${h.qty===0?"out":""}" data-hw="${E(h.key)}">${pic}
      <div class="d">${E(h.description||h.part_no||"(no description)")}${h.size?` <span style="font-weight:400;color:var(--muted)">${E(h.size)}</span>`:""}${lowHw(h)?`<span class="tg">LOW</span>`:""}</div>
      <div class="q">${h.qty==null?"?":+h.qty}<small>${E(h.unit||"on hand")}</small></div>
      <div class="s">${[h.vendor?E(h.vendor)+(h.part_no?" #"+E(h.part_no):""):h.part_no?"#"+E(h.part_no):"",h.unit_cost!=null?money(h.unit_cost)+" ea":"no price",h.spec?E(h.spec):"",h.per_truck?`${+h.per_truck} per truck`:"",h.min_qty!=null?`keep ${+h.min_qty}`:"",E(h.kind||"")].filter(Boolean).join(" · ")}</div></div>`; }).join("")}
    ${list.length>hwMax?`<button class="btn" type="button" id="hwMore" style="width:100%;margin-top:6px">Show ${Math.min(150,list.length-hwMax)} more</button>`:""}
    ${!HW.length?`<div class="empty" style="text-align:left">${hwLoaded?"Robin's hardware list hasn't been synced yet.":"Loading…"}</div>`:""}`;
  if(window.invModeWire) window.invModeWire();
  const q=$("#hwQ"); q.oninput=()=>{ hwQ=q.value; hwMax=150; const p=q.selectionStart; window.renderHw(); const n=$("#hwQ"); n.focus(); n.setSelectionRange(p,p); };
  $("#hwV").onchange=e=>{ hwVendor=e.target.value; hwMax=150; window.renderHw(); };
  B.querySelectorAll("[data-hk]").forEach(b=>b.onclick=()=>{ hwKind=b.dataset.hk; hwMax=150; window.renderHw(); });
  $("#hwL").onclick=()=>{ hwLow=!hwLow; window.renderHw(); };
  const mo=$("#hwMore"); if(mo) mo.onclick=()=>{ hwMax+=150; window.renderHw(); };
  B.querySelectorAll("[data-hw]").forEach(el=>el.onclick=()=>hwSheet(HW.find(h=>h.key===el.dataset.hw)));
};
function hwSheet(h){
  if(!h) return;
  const own=window.hwHasOwnPhoto&&window.hwHasOwnPhoto(h), cred=window.hwPhotoCredit?window.hwPhotoCredit(h):"";
  sheetUI(`${window.hwPic?window.hwPic(h,"hwsheetpic"):""}${cred?`<div class="hwcred">${cred}</div>`:""}
    ${office()&&window.hwPhotoSet?`<div class="row" style="justify-content:center;gap:8px;margin-bottom:10px"><label class="btn sm" style="cursor:pointer;margin:0">📷 ${own?"Replace photo":"Add / replace photo"}<input id="hwPh" type="file" accept="image/*" style="display:none"></label>${own?`<button class="btn sm" type="button" id="hwPhX">Remove photo</button>`:""}</div>`:""}<h3 style="text-transform:none;letter-spacing:.02em">${E(h.description||h.part_no)}</h3>
    <div class="tnote" style="margin:-4px 0 10px">${[h.size,h.spec,h.vendor?h.vendor+(h.part_no?" #"+h.part_no:""):h.part_no,h.unit_cost!=null?money(h.unit_cost)+" each":"",h.pack_qty?"pack of "+(+h.pack_qty):"",h.per_truck?`${+h.per_truck} per truck`:"",h.grp?"sheet: "+h.grp:""].filter(Boolean).map(E).join(" · ")}</div>
    <div style="display:flex;gap:10px;margin-bottom:10px"><div class="pcard" style="--c:#9fb3c8;margin:0;cursor:default"><div><span>ON HAND</span><b>${h.qty==null?"?":+h.qty} <small style="font-size:13px;color:var(--muted)">${E(h.unit||"")}</small></b></div></div></div>
    ${office()?`<label>Keep at least (min qty - flags it LOW on the list)<input id="hwMin" type="number" min="0" step="1" value="${h.min_qty??""}" style="font-size:16px"></label>`:""}
    <div class="row" style="justify-content:space-between;gap:8px;margin-top:12px;flex-wrap:wrap">
      ${office()?`<button class="btn" type="button" id="hwOrd">+ Add to order list</button>`:`<button class="btn" type="button" id="hwAsk">We need more of these</button>`}
      <span style="flex:1"></span><button class="btn" type="button" id="hwX">Close</button>${office()?`<button class="btn primary" type="button" id="hwSave">Save</button>`:""}</div>`,(el,close)=>{
    el.querySelector("#hwX").onclick=close;
    const ph=el.querySelector("#hwPh"); if(ph) ph.onchange=async()=>{ const f=ph.files&&ph.files[0]; if(!f) return; if(pv()){ say(PV); return; }
      say("Uploading photo…"); try{ await window.hwPhotoSet(h,f); say("Photo saved"); close(); hwSheet(h); }catch(e){ say("Couldn't save the photo: "+(e.message||e)); } };
    const phx=el.querySelector("#hwPhX"); if(phx) phx.onclick=async()=>{ if(pv()){ say(PV); return; } try{ await window.hwPhotoRemove(h); close(); hwSheet(h); }catch(e){ say("Couldn't remove it: "+(e.message||e)); } };
    const sv=el.querySelector("#hwSave"); if(sv) sv.onclick=async()=>{ if(pv()){ say(PV); return; } const v=el.querySelector("#hwMin").value;
      const r=await sb.from("gvc_hardware").update({min_qty:v===""?null:+v}).eq("key",h.key); if(r.error){ say("Couldn't save: "+r.error.message); return; } h.min_qty=v===""?null:+v; close(); render(); };
    const o=el.querySelector("#hwOrd"); if(o) o.onclick=()=>{ close(); newRequest({what:[h.description,h.size].filter(Boolean).join(" ")+(h.vendor?` (${h.vendor}${h.part_no?" #"+h.part_no:""})`:""),hardware_key:h.key}); };
    const a=el.querySelector("#hwAsk"); if(a) a.onclick=()=>{ close(); window.needSupplies().then(()=>{ const w=document.getElementById("nsWhat"); if(w) w.value=[h.description,h.size].filter(Boolean).join(" "); }); };
  });
}

/* ================= staging placeholder ================= */
function renderStaging(){
  const B=$("#board"); B.className="stg"; B.style.gridTemplateColumns="";
  B.innerHTML=`<h2 style="font-family:Oswald,sans-serif;letter-spacing:.05em;margin:0">Staging kits <span style="font-size:12px;letter-spacing:.1em;border:1px solid #4a4f56;border-radius:6px;padding:2px 8px;color:#9aa1aa;vertical-align:4px">COMING LATER</span></h2>
    <div class="box" style="margin-top:12px">
      <b>What this will be</b>
      <div class="tnote" style="margin-top:4px">When a job's task is coming up on the week plan, its kit of parts shows up here a couple of days ahead - the brackets, hinges, bolts, lights and mud flaps that assembly needs.</div>
      <ol class="tnote">
        <li>You pull the kit and tick each part off, then mark it <b>Staged</b>.</li>
        <li>Whoever is building it sees "Kit ready in the stock room" on their task.</li>
        <li>Anything short goes straight onto the order list.</li>
        <li>Leftovers come back as a return when the job's done.</li>
      </ol>
      <div class="tnote" style="margin-top:10px">Waiting on: the kit lists for each assembly (picker deck, crew truck...). Kyle is putting those together first.</div>
    </div>`;
}

/* ================= Robin's Home ================= */
window.partsHome=B=>{
  // Robin doesn't punch in or track her own time here (Kyle, Nov 6) - her Home is ordering, stock and the crew to message
  B.innerHTML=`<div class="hm shanim"></div>`;
  const hm=B.querySelector(".hm");
  const flat=(typeof parts!=="undefined"?parts:[]).reduce((a,p)=>a+(p.stock_flat||0),0);
  const consLow=window.invMode&&window.invMode.low?window.invMode.low():0;
  const sec=document.createElement("section"); sec.setAttribute("aria-label","Parts");
  sec.innerHTML=`<h4><span>ORDERING</span><span>SUPPLY REQUESTS</span></h4>
    <div class="pnums">
      <button type="button" data-pt="approved" style="--c:#22c3e6"><b>${by("approved").length}</b><span>TO ORDER</span></button>
      <button type="button" data-pt="review" style="--c:#9b7bff"><b>${by("review").length}</b><span>WAITING FOR KYLE</span></button>
      <button type="button" data-pt="ordered" style="--c:#ff8a2a"><b>${by("ordered").length}</b><span>ON ORDER</span></button></div>
    <h4 style="margin-top:14px"><span>STOCK</span></h4>
    <button class="pcard" type="button" data-pi="hw" style="--c:${window.hwLowCount()?"#e5483b":"#9fb3c8"}"><div><span>HARDWARE · BOLTS, LIGHTS, ELECTRICAL</span><b>${HW.length} items${window.hwLowCount()?` · ${window.hwLowCount()} low`:""}</b></div><span style="font-size:22px">›</span></button>
    <button class="pcard" type="button" data-pi="parts" style="--c:#9fb3c8"><div><span>TRUCK PARTS</span><b>${(typeof parts!=="undefined"?parts.length:0)} parts${flat?` · ${flat} pcs flat`:""}</b></div><span style="font-size:22px">›</span></button>
    <button class="pcard" type="button" data-pi="cons" style="--c:${consLow?"#e5483b":"#f5b041"}"><div><span>CONSUMABLES · WIRE, GAS, DISCS</span><b>${consLow?consLow+" low":"Counts"}</b></div><span style="font-size:22px">›</span></button>
    <h4 style="margin-top:14px"><span>COMING LATER</span></h4>
    <button class="soon" type="button" data-pg="staging" style="display:block;width:100%;text-align:left;background:none;font:inherit;cursor:pointer"><b>Staging kits<i>COMING LATER</i></b>Parts for upcoming jobs, pulled and ready before the build starts.</button>
    <div class="soon"><b>Hardware price comparison<i>COMING LATER</i></b>The same bolt at Fastenal, Resource and Gregg's side by side, with price history.</div>
    <div class="soon"><b>Time & payroll<i>COMING LATER</i></b>Everyone's punched hours by pay period (semi-monthly), approved and exported for QuickBooks.</div>`;
  hm.appendChild(sec);
  const COL={Kyle:"#2f8ff0",Colton:"#3ad06b",Aaron:"#c9a46a",Cooper:"#e04fa0",Robin:"#9b7bff"};
  const crewSec=document.createElement("section"); crewSec.setAttribute("aria-label","The crew");
  crewSec.innerHTML=`<h4><span>THE CREW</span><span>TAP TO MESSAGE</span></h4><div class="cw tmrow">${[...(typeof CREW!=="undefined"?CREW:["Kyle","Colton","Aaron","Cooper"]),"Robin"].map(p=>`<button class="p" type="button" data-cw="${E(p)}"><span class="av" style="background:${COL[p]||"#9aa1aa"}">${E(p[0])}</span><span class="n">${E(p)}</span></button>`).join("")}</div>`;
  hm.appendChild(crewSec);
  if(window.teamDecorate) window.teamDecorate();
  sec.querySelectorAll("[data-pt]").forEach(b=>b.onclick=()=>{ rqTab=b.dataset.pt; shellGo("requests"); });
  sec.querySelectorAll("[data-pi]").forEach(b=>b.onclick=()=>{ if(window.invMode) window.invMode.set(b.dataset.pi); shellGo("inv"); });
  sec.querySelectorAll("[data-pg]").forEach(b=>b.onclick=()=>shellGo(b.dataset.pg));
};

/* ================= views ================= */
window.extraViews=Object.assign(window.extraViews||{},{requests:renderRequests,staging:renderStaging});
const _render=render;
render=function(){ _render(); const L=document.querySelector("section.list"); if(L&&["requests","staging"].includes(cur)) L.style.display="none"; };
})();
