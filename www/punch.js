/* ---------- Job time clock + crew mode (Kyle, 2026-11-05) ----------
   PUNCH CLOCK (everyone): punch into a task -> the clock runs on that task; punching into the next task closes the
   last one. Rows in gvc_punches (who, job, task, start, end). Punching in moves a Ready task to In progress.
   - Home: "MY DAY" - my tasks from the week plan with Punch in / Done, and the running clock bar on every screen.
   - Job card: ▶ on each task, and "TIME ON THIS JOB" (actual hours per task per person vs the plan estimate),
     so we learn how long things really take for next time.
   CREW MODE (gvc_members.role = 'crew', e.g. Colton): Home = clock + my day + All jobs. Jobs = Shop floor + All jobs
   (no Pipeline / Orders boards). No To do, Next up, My time, quotes/suppliers, stage moves, delete/archive, App ideas.
   Wheel: Punch in, Add my work, Count, Problem/NCR, Revision, Talk. Work he adds lands on Kyle's To do. */
(()=>{
const st=document.createElement("style");
st.textContent=`
.pbar{position:sticky;top:0;z-index:40;display:flex;align-items:center;gap:10px;margin:0 auto 10px;max-width:1500px;padding:8px 12px;border-radius:12px;
  background:linear-gradient(90deg,rgba(58,208,107,.22),rgba(58,208,107,.06));border:1px solid rgba(58,208,107,.55);box-shadow:0 0 18px rgba(58,208,107,.18)}
.pbar[hidden]{display:none}
.pbar .dot{width:10px;height:10px;border-radius:50%;background:#3ad06b;box-shadow:0 0 10px #3ad06b;animation:pdot 1.4s ease-in-out infinite;flex:none}
@keyframes pdot{50%{opacity:.35}}
.pbar .t{flex:1;min-width:0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pbar .t b{font-weight:600}.pbar .t small{color:var(--muted);margin-left:6px}
.pbar .clk{font:600 18px Oswald,sans-serif;letter-spacing:.06em;color:#7ff0a8;font-variant-numeric:tabular-nums}
.pbar button{border:none;border-radius:10px;background:#e5483b;color:#fff;font:600 13px Oswald,sans-serif;letter-spacing:.08em;padding:8px 12px;cursor:pointer}
.mday{grid-column:1/-1}
.mday .row2{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:10px 12px;border:1px solid #2a2e34;border-left:4px solid var(--c);border-radius:12px;margin-bottom:6px;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 12%,#17191d),#15171a 60%)}
.mday .row2.on{border-color:#3ad06b;box-shadow:0 0 0 1px #3ad06b inset}
.mday .row2.dn{opacity:.5}
.mday .tm{font:600 12px Oswald,sans-serif;letter-spacing:.06em;color:var(--muted);min-width:54px}
.mday .nm{min-width:0}.mday .nm b{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mday .nm small{display:block;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mday .bt{display:flex;gap:6px}
.mday .bt button{border:none;border-radius:10px;font:600 13px Oswald,sans-serif;letter-spacing:.08em;padding:0 12px;height:40px;cursor:pointer}
.mday .pin{background:linear-gradient(180deg,#5be38a,#2fae5b);color:#0b1a10}.mday .pout{background:#e5483b;color:#fff}.mday .pdn{background:rgba(255,255,255,.07);color:#e9e6e1;border:1px solid #33373e!important}
@media (max-width:600px){ .mday .row2{grid-template-columns:1fr auto;row-gap:2px} .mday .tm{grid-column:1/-1;min-width:0} .mday .nm b{white-space:normal} .mday .bt button{height:44px} }
.mday .none{color:var(--dim);font-size:13px;margin:0 2px 4px}
.mday .dh{font:600 11.5px Oswald,sans-serif;letter-spacing:.16em;color:#ffb36b;margin:12px 2px 6px}
.mday .add{width:100%;border:1px dashed #3a3e45;background:none;color:#cfd3d8;border-radius:12px;padding:10px;font:500 14px Inter,sans-serif;cursor:pointer;margin-top:4px}
.jtime table{width:100%;border-collapse:collapse;font-size:13.5px}.jtime td,.jtime th{padding:6px 8px;border-bottom:1px solid #22252a;text-align:left}
.jtime th{font:600 11px Oswald,sans-serif;letter-spacing:.12em;color:var(--muted)}.jtime .over{color:#ff9b91}.jtime .under{color:#3ad06b}
.pnb{border:none;border-radius:8px;background:rgba(58,208,107,.16);color:#7ff0a8;font:600 11.5px Oswald,sans-serif;letter-spacing:.08em;padding:4px 8px;margin-top:5px;cursor:pointer}
.pnb.on{background:#e5483b;color:#fff}
/* crew mode: hide the office side */
body.crew #shBell,body.crew #undoBtn,body.crew #ideasBtn,body.crew #addJob,body.crew #msBtn,
body.crew #dlg #back,body.crew #dlg #next,body.crew #dlg #delJob,body.crew #dlg #archJob,body.crew #dlg #cmpQ,body.crew #dlg #addSup,
body.crew #dlg details[data-fold="edit"],body.crew .subnav .sn[data-sv="pipeline"],body.crew .subnav .sn[data-sv="ordering"],body.crew .subnav .sn[data-sv="todo"]{display:none!important}
body.crew #dlg .supsec{display:none!important}
`;
document.head.appendChild(st);
const toast=m=>{ if(typeof todoToast==="function"){ todoToast(m,null); const u=document.getElementById("toastUndo"); if(u) u.style.display="none"; } };
const me=()=>(window.ME&&ME.name)||"Kyle";
const isCrew=()=>!!(window.ME&&ME.role==="crew");
let open=null, tick=null, jobPunches={};
const hm=ms=>{ const s=Math.max(0,Math.floor(ms/1000)); return `${Math.floor(s/3600)}:${String(Math.floor(s/60)%60).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`; };
const hrs=ms=>{ const h=ms/36e5; return h<0.1?"<0.1h":(Math.round(h*10)/10)+"h"; };

/* ---- clock bar ---- */
const bar=document.createElement("div"); bar.className="pbar"; bar.hidden=true;
const wrap=document.querySelector(".wrap"); if(wrap) wrap.prepend(bar);
function paint(){
  clearInterval(tick);
  if(!open||$("#app").hidden){ bar.hidden=true; return; }
  bar.hidden=false;
  bar.innerHTML=`<i class="dot"></i><div class="t"><b>${esc(open.task_name||"On the clock")}</b><small>${esc(open.job_name||"")}</small></div><span class="clk" id="pClk">${hm(Date.now()-new Date(open.start_at))}</span><button type="button" id="pOut">PUNCH OUT</button>`;
  bar.querySelector("#pOut").onclick=()=>punchOut();
  bar.querySelector(".t").onclick=()=>{ if(open.job_id&&jobs.some(j=>j.id===open.job_id)) openJob(open.job_id); };
  tick=setInterval(()=>{ const c=$("#pClk"); if(c&&open) c.textContent=hm(Date.now()-new Date(open.start_at)); },1000);
}
async function load(){
  if(typeof db==="undefined"||!db) return;
  const r=await sb.from("gvc_punches").select("*").eq("who",me()).is("end_at",null).maybeSingle();
  open=r.data||null; paint(); if(cur==="home") render();
}
window.punchLoad=load; window.punchOpen=()=>open;

async function setTask(jid,aid,fn,logText){
  const j0=jobs.find(x=>x.id===jid); if(!j0) return;
  const j=structuredClone(j0); delete j.id; const a=(j.assemblies||[]).find(x=>x.id===aid); if(!a) return;
  if(fn(a,j)===false) return;
  if(logText) j.log=[...(j.log||[]),{at:new Date().toISOString(),text:logText}];
  try{ await saveJob(jid,j); }catch(e){}
}
const preview=()=>!!(window.ME&&ME.preview);
const PV="Preview - nothing is saved. Exit the preview to punch in for real.";
async function punchIn(jid,aid){
  if(preview()){ toast(PV); return; }
  const j=jobs.find(x=>x.id===jid); const a=j&&(j.assemblies||[]).find(x=>x.id===aid); if(!a) return;
  const r=await sb.rpc("gvc_punch_in",{p_who:me(),p_job:jid,p_task:aid,p_job_name:j.name,p_task_name:a.name});
  if(r.error){ toast("Couldn't punch in: "+r.error.message); return; }
  const who=String(a.who||"").split(",").map(s=>s.trim()).filter(Boolean);
  if(["ready","bend"].includes(a.status)||!who.includes(me()))
    await setTask(jid,aid,x=>{ if(x.status==="ready") x.status="prog"; if(!who.includes(me())) x.who=[...who,me()].join(", "); },`${me()} punched in on ${a.name}`);
  delete jobPunches[jid]; await load(); toast(`On the clock: ${a.name}`);
}
async function punchOut(){
  if(preview()){ toast(PV); return; }
  const was=open; const r=await sb.rpc("gvc_punch_out",{p_who:me()});
  if(r.error){ toast("Couldn't punch out: "+r.error.message); return; }
  if(was) delete jobPunches[was.job_id];
  open=null; paint(); if(was) toast(`Punched out - ${hrs(Date.now()-new Date(was.start_at))} on ${was.task_name}`);
  render();
}
async function doneTask(jid,aid){
  if(preview()){ toast(PV); return; }
  if(open&&open.job_id===jid&&open.task_id===aid) await punchOut();
  const j=jobs.find(x=>x.id===jid); const a=j&&(j.assemblies||[]).find(x=>x.id===aid);
  await setTask(jid,aid,x=>{ x.status="done"; },`${a?a.name:"Task"}: Done (${me()})`);
  toast(`Done: ${a?a.name:""}`);
}
window.punchIn=punchIn; window.punchOut=punchOut;

/* ---- MY DAY: my tasks from the week plan (today, + next 2 work days for crew), plus tasks I'm on that aren't scheduled ---- */
function myTasks(){
  const out={days:[],other:[]}; const P=window.gvcPlan; if(!P||!P.loaded||!P.loaded()) return out;
  let M,R; try{ ({M,R}=P.mc()); }catch(e){ return out; }
  const placed=new Set(); const x=new Date(); x.setHours(0,0,0,0);
  for(let i=0;i<10&&out.days.length<(isCrew()?3:1);i++,x.setDate(x.getDate()+1)){
    const w=x.getDay(); if(i>0&&(w===0||w===6)) continue;
    const d=P.iso(x); const ks=(M.S[me()]||{})[d]||[];
    const rows=ks.map(k=>{ const t=M.T[k]; if(!t) return null; const bk=String(k).split("#")[0]; const m=bk.match(/^j:([^:]+):(.+)$/); placed.add(bk);
      const r=(R[me()]||{})[k]; return {t,jid:m?m[1]:"",aid:m?m[2]:"",time:r?P.clock(r.s)+"–"+P.clock(r.e):"",color:t.color||"#8e96a3"}; }).filter(Boolean);
    out.days.push({d,label:i===0?"TODAY":P.dlabel(d).toUpperCase(),rows});
  }
  jobs.forEach(j=>{ if(j.stage==="done"||j.archived) return; (j.assemblies||[]).forEach(a=>{
    if(a.status==="done"||!String(a.who||"").split(",").map(s=>s.trim()).includes(me())) return;
    if(placed.has(`j:${j.id}:${a.id}`)) return;
    out.other.push({t:{name:a.name,job:j.name,done:false},jid:j.id,aid:a.id,time:"",color:window.jobColor?window.jobColor(j.id):"#8e96a3"}); }); });
  return out;
}
function rowHtml(x){
  const on=open&&open.job_id===x.jid&&open.task_id===x.aid; const dn=x.t.done;
  const j=jobs.find(y=>y.id===x.jid); const a=j&&(j.assemblies||[]).find(y=>y.id===x.aid);
  return `<div class="row2 ${on?"on":""} ${dn?"dn":""}" style="--c:${x.color}"><span class="tm">${esc(x.time||"")}</span>
    <div class="nm" data-oj="${esc(x.jid)}"><b>${dn?"✓ ":""}${x.t.cont?"↳ ":""}${esc(x.t.name)}</b><small>${esc(x.t.job||"")}${a&&a.status==="prog"?" · in progress":""}</small></div>
    <div class="bt">${dn||!a?"":on?`<button class="pout" type="button" data-pout="1">PUNCH OUT</button>`:`<button class="pin" type="button" data-pin="${esc(x.jid)}|${esc(x.aid)}">▶ PUNCH IN</button>`}${dn||!a?"":`<button class="pdn" type="button" data-pdn="${esc(x.jid)}|${esc(x.aid)}">✓</button>`}</div></div>`;
}
window.myDayHtml=()=>{
  const T=myTasks(); const n=T.days.reduce((s,d)=>s+d.rows.length,0)+T.other.length;

  return `<section class="mday" aria-label="My day"><h4><span>MY DAY · ${esc(me()).toUpperCase()}</span>${open?`<span style="color:#7ff0a8">ON THE CLOCK</span>`:`<span>NOT PUNCHED IN</span>`}</h4>
    ${T.days.map(d=>`${T.days.length>1?`<div class="dh">${d.label}</div>`:""}${d.rows.map(rowHtml).join("")||`<div class="none">Nothing planned${d.label==="TODAY"?" for you today":""}.</div>`}`).join("")}
    ${T.other.length?`<div class="dh">ALSO ON YOU</div>${T.other.map(rowHtml).join("")}`:""}
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="add" type="button" data-pick="1" style="flex:1;border-style:solid;border-color:rgba(58,208,107,.5);color:#7ff0a8">▶ Punch in on any task…</button>${isCrew()?`<button class="add" type="button" data-addw="1" style="flex:1">+ I'm doing something else</button>`:`<button class="add" type="button" data-crewv="1" style="flex:0 0 auto;width:auto;padding:10px 14px">👁 See Colton's view</button>`}</div></section>`;
};
window.myDayWire=root=>{
  root.querySelectorAll("[data-pin]").forEach(b=>b.onclick=()=>{ const [j,a]=b.dataset.pin.split("|"); punchIn(j,a); });
  root.querySelectorAll("[data-pout]").forEach(b=>b.onclick=()=>punchOut());
  root.querySelectorAll("[data-pdn]").forEach(b=>b.onclick=()=>{ const [j,a]=b.dataset.pdn.split("|"); doneTask(j,a); });
  root.querySelectorAll("[data-oj]").forEach(b=>b.onclick=()=>{ if(b.dataset.oj) openJob(b.dataset.oj); });
  root.querySelectorAll("[data-addw]").forEach(b=>b.onclick=()=>addMyWork());
  root.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>pickTask());
  root.querySelectorAll("[data-crewv]").forEach(b=>b.onclick=()=>window.crewPreview(true));
};
window.crewHome=B=>{
  B.innerHTML=`<div class="hm shanim">${window.myDayHtml()}</div>`;
  window.myDayWire(B);
};

/* ---- job card: ▶ per task + TIME ON THIS JOB ---- */
async function punchesFor(jid){
  if(jobPunches[jid]) return jobPunches[jid];
  const r=await sb.from("gvc_punches").select("who,task_id,task_name,start_at,end_at").eq("job_id",jid).order("start_at");
  return (jobPunches[jid]=r.data||[]);
}
const _draw=drawDlg;
drawDlg=function(){
  _draw();
  const D=$("#dlg"); const j=typeof job==="function"?job():null; if(!j||!D) return;
  // supplier block marked so crew mode can hide it (prices)
  D.querySelectorAll(".sec").forEach(s=>{ if(/^Suppliers/.test((s.textContent||"").trim())){ s.classList.add("supsec"); let n=s.nextElementSibling; while(n&&!n.classList.contains("sec")&&n.tagName!=="DETAILS"){ n.classList.add("supsec"); n=n.nextElementSibling; } } });
  const rows=[...D.querySelectorAll("table.at tbody tr")];
  rows.forEach((tr,k)=>{ const a=(j.assemblies||[])[k]; if(!a||a.status==="done") return; const td=tr.querySelector("td"); if(!td) return;
    const on=open&&open.job_id===j.id&&open.task_id===a.id;
    const b=document.createElement("button"); b.type="button"; b.className="pnb"+(on?" on":""); b.textContent=on?"■ PUNCH OUT":"▶ PUNCH IN";
    b.onclick=e=>{ e.stopPropagation(); on?punchOut():punchIn(j.id,a.id); }; td.appendChild(b); });
  const tasks=D.querySelector("table.at")||D.querySelector("#newAsm");
  const box=document.createElement("div"); box.className="jtime"; box.innerHTML=`<div class="sec"><span>Time on this job</span></div><div class="tnote">Loading…</div>`;
  const anchor=D.querySelector("#newAsm")||(tasks&&tasks.closest(".atw")); if(anchor) anchor.after(box); else return;
  punchesFor(j.id).then(P=>{
    if(!D.contains(box)) return;
    const now=Date.now(); const by={};
    P.forEach(p=>{ const k=p.task_id||"-"; const o=by[k]=by[k]||{name:p.task_name,ms:0,who:{}}; const ms=(p.end_at?new Date(p.end_at):now)-new Date(p.start_at); o.ms+=ms; o.who[p.who]=(o.who[p.who]||0)+ms; });
    const plan=(window.gvcPlan&&gvcPlan.get&&gvcPlan.get())||{}; const H=plan.hours||{};
    const ks=Object.keys(by);
    if(!ks.length){ box.innerHTML=`<div class="sec"><span>Time on this job</span></div><div class="tnote">Nobody has punched in on this job yet. Tap ▶ PUNCH IN on a task to start the clock.</div>`; return; }
    let tot=0;
    box.innerHTML=`<div class="sec"><span>Time on this job</span></div><table><thead><tr><th>Task</th><th>Who</th><th>Actual</th><th>Planned</th></tr></thead><tbody>${ks.map(k=>{ const o=by[k]; tot+=o.ms;
      const a=(j.assemblies||[]).find(x=>x.id===k); const est=H[`j:${j.id}:${k}`]; const act=o.ms/36e5;
      return `<tr><td>${esc(a?a.name:o.name||"")}</td><td>${Object.entries(o.who).map(([w,ms])=>`${esc(w)} ${hrs(ms)}`).join(", ")}</td><td>${hrs(o.ms)}</td><td class="${est?act>est*1.15?"over":act<est*0.85&&a&&a.status==="done"?"under":"":""}">${est?est+"h":"-"}</td></tr>`; }).join("")}
      <tr><td><b>Total</b></td><td></td><td><b>${hrs(tot)}</b></td><td></td></tr></tbody></table>`;
  });
};

/* ---- crew: add my own work ---- */
function addMyWork(){
  if(preview()){ toast(PV); return; }
  const act=jobs.filter(j=>j.stage!=="done"&&!j.archived).sort((a,b)=>String(a.name).localeCompare(String(b.name),undefined,{numeric:true}));
  const ov=document.createElement("div"); ov.className="shov"; ov.innerHTML=`<div class="shsheet" role="dialog" aria-modal="true"><h3>I'M DOING SOMETHING ELSE</h3>
    <label>What are you doing<input id="mwWhat" placeholder="e.g. Grinding welds on the headache rack"></label>
    <label>Which job<select id="mwJob"><option value="">A new job (no job number yet)</option>${act.map(j=>`<option value="${esc(j.id)}">${esc(j.name)}</option>`).join("")}</select></label>
    <label>Who asked for it (optional)<input id="mwFrom" placeholder="e.g. Randy"></label>
    <label style="display:flex;gap:8px;align-items:center;margin-top:6px"><input type="checkbox" id="mwPunch" checked style="width:20px;height:20px"> Punch in on it now</label>
    <div class="tnote" id="mwMsg" style="margin:8px 0"></div>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" type="button" id="mwX">Cancel</button><button class="btn primary" type="button" id="mwGo" style="min-height:44px">Add it</button></div></div>`;
  document.body.appendChild(ov); requestAnimationFrame(()=>ov.classList.add("on"));
  const close=()=>{ ov.classList.remove("on"); setTimeout(()=>ov.remove(),260); };
  ov.onclick=e=>{ if(e.target===ov) close(); }; ov.querySelector("#mwX").onclick=close;
  ov.querySelector("#mwGo").onclick=async()=>{
    const what=ov.querySelector("#mwWhat").value.trim(), jid=ov.querySelector("#mwJob").value, from=ov.querySelector("#mwFrom").value.trim();
    if(!what){ ov.querySelector("#mwMsg").textContent="Say what you're doing."; return; }
    const now=new Date().toISOString(); const aid=uid(); let id=jid, name="";
    try{
      if(jid){ const j=structuredClone(jobs.find(x=>x.id===jid)); delete j.id; name=j.name;
        j.assemblies=[...(j.assemblies||[]),{id:aid,name:what,meta:`added by ${me()}`,status:"ready",who:me(),final:false}];
        j.log=[...(j.log||[]),{at:now,text:`${me()} added a task: ${what}${from?" (asked by "+from+")":""}`}];
        await saveJob(jid,j); }
      else { id=uid(); name=what;
        await saveJob(id,{name:what,folder:"",summary:`${me()} on it${from?" · from "+from:""} · no job # yet`,stage:"fab",from:from||me(),suppliers:[],order:Date.now(),
          assemblies:[{id:aid,name:what,meta:`added by ${me()}`,status:"ready",who:me(),final:false}],log:[{at:now,text:`Started by ${me()}${from?" - asked by "+from:""} - no job number yet`}]});
        if(!jobs.some(x=>x.id===id)) await loadJobs(); }
      if(isCrew()) await sb.from("gvc_todos").insert({text:`${me()} added: ${what}${jid?" on "+name:" (new job, no number)"}${from?" - asked by "+from:""}`,job_id:id,source:"crew",from_name:me()});
      close();
      if(ov.querySelector("#mwPunch").checked) await punchIn(id,aid); else toast("Added: "+what);
    }catch(e){ ov.querySelector("#mwMsg").textContent="Couldn't save: "+(e.message||e); }
  };
}
window.addMyWork=addMyWork;
function pickJob(title,fn){
  const act=jobs.filter(j=>j.stage!=="done"&&!j.archived);
  const ov=document.createElement("div"); ov.className="shov"; ov.innerHTML=`<div class="shsheet" role="dialog" aria-modal="true"><h3>${title}</h3>${act.map(j=>`<button class="add" type="button" data-pj="${esc(j.id)}" style="text-align:left;border-style:solid">${esc(j.name)}</button>`).join("")}</div>`;
  document.body.appendChild(ov); requestAnimationFrame(()=>ov.classList.add("on"));
  const close=()=>{ ov.classList.remove("on"); setTimeout(()=>ov.remove(),260); };
  ov.onclick=e=>{ if(e.target===ov) close(); };
  ov.querySelectorAll("[data-pj]").forEach(b=>b.onclick=()=>{ close(); fn(b.dataset.pj); });
}
/* pick any task on an active job to punch into (my tasks first) */
function pickTask(){
  const mine=[], other=[];
  jobs.filter(j=>j.stage!=="done"&&!j.archived).forEach(j=>(j.assemblies||[]).forEach(a=>{ if(a.status==="done") return;
    (String(a.who||"").split(",").map(x=>x.trim()).includes(me())?mine:other).push({j,a}); }));
  const item=x=>`<button class="add" type="button" data-pt="${esc(x.j.id)}|${esc(x.a.id)}" style="text-align:left;border-style:solid"><b>${esc(x.a.name)}</b><span style="display:block;color:var(--muted);font-size:12px">${esc(x.j.name)}${x.a.who?" · "+esc(x.a.who):""}</span></button>`;
  const ov=document.createElement("div"); ov.className="shov"; ov.innerHTML=`<div class="shsheet" role="dialog" aria-modal="true" style="max-height:80vh;overflow:auto"><h3>PUNCH IN ON…</h3>
    ${mine.length?`<div class="tnote" style="margin:4px 0">YOUR TASKS</div>${mine.map(item).join("")}`:""}
    ${other.length?`<div class="tnote" style="margin:10px 0 4px">EVERYTHING ELSE</div>${other.map(item).join("")}`:""}
    ${!mine.length&&!other.length?`<div class="tnote">No open tasks on any job.</div>`:""}
    ${isCrew()?`<button class="add" type="button" data-pw="1">+ It's not on the list - I'm doing something else</button>`:""}</div>`;
  document.body.appendChild(ov); requestAnimationFrame(()=>ov.classList.add("on"));
  const close=()=>{ ov.classList.remove("on"); setTimeout(()=>ov.remove(),260); };
  ov.onclick=e=>{ if(e.target===ov) close(); };
  ov.querySelectorAll("[data-pt]").forEach(b=>b.onclick=()=>{ close(); const [j,a]=b.dataset.pt.split("|"); punchIn(j,a); });
  ov.querySelectorAll("[data-pw]").forEach(b=>b.onclick=()=>{ close(); addMyWork(); });
}
window.pickTask=pickTask;
/* Kyle can look at the app the way Colton sees it (nothing saved while previewing) */
const pvBar=document.createElement("div"); pvBar.style.cssText="position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:1200;background:#9085e9;color:#0b0b14;font:600 13px Oswald,sans-serif;letter-spacing:.08em;padding:6px 8px 6px 14px;border-radius:0 0 12px 12px;display:none;align-items:center;gap:10px;box-shadow:0 6px 18px rgba(0,0,0,.5)";
pvBar.innerHTML=`👁 CREW PREVIEW · WHAT COLTON SEES <button type="button" style="border:none;border-radius:8px;background:#0b0b14;color:#fff;font:600 12px Oswald,sans-serif;letter-spacing:.08em;padding:5px 10px;cursor:pointer">EXIT</button>`;
document.body.appendChild(pvBar);
let realMe=null, realOpen=null;
window.crewPreview=on=>{
  if(on){ if(window.ME&&ME.preview) return; realMe=window.ME; realOpen=open; window.ME={name:"Colton",role:"crew",preview:true}; open=null; pvBar.style.display="flex"; }
  else { if(!(window.ME&&ME.preview)) return; window.ME=realMe; open=realOpen; pvBar.style.display="none"; }
  document.body.classList.toggle("crew",!!(window.ME&&ME.role==="crew"));
  paint(); shellGo("home");
  if(!on) load();
};
pvBar.querySelector("button").onclick=()=>window.crewPreview(false);
window.crewAct=k=>{
  if(k==="punch"){ pickTask(); return true; }
  if(k==="mywork"){ addMyWork(); return true; }
  if(k==="ncr"){ pickJob("PROBLEM ON WHICH JOB?",id=>{ openJob(id); setTimeout(()=>{ const b=$("#ncrAdd"); if(b) b.click(); },150); }); return true; }
  if(k==="rev"){ pickJob("REVISION FOR WHICH JOB?",id=>{ if(window.newRevision) window.newRevision({job:id}); }); return true; }
  return false;
};

/* ---- crew mode guard: only the views a crew member uses ---- */
const CREW_VIEWS=["home","build","archive","crew","ncr","revs","inv"];
const _render=render;
render=function(){
  if(isCrew()&&!CREW_VIEWS.includes(cur)) cur="home";
  _render();
  if(!bar.hidden&&open){ const c=$("#pClk"); if(c) c.textContent=hm(Date.now()-new Date(open.start_at)); }
};
// pick up the clock once signed in, and when another device punches
let started=false;
setInterval(()=>{ if(!started&&typeof db!=="undefined"&&db){ started=true; load();
  try{ sb.channel("gvc_punches").on("postgres_changes",{event:"*",schema:"public",table:"gvc_punches"},p=>{ const r=p.new||p.old||{}; if(r.job_id) delete jobPunches[r.job_id]; if(r.who===me()) load(); }).subscribe(); }catch(e){} } },1000);
})();
