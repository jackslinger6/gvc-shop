/* ---------- My time (Kyle's daily hours) ----------
   Stored in gvc_plan.data.time: { "YYYY-MM-DD": { lines:[{id,ti,gj,h,note}], ok:bool, sent:iso|null, sentIds:[], changed:bool } }
   plan.tiMap: { gvcJobId: timeInvoiceJobId }   plan.timeStart: first day reminders count from.
   Nothing is written to the time invoice app (tables jobs / time_entries) until Kyle presses Send. */
(()=>{
const ME="Kyle", DAY=8;
const P=()=>window.gvcPlan;
let tiJobs=[], tiEntries=[], tiLoaded=false, wkT=0, showWe=false, sendBox=null, tmsg="";
const css=document.createElement("style");
css.textContent=`
.tmv{margin-top:12px;max-width:980px}
.tmv .tbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
.tmv .lbl{font-size:12px;color:var(--muted)}
.tmv .tmsg{font-size:12.5px;color:#ffd28a;min-height:18px;margin:4px 0}
.tmv .tday{border:1px solid var(--line);border-left:4px solid var(--c,#555);background:rgba(0,0,0,.28);border-radius:8px;padding:10px 12px;margin:8px 0}
.tmv .thd{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.tmv .thd .tot{font-weight:600}
.tmv .tok{font-size:11px;padding:1px 8px;border-radius:999px;background:rgba(58,208,107,.15);color:#7fe3a0;border:1px solid rgba(58,208,107,.45)}
.tmv .tsent{font-size:11px;padding:1px 8px;border-radius:999px;background:rgba(47,143,240,.15);color:#8fc2ff;border:1px solid rgba(47,143,240,.45)}
.tmv .twarn{font-size:11px;padding:1px 8px;border-radius:999px;background:rgba(229,72,59,.15);color:#ff9b91;border:1px solid rgba(229,72,59,.5)}
.tmv .tl{display:grid;grid-template-columns:minmax(150px,220px) 1fr 74px 28px;gap:6px;margin-top:6px;align-items:start}
.tmv .tl select,.tmv .tl input,.tmv .tl textarea{font:inherit;font-size:13px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:5px 7px;width:100%}
.tmv .tl textarea{min-height:32px;resize:vertical}
.tmv .tl button{background:none;border:0;color:var(--dim);cursor:pointer;font-size:16px}
.tmv .ask{margin-top:8px;font-size:13px;color:#ffd28a}
.tmv .ask .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.tmv .tft{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px}
.tmv .draft{font-size:11.5px;color:var(--muted);margin-top:4px}
.tmv .sendbox{border:1px solid var(--orange);border-radius:8px;padding:10px 12px;margin:8px 0;font-size:13px}
@media (max-width:600px){ .tmv .tl{grid-template-columns:1fr 64px 26px} .tmv .tl select{grid-column:1/4} }
`;
document.head.appendChild(css);

const r4=x=>Math.round(x*4)/4;
const iso=d=>P().iso(d);
const todayIso=()=>iso(new Date());
const plan=()=>P().get();
const T=()=>{ const p=plan(); p.time=p.time||{}; return p.time; };
const tiName=id=>{ const j=tiJobs.find(x=>x.id===id); return j?`${j.name}${j.description?" · "+j.description:""}`:""; };
const rid=()=>Math.random().toString(36).slice(2,9);

async function loadTI(){
  if(!db) return;
  const a=iso(new Date(Date.now()-35*86400000)), b=iso(new Date(Date.now()+21*86400000));
  const [j,e]=await Promise.all([sb.from("jobs").select("id,name,description,closed"), sb.from("time_entries").select("id,date,job_id,hours,notes").gte("date",a).lte("date",b)]);
  if(!j.error) tiJobs=(j.data||[]).filter(x=>!x.closed).sort((x,y)=>String(y.name).localeCompare(String(x.name),undefined,{numeric:true}));
  if(!e.error) tiEntries=e.data||[];
  tiLoaded=true; if(cur==="time"||cur==="todo") render();
}
setInterval(()=>{ if(db&&!tiLoaded&&P()&&P().loaded()){ tiLoaded=true; loadTI(); } },1000);

/* ---------- job matching ---------- */
const words=s=>String(s||"").toLowerCase().replace(/[^a-z0-9 ]/g," ").split(/\s+/).filter(w=>w.length>=4);
function lev1(a,b){ if(a===b) return true; if(Math.abs(a.length-b.length)>1) return false; let i=0,j=0,e=0; while(i<a.length&&j<b.length){ if(a[i]===b[j]){i++;j++;continue;} if(++e>1) return false; if(a.length>b.length) i++; else if(b.length>a.length) j++; else {i++;j++;} } return e+(a.length-i)+(b.length-j)<=1; }
function guessTI(gj){
  const map=plan().tiMap||{}; if(map[gj.id]&&tiJobs.some(x=>x.id===map[gj.id])) return map[gj.id];
  const m=String(gj.name).match(/\b(\d{4})\s*([a-z]{0,2})\b/i);
  if(m){ const n=m[1], suf=(m[2]||"").toLowerCase(); const c=tiJobs.filter(x=>String(x.name).replace(/\s/g,"").toLowerCase().startsWith(n));
    const ex=c.find(x=>String(x.name).replace(/\s/g,"").toLowerCase()===n+suf); if(ex) return ex.id; if(c.length) return c[0].id; }
  const gw=words(gj.name); let best=null,bs=0;
  tiJobs.forEach(x=>{ const tw=words(x.name+" "+x.description); const s=gw.filter(w=>tw.some(t=>lev1(w,t))).length; if(s>bs){bs=s;best=x.id;} });
  return best;
}
const MONTHS=["january","february","march","april","may","june","july","august","september","october","november","december"];
function shopJob(d){ const mo=MONTHS[P().fromIso(d).getMonth()]; const hit=tiJobs.find(x=>{ const t=(x.name+" "+x.description).toLowerCase(); return t.includes("shop")&&(t.includes(mo)||t.includes(mo.slice(0,3)+" ")||t.endsWith(mo.slice(0,3))); }); return hit?hit.id:""; }

/* ---------- suggestion from the week plan ---------- */
function suggest(d){
  const G=P(); if(!G||!G.loaded()) return [];
  const M=G.model(), R=G.compute(M); const ids=(M.S[ME]||{})[d]||[]; const by={};
  ids.forEach(k=>{ const t=M.T[k], r=R[ME][k]; if(!t||!r) return; const h=r.w; if(h<0.01) return;
    const key=t.jid||(t.errand?"__shop":"__other"); const g=by[key]=by[key]||{gj:t.jid||null,h:0,names:[]};
    g.h+=h; g.names.push(t.name); });
  return Object.entries(by).map(([key,g])=>{ const gjob=g.gj&&jobs.find(j=>j.id===g.gj);
    return {id:rid(),gj:g.gj,ti:gjob?(guessTI(gjob)||""):(key==="__shop"?shopJob(d):""),h:r4(g.h),note:g.names.join(", ")}; });
}
function dayRec(d){ const r=T()[d]; if(r) return {...r,draft:false}; return {lines:suggest(d),ok:false,sent:null,draft:true}; }
const total=r=>r.lines.reduce((a,l)=>a+(Number(l.h)||0),0);
const theirs=d=>{ const mine=new Set((T()[d]||{}).sentIds||[]); return tiEntries.filter(e=>e.date===d&&!mine.has(e.id)); };

let saveT=null;
function persist(now){ clearTimeout(saveT); if(now) return P().save(); saveT=setTimeout(()=>P().save(),700); }
function edit(d,fn,quiet){
  const cur0=dayRec(d); const r={lines:cur0.lines.map(l=>({...l})),ok:cur0.ok,sent:cur0.sent,sentIds:cur0.sentIds||[],changed:cur0.changed};
  fn(r); if(r.ok&&total(r)<DAY-1e-6) r.ok=false; if(r.sent) r.changed=true;
  T()[d]=r; persist(); if(!quiet) render();
}

/* ---------- view ---------- */
function weekDates(){ const s=P().monday(wkT),o=[]; for(let i=0;i<7;i++){ const x=new Date(s); x.setDate(s.getDate()+i); const w=x.getDay(); const di=iso(x);
  if((w===0||w===6)&&!showWe&&!T()[di]&&!suggest(di).length) continue; o.push(di); } return o; }
const jobOpts=sel=>`<option value="">Pick a job…</option>`+tiJobs.map(j=>`<option value="${esc(j.id)}" ${j.id===sel?"selected":""}>${esc(j.name)}${j.description?" · "+esc(j.description):""}</option>`).join("");
const QUICK=[["Meeting","shop"],["Drawings / office","shop"],["Shop cleanup","shop"],["Parts run","shop"],["Helping the crew","shop"]];

function renderTime(){
  const B=$("#board"); B.className="tmv"; B.style.gridTemplateColumns="";
  if(!P()||!P().loaded()||!tiLoaded){ B.innerHTML=`<div class="lbl" style="padding:20px">Loading your time…</div>`; return; }
  const D=weekDates(), today=todayIso(), G=P();
  const s=G.monday(wkT), e=new Date(s); e.setDate(s.getDate()+6);
  let h=`<div class="tbar"><button class="btn sm" data-tw="-1" aria-label="Previous week">‹</button><button class="btn sm" data-tw="0">This week</button><button class="btn sm" data-tw="1" aria-label="Next week">›</button>
    <span style="font-weight:600;margin:0 6px">${s.toLocaleDateString("en-CA",{month:"short",day:"numeric"})} – ${e.toLocaleDateString("en-CA",{month:"short",day:"numeric"})}</span>
    <button class="btn sm ${showWe?"primary":""}" id="tWe">Sat/Sun</button><span style="flex:1"></span><span class="lbl">Every day has to add up to ${DAY}h. Nothing goes to the time invoice app until you press Send.</span></div>
    <div class="tmsg">${esc(tmsg)}</div>`;
  if(sendBox) h+=sendBox.html;
  let wkTot=0, ready=[];
  D.forEach(d=>{
    const off=G.isOff(ME,d); const r=dayRec(d); const tot=total(r); wkTot+=tot; const ext=theirs(d); const extH=ext.reduce((a,x)=>a+Number(x.hours||0),0);
    const future=d>today;
    const c=off?"#6c727a":r.ok?(r.sent&&!r.changed?"#2f8ff0":"#3ad06b"):(tot>=DAY?"#f5b041":"#e5483b");
    if(r.ok&&(!r.sent||r.changed)) ready.push(d);
    h+=`<div class="tday" data-day="${d}" style="--c:${c}"><div class="thd"><b>${G.dlabel(d)}${d===today?" (today)":""}</b>
      <span class="tot" style="color:${tot>DAY+1e-6?"#ffd28a":tot<DAY-1e-6?"#ff9b91":"#7fe3a0"}">${G.fh(tot)} / ${DAY}h</span>
      ${tot>DAY+1e-6?`<span class="twarn" style="color:#ffd28a;border-color:#8a6a2a;background:rgba(245,176,65,.12)">${G.fh(tot-DAY)} overtime</span>`:""}
      ${off?`<span class="lbl">Day off in the plan</span>`:""}
      ${r.ok?`<span class="tok">Confirmed</span>`:""}${r.sent?`<span class="tsent">Sent${r.changed?" - changed since":""}</span>`:""}
      ${extH?`<span class="twarn">Invoice app already has ${G.fh(extH)} for this day</span>`:""}</div>
      ${r.draft&&r.lines.length?`<div class="draft">Suggested from your week plan. Change anything, then confirm.</div>`:""}
      ${!r.lines.length&&!off&&!extH?`<div class="draft">${future?"Nothing planned yet.":"Nothing logged yet."}</div>`:""}
      ${r.lines.map((l,i)=>`<div class="tl"><select data-tj="${d}|${i}" aria-label="Job">${jobOpts(l.ti)}</select>
        <textarea data-tn="${d}|${i}" rows="1" placeholder="What you did" aria-label="What you did">${esc(l.note)}</textarea>
        <input data-th="${d}|${i}" type="number" step="0.25" min="0" value="${l.h}" aria-label="Hours">
        <button data-tx="${d}|${i}" title="Remove line" aria-label="Remove line">✕</button></div>`).join("")}
      ${extH&&!r.lines.length?`<div class="draft">Already logged in the time invoice app (${G.fh(extH)}). Nothing to do here.</div>`:""}
      ${!off&&!future&&tot<DAY-1e-6&&!(extH&&!r.lines.length)?`<div class="ask">That's ${G.fh(tot)}. What else did you do for the other ${G.fh(DAY-tot)}?
        <div class="row">${QUICK.map(([q])=>`<button class="btn sm" data-tq="${d}|${esc(q)}">${esc(q)}</button>`).join("")}<button class="btn sm" data-ta="${d}">Something else…</button></div></div>`:""}
      <div class="tft"><button class="btn sm" data-ta="${d}">+ Line</button>${suggest(d).length?`<button class="btn sm" data-tf="${d}">Fill from plan</button>`:""}
        <span style="flex:1"></span>${r.ok?`<button class="btn sm" data-tu="${d}">Unconfirm</button>`:`<button class="btn sm ${tot>=DAY-1e-6?"primary":""}" data-tc="${d}">Confirm day</button>`}</div></div>`;
  });
  h+=`<div class="tft" style="margin-top:12px"><b>Week: ${G.fh(wkTot)}</b><span style="flex:1"></span>
    <button class="btn ${ready.length?"primary":""}" id="tSend" ${ready.length?"":"disabled"}>Send ${ready.length} confirmed day${ready.length===1?"":"s"} to time invoice app</button></div>`;
  B.innerHTML=h;
  B.querySelectorAll("[data-tw]").forEach(b=>b.onclick=()=>{ const v=+b.dataset.tw; wkT=v===0?0:wkT+v; sendBox=null; render(); });
  $("#tWe").onclick=()=>{ showWe=!showWe; render(); };
  const sp=x=>{ const [d,i]=x.split("|"); return [d,+i]; };
  B.querySelectorAll("[data-tj]").forEach(el=>el.onchange=()=>{ const [d,i]=sp(el.dataset.tj); edit(d,r=>{ const l=r.lines[i]; l.ti=el.value; if(l.gj&&el.value){ const p=plan(); p.tiMap=p.tiMap||{}; p.tiMap[l.gj]=el.value; } }); });
  B.querySelectorAll("[data-tn]").forEach(el=>{ el.oninput=()=>{ const [d,i]=sp(el.dataset.tn); edit(d,r=>{ r.lines[i].note=el.value; },true); }; });
  B.querySelectorAll("[data-th]").forEach(el=>el.oninput=()=>{ const [d,i]=sp(el.dataset.th); edit(d,r=>{ r.lines[i].h=Math.max(0,r4(Number(el.value)||0)); },true); patchTot(d); });
  B.querySelectorAll("[data-tx]").forEach(el=>el.onclick=()=>{ const [d,i]=sp(el.dataset.tx); edit(d,r=>{ r.lines.splice(i,1); }); });
  B.querySelectorAll("[data-ta]").forEach(el=>el.onclick=()=>{ const d=el.dataset.ta; edit(d,r=>{ r.lines.push({id:rid(),gj:null,ti:"",h:r4(Math.max(0,DAY-total(r)))||1,note:""}); }); setTimeout(()=>{ const t=[...document.querySelectorAll(`[data-tn^="${d}|"]`)].pop(); if(t) t.focus(); },50); });
  B.querySelectorAll("[data-tq]").forEach(el=>el.onclick=()=>{ const [d,q]=el.dataset.tq.split("|"); edit(d,r=>{ r.lines.push({id:rid(),gj:null,ti:shopJob(d),h:r4(Math.max(0.25,DAY-total(r))),note:q}); });
    if(!shopJob(d)) tmsg=`No "${MONTHS[P().fromIso(d).getMonth()]} shop" job in the time invoice app yet - pick a job for that line.`; render(); });
  B.querySelectorAll("[data-tf]").forEach(el=>el.onclick=()=>{ const d=el.dataset.tf; const sg=suggest(d); edit(d,r=>{ const have=new Set(r.lines.filter(l=>l.gj).map(l=>l.gj)); sg.forEach(l=>{ if(!l.gj||!have.has(l.gj)) r.lines.push(l); }); }); });
  B.querySelectorAll("[data-tc]").forEach(el=>el.onclick=()=>{ const d=el.dataset.tc; const r=dayRec(d); const tot=total(r);
    if(tot<DAY-1e-6){ tmsg=`${P().dlabel(d)} only adds up to ${P().fh(tot)}. What else did you do? Add a line for the other ${P().fh(DAY-tot)}.`; render(); return; }
    if(r.lines.some(l=>!l.ti)){ tmsg="Pick a time-invoice job for every line first."; render(); return; }
    edit(d,x=>{ x.ok=true; }); tmsg=`${P().dlabel(d)} confirmed.`; render(); });
  B.querySelectorAll("[data-tu]").forEach(el=>el.onclick=()=>edit(el.dataset.tu,r=>{ r.ok=false; }));
  $("#tSend").onclick=()=>prepSend(ready);
  B.querySelectorAll("[data-sgo]").forEach(b=>b.onclick=()=>doSend(b.dataset.sgo==="skip"));
  B.querySelectorAll("[data-scx]").forEach(b=>b.onclick=()=>{ sendBox=null; render(); });
}

function patchTot(d){ const el=document.querySelector(`.tmv .tday[data-day="${d}"] .tot`); if(!el) return; const t=total(dayRec(d));
  el.textContent=`${P().fh(t)} / ${DAY}h`; el.style.color=t>DAY+1e-6?"#ffd28a":t<DAY-1e-6?"#ff9b91":"#7fe3a0"; }
/* ---------- send to the time invoice app (only when Kyle presses it) ---------- */
async function prepSend(days){
  await loadTI();
  const G=P(); const rows=[]; const clash=[];
  days.forEach(d=>{ const r=T()[d]; const by={}; r.lines.forEach(l=>{ if(!(Number(l.h)>0)) return; const g=by[l.ti]=by[l.ti]||{h:0,notes:[]}; g.h+=Number(l.h); if(l.note) g.notes.push(l.note); });
    Object.entries(by).forEach(([ti,g])=>rows.push({date:d,job_id:ti,hours:r4(g.h),notes:g.notes.join(". ")}));
    const ex=theirs(d).reduce((a,x)=>a+Number(x.hours||0),0); if(ex) clash.push({d,h:ex}); });
  const tot=rows.reduce((a,x)=>a+x.hours,0);
  sendBox={days,rows,clash,html:`<div class="sendbox"><b>Send to the time invoice app?</b>
    <div style="margin-top:6px">${days.map(d=>`${G.dlabel(d)}: `+rows.filter(x=>x.date===d).map(x=>`${G.fh(x.hours)} ${esc(tiName(x.job_id).split(" · ")[0])}`).join(", ")).join("<br>")}</div>
    <div style="margin-top:6px">${G.fh(tot)} total, ${rows.length} entr${rows.length===1?"y":"ies"}.${days.some(d=>T()[d].sent)?" Days you already sent get replaced, not doubled.":""}</div>
    ${clash.length?`<div style="margin-top:6px;color:#ff9b91">Heads up: the invoice app already has time you entered there for ${clash.map(c=>`${G.dlabel(c.d)} (${G.fh(c.h)})`).join(", ")}. Sending these too would double up.</div>`:""}
    <div class="tft">${clash.length?`<button class="btn sm primary" data-sgo="skip">Send, but skip those days</button><button class="btn sm" data-sgo="all">Send everything anyway</button>`:`<button class="btn sm primary" data-sgo="all">Send</button>`}<button class="btn sm" data-scx="1">Cancel</button></div></div>`};
  render();
}
async function doSend(skipClash){
  const b=sendBox; if(!b) return; sendBox=null;
  const skip=new Set(skipClash?b.clash.map(c=>c.d):[]);
  const days=b.days.filter(d=>!skip.has(d)); let n=0;
  for(const d of days){
    const r=T()[d]; if(!r) continue;
    if((r.sentIds||[]).length){ const del=await sb.from("time_entries").delete().in("id",r.sentIds); if(del.error){ tmsg="Couldn't replace "+P().dlabel(d)+": "+del.error.message; break; } }
    const rows=b.rows.filter(x=>x.date===d).map(x=>({id:rid(),...x}));
    const ins=await sb.from("time_entries").insert(rows); if(ins.error){ tmsg="Couldn't send "+P().dlabel(d)+": "+ins.error.message; break; }
    r.sentIds=rows.map(x=>x.id); r.sent=new Date().toISOString(); r.changed=false; n++;
  }
  await P().save(); await loadTI();
  if(n) tmsg=`Sent ${n} day${n===1?"":"s"} to the time invoice app.${skip.size?` Skipped ${skip.size} that already had time there.`:""}`;
  render();
}

/* ---------- hooks ---------- */
function pending(){ if(!P()||!P().loaded()) return [];
  const p=plan(); const start=p.timeStart; if(!start) return [];
  const today=todayIso(), out=[]; const x=P().fromIso(start);
  while(iso(x)<=today){ const d=iso(x), w=x.getDay();
    if(w!==0&&w!==6&&!P().isOff(ME,d)){ const r=dayRec(d); const late=d<today||new Date().getHours()+new Date().getMinutes()/60>=15.5;
      if(!r.ok&&late&&!theirs(d).length) out.push({d,tot:total(r),draft:r.draft}); }
    x.setDate(x.getDate()+1); }
  return out; }
window.timeTab=()=>{ const n=pending().length; return `<button class="tab ${cur==="time"?"on":""}" style="--c:#7fe3a0" role="tab" aria-selected="${cur==="time"}" data-b="time">My time${n?`<span class="at">${n} to log</span>`:""}</button>`; };
window.renderTime=renderTime;
const _auto=autoTodos;
autoTodos=function(){ const out=_auto();
  try{ pending().forEach(x=>{ const text=`Log your time for ${P().dlabel(x.d)} (${x.draft&&x.tot?"plan says "+P().fh(x.tot)+", confirm it":P().fh(x.tot)+" of 8h so far"})`; out.push({text,c:"#7fe3a0",view:"time"}); });
    const G=P(); if(G&&G.loaded()){ const lastMon=iso(G.monday(-1)), thisMon=iso(G.monday(0)); const unsent=Object.entries(T()).filter(([d,r])=>d>=lastMon&&d<thisMon&&r.ok&&(!r.sent||r.changed));
      if(unsent.length) out.push({text:`Send last week's time to the time invoice app (${unsent.length} day${unsent.length===1?"":"s"} confirmed)`,c:"#7fe3a0",view:"time"}); }
  }catch(e){}
  return out; };
setInterval(()=>{ const G=P(); if(db&&G&&G.loaded()){ const p=plan(); if(!p.timeStart){ p.timeStart=todayIso(); G.save(); } } },1500);
})();
