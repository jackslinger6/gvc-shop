/* ---------- Today (usability pass, Nov 15) ----------
   One focused screen for whoever tracks time: replaces the crew's separate Home (task list) and Punch (clock) screens.
   Order on the page: what you're on now (timer, instructions, drawings, blockers, Stop timer / Switch task / Task done),
   then the next ready task, then the rest of today, blocked tasks, and coming days (only days that have something).
   Stopping the timer never finishes a task; Task done is its own button and still asks first (punch.js doneTask).
   Full time history stays on Time. Route: #today (old #punch and #mytodo links land here). */
(()=>{
const P=()=>window.gvcPunch;
const css=document.createElement("style");
css.textContent=`
.tdy{max-width:760px;display:flex;flex-direction:column;gap:14px}
.tdy h2{margin:0;padding:0;border:0;text-transform:none;background:none}.tdy .tdt{font:700 22px var(--font-ui,Inter,sans-serif);letter-spacing:0}
.tdy .tdsub{color:var(--muted);font-size:13px;margin-top:2px}
.tdy .now{border:1px solid var(--line);border-radius:16px;padding:16px;background:var(--panel2,#1a1d21)}
.tdy .now.on{border-color:rgba(58,208,107,.55);background:linear-gradient(180deg,rgba(58,208,107,.10),rgba(58,208,107,.02))}
.tdy .lab{font:700 11.5px var(--font-ui,Inter,sans-serif);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.tdy .now.on .lab{color:#7fe3a1}
.tdy .tn{font:700 20px/1.25 var(--font-ui,Inter,sans-serif);margin:6px 0 4px;word-break:break-word}
.tdy .jn{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:14px;flex-wrap:wrap}
.tdy .jb{font:700 12px var(--font-ui,Inter,sans-serif);color:#111;border-radius:6px;padding:2px 7px}
.tdy .clk{font:600 34px var(--font-display);letter-spacing:.04em;color:#7ff0a8;font-variant-numeric:tabular-nums;margin:10px 0 2px}
.tdy .since{font-size:13px;color:var(--muted)}
.tdy .ins{margin-top:12px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid var(--line);font-size:15px;line-height:1.45;white-space:pre-wrap}
.tdy .blk{margin-top:12px;padding:10px 12px;border-radius:10px;border:1px solid rgba(245,176,65,.55);background:rgba(245,176,65,.08);color:#ffd28a;font-size:14px}
.tdy .blk b{color:#ffd28a}
.tdy .links{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
.tdy .links .btn{min-height:44px}
.tdy .acts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px}
.tdy .acts button{min-height:56px;border-radius:12px;font:700 15px var(--font-ui,Inter,sans-serif);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;padding:6px 8px;cursor:pointer;border:1px solid var(--line);background:var(--panel3,#22262b);color:var(--text)}
.tdy .acts button small{font:500 11.5px var(--font-ui,Inter,sans-serif);color:var(--muted);text-align:center;line-height:1.25}
.tdy .acts .done{background:#3ad06b;border-color:#3ad06b;color:#0d1a12}.tdy .acts .done small{color:#174a2a}
.tdy .start{width:100%;min-height:56px;border:0;border-radius:12px;background:linear-gradient(180deg,#5be38a,#2fae5b);color:#0b1a10;font:700 17px var(--font-ui,Inter,sans-serif);cursor:pointer;margin-top:14px}
.tdy .start small{display:block;font-weight:500;font-size:13px;opacity:.85}
.tdy .sec .tdh{margin:4px 0 8px;font:700 15px var(--font-ui,Inter,sans-serif);display:flex;justify-content:space-between;align-items:baseline}
.tdy .sec .tdh span{font-weight:500;color:var(--muted);font-size:13px}
.tdy .tr{display:grid;grid-template-columns:4px 1fr auto;gap:12px;align-items:center;padding:10px 12px 10px 0;border:1px solid var(--line);border-radius:12px;margin-bottom:8px;background:var(--panel2,#1a1d21);overflow:hidden}
.tdy .tr .cb{align-self:stretch;background:var(--c,#8e96a3)}
.tdy .tr .tx{min-width:0;cursor:pointer;text-align:left;background:none;border:0;color:inherit;font:inherit;padding:0}
.tdy .tr .tx b{display:block;font-size:15.5px;line-height:1.3;word-break:break-word}
.tdy .tr .tx small{display:block;color:var(--muted);font-size:13px;margin-top:2px}
.tdy .tr .rb{display:flex;gap:6px;align-items:center}
.tdy .tr .rb button{min-height:44px;min-width:44px;border-radius:10px;border:1px solid var(--line);background:var(--panel3,#22262b);color:var(--text);font:600 14px var(--font-ui,Inter,sans-serif);padding:0 12px;cursor:pointer}
.tdy .tr .rb .go{background:linear-gradient(180deg,#5be38a,#2fae5b);border:0;color:#0b1a10}
.tdy .tr.bl{opacity:.85}
.tdy .why{color:#ffd28a!important}
.tdy details.sec>summary{list-style:none;cursor:pointer;min-height:44px;display:flex;align-items:center;justify-content:space-between;font:700 15px var(--font-ui,Inter,sans-serif)}
.tdy details.sec>summary::-webkit-details-marker{display:none}
.tdy details.sec>summary::after{content:"▸";color:var(--muted);transition:transform .15s}
.tdy details.sec[open]>summary::after{transform:rotate(90deg)}
.tdy .dh{font:600 12px var(--font-ui,Inter,sans-serif);color:var(--muted);letter-spacing:.06em;text-transform:uppercase;margin:10px 0 6px}
.tdy .foot{display:flex;gap:8px;flex-wrap:wrap}
.tdy .foot .btn{min-height:44px}
.tdy .tdlink{background:none;border:0;padding:0;color:inherit;font:inherit;text-align:left;cursor:pointer}
.tdy .tdlink:hover{text-decoration:underline}
.tdy .tdfix{background:none;border:0;color:var(--accent,#ff8a2a);font:600 13px var(--font-ui,Inter,sans-serif);text-decoration:underline;cursor:pointer;padding:4px 2px;min-height:32px}
.tdy .tdempty{color:var(--muted);font-size:14px;padding:4px 2px}
@media (max-width:600px){ .tdy .acts button{font-size:14px} .tdy .clk{font-size:30px} }
@media (prefers-reduced-motion:no-preference){ .tdy .now{transition:border-color .2s,background .2s} }
`;
document.head.appendChild(css);

const jobOf=id=>jobs.find(j=>j.id===id);
const taskOf=(j,aid)=>j&&(j.assemblies||[]).find(a=>a.id===aid);
const num=j=>j&&window.jobNum?window.jobNum(j.name):"";
const rest=j=>{ const n=num(j); return n?String(j.name).replace(/^\s*\S+\s*[-–:]?\s*/,""):j?j.name:""; };
const col=id=>window.jobColor?window.jobColor(id):"#8e96a3";
const clk12=t=>new Date(t).toLocaleTimeString([], {hour:"numeric",minute:"2-digit"});
let tick=null;

/* what's in the way of a task: the week plan's own reason (waiting on bending, parts not in, waits for the
   other tasks) and tasks it has to come after, plus an open NCR on it */
function blockers(jid,aid){
  const out=[]; const G=window.gvcPlan;
  try{ if(G&&G.loaded&&G.loaded()){ const {M}=G.mc(); const t=M.T[`j:${jid}:${aid}`];
    if(t){ if(t.why) out.push(t.why);
      (t.needs||[]).forEach(k=>{ const n=M.T[k]; if(n&&!n.done) out.push(`After: ${n.name}`); }); } } }catch(e){}
  const a=taskOf(jobOf(jid),aid); if(a&&a.ncr) out.push(`NCR-${String(a.ncr).padStart(3,"0")} on this task`);
  return [...new Set(out)];
}
function rows(){
  const T=P().myTasks(); const seen=new Set(), out=[];
  const add=(x,day)=>{ const k=x.jid+"|"+x.aid; if(!x.jid||!x.aid||seen.has(k)) return; const j=jobOf(x.jid), a=taskOf(j,x.aid);
    if(!a||a.status==="done"||x.t.done) return; seen.add(k); out.push({...x,j,a,day,why:blockers(x.jid,x.aid)}); };
  (T.days[0]?T.days[0].rows:[]).forEach(x=>add(x,"today"));
  T.other.forEach(x=>add(x,"today"));
  const later=T.days.slice(1).map(d=>({label:d.label,list:d.rows.map(x=>{ const before=out.length; add(x,d.label); return out.length>before?out[out.length-1]:null; }).filter(Boolean)})).filter(d=>d.list.length);
  return {today:out.filter(r=>r.day==="today"),later};
}
function drawBtn(j,label){ const n=num(j); if(!n||!window.openJobParts) return "";
  return `<button class="btn" type="button" data-tdw="${esc(j.id)}" aria-label="Drawings for ${esc(j.name)}">${label||"Drawings"}</button>`; }
function rowHtml(r,first){
  const blocked=r.why.length>0;
  return `<div class="tr ${blocked?"bl":""}" style="--c:${col(r.jid)}"><span class="cb"></span>
    <button class="tx" type="button" data-tdo="${esc(r.jid)}|${esc(r.aid)}"><b>${esc(r.a.name)}</b><small>${num(r.j)?esc(num(r.j))+" · ":""}${esc(rest(r.j))}${r.time?" · "+esc(r.time):""}</small>${blocked?`<small class="why">${esc(r.why.join(" · "))}</small>`:""}</button>
    <span class="rb">${num(r.j)?`<button type="button" data-tdw="${esc(r.jid)}" aria-label="Drawings for ${esc(r.a.name)}" title="Drawings">${dwIcon}</button>`:""}${blocked?"":`<button type="button" class="${first?"go":""}" data-tds="${esc(r.jid)}|${esc(r.aid)}" aria-label="Start work on ${esc(r.a.name)}">▶ Start</button>`}</span></div>`;
}
const dwIcon=`<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h5"/></svg>`;

function render(){
  const B=$("#board"); B.className="home"; B.style.gridTemplateColumns="";
  if(!P()){ B.innerHTML=`<div class="tnote">Loading…</div>`; return; }
  const o=P().open(); const R=rows();
  const curJ=o&&jobOf(o.job_id), curA=o&&o.task_id&&taskOf(curJ,o.task_id);
  const others=R.today.filter(r=>!(o&&r.jid===o.job_id&&r.aid===o.task_id));
  const ready=others.filter(r=>!r.why.length), blocked=others.filter(r=>r.why.length);
  const next=ready[0]||null;
  const d=new Date(); const dl=d.toLocaleDateString([], {weekday:"long",month:"short",day:"numeric"});
  let now;
  if(o){
    const why=curA?blockers(o.job_id,o.task_id):[];
    now=`<section class="now on" aria-labelledby="tdyNowT"><div class="lab">Working on</div>
      <div class="tn" id="tdyNowT">${curA?`<button type="button" class="tdlink" data-tdo="${esc(curJ.id)}|${esc(curA.id)}">${esc(curA.name)}</button>`:esc(o.task_name||(curJ?"Whole job":"On the clock"))}</div>
      <div class="jn">${curJ&&num(curJ)?`<span class="jb" style="background:${col(curJ.id)}">${esc(num(curJ))}</span>`:""}<span>${esc(curJ?rest(curJ):o.job_name||"")}</span></div>
      <div class="clk" id="tdyClk" aria-live="off">${P().hm(P().paidMs(o.start_at))}</div><div class="since">Timer running since ${clk12(o.start_at)} · <button class="tdfix" type="button" data-tdfix>Fix start time</button></div>
      ${curA&&curA.meta?`<div class="ins"><span class="lab" style="display:block;margin-bottom:4px">Instructions</span>${esc(curA.meta)}</div>`:""}
      ${why.length?`<div class="blk" role="note"><b>Blocked:</b> ${esc(why.join(" · "))}</div>`:""}
      <div class="links">${curJ?drawBtn(curJ,"Drawings for this job"):""}${curJ?`<button class="btn" type="button" data-tdo="${esc(curJ.id)}|${esc(curA?curA.id:"")}">${curA?"Task details":"Open job"}</button>`:""}</div>
      <div class="acts" role="group" aria-label="Timer and task">
        <button type="button" data-tdout><span>Stop timer</span><small>Clock stops. Task stays open.</small></button>
        <button type="button" data-tdsw><span>Switch task</span><small>Stop this, start another.</small></button>
        ${curA?`<button type="button" class="done" data-tddone="${esc(curJ.id)}|${esc(curA.id)}"><span>Task done</span><small>Finished for everyone.</small></button>`
          :`<button type="button" disabled title="You're on the whole job - no single task to finish"><span>Task done</span><small>On the whole job</small></button>`}
      </div></section>`;
  } else {
    now=`<section class="now" aria-labelledby="tdyNowT"><div class="lab">Not on the clock</div>
      ${next?`<div class="tn" id="tdyNowT"><button type="button" class="tdlink" data-tdo="${esc(next.jid)}|${esc(next.aid)}">${esc(next.a.name)}</button></div><div class="jn">${num(next.j)?`<span class="jb" style="background:${col(next.jid)}">${esc(num(next.j))}</span>`:""}<span>${esc(rest(next.j))}</span></div>
        ${next.a.meta?`<div class="ins"><span class="lab" style="display:block;margin-bottom:4px">Instructions</span>${esc(next.a.meta)}</div>`:""}
        <div class="links">${drawBtn(next.j,"Drawings for this job")}</div>
        <button class="start" type="button" data-tds="${esc(next.jid)}|${esc(next.aid)}">▶ Start work<small>Starts the timer on this task</small></button>
        <div class="foot" style="margin-top:8px"><button class="btn" type="button" data-tdpick>Pick a different job</button></div>`
      :`<div class="tn" id="tdyNowT">Nothing ready for you</div><div class="tdsub">${blocked.length?"Your tasks are waiting on something - see Blocked below.":"No tasks are on you today."}</div>
        <button class="start" type="button" data-tdpick>▶ Start work on a job…</button>`}
    </section>`;
  }
  const upNext=o?ready:ready.slice(1);
  B.innerHTML=`<div class="tdy shanim">
    <h2 class="tdt">Today</h2>
    ${now}
    <section class="sec" aria-labelledby="tdyNx"><h2 class="tdh" id="tdyNx">Next up <span>${upNext.length?upNext.length+" ready":""}</span></h2>
      ${upNext.length?upNext.map((r,i)=>rowHtml(r,o?false:i===0)).join(""):`<div class="tdempty">${o?"Nothing else ready today.":"Nothing else ready today."}</div>`}</section>
    ${blocked.length?`<section class="sec" aria-labelledby="tdyBl"><h2 class="tdh" id="tdyBl">Blocked <span>${blocked.length} waiting</span></h2>${blocked.map(r=>rowHtml(r,false)).join("")}</section>`:""}
    ${R.later.length?`<details class="sec"><summary>Coming up <span style="font-weight:500;color:var(--muted);font-size:13px;margin-left:auto;margin-right:8px">${R.later.reduce((a,d)=>a+d.list.length,0)} tasks</span></summary>${R.later.map(dd=>`<div class="dh">${esc(dd.label)}</div>${dd.list.map(r=>rowHtml(r,false)).join("")}`).join("")}</details>`:""}
    <div class="foot">${P().isCrew()?`<button class="btn" type="button" data-tdw2>+ I'm doing something else</button>`:""}<button class="btn" type="button" data-tdtime>My time history</button></div>
  </div>`;
  wire(B);
  clearInterval(tick);
  if(o) tick=setInterval(()=>{ const c=document.getElementById("tdyClk"); if(!c||cur!=="today"){ clearInterval(tick); return; } const oo=P().open(); if(oo) c.textContent=P().hm(P().paidMs(oo.start_at)); },1000);
}
function wire(B){
  const sp=s=>s.split("|");
  B.querySelectorAll("[data-tds]").forEach(b=>b.onclick=async()=>{ if(b.disabled) return; b.disabled=true; const [j,a]=sp(b.dataset.tds); await P().punchIn(j,a); render(); });
  B.querySelectorAll("[data-tdout]").forEach(b=>b.onclick=async()=>{ if(b.disabled) return; b.disabled=true; await P().punchOut(); if(cur==="today") render(); });
  B.querySelectorAll("[data-tddone]").forEach(b=>b.onclick=async()=>{ if(b.disabled) return; b.disabled=true; const [j,a]=sp(b.dataset.tddone); await P().doneTask(j,a); if(cur==="today") render(); });
  B.querySelectorAll("[data-tdsw]").forEach(b=>b.onclick=()=>switchSheet());
  B.querySelectorAll("[data-tdpick]").forEach(b=>b.onclick=()=>P().pickTask());
  B.querySelectorAll("[data-tdfix]").forEach(b=>b.onclick=()=>P().fixStart());
  B.querySelectorAll("[data-tdw2]").forEach(b=>b.onclick=()=>P().addMyWork());
  B.querySelectorAll("[data-tdtime]").forEach(b=>b.onclick=()=>shellGo("time"));
  B.querySelectorAll("[data-tdo]").forEach(b=>b.onclick=()=>{ const [j,a]=sp(b.dataset.tdo); if(a) taskDetail(j,a); else openJob(j); });
  B.querySelectorAll("[data-tdw]").forEach(b=>b.onclick=()=>{ const j=jobOf(b.dataset.tdw); if(j&&window.openJobParts){ if(window.jpFresh) window.jpFresh(); openJobParts(num(j),j.name,"today"); } });
}
/* Switch task: the clock moves to the task you pick (punching in on another task closes this one) */
function switchSheet(){
  const o=P().open(); const R=rows();
  const list=R.today.filter(r=>!(o&&r.jid===o.job_id&&r.aid===o.task_id));
  const html=`<h3>Switch to…</h3><div class="tnote" style="margin:-2px 0 10px">The timer moves to the task you pick. ${o&&o.task_name?esc(o.task_name)+" stays open (not done).":""}</div>
    ${list.length?list.map(r=>`<button class="add" type="button" data-sw="${esc(r.jid)}|${esc(r.aid)}" style="text-align:left;min-height:52px;display:block;width:100%;margin-bottom:6px"><b>${esc(r.a.name)}</b><span style="display:block;color:var(--muted);font-size:13px">${esc(num(r.j)||"")} ${esc(rest(r.j))}${r.why.length?" · "+esc(r.why.join(" · ")):""}</span></button>`).join(""):`<div class="tnote">No other tasks on you today.</div>`}
    <button class="add" type="button" data-swo style="width:100%;min-height:48px">Another job…</button>`;
  if(!window.gvcSheet) return P().pickTask();
  window.gvcSheet(html,(el,close)=>{
    el.querySelectorAll("[data-sw]").forEach(b=>b.onclick=async()=>{ close(); const [j,a]=b.dataset.sw.split("|"); await P().punchIn(j,a); if(cur==="today") render(); });
    el.querySelector("[data-swo]").onclick=()=>{ close(); P().pickTask(); };
  });
}
/* Focused task (usability review, Nov 15): tapping a task opens just that task - instructions, what's in the way,
   drawings, the timer actions and Report a problem. The whole job's task list is one tap away ("View all job tasks"). */
function taskDetail(jid,aid){
  const j=jobOf(jid), a=taskOf(j,aid); if(!a){ if(window.openJob) openJob(jid,"tasks"); return; }
  const o=P()&&P().open(), on=o&&o.job_id===jid&&o.task_id===aid;
  const why=blockers(jid,aid), st=(typeof AST!=="undefined"&&AST[a.status])||{t:a.status,c:"#8e96a3"};
  const who=String(a.who||"").split(",").map(x=>x.trim()).filter(Boolean);
  const mine=who.includes(P().me()), crew=P().isCrew();
  const html=`<div class="tdd">
    <div class="lab">Task</div><h2 class="tdh2">${esc(a.name)}</h2>
    <div class="jn">${num(j)?`<span class="jb" style="background:${col(j.id)}">${esc(num(j))}</span>`:""}<span>${esc(rest(j))}</span><span class="ostat" style="--c:${st.c}">${esc(st.t)}</span></div>
    <div class="tdw">${who.length?`On it: ${esc(who.join(", "))}`:"Nobody assigned yet"}</div>
    <div class="ins"><span class="lab" style="display:block;margin-bottom:4px">Instructions</span>${a.meta?esc(a.meta):`<span style="color:var(--muted)">No instructions written for this task.</span>`}</div>
    ${why.length?`<div class="blk" role="note"><b>Blocked:</b> ${esc(why.join(" · "))}</div>`:""}
    ${on?`<div class="clkl">Timer running · ${P().hm(P().paidMs(o.start_at))}</div>`:""}
    <div class="tdact">
      ${a.status==="done"?`<span class="lbl" style="color:#7fe3a1;font-weight:700">✓ Done</span>`
        :on?`<button class="btn" type="button" data-dout>Stop timer<small>Task stays open</small></button>${(!crew||mine)?`<button class="btn done" type="button" data-ddone>Task done<small>Finished for everyone</small></button>`:""}`
        :`<button class="btn primary" type="button" data-dstart ${why.length?"":""}>▶ Start work${why.length?"<small>It's marked blocked - start anyway</small>":"<small>Starts the timer on this task</small>"}</button>${(!crew||mine)?`<button class="btn" type="button" data-ddone>Task done<small>Finished for everyone</small></button>`:""}`}
    </div>
    <div class="tdlinks">${num(j)&&window.openJobParts?`<button class="btn" type="button" data-ddw>Drawings for this job</button>`:""}<button class="btn" type="button" data-dncr>⚠ Report a problem</button></div>
    <button class="tdall" type="button" data-dall>View all job tasks ›</button>
  </div>`;
  if(!window.gvcSheet){ openJob(jid,"tasks"); return; }
  window.gvcSheet(html,(el,close)=>{
    const q=s=>el.querySelector(s);
    const after=()=>{ if(cur==="today") render(); };
    if(q("[data-dstart]")) q("[data-dstart]").onclick=async e=>{ const b=e.currentTarget; if(b.disabled) return; b.disabled=true; close(); await P().punchIn(jid,aid); after(); };
    if(q("[data-dout]")) q("[data-dout]").onclick=async e=>{ e.currentTarget.disabled=true; close(); await P().punchOut(); after(); };
    if(q("[data-ddone]")) q("[data-ddone]").onclick=async e=>{ e.currentTarget.disabled=true; close(); await P().doneTask(jid,aid); after(); };
    if(q("[data-ddw]")) q("[data-ddw]").onclick=()=>{ close(); if(window.jpFresh) window.jpFresh(); openJobParts(num(j),j.name,"task"); };
    q("[data-dncr]").onclick=()=>{ close(); if(window.ncrNewFor) window.ncrNewFor(jid,{details:`Found on task: ${a.name}`}); };
    q("[data-dall]").onclick=()=>{ close(); if(window.openJobTask) openJobTask(jid,aid); else openJob(jid,"tasks"); };
  });
}
window.openTaskDetail=taskDetail;
{ const s3=document.createElement("style"); s3.textContent=`
.tdd .lab{font:700 11.5px var(--font-ui,Inter,sans-serif);letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}
.tdd h2.tdh2{margin:4px 0 6px;font:700 20px/1.25 var(--font-ui,Inter,sans-serif);text-transform:none;letter-spacing:0;padding:0;border:0;background:none;word-break:break-word}
.tdd .jn{display:flex;align-items:center;gap:8px;flex-wrap:wrap;color:var(--muted);font-size:14px}
.tdd .jb{font:700 12px var(--font-ui,Inter,sans-serif);color:#111;border-radius:6px;padding:2px 7px}
.tdd .tdw{margin-top:8px;font-size:14px;color:var(--muted)}
.tdd .ins{margin-top:12px;padding:10px 12px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid var(--line);font-size:15px;line-height:1.45;white-space:pre-wrap}
.tdd .blk{margin-top:10px;padding:10px 12px;border-radius:10px;border:1px solid rgba(245,176,65,.55);background:rgba(245,176,65,.08);color:#ffd28a;font-size:14px}
.tdd .clkl{margin-top:10px;font:600 15px var(--font-ui,Inter,sans-serif);color:#7fe3a1}
.tdd .tdact{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:14px}
.tdd .tdact .btn{min-height:56px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:15px}
.tdd .tdact .btn small{font-size:12px;font-weight:500;opacity:.8}
.tdd .tdact .btn.done{background:#3ad06b;border-color:#3ad06b;color:#0d1a12}
.tdd .tdlinks{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.tdd .tdlinks .btn{min-height:44px;flex:1 1 160px}
.tdd .tdall{margin-top:12px;background:none;border:0;color:var(--accent,#ff8a2a);font:600 14px var(--font-ui,Inter,sans-serif);min-height:44px;cursor:pointer;padding:0;text-decoration:underline}
`; document.head.appendChild(s3); }
window.renderToday=render;
window.extraViews=Object.assign(window.extraViews||{},{today:render});
// the clock changed (punch in/out on another screen or device): keep Today current
GVC.on("render:after",()=>{ if(cur!=="today") clearInterval(tick);
  // the Today card already shows the running timer - don't repeat it in the bar above
  const pb=document.querySelector(".pclk"); if(pb) pb.classList.toggle("tdyhide",cur==="today"); });
{ const s2=document.createElement("style"); s2.textContent=".pclk.tdyhide{display:none!important}"; document.head.appendChild(s2); }
})();
