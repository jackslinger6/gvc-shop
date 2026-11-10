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
// unpaid breaks - coffee 10:00-10:15, lunch 12:00-12:30, coffee 3:00-3:15 (day 8-5). Punched time over these doesn't count (Kyle, 2026-11-05)
window.GVC_BREAKS=[[10,0,10,15],[12,0,12,30],[15,0,15,15]];
window.paidMs=(a,b)=>{ a=+new Date(a); b=b==null?Date.now():+new Date(b); if(!(b>a)) return 0; let ms=b-a;
  const d=new Date(a); d.setHours(0,0,0,0);
  for(;+d<b;d.setDate(d.getDate()+1)) for(const [h1,m1,h2,m2] of window.GVC_BREAKS){
    const s=new Date(d); s.setHours(h1,m1,0,0); const e=new Date(d); e.setHours(h2,m2,0,0);
    ms-=Math.max(0,Math.min(b,+e)-Math.max(a,+s)); }
  return ms; };
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
.mday .jrow .nm b{display:flex;align-items:center;gap:8px;font-size:16px}
.mday .jb{font:600 12.5px Oswald,sans-serif;letter-spacing:.06em;color:#111;border-radius:5px;padding:1px 7px;flex:none}
.mday .tchips{grid-column:2/-1;display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}
.mday .tchip{font:500 12.5px Inter,sans-serif;color:var(--text);background:color-mix(in srgb,var(--c) 14%,transparent);border:1px solid color-mix(in srgb,var(--c) 55%,transparent);border-radius:99px;padding:4px 10px;cursor:pointer}
.mday .tchip.dn{opacity:.5;text-decoration:line-through;cursor:default}.mday .tchip.live{box-shadow:0 0 0 2px #3ad06b}
@media (max-width:600px){ .mday .tchips{grid-column:1/-1} }
.splt{display:grid;gap:6px}.spr{display:grid;grid-template-columns:minmax(0,1fr) 84px auto;gap:10px;align-items:center;border:1px solid var(--line);border-left:4px solid var(--c);border-radius:10px;padding:8px 10px}
.spr.dn{opacity:.6}.spr .sn b{display:block;font-size:14px}.spr .sn small{display:block;font-size:11.5px;color:var(--muted)}
.spr select{font-size:16px;min-height:42px;margin:0}.spr .sfin{display:flex;gap:6px;align-items:center;margin:0;font-size:13px;white-space:nowrap}.spr .sfin input{width:20px;height:20px;margin:0}
.pkh{font:600 11.5px Oswald,sans-serif;letter-spacing:.16em;color:#ffb36b;margin:12px 2px 6px}
.pkt{display:block;width:100%;text-align:left;border:1px solid #2a2e34;border-left:4px solid var(--c);border-radius:12px;padding:10px 12px;margin-bottom:6px;cursor:pointer;
  background:linear-gradient(90deg,color-mix(in srgb,var(--c) 12%,#17191d),#15171a 60%);color:var(--text);font:inherit}
.pkt b{display:block;font-size:14.5px;font-weight:600}.pkt small{display:block;color:var(--muted);font-size:12px;margin-top:2px}
.pkt.on{border-color:#3ad06b;box-shadow:0 0 0 1px #3ad06b inset}.pkt:active{transform:scale(.99)}
.mday .pdn{font-size:12px!important;padding:0 10px!important}
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
/* crew: no Jobs tab (All jobs is on Home), week plan / lanes are look-only, no assigning people, no adding/removing tasks on jobs */
body.crew .shnav [data-n="jobs"],body.crew #pTA,body.crew #pTS,body.crew [data-off],body.crew [data-pck],body.crew #pPanel,body.crew .wkv .pool,
body.crew #dlg [data-rmasm],body.crew #dlg #addAsm,body.crew #dlg #newAsm,body.crew [data-wc]{display:none!important}
body.crew .lanes select{pointer-events:none;opacity:.8}
body.crew .crewhide,body.crew .palert{display:none!important}
body.parts .pbar{display:none!important}
body.crew #app .bar,body.crew #subnav{display:none!important}
body.crew .wkv .pblk,body.crew .wkv .pjob{cursor:default!important}
@media (max-width:899px){ body.crew .shnav{grid-template-columns:repeat(4,1fr)!important} }
`;
document.head.appendChild(st);
const toast=m=>{ if(typeof todoToast==="function"){ todoToast(m,null); const u=document.getElementById("toastUndo"); if(u) u.style.display="none"; } };
const me=()=>(window.ME&&ME.name)||"Kyle";
const isCrew=()=>!!(window.ME&&(ME.role==="crew"||ME.role==="parts"));   // crew + parts (Robin): own tasks only, no office boards
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
  bar.innerHTML=`<i class="dot"></i><div class="t"><b>${esc(open.task_name||open.job_name||"On the clock")}</b><small>${open.task_name?esc(open.job_name||""):"whole job - split it over the tasks when you punch out"}</small></div><span class="clk" id="pClk" title="Fix the start time" style="cursor:pointer">${hm(paidMs(open.start_at))}</span><button type="button" id="pFix" title="Forgot to punch in on time? Fix the start" style="background:rgba(255,255,255,.1);color:#e9e6e1;padding:8px 9px">✎</button><button type="button" id="pOut">PUNCH OUT</button>`;
  bar.querySelector("#pFix").onclick=e=>{ e.stopPropagation(); fixStartSheet(); };
  bar.querySelector("#pClk").onclick=e=>{ e.stopPropagation(); fixStartSheet(); };
  bar.querySelector("#pOut").onclick=()=>punchOut();
  bar.querySelector(".t").onclick=()=>{ if(open.job_id&&jobs.some(j=>j.id===open.job_id)) openJob(open.job_id); };
  tick=setInterval(()=>{ const c=$("#pClk"); if(c&&open) c.textContent=hm(paidMs(open.start_at)); },1000);
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
async function punchIn(jid,aid,startAt){
  if(preview()){ toast(PV); return; }
  const j=jobs.find(x=>x.id===jid); const a=j&&(j.assemblies||[]).find(x=>x.id===aid); if(!a) return;
  const r=await sb.rpc("gvc_punch_in",{p_who:me(),p_job:jid,p_task:aid,p_job_name:j.name,p_task_name:a.name});
  if(r.error){ toast("Couldn't punch in: "+r.error.message); return; }
  if(startAt){ await load(); if(open&&!(await moveStart(startAt,true))) startAt=null; }
  const who=String(a.who||"").split(",").map(s=>s.trim()).filter(Boolean);
  if(["ready","bend"].includes(a.status)||!who.includes(me()))
    await setTask(jid,aid,x=>{ if(x.status==="ready") x.status="prog"; if(!who.includes(me())) x.who=[...who,me()].join(", "); },`${me()} punched in on ${a.name}`);
  delete jobPunches[jid]; await load(); toast(`On the clock: ${a.name}${startAt?" since "+clk12(startAt):""}`);
}
/* Punch in on the JOB, not a task (Kyle, Nov 8) - at punch out you split the time over the tasks you did */
async function punchJob(jid,startAt){
  if(preview()){ toast(PV); return; }
  const j=jobs.find(x=>x.id===jid); if(!j) return;
  const r=await sb.rpc("gvc_punch_in",{p_who:me(),p_job:jid,p_task:null,p_job_name:j.name,p_task_name:null});
  if(r.error){ toast("Couldn't punch in: "+r.error.message); return; }
  if(startAt){ await load(); if(open&&!(await moveStart(startAt,true))) startAt=null; }
  delete jobPunches[jid]; await load(); toast(`On the clock: ${j.name}${startAt?" since "+clk12(startAt):""}`);
}
window.punchJob=punchJob;
/* forgot to punch in on time (Colton, Nov 6): move the start of the running punch back; the entry before it gets shortened to match */
const clk12=t=>new Date(t).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"}).replace(" ","").toLowerCase();
async function moveStart(t,quiet){
  if(!open) return false;
  const sa=new Date(t); if(sa>new Date()){ toast("That start time is in the future."); return false; }
  const fit=window.gvcFitPunch?await window.gvcFitPunch(sa,null,open.id):{changes:[]};
  if(fit.block){ toast("Couldn't move the start: "+fit.block); return false; }
  if(fit.changes.length&&!quiet&&!confirm("This runs into other time:\n\n"+fit.changes.map(c=>"• "+c.label).join("\n")+"\n\nShorten it to fit?")) return false;
  if(window.gvcApplyFit&&!(await window.gvcApplyFit(fit))) return false;
  const r=await sb.from("gvc_punches").update({start_at:sa.toISOString(),edited_at:new Date().toISOString()}).eq("id",open.id);
  if(r.error){ toast("Couldn't move the start: "+r.error.message); return false; }
  delete jobPunches[open.job_id]; return true;
}
/* quarter-hour start choices for today, newest first: "Now", then 15-minute steps back to 6:00 */
function startOpts(){
  const n=new Date(), x=new Date(n); x.setSeconds(0,0); x.setMinutes(Math.floor(x.getMinutes()/15)*15);
  const o=[]; const z=new Date(n); z.setHours(6,0,0,0);
  for(let t=new Date(x);t>=z&&o.length<64;t=new Date(t.getTime()-9e5)) o.push(t.toISOString());
  return o;
}
function fixStartSheet(){
  if(preview()){ toast(PV); return; }
  if(!open) return;
  const st0=new Date(open.start_at); const opts=startOpts().filter(t=>new Date(t)<new Date());
  const ov=document.createElement("div"); ov.className="shov"; ov.innerHTML=`<div class="shsheet" role="dialog" aria-modal="true"><h3>WHEN DID YOU START?</h3>
    <div class="tnote" style="margin:-4px 0 10px">${esc(open.task_name||"")} · punched in at ${clk12(st0)}. Forgot to punch in on time? Pick when you really started.</div>
    <label>Started at<select id="fsT" style="font-size:16px;min-height:48px">${opts.map(t=>`<option value="${t}">${clk12(t)}</option>`).join("")}</select></label>
    <div class="tnote" id="fsMsg" style="margin:8px 0"></div>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" type="button" id="fsX">Cancel</button><button class="btn primary" type="button" id="fsGo" style="min-height:44px">Save</button></div></div>`;
  document.body.appendChild(ov); requestAnimationFrame(()=>ov.classList.add("on"));
  const sel=ov.querySelector("#fsT"); const best=opts.reduce((b,t)=>Math.abs(new Date(t)-st0)<Math.abs(new Date(b)-st0)?t:b,opts[0]); if(best) sel.value=best;
  const close=()=>{ ov.classList.remove("on"); setTimeout(()=>ov.remove(),260); };
  ov.onclick=e=>{ if(e.target===ov) close(); }; ov.querySelector("#fsX").onclick=close;
  ov.querySelector("#fsGo").onclick=async()=>{ if(await moveStart(sel.value)){ close(); await load(); toast("Start time fixed: "+clk12(sel.value)); } };
}
window.punchFixStart=fixStartSheet;
async function punchOut(skipSplit){
  if(preview()){ toast(PV); return; }
  const was=open;
  if(!skipSplit&&was&&was.job_id&&!was.task_id){ const j=jobs.find(x=>x.id===was.job_id); if(j&&(j.assemblies||[]).length) return splitSheet(was,j); } const r=await sb.rpc("gvc_punch_out",{p_who:me()});
  if(r.error){ toast("Couldn't punch out: "+r.error.message); return; }
  if(was) delete jobPunches[was.job_id];
  open=null; paint(); if(was) toast(`Punched out - ${hrs(paidMs(was.start_at))} on ${was.task_name}`);
  render();
}

/* "What did you do?" - after a whole-job punch, put hours on each task (quarter hours). The punch gets cut into one
   entry per task, back to back from the start, so the job's TIME table shows hours per task. Anything left over stays on the job. */
function splitSheet(was,j){
  const end=new Date(), tot=paidMs(was.start_at,end), totH=Math.round(tot/36e5*4)/4;
  const T=(j.assemblies||[]).slice().sort((a,b)=>(a.status==="done")-(b.status==="done")||(whoList(b).includes(me()))-(whoList(a).includes(me())));
  const opts=h=>{ let o=""; for(let x=0;x<=Math.max(totH,0.25)+1e-9;x+=0.25) o+=`<option value="${x}" ${Math.abs(x-h)<1e-9?"selected":""}>${x?(x+"h").replace(/^0\./,"."):"-"}</option>`; return o; };
  const ov=document.createElement("div"); ov.className="shov"; ov.innerHTML=`<div class="shsheet" role="dialog" aria-modal="true" style="max-height:85vh;overflow:auto"><h3>WHAT DID YOU DO?</h3>
    <div class="tnote" style="margin:-4px 0 10px"><b style="color:var(--text)">${esc(j.name)}</b> · on the clock ${totH}h (${clk12(was.start_at)}–${clk12(end)}). Put the hours on the tasks you worked on. Tick the ones you finished.</div>
    <div class="splt">${T.map(a=>`<div class="spr ${a.status==="done"?"dn":""}" style="--c:${window.jobColor?window.jobColor(j.id):"#8e96a3"}"><div class="sn"><b>${esc(a.name)}</b><small>${a.status==="done"?"done":esc(whoList(a).join(", ")||"nobody on it")}</small></div>
      <select data-sh="${esc(a.id)}">${opts(T.length===1?totH:0)}</select>
      <label class="sfin"><input type="checkbox" data-sf="${esc(a.id)}" ${a.status==="done"?"checked disabled":""}> Finished</label></div>`).join("")}</div>
    <div class="tnote" id="spLeft" style="margin:10px 0"></div>
    <div class="row" style="justify-content:flex-end;gap:8px;flex-wrap:wrap"><button class="btn" type="button" id="spX">Keep working</button><button class="btn" type="button" id="spSkip">Punch out - split later</button><button class="btn primary" type="button" id="spGo" style="min-height:44px">Punch out</button></div></div>`;
  document.body.appendChild(ov); requestAnimationFrame(()=>ov.classList.add("on"));
  const close=()=>{ ov.classList.remove("on"); setTimeout(()=>ov.remove(),260); };
  ov.onclick=e=>{ if(e.target===ov) close(); }; ov.querySelector("#spX").onclick=close;
  const sum=()=>[...ov.querySelectorAll("[data-sh]")].reduce((a,x)=>a+(+x.value||0),0);
  const upd=()=>{ const u=sum(), left=totH-u; ov.querySelector("#spLeft").innerHTML=u>totH+1e-9?`<span style="color:#ff9b91">That's ${u}h - more than the ${totH}h you were on the clock.</span>`:left>0?`${left}h not put on a task - it stays on the job.`:`All ${totH}h put on tasks.`; };
  ov.querySelectorAll("[data-sh]").forEach(x=>x.onchange=upd); upd();
  ov.querySelector("#spSkip").onclick=async()=>{ close(); await punchOut(true); };
  ov.querySelector("#spGo").onclick=async()=>{
    if(sum()>totH+1e-9){ toast("More hours than you were on the clock."); return; }
    const parts=[...ov.querySelectorAll("[data-sh]")].map(x=>({a:T.find(t=>t.id===x.dataset.sh),h:+x.value||0})).filter(x=>x.h>0);
    const fin=[...ov.querySelectorAll("[data-sf]:checked:not(:disabled)")].map(x=>x.dataset.sf);
    close(); await punchOut(true);
    const r=await sb.from("gvc_punches").select("*").eq("id",was.id).maybeSingle(); const P=r.data; if(!P||!P.end_at) return;
    // walk forward from the start: each task gets its paid hours, breaks skipped like the clock does
    const pe=new Date(P.end_at); let c=new Date(P.start_at); const seg=[];
    const adv=(from,ms)=>{ let lo=+from, hi=+pe; if(paidMs(from,pe)<=ms) return pe; for(let i=0;i<40;i++){ const m=(lo+hi)/2; if(paidMs(from,new Date(m))<ms) lo=m; else hi=m; } return new Date(hi); };
    parts.forEach(x=>{ const e=adv(c,x.h*36e5); if(e>c){ seg.push({a:x.a,s:c,e}); c=e; } });
    if(pe-c>60e3) seg.push({a:null,s:c,e:pe}); else if(seg.length) seg[seg.length-1].e=pe;
    if(!seg.length) return;
    const row=x=>({task_id:x.a?x.a.id:null,task_name:x.a?x.a.name:null,start_at:x.s.toISOString(),end_at:x.e.toISOString(),edited_at:new Date().toISOString()});
    const u=await sb.from("gvc_punches").update(row(seg[0])).eq("id",P.id);
    if(u.error){ toast("Couldn't split the time: "+u.error.message); return; }
    if(seg.length>1){ const ins=await sb.from("gvc_punches").insert(seg.slice(1).map(x=>({who:P.who,job_id:P.job_id,job_name:P.job_name,...row(x),note:"split from a whole-job punch"})));
      if(ins.error) toast("Couldn't save all of the split: "+ins.error.message); }
    for(const aid of fin) await setTask(j.id,aid,x=>{ x.status="done"; },`${(T.find(t=>t.id===aid)||{}).name||"Task"}: Done (${me()})`);
    delete jobPunches[j.id]; render();
    toast(`Saved ${parts.map(x=>`${x.h}h ${x.a.name}`).join(", ")||"time on "+j.name}${fin.length?` · ${fin.length} finished`:""}`);
  };
}
async function doneTask(jid,aid){
  if(preview()){ toast(PV); return; }
  if(isCrew()){ const j0=jobs.find(x=>x.id===jid); const a0=j0&&(j0.assemblies||[]).find(x=>x.id===aid);
    if(a0&&!whoList(a0).includes(me())){ toast(`That's ${whoList(a0).join(", ")||"someone else"}'s task - tell Kyle with Talk if it's done.`); return; } }
  { const j0=jobs.find(x=>x.id===jid); const a0=j0&&(j0.assemblies||[]).find(x=>x.id===aid); if(!confirm(`Is "${a0?a0.name:"this task"}" finished?\n\nThis marks it Done for everyone. (To just switch to something else, punch in on the other task instead.)`)) return; }
  if(open&&open.job_id===jid&&open.task_id===aid) await punchOut();
  const j=jobs.find(x=>x.id===jid); const a=j&&(j.assemblies||[]).find(x=>x.id===aid);
  await setTask(jid,aid,x=>{ x.status="done"; },`${a?a.name:"Task"}: Done (${me()})`);
  toast(`Done: ${a?a.name:""}`);
}
window.punchIn=punchIn; window.punchOut=punchOut;

/* ---- MY DAY: my tasks from the week plan (today, + next 2 work days for crew), plus tasks I'm on that aren't scheduled ---- */
function myTasks(){
  const out={days:[],other:[]}; const P=window.gvcPlan; const placed=new Set();
  let M=null,R=null; if(P&&P.loaded&&P.loaded()) try{ ({M,R}=P.mc()); }catch(e){}
  if(M){ const x=new Date(); x.setHours(0,0,0,0);
  for(let i=0;i<10&&out.days.length<(isCrew()?3:1);i++,x.setDate(x.getDate()+1)){
    const w=x.getDay(); if(i>0&&(w===0||w===6)) continue;
    const d=P.iso(x); const ks=(M.S[me()]||{})[d]||[];
    const rows=ks.map(k=>{ const t=M.T[k]; if(!t) return null; const bk=String(k).split("#")[0]; const m=bk.match(/^j:([^:]+):(.+)$/); placed.add(bk);
      const r=(R[me()]||{})[k]; return {t,jid:m?m[1]:"",aid:m?m[2]:"",time:r?P.clock(r.s)+"–"+P.clock(r.e):"",color:t.color||"#8e96a3"}; }).filter(Boolean);
    out.days.push({d,label:i===0?"TODAY":P.dlabel(d).toUpperCase(),rows});
  }
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
    <div class="bt">${dn||!a?"":on?`<button class="pout" type="button" data-pout="1">PUNCH OUT</button>`:`<button class="pin" type="button" data-pin="${esc(x.jid)}|${esc(x.aid)}">▶ PUNCH IN</button>`}${dn||!a?"":`<button class="pdn" type="button" data-pdn="${esc(x.jid)}|${esc(x.aid)}" title="Finished - mark this task done">✓ DONE</button>`}</div></div>`;
}
/* one row per JOB in its own colour (same as the week plan / All jobs), its tasks as chips under it (Kyle, Nov 8) */
function jobRows(rows){
  const out=[], by={};
  rows.forEach(x=>{ const j=x.jid&&jobs.find(y=>y.id===x.jid); if(!j){ out.push(rowHtml(x)); return; }
    if(!by[x.jid]){ by[x.jid]={j,rows:[],time:""}; out.push(by[x.jid]); } const g=by[x.jid]; if(!g.rows.some(r=>r.aid===x.aid)) g.rows.push(x); if(x.time&&!g.time) g.time=x.time; });
  return out.map(g=>typeof g==="string"?g:jobRowHtml(g)).join("");
}
function jobRowHtml(g){
  const j=g.j, c=window.jobColor?window.jobColor(j.id):"#8e96a3", on=open&&open.job_id===j.id;
  const num=window.jobNum?window.jobNum(j.name):""; const nm=num?String(j.name).replace(/^\s*\S+\s*[-–:]?\s*/,""):j.name;
  const chips=g.rows.map(x=>{ const a=(j.assemblies||[]).find(y=>y.id===x.aid); const dn=x.t.done||(a&&a.status==="done"); const live=on&&open.task_id===x.aid;
    return `<button type="button" class="tchip ${dn?"dn":""} ${live?"live":""}" ${a&&!dn?`data-pdn="${esc(j.id)}|${esc(x.aid)}" title="Tap when it's finished"`:""}>${dn?"✓ ":""}${esc(x.t.name)}</button>`; }).join("");
  return `<div class="row2 jrow ${on?"on":""}" style="--c:${c}"><span class="tm">${esc(g.time||"")}</span>
    <div class="nm" data-oj="${esc(j.id)}"><b>${num?`<span class="jb" style="background:${c}">${esc(num)}</span>`:""}${esc(nm)}</b>${on?`<small style="color:#7ff0a8">On the clock${open.task_name?" · "+esc(open.task_name):""}</small>`:""}</div>
    <div class="bt">${on?`<button class="pout" type="button" data-pout="1">PUNCH OUT</button>`:`<button class="pin" type="button" data-pjob="${esc(j.id)}">▶ PUNCH IN</button>`}</div>
    <div class="tchips">${chips}</div></div>`;
}
window.myDayHtml=()=>{
  const T=myTasks();
  return `<section class="mday" aria-label="My day"><h4><span>MY DAY · ${esc(me()).toUpperCase()}</span>${open?`<span style="color:#7ff0a8">ON THE CLOCK</span>`:`<span>NOT PUNCHED IN</span>`}</h4>
    ${T.days.map(d=>`${T.days.length>1?`<div class="dh">${d.label}</div>`:""}${jobRows(d.rows)||`<div class="none">Nothing planned${d.label==="TODAY"?" for you today":""}.</div>`}`).join("")}
    ${T.other.length?`<div class="dh">ALSO ON YOU</div>${jobRows(T.other)}`:""}
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="add" type="button" data-pick="1" style="flex:1;border-style:solid;border-color:rgba(58,208,107,.5);color:#7ff0a8">▶ Punch in on a job…</button>${isCrew()?`<button class="add" type="button" data-addw="1" style="flex:1">+ I'm doing something else</button>`:`<button class="add" type="button" data-crewv="1" style="flex:0 0 auto;width:auto;padding:10px 14px">👁 See Colton's view</button>`}</div></section>`;
};
window.myDayWire=root=>{
  root.querySelectorAll("[data-pin]").forEach(b=>b.onclick=()=>{ const [j,a]=b.dataset.pin.split("|"); punchIn(j,a); });
  root.querySelectorAll("[data-pout]").forEach(b=>b.onclick=()=>punchOut());
  root.querySelectorAll("[data-pjob]").forEach(b=>b.onclick=()=>punchJob(b.dataset.pjob));
  root.querySelectorAll("[data-pdn]").forEach(b=>b.onclick=()=>{ const [j,a]=b.dataset.pdn.split("|"); doneTask(j,a); });
  root.querySelectorAll("[data-oj]").forEach(b=>b.onclick=()=>{ if(b.dataset.oj) openJob(b.dataset.oj); });
  root.querySelectorAll("[data-addw]").forEach(b=>b.onclick=()=>addMyWork());
  root.querySelectorAll("[data-pick]").forEach(b=>b.onclick=()=>pickTask());
  root.querySelectorAll("[data-crewv]").forEach(b=>b.onclick=()=>window.crewPreview(true));
};
/* ---- crew To do (Colton, Aaron): Home is their task list, the clock is on the Punch tab - same layout as Kyle (Nov 9) ---- */
window.myTodoHtml=()=>{
  const T=myTasks(); const seen=new Set(); let open=0;
  const row=x=>{ const j=x.jid&&jobs.find(y=>y.id===x.jid); const a=j&&(j.assemblies||[]).find(y=>y.id===x.aid); const k=x.jid+"|"+x.aid;
    if(seen.has(k)) return ""; seen.add(k);
    const dn=x.t.done||(a&&a.status==="done"); if(!dn) open++;
    const num=j&&window.jobNum?window.jobNum(j.name):""; const c=x.color||"#8e96a3";
    return `<div class="ti ctd ${dn?"dn":""}" style="--c:${c}"><button class="ck" type="button" ${a&&!dn?`data-pdn="${esc(x.jid)}|${esc(x.aid)}"`:"disabled"} title="${dn?"Done":"Mark done"}">${dn?"✓":""}</button><span class="bar"></span>
      <div class="body" ${j?`data-oj="${esc(j.id)}"`:""}><div class="tt">${esc(x.t.name)}</div><div class="meta">${num?`<span class="jb" style="background:${c}">${esc(num)}</span> `:""}${esc(j?String(j.name).replace(/^\s*\S+\s*[-–:]?\s*/,""):(x.t.job||""))}${x.time?" · "+esc(x.time):""}${a&&a.status==="prog"?" · in progress":""}</div></div></div>`; };
  const days=T.days.map(d=>{ const r=d.rows.map(row).join(""); return `<div class="dh">${d.label}</div>${r||`<div class="none">Nothing planned${d.label==="TODAY"?" for you today":""}.</div>`}`; }).join("");
  const other=T.other.map(row).join("");
  return `<section class="tbox mday ctodo" aria-label="To do"><h3>To do <span class="n">${open}</span></h3>${days}${other?`<div class="dh">ALSO ON YOU</div>${other}`:""}
    <button class="add" type="button" data-addw="1" style="margin-top:10px">+ I'm doing something else</button></section>`;
};
window.myTodoWire=root=>{
  root.querySelectorAll("[data-pdn]").forEach(b=>b.onclick=()=>{ const [j,a]=b.dataset.pdn.split("|"); doneTask(j,a); });
  root.querySelectorAll("[data-oj]").forEach(b=>b.onclick=()=>openJob(b.dataset.oj));
  root.querySelectorAll("[data-addw]").forEach(b=>b.onclick=()=>addMyWork());
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
    P.forEach(p=>{ const k=p.task_id||"-"; const o=by[k]=by[k]||{name:p.task_name,ms:0,who:{}}; const ms=paidMs(p.start_at,p.end_at||now); o.ms+=ms; o.who[p.who]=(o.who[p.who]||0)+ms; });
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
/* crew: "we need more wire" - goes on Kyle's To do (and marks the consumable as out/low if it's on the list) */
async function needSupplies(){
  let cons=[]; try{ const r=await sb.from("gvc_consumables").select("id,name,category,unit,qty,min_qty").order("category").order("name"); cons=r.data||[]; }catch(e){}
  const ov=document.createElement("div"); ov.className="shov"; ov.innerHTML=`<div class="shsheet" role="dialog" aria-modal="true" style="max-height:85vh;overflow:auto"><h3>NEED SUPPLIES</h3>
    <button class="btn primary" type="button" id="nsTalk" style="width:100%;min-height:52px;font:600 15px Oswald,sans-serif;letter-spacing:.1em;margin-bottom:10px">🎤 SAY IT TO CLAUDE</button>
    <div class="tnote" style="margin:-4px 0 10px">e.g. ".035 wire is running low, last spool on the Miller"</div>
    <label>or type it - what do we need<input id="nsWhat" placeholder="e.g. 0.035 wire, 4.5&quot; flap discs, argon"></label>
    ${cons.length?`<div class="tnote" style="margin:4px 0 6px">or tap one</div><div class="chips" id="nsChips" style="margin-bottom:10px">${cons.map(c=>`<button type="button" data-ns="${esc(c.id)}">${esc(c.name)}</button>`).join("")}</div>`:""}
    <label style="display:flex;gap:14px;align-items:center;margin:6px 0">${["Running low","Out"].map((t,i)=>`<span style="display:flex;gap:6px;align-items:center"><input type="radio" name="nsHow" value="${t}" ${i===0?"checked":""} style="width:18px;height:18px"> ${t}</span>`).join("")}</label>
    <label>Note (optional)<input id="nsNote" placeholder="e.g. last spool on the Miller"></label>
    <div class="tnote" id="nsMsg" style="margin:8px 0"></div>
    <div class="row" style="justify-content:flex-end;gap:8px"><button class="btn" type="button" id="nsX">Cancel</button><button class="btn primary" type="button" id="nsGo" style="min-height:44px">Tell Kyle</button></div></div>`;
  document.body.appendChild(ov); requestAnimationFrame(()=>ov.classList.add("on"));
  const close=()=>{ ov.classList.remove("on"); setTimeout(()=>ov.remove(),260); };
  ov.onclick=e=>{ if(e.target===ov) close(); }; ov.querySelector("#nsX").onclick=close;
  ov.querySelector("#nsTalk").onclick=()=>{ if(window.shellTalk) window.shellTalk("[Need supplies - put it on Kyle's To do with add_todo, say low or out, and if it's on the consumables list mark it:]",close); };
  let pick=null;
  ov.querySelectorAll("[data-ns]").forEach(b=>b.onclick=()=>{ pick=cons.find(c=>c.id===b.dataset.ns); ov.querySelector("#nsWhat").value=pick.name; ov.querySelectorAll("[data-ns]").forEach(x=>x.classList.toggle("on",x===b)); });
  ov.querySelector("#nsGo").onclick=async()=>{
    const what=ov.querySelector("#nsWhat").value.trim(); if(!what){ ov.querySelector("#nsMsg").textContent="Say what we need."; return; }
    if(preview()){ toast(PV); close(); return; }
    const how=(ov.querySelector("[name=nsHow]:checked")||{}).value||"Running low"; const note=ov.querySelector("#nsNote").value.trim();
    if(!pick||pick.name!==what) pick=cons.find(c=>c.name.toLowerCase()===what.toLowerCase())||null;
    try{
      await sb.from("gvc_todos").insert({text:`${how==="Out"?"OUT of":"Low on"} ${what}${note?" - "+note:""} (${me()})`,source:"crew",from_name:me()});
      if(pick&&how==="Out") await sb.from("gvc_consumables").update({qty:0,counted_at:new Date().toISOString()}).eq("id",pick.id);
      close(); toast(`Kyle's been told: ${how.toLowerCase()} on ${what}`);
    }catch(e){ ov.querySelector("#nsMsg").textContent="Couldn't send: "+(e.message||e); }
  };
}
window.needSupplies=needSupplies;
/* crew: tap a job on the week plan -> its tasks with Punch in / Done (the plan itself can't be changed) */
document.addEventListener("click",e=>{
  if(!isCrew()||cur!=="crew") return;
  const b=e.target.closest(".wkv .pblk,.wkv .pjob"); if(!b) return;
  e.stopPropagation(); e.preventDefault();
  const keys=[...new Set([...(b.dataset.ks||"").split(","),b.dataset.k||""].filter(Boolean).map(k=>String(k).split("#")[0]))];
  const list=keys.map(k=>{ const m=k.match(/^j:([^:]+):(.+)$/); if(!m) return null; const j=jobs.find(x=>x.id===m[1]); const a=j&&(j.assemblies||[]).find(x=>x.id===m[2]); return a?{j,a}:null; }).filter(Boolean);
  if(!list.length) return;
  const ov=document.createElement("div"); ov.className="shov"; ov.innerHTML=`<div class="shsheet" role="dialog" aria-modal="true"><h3>${esc(list[0].j.name)}</h3><section class="mday">
    ${list.map(x=>rowHtml({t:{name:x.a.name,job:x.a.who||"",done:x.a.status==="done"},jid:x.j.id,aid:x.a.id,time:"",color:window.jobColor?window.jobColor(x.j.id):"#8e96a3"})).join("")}</section>
    <div class="row" style="justify-content:space-between;gap:8px;margin-top:8px"><button class="btn" type="button" data-oj2="1">Open the job</button><button class="btn" type="button" data-x="1">Close</button></div></div>`;
  document.body.appendChild(ov); requestAnimationFrame(()=>ov.classList.add("on"));
  const close=()=>{ ov.classList.remove("on"); setTimeout(()=>ov.remove(),260); };
  ov.onclick=ev=>{ if(ev.target===ov) close(); };
  ov.querySelector("[data-x]").onclick=close; ov.querySelector("[data-oj2]").onclick=()=>{ close(); openJob(list[0].j.id); };
  ov.querySelectorAll("[data-pin]").forEach(x=>x.onclick=()=>{ close(); const [j,a]=x.dataset.pin.split("|"); punchIn(j,a); });
  ov.querySelectorAll("[data-pout]").forEach(x=>x.onclick=()=>{ close(); punchOut(); });
  ov.querySelectorAll("[data-pdn]").forEach(x=>x.onclick=()=>{ close(); const [j,a]=x.dataset.pdn.split("|"); doneTask(j,a); });
},true);
function pickJob(title,fn){
  const act=jobs.filter(j=>j.stage!=="done"&&!j.archived);
  const ov=document.createElement("div"); ov.className="shov"; ov.innerHTML=`<div class="shsheet" role="dialog" aria-modal="true"><h3>${title}</h3>${act.map(j=>`<button class="add" type="button" data-pj="${esc(j.id)}" style="text-align:left;border-style:solid">${esc(j.name)}</button>`).join("")}</div>`;
  document.body.appendChild(ov); requestAnimationFrame(()=>ov.classList.add("on"));
  const close=()=>{ ov.classList.remove("on"); setTimeout(()=>ov.remove(),260); };
  ov.onclick=e=>{ if(e.target===ov) close(); };
  ov.querySelectorAll("[data-pj]").forEach(b=>b.onclick=()=>{ close(); fn(b.dataset.pj); });
}
/* pick a JOB to punch into (jobs I'm on first) - tasks get their hours when you punch out (Kyle, Nov 8) */
function pickTask(){
  const act=jobs.filter(j=>j.stage!=="done"&&!j.archived);
  const minej=act.filter(j=>(j.assemblies||[]).some(a=>a.status!=="done"&&whoList(a).includes(me()))), other=act.filter(j=>!minej.includes(j));
  const item=j=>{ const on=open&&open.job_id===j.id; const c=window.jobColor?window.jobColor(j.id):"#8e96a3"; const t=(j.assemblies||[]).filter(a=>a.status!=="done");
    return `<button class="pkt ${on?"on":""}" type="button" data-pj="${esc(j.id)}" style="--c:${c}"><b>${esc(j.name)}</b><small>${t.length?esc(t.slice(0,4).map(a=>a.name).join(" · "))+(t.length>4?` +${t.length-4} more`:""):"no open tasks"}${on?" · ON THE CLOCK":""}</small></button>`; };
  const ov=document.createElement("div"); ov.className="shov"; ov.innerHTML=`<div class="shsheet" role="dialog" aria-modal="true" style="max-height:80vh;overflow:auto"><h3>PUNCH IN ON…</h3>
    <div class="tnote" style="margin:-4px 0 10px">Pick the job. When you punch out you say how long you spent on each task.</div>
    <label style="display:flex;gap:10px;align-items:center;margin:0 0 10px">Started<select id="ptStart" style="flex:1;font-size:16px;min-height:44px"><option value="">Now</option>${startOpts().filter(t=>new Date(t)<Date.now()-5*60e3).map(t=>`<option value="${t}">${clk12(t)} - forgot to punch in</option>`).join("")}</select></label>
    ${minej.length?`<div class="pkh">YOUR JOBS</div>${minej.map(item).join("")}`:""}
    ${other.length?`<div class="pkh">OTHER JOBS</div>${other.map(item).join("")}`:""}
    ${!act.length?`<div class="tnote">No open jobs.</div>`:""}
    ${isCrew()?`<button class="pkt" type="button" data-pw="1" style="--c:#3a3e45;margin-top:8px;border-style:dashed;text-align:center"><b>+ It's not on the list - I'm doing something else</b></button>`:""}</div>`;
  document.body.appendChild(ov); requestAnimationFrame(()=>ov.classList.add("on"));
  const close=()=>{ ov.classList.remove("on"); setTimeout(()=>ov.remove(),260); };
  ov.onclick=e=>{ if(e.target===ov) close(); };
  ov.querySelectorAll("[data-pj]").forEach(b=>b.onclick=()=>{ const t=(ov.querySelector("#ptStart")||{}).value||null; close(); punchJob(b.dataset.pj,t); });
  ov.querySelectorAll("[data-pw]").forEach(b=>b.onclick=()=>{ close(); addMyWork(); });
}
window.pickTask=pickTask;
/* Kyle can look at the app the way Colton sees it (nothing saved while previewing) */
const pvBar=document.createElement("div"); pvBar.style.cssText="position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:1200;background:#9085e9;color:#0b0b14;font:600 13px Oswald,sans-serif;letter-spacing:.08em;padding:6px 8px 6px 14px;border-radius:0 0 12px 12px;display:none;align-items:center;gap:10px;box-shadow:0 6px 18px rgba(0,0,0,.5)";
pvBar.innerHTML=`👁 CREW PREVIEW · WHAT COLTON SEES <button type="button" style="border:none;border-radius:8px;background:#0b0b14;color:#fff;font:600 12px Oswald,sans-serif;letter-spacing:.08em;padding:5px 10px;cursor:pointer">EXIT</button>`;
document.body.appendChild(pvBar);
let realMe=null, realOpen=null;
window.crewPreview=(on,who)=>{
  if(on){ if(window.ME&&ME.preview) return; realMe=window.ME; realOpen=open; who=who||"Colton";
    window.ME={name:who,role:who==="Robin"?"parts":"crew",preview:true}; open=null; pvBar.firstChild.textContent=`👁 PREVIEW · WHAT ${who.toUpperCase()} SEES `; pvBar.style.display="flex"; }
  else { if(!(window.ME&&ME.preview)) return; window.ME=realMe; open=realOpen; pvBar.style.display="none"; }
  document.body.classList.toggle("crew",!!(window.ME&&(ME.role==="crew"||ME.role==="parts")));
  document.body.classList.toggle("parts",!!(window.ME&&ME.role==="parts"));
  if(window.gvcTheme) gvcTheme.preview(!!(on&&window.ME&&ME.role==="parts"));
  paint(); shellGo("home");
  if(!on){ load(); window.teamReload&&window.teamReload(); }
};
pvBar.querySelector("button").onclick=()=>window.crewPreview(false);
window.crewAct=k=>{
  if(preview()&&["count","ncr","rev","chat","quick","todo","time","rec","sms","order"].includes(k)){ toast("Preview - nothing is saved. Exit the preview to do that."); return true; }
  if(k==="punch"){ pickTask(); return true; }
  if(k==="mywork"){ addMyWork(); return true; }
  if(k==="supplies"){ window.needSupplies(); return true; }
  if(k==="order"){ if(window.newRequest) window.newRequest(); return true; }
  if(k==="inv"){ shellGo("inv"); return true; }
  if(k==="msgs"){ if(window.openInbox) window.openInbox(); return true; }
  if(k==="requests"){ shellGo("requests"); return true; }
  if(k==="ncr"){ pickJob("PROBLEM ON WHICH JOB?",id=>{ openJob(id); setTimeout(()=>{ const b=$("#ncrAdd"); if(b) b.click(); },150); }); return true; }
  if(k==="rev"){ pickJob("REVISION FOR WHICH JOB?",id=>{ if(window.newRevision) window.newRevision({job:id}); }); return true; }
  return false;
};

/* ---- crew mode guard: only the views a crew member uses ---- */
const CREW_VIEWS=["home","drawings","mytodo","punch","crewjobs","archive","crew","ncr","revs","inv","requests","staging","porders"];
const _render=render;
render=function(){
  if(isCrew()&&!CREW_VIEWS.includes(cur)) cur="home";
  _render();
  { const cb=document.getElementById("crewBar"); if(cb) cb.style.display=cur==="crew"?"":"none"; }
  if(!bar.hidden&&open){ const c=$("#pClk"); if(c) c.textContent=hm(paidMs(open.start_at)); }
};
// pick up the clock once signed in, and when another device punches
let started=false;
setInterval(()=>{ if(!started&&typeof db!=="undefined"&&db){ started=true; load();
  try{ sb.channel("gvc_punches").on("postgres_changes",{event:"*",schema:"public",table:"gvc_punches"},p=>{ const r=p.new||p.old||{}; if(r.job_id) delete jobPunches[r.job_id]; if(r.who===me()) load(); }).subscribe(); }catch(e){} } },1000);
})();
