/* ---------- Week planner (Crew tab → Week) ----------
   Plan lives in Supabase table gvc_plan (row "main"):
   { sched:{person:{"YYYY-MM-DD":[taskKey,...]}}, off:{person:[dates]}, extra:{id:{name,job,h,who,done,at,errand}},
     hours:{taskKey:h}, needs:{taskKey:[taskKey]}, start:8 }
   Job tasks are "j:<jobId>:<taskId>" (who/status stay on the job); planner-only tasks are "x:<id>". */
(()=>{
const PCOL=["#2f8ff0","#ff8a2a","#3ad06b","#e04fa0","#9b4dff","#22c3e6","#e5483b","#c9a46a"];
const ERR_C="#f5b041";
const BLANK=()=>({sched:{},off:{},extra:{},hours:{},needs:{},start:8});
let plan=BLANK(), planLoaded=false, planLoading=false, planCh=null;
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
const lsSet=(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}};
let view=lsGet("gvc_crew_view")||"week", wk=0, weeks=+(lsGet("gvc_wk_n")||1), weekend=lsGet("gvc_wk_we")==="1", sel=null, msg="";

const css=document.createElement("style");
css.textContent=`
#crewBar{display:flex;gap:6px;margin-top:12px}
#crewBar button.on{border-color:var(--orange);color:#fff}
.wkv{margin-top:10px;user-select:none;-webkit-user-select:none;position:relative}
.wkv .pbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:6px 0;font-size:13px}
.wkv .pbar input[type=text]{flex:1;min-width:150px;width:auto}
.wkv .pbar select{width:auto}
.wkv .pbar.hid{display:none}
.wkv .pbar input,.wkv .pbar select{font:inherit;font-size:13px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:5px 8px}
.wkv .lbl{font-size:12px;color:var(--muted)}
.wkv .plbl{width:84px;font-size:12px;color:var(--muted)}
.wkv .pmsg{font-size:12.5px;color:#ffd28a;min-height:18px;margin:4px 0}
.wkv .palert{border:1px solid #5c2a26;background:#2a1513;color:#ffb3ab;border-radius:8px;padding:8px 10px;margin:6px 0;font-size:13px}
.wkv .palert .row{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
.wkv .ppool{display:flex;flex-wrap:wrap;gap:6px;padding:8px;border-radius:8px;background:rgba(0,0,0,.3);border:1px solid var(--line);min-height:42px}
.wkv .ppool .pblk{margin:0;max-width:220px}
.wkv .pwrap{overflow-x:auto;margin-top:8px}
.wkv table.pg{width:100%;min-width:640px;border-collapse:separate;border-spacing:4px;table-layout:fixed}
.wkv table.pg th{font-family:Oswald,sans-serif;font-weight:500;letter-spacing:.04em;font-size:13px;color:var(--muted);text-align:left;padding:2px 4px}
.wkv table.pg th.day{font-family:Inter,sans-serif;font-size:12px;vertical-align:top;padding-top:8px;width:80px}
.wkv table.pg th.day.today{color:#ffd28a}
.wkv table.pg td{vertical-align:top;background:rgba(0,0,0,.28);border:1px solid var(--line);border-radius:8px;padding:4px;height:86px}
.wkv table.pg td.off{background:repeating-linear-gradient(45deg,rgba(0,0,0,.25) 0 6px,rgba(255,255,255,.04) 6px 12px)}
.wkv table.pg td.hot,.wkv .ppool.hot{outline:2px dashed var(--orange)}
.wkv .ld{display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--muted);margin-bottom:3px}
.wkv .ld.over{color:#ff9b91}
.wkv .ld button{background:none;border:0;color:var(--dim);cursor:pointer;font-size:11px;padding:0 2px}
.wkv .ld button:hover{color:var(--text)}
.wkv .pblk{background:rgba(255,255,255,.06);border-radius:5px;padding:3px 6px;margin-bottom:3px;line-height:1.25;overflow:hidden;font-size:11.5px;cursor:grab;touch-action:none;background:color-mix(in srgb,var(--c) 18%,transparent);border-left:3px solid var(--c);color:var(--text)}
.wkv .pblk small{display:block;color:var(--muted);font-size:10.5px}
.wkv .pblk.sel{outline:1.5px solid #fff}
.wkv .pblk.bad{box-shadow:inset 0 0 0 1.5px #e5483b}
.wkv .pblk.done{opacity:.4}
.wkv .pblk.fx{border-left-style:dashed}
.wkv .pind{height:3px;background:var(--orange);border-radius:2px;margin:1px 0 3px}
.wkv .pghost{position:absolute;pointer-events:none;opacity:.9;z-index:20;width:150px}
.wkv .ppanel{border-top:1px solid var(--line);margin-top:8px;padding-top:10px;font-size:13px}
.wkv .ppanel .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:7px}
.wkv .ppanel select{font:inherit;font-size:12.5px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:6px;padding:4px 6px;max-width:100%}
.wkv .ppanel b{font-weight:600;min-width:30px;text-align:center}
@media (max-width:600px){
 .wkv table.pg{min-width:0;border-spacing:2px}
 .wkv table.pg th.day{width:40px;font-size:10.5px}
 .wkv table.pg td{padding:2px;height:70px}
 .wkv .pblk{font-size:10.5px;padding:2px 4px}
 .wkv .pblk small{font-size:9.5px}
 .wkv .ld{font-size:10px}
 .wkv .ppool .pblk{max-width:100%}
}
`;
document.head.appendChild(css);

/* ---------- dates & data ---------- */
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const dnum=s=>{const [y,m,d]=s.split("-").map(Number);return Math.round(Date.UTC(y,m-1,d)/86400000);};
const fromIso=s=>{const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d);};
const dlabel=s=>fromIso(s).toLocaleDateString("en-CA",{weekday:"short",month:"short",day:"numeric"});
function monday(off){const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-((d.getDay()+6)%7)+off*7);return d;}
function weekDays(){const s=monday(wk),o=[];for(let i=0;i<weeks*7;i++){const d=new Date(s);d.setDate(s.getDate()+i);const w=d.getDay();if(!weekend&&(w===0||w===6))continue;o.push(iso(d));}return o;}
const DS=()=>Number(plan.start)||8;
const H=t=>t.h==null?2:Number(t.h);
const nowH=()=>{const n=new Date();return n.getHours()+n.getMinutes()/60-DS();};
function clock(a){let t=DS()+(a%100),h=Math.floor(t+1e-9),m=Math.round((t-h)*60);if(m===60){h++;m=0;}const hh=h>12?h-12:h;return `${hh}:${String(m).padStart(2,"0")}`;}
const fh=x=>`${+Number(x).toFixed(1)}h`;
const isOff=(p,d)=>((plan.off||{})[p]||[]).includes(d);
function jobColor(jid){const ids=jobs.map(j=>j.id).sort();return PCOL[Math.max(0,ids.indexOf(jid))%PCOL.length];}

async function loadPlan(){
  if(!db||planLoading) return; planLoading=true;
  try{
    const {data,error}=await sb.from("gvc_plan").select("data").eq("id","main").maybeSingle();
    if(!error&&data) plan=Object.assign(BLANK(),data.data||{});
    planLoaded=true;
    if(!planCh) planCh=sb.channel("gvc_plan").on("postgres_changes",{event:"*",schema:"public",table:"gvc_plan"},()=>{ if(!drag) loadPlan(); }).subscribe();
  }finally{ planLoading=false; }
  if(cur==="crew"||cur==="todo") render();
}
setInterval(()=>{ if(db&&!planLoaded) loadPlan(); },800);
async function savePlan(){
  const {error}=await sb.from("gvc_plan").upsert({id:"main",data:plan,updated_at:new Date().toISOString()});
  if(error) say("Couldn't save the plan: "+error.message);
}

/* ---------- model ---------- */
function model(){
  const T={};
  jobs.filter(j=>j.stage!=="done").forEach(j=>(j.assemblies||[]).forEach(a=>{ if(!a.id) return; const key="j:"+j.id+":"+a.id;
    T[key]={key,jid:j.id,aid:a.id,job:j.name,name:a.name,h:plan.hours[key]??null,who:whoList(a),needs:(plan.needs[key]||[]).slice(),done:a.status==="done",color:jobColor(j.id)}; }));
  Object.entries(plan.extra||{}).forEach(([id,x])=>{ const key="x:"+id;
    T[key]={key,xid:id,job:x.job||"Other",name:x.name,h:x.h??null,who:(x.who||[]).slice(),needs:(plan.needs[key]||[]).slice(),done:!!x.done,at:x.at??null,errand:!!x.errand,color:x.errand?ERR_C:"#8e96a3"}; });
  const S={}; CREW.forEach(p=>{ S[p]={}; const src=(plan.sched||{})[p]||{}; for(const d in src){ const l=(src[d]||[]).filter(k=>T[k]&&T[k].who.includes(p)); if(l.length) S[p][d]=l; } });
  return {T,S};
}
const L=(M,p,d)=>(M.S[p][d]=M.S[p][d]||[]);
const dayOf=(M,p,k)=>{for(const d in M.S[p]) if(M.S[p][d].includes(k)) return d; return null;};
const rmK=(M,p,d,k)=>{if(d!=null&&M.S[p][d]) M.S[p][d]=M.S[p][d].filter(x=>x!==k);};
const cloneM=M=>({T:structuredClone(M.T),S:structuredClone(M.S)});

function fixedOf(M,p,d){ return (M.S[p][d]||[]).map(k=>M.T[k]).filter(t=>t.at!=null).map(t=>({k:t.key,s:dnum(d)*100+Number(t.at),e:dnum(d)*100+Number(t.at)+H(t)})).sort((a,b)=>a.s-b.s); }
function advance(s,w,fx){let t=s;for(const f of fx){if(f.e<=t)continue;if(f.s>=t+w)break;if(f.s<=t){t=f.e;continue;}w-=f.s-t;t=f.e;}return t+w;}
function skip(s,fx){fx.forEach(f=>{if(f.s<=s&&s<f.e)s=f.e;});return s;}
function worked(s,F,fx){let w=Math.max(0,F-s);fx.forEach(f=>{const a=Math.max(s,f.s),b=Math.min(F,f.e);if(b>a)w-=b-a;});return Math.max(0,w);}
function compute(M){
  const F={}; let R;
  for(let pass=0;pass<12;pass++){
    R={}; const st={};
    CREW.forEach(p=>{ R[p]={}; for(const d in M.S[p]){ const fx=fixedOf(M,p,d); let c=dnum(d)*100;
      fx.forEach(f=>R[p][f.k]={s:f.s,e:f.e,w:f.e-f.s});
      M.S[p][d].forEach(k=>{ const t=M.T[k]; if(t.at!=null) return; const s=skip(c,fx); let e;
        if(t.who.length<=1) e=advance(s,H(t),fx);
        else { e=F[k]!=null?Math.max(s,F[k]):advance(s,H(t)/t.who.length,fx); (st[k]=st[k]||[]).push({s,fx}); }
        R[p][k]={s,e,w:worked(s,e,fx)}; c=e; }); } });
    let ch=false;
    for(const k in st){ const arr=st[k],h=H(M.T[k]); let lo=Math.min(...arr.map(x=>x.s)),hi=lo+h+60;
      for(let i=0;i<40;i++){const mid=(lo+hi)/2;const w=arr.reduce((a,x)=>a+worked(x.s,mid,x.fx),0);if(w>=h)hi=mid;else lo=mid;}
      if(F[k]==null||Math.abs(F[k]-hi)>1e-4){F[k]=hi;ch=true;} }
    if(!ch) break;
  }
  return R;
}
function conflicts(M,R){
  const out=[];
  for(const k in M.T){ const t=M.T[k]; if(!t.who.length||t.done) continue;
    const placed=t.who.filter(w=>R[w]&&R[w][k]); if(!placed.length) continue;
    t.needs.forEach(pk=>{ const p=M.T[pk]; if(!p||p.done) return;
      const ds=Math.min(...placed.map(w=>R[w][k].s));
      const pp=p.who.filter(w=>R[w]&&R[w][pk]);
      if(!pp.length){ out.push({id:k,pid:pk,ds,pe:null}); return; }
      const pe=Math.max(...pp.map(w=>R[w][pk].e)); if(ds<pe-1e-6) out.push({id:k,pid:pk,ds,pe}); }); }
  return out;
}
function give(M,pk,q,dk){ const p=M.T[pk],dep=M.T[dk]; const d=dayOf(M,dep.who.find(w=>dayOf(M,w,dk)!=null),dk); if(d==null) return;
  p.who.forEach(w=>rmK(M,w,dayOf(M,w,pk),pk)); p.who=[q]; p.at=null; const l=L(M,q,d); if(dep.who.includes(q)) l.splice(l.indexOf(dk),0,pk); else l.push(pk); }
function pushLater(M,dk){ M.T[dk].who.forEach(w=>{ const d=dayOf(M,w,dk); if(d==null) return; const l=M.S[w][d]; l.splice(l.indexOf(dk),1); l.push(dk); }); }
function fixes(M,c){
  const opts=[]; const dep=M.T[c.id]; const d=dayOf(M,dep.who.find(w=>dayOf(M,w,c.id)!=null),c.id);
  const ok=(label,fn)=>{ const M2=cloneM(M); fn(M2); const R2=compute(M2); if(!conflicts(M2,R2).some(x=>x.id===c.id&&x.pid===c.pid)) opts.push({label,fn}); };
  CREW.forEach(q=>{ const p=M.T[c.pid]; if(p.who.length===1&&p.who[0]===q) return; if(isOff(q,d)) return;
    ok(dep.who.includes(q)?`${q} does it first`:`Give it to ${q}`,M2=>give(M2,c.pid,q,c.id)); });
  ok(`Push ${dep.name} later`,M2=>pushLater(M2,c.id));
  return opts;
}

/* ---------- saving ---------- */
async function commit(M2,label,undoable=true){
  const M1=model();
  const byJob={};
  for(const k in M2.T){ const a=M2.T[k],b=M1.T[k]; if(!b||!k.startsWith("j:")) continue;
    if(a.who.join(",")!==b.who.join(",")||a.done!==b.done) (byJob[a.jid]=byJob[a.jid]||[]).push(a); }
  const np=structuredClone(plan); np.sched={}; np.hours={}; np.needs={}; np.extra=np.extra||{};
  CREW.forEach(p=>{ np.sched[p]={}; for(const d in M2.S[p]) if(M2.S[p][d].length) np.sched[p][d]=M2.S[p][d].slice(); });
  for(const k in M2.T){ const t=M2.T[k]; if(t.needs.length) np.needs[k]=t.needs.slice();
    if(k.startsWith("j:")){ if(t.h!=null) np.hours[k]=t.h; }
    else np.extra[t.xid]={name:t.name,job:t.job,h:t.h,who:t.who,done:t.done,at:t.at,errand:t.errand}; }
  Object.keys(np.extra).forEach(id=>{ if(!M2.T["x:"+id]) delete np.extra[id]; });
  for(const k in plan.hours||{}) if(!M2.T[k]&&!(k in np.hours)) np.hours[k]=plan.hours[k];
  plan=np; render();
  for(const jid in byJob){ const j0=jobs.find(x=>x.id===jid); if(!j0) continue; const j=structuredClone(j0);
    byJob[jid].forEach(t=>{ const a=(j.assemblies||[]).find(x=>x.id===t.aid); if(!a) return; a.who=t.who.join(", ");
      if(t.done!==(a.status==="done")) a.status=t.done?"done":"ready"; });
    j.log=[...(j.log||[]),{at:new Date().toISOString(),text:"Planner: "+label}];
    const {id,...data}=j; try{ await saveJob(id,data); }catch(e){ say("Couldn't save "+j.name+": "+(e.message||e)); } }
  await savePlan();
  if(undoable) todoToast(label,()=>commit(M1,"Undid: "+label,false));
}
function say(s){ msg=s; const el=document.querySelector(".wkv .pmsg"); if(el) el.textContent=s; }

/* ---------- actions ---------- */
function doMove(k,fp,fd,tp,td,idx){
  const M=model(); const t=M.T[k]; if(!t) return;
  if(tp==null){ if(!fp) return; rmK(M,fp,fd,k); t.who=t.who.filter(w=>w!==fp); t.at=null; commit(M,`${t.name} back to the pool`); return; }
  if(isOff(tp,td)){ say(`${tp} is off ${dlabel(td)}.`); return; }
  if(fp){ rmK(M,fp,fd,k); if(fp!==tp) t.who=t.who.filter(w=>w!==fp); }
  else if(!t.who.includes(tp)) t.who=[];
  if(fp!==tp&&t.who.includes(tp)) rmK(M,tp,dayOf(M,tp,k),k);
  if(!t.who.includes(tp)) t.who.push(tp);
  t.at=null;
  const l=L(M,tp,td); l.splice(Math.min(idx,l.length),0,k);
  let note="";
  t.who.forEach(w=>{ if(w===tp) return; const dw=dayOf(M,w,k); if(dw!==td){ rmK(M,w,dw,k); if(isOff(w,td)){ t.who=t.who.filter(x=>x!==w); note=` (${w} is off that day, so they came off it)`; } else L(M,w,td).push(k); } });
  commit(M,`${t.name} → ${tp}, ${dlabel(td)}${note}`);
}
function nextWorkDay(p,d){ let x=fromIso(d); for(let i=0;i<21;i++){ x.setDate(x.getDate()+1); const w=x.getDay(); const s=iso(x); if((w===0||w===6)&&!weekend) continue; if(!isOff(p,s)) return s; } return null; }
function toggleOff(p,d){
  const M=model(); const offL=(plan.off[p]||[]).slice(); const was=offL.includes(d);
  plan.off[p]=was?offL.filter(x=>x!==d):[...offL,d];
  const moved=(M.S[p][d]||[]).slice();
  if(!was&&moved.length){ const nd=nextWorkDay(p,d); M.S[p][d]=[]; if(nd){ const l=L(M,p,nd); l.unshift(...moved.filter(k=>M.T[k].at==null)); moved.filter(k=>M.T[k].at!=null).forEach(k=>{ M.T[k].who=M.T[k].who.filter(w=>w!==p); }); } }
  commit(M,was?`${p} working ${dlabel(d)}`:`${p} off ${dlabel(d)}${moved.length?" (tasks moved to the next work day)":""}`);
}
function sendNow(p,what,h){
  const today=iso(new Date());
  if(isOff(p,today)){ say(`${p} is off today.`); return; }
  const M=model(); const id=uid(); const key="x:"+id; const at=Math.max(0,+nowH().toFixed(2));
  M.T[key]={key,xid:id,job:"Errand",name:what,h,who:[p],needs:[],done:false,at,errand:true,color:ERR_C};
  L(M,p,today).push(key);
  const R0=compute(model()); const curK=(model().S[p][today]||[]).find(k=>R0[p][k]&&R0[p][k].s<at&&R0[p][k].e>at);
  commit(M,`${p}: ${what} at ${clock(at)}`).then(()=>{ if(curK){ const M3=model(),R3=compute(M3); const r=R3[p][curK]; if(r) say(`${p} pauses ${M3.T[curK].name} for ${fh(h)}; it now finishes at ${clock(r.e)}.`); } });
}
async function quickAdd(name,h,jid){
  if(jid){ const j0=jobs.find(x=>x.id===jid); const j=structuredClone(j0); const aid=uid();
    j.assemblies=[...(j.assemblies||[]),{id:aid,name,meta:"",status:"ready",who:"",final:false}];
    plan.hours["j:"+jid+":"+aid]=h; await put(j,`Added ${name} to ${j.name}`); await savePlan(); }
  else { const id=uid(); plan.extra[id]={name,job:"Other",h,who:[],done:false,at:null}; await savePlan(); render(); }
  say(`Added "${name}" to the pool. Drag it onto someone's day.`);
}

/* ---------- render ---------- */
let lastM=null, lastFix=[], openRow="";
function blk(M,t,p,d,r,bad){
  const share=r?r.w:H(t); const others=p?t.who.filter(w=>w!==p):(t.who.length>1?t.who:[]); const solo=!p&&t.who.length===1?t.who[0]:"";
  const after=t.needs.map(n=>M.T[n]&&M.T[n].name).filter(Boolean);
  const today=iso(new Date()); const past=r&&(d<today||(d===today&&r.e<=nowH()+1e-6));
  const pauses=r&&t.at==null&&(r.e-r.s)>r.w+1e-6;
  if(r&&p&&others.length&&r.w<0.05) return `<div class="pblk ${sel===t.key?"sel":""}" style="--c:${t.color};opacity:.5" data-k="${esc(t.key)}" data-p="${p}" data-d="${d}">🔗 ${esc(t.name)} <small>${others.join(", ")} finish${others.length>1?"":"es"} it before ${p} gets there</small></div>`;
  return `<div class="pblk ${sel===t.key?"sel":""} ${bad?"bad":""} ${t.done?"done":""} ${t.at!=null?"fx":""}" style="--c:${t.color};${p?`min-height:${Math.max(24,share*9)}px`:""}${past&&!t.done?";opacity:.65":""}" data-k="${esc(t.key)}" ${p?`data-p="${p}" data-d="${d}"`:""}>
   ${t.done?"✓ ":""}${others.length?"🔗 ":""}${after.length?"🔒 ":""}${esc(t.name)} · ${fh(share)}${t.h==null?"?":""}
   <small>${r?`${clock(r.s)}–${clock(r.e)}${pauses?" (paused)":""} · `:""}${esc(t.job)}${solo?" · "+solo:""}${others.length?(p?" · with ":" · ")+others.join(", "):""}${after.length?" · after "+esc(after.join(", ")):""}</small></div>`;
}
function renderWeek(){
  const B=$("#board"); B.className="wkv"; B.style.gridTemplateColumns="";
  if(!planLoaded){ B.innerHTML=`<div class="lbl" style="padding:20px">Loading the plan…</div>`; return; }
  const M=model(), R=compute(M), C=conflicts(M,R), D=weekDays(), today=iso(new Date());
  lastM=M; const bad=new Set(C.map(c=>c.id));
  const placed=new Set(); CREW.forEach(p=>{ for(const d in M.S[p]) M.S[p][d].forEach(k=>placed.add(k)); });
  const pool=Object.values(M.T).filter(t=>!t.done&&!placed.has(t.key)).sort((a,b)=>a.job.localeCompare(b.job));
  lastFix=C.map(c=>({c,opts:fixes(M,c)}));
  const ws=fromIso(D[0]||iso(monday(wk))), we=fromIso(D[D.length-1]||iso(monday(wk)));
  const rng=`${ws.toLocaleDateString("en-CA",{month:"short",day:"numeric"})} – ${we.toLocaleDateString("en-CA",{month:"short",day:"numeric"})}`;
  const jobOpts=jobs.filter(j=>j.stage!=="done").map(j=>`<option value="${esc(j.id)}">${esc(j.name)}</option>`).join("");
  let h=`<div class="pbar"><button class="btn sm" data-wk="-1" aria-label="Previous week">‹</button><button class="btn sm" data-wk="0">This week</button><button class="btn sm" data-wk="1" aria-label="Next week">›</button>
     <span style="font-weight:600;margin:0 6px">${rng}</span>
     <button class="btn sm ${weeks===1?"primary":""}" data-wn="1">1 week</button><button class="btn sm ${weeks===2?"primary":""}" data-wn="2">2 weeks</button>
     <button class="btn sm ${weekend?"primary":""}" id="pWe">Sat/Sun</button><span style="flex:1"></span>
     <button class="btn sm" id="pTA">+ Task</button><button class="btn sm" id="pTS">Send someone now</button><span class="lbl">Day starts</span><select id="pStart">${[6,6.5,7,7.5,8,8.5,9].map(x=>`<option value="${x}" ${DS()===x?"selected":""}>${clock(x-DS())}</option>`).join("")}</select></div>
   <div class="pbar ${openRow==="add"?"":"hid"}"><span class="plbl">Add a task</span><input type="text" id="pQn" placeholder="e.g. Grind welds on tailgate"><select id="pQh">${[0.5,1,2,3,4,6,8].map(x=>`<option ${x===2?"selected":""}>${x}</option>`).join("")}</select><span class="lbl">h</span><select id="pQj"><option value="">No job (other)</option>${jobOpts}</select><button class="btn sm" id="pQa">Add</button></div>
   <div class="pbar ${openRow==="send"?"":"hid"}"><span class="plbl">Send now</span><select id="pIp">${CREW.map(c=>`<option ${c==="Cooper"?"selected":""}>${c}</option>`).join("")}</select><input type="text" id="pIw" value="Pick up parts at paint"><select id="pIh">${[0.5,1,1.5,2,3,4].map(x=>`<option ${x===1?"selected":""}>${x}</option>`).join("")}</select><span class="lbl">h</span><button class="btn sm primary" id="pIg">Send</button></div>
   <div class="pmsg">${esc(msg)}</div>`;
  h+=lastFix.map((f,i)=>{ const t=M.T[f.c.id],p=M.T[f.c.pid];
    return `<div class="palert">⚠ <b>${esc(t.name)}</b> (${t.who.join(", ")}, ${dlabel(Object.keys(M.S[t.who[0]]||{}).find(d=>M.S[t.who[0]][d].includes(t.key))||today)} ${clock(f.c.ds)}) needs <b>${esc(p.name)}</b> first, but ${f.c.pe==null?"that isn't scheduled yet.":`${p.who.join(" + ")} won't finish it until ${clock(f.c.pe)}.`}
      <div class="row">${f.opts.length?f.opts.map((o,j)=>`<button class="btn sm" data-fx="${i}:${j}">${esc(o.label)}</button>`).join(""):"<span>No quick fix - drag things around.</span>"}</div></div>`; }).join("");
  h+=`<div class="lbl" style="margin:8px 0 4px">Not scheduled (${pool.length}). Drag onto someone's day; drag back here to unschedule.</div>
   <div class="ppool">${pool.length?pool.map(t=>blk(M,t)).join(""):'<span class="lbl">Everything is scheduled.</span>'}</div>`;
  h+=`<div class="pwrap"><table class="pg"><thead><tr><th class="day"></th>${CREW.map(c=>`<th>${c}</th>`).join("")}</tr></thead><tbody>`;
  D.forEach(d=>{ h+=`<tr><th class="day ${d===today?"today":""}">${dlabel(d).replace(", ","<br>")}${d===today?"<br>today":""}</th>`+CREW.map(p=>{
    if(isOff(p,d)) return `<td class="off" data-p="${p}" data-d="${d}"><div class="ld"><span>Day off</span><button data-off="${p}|${d}" title="Working this day">undo</button></div></td>`;
    const ids=M.S[p][d]||[]; const used=ids.reduce((a,k)=>a+(R[p][k]?R[p][k].w:0),0);
    return `<td data-p="${p}" data-d="${d}"><div class="ld ${used>8.01?"over":""}"><span>${used?fh(used)+" / 8h":"Open"}</span><button data-off="${p}|${d}" title="Mark ${p} off ${dlabel(d)}">off</button></div>${ids.map(k=>blk(M,M.T[k],p,d,R[p][k],bad.has(k))).join("")}</td>`; }).join("")+`</tr>`; });
  h+=`</tbody></table></div><div class="ppanel" id="pPanel"></div>`;
  B.innerHTML=h;
  panel(M);
  B.querySelectorAll("[data-wk]").forEach(b=>b.onclick=()=>{ const v=+b.dataset.wk; wk=v===0?0:wk+v; render(); });
  B.querySelectorAll("[data-wn]").forEach(b=>b.onclick=()=>{ weeks=+b.dataset.wn; lsSet("gvc_wk_n",weeks); render(); });
  $("#pWe").onclick=()=>{ weekend=!weekend; lsSet("gvc_wk_we",weekend?"1":"0"); render(); };
  $("#pStart").onchange=e=>{ plan.start=+e.target.value; savePlan(); render(); };
  $("#pTA").onclick=()=>{ openRow=openRow==="add"?"":"add"; render(); if(openRow) $("#pQn").focus(); };
  $("#pTS").onclick=()=>{ openRow=openRow==="send"?"":"send"; render(); };
  $("#pQa").onclick=()=>{ const n=$("#pQn").value.trim(); if(!n){ say("Type a task name first."); return; } quickAdd(n,+$("#pQh").value,$("#pQj").value); };
  $("#pQn").onkeydown=e=>{ if(e.key==="Enter") $("#pQa").click(); };
  $("#pIg").onclick=()=>sendNow($("#pIp").value,$("#pIw").value.trim()||"Errand",+$("#pIh").value);
  B.querySelectorAll("[data-fx]").forEach(b=>b.onclick=()=>{ const [i,j]=b.dataset.fx.split(":").map(Number); const o=lastFix[i].opts[j]; const M2=model(); o.fn(M2); commit(M2,o.label); say(o.label+"."); });
  B.querySelectorAll("[data-off]").forEach(b=>b.onclick=e=>{ e.stopPropagation(); const [p,d]=b.dataset.off.split("|"); toggleOff(p,d); });
}
function panel(M){
  const el=$("#pPanel"); const t=M.T[sel];
  if(!t){ el.innerHTML=`<span class="lbl">Tap a block to set hours, who's on it, or what it waits for. 🔗 shared (crew-hours split so everyone finishes together) · 🔒 waits on another task · dashed = fixed-time errand · "?" = no estimate yet (counted as 2h).</span>`; return; }
  const others=Object.values(M.T).filter(x=>x.key!==t.key&&!x.done).sort((a,b)=>a.job.localeCompare(b.job));
  el.innerHTML=`<div><span style="color:${t.color}">${esc(t.job)}</span> · <b style="font-weight:600">${esc(t.name)}</b>${t.jid?` <button class="btn sm ghost" id="pOpen">Open job</button>`:""}</div>
   <div class="row"><span class="lbl">${t.who.length>1?"Crew-hours":"Hours"}</span><button class="btn sm" data-ph="-0.5">−</button><b>${t.h==null?"?":t.h}</b><button class="btn sm" data-ph="0.5">+</button>${[1,2,4,8].map(x=>`<button class="btn sm ${t.h===x?"primary":""}" data-phs="${x}">${x}h</button>`).join("")}</div>
   <div class="row"><span class="lbl">On it</span>${CREW.map(c=>`<button class="wc ${t.who.includes(c)?"on":""}" data-pw="${c}">${c}</button>`).join("")}</div>
   <div class="row"><span class="lbl">Has to wait for</span><select id="pNd"><option value="">Nothing</option>${others.map(o=>`<option value="${esc(o.key)}" ${t.needs.includes(o.key)?"selected":""}>${esc(o.job)} · ${esc(o.name)}</option>`).join("")}</select></div>
   <div class="row"><button class="btn sm" id="pDone">${t.done?"Not done":"✓ Done"}</button>${t.who.length?`<button class="btn sm" id="pPool">Back to pool</button>`:""}${t.xid?`<button class="btn sm danger" id="pDel">Delete</button>`:""}<span style="flex:1"></span><button class="btn sm ghost" id="pX">Close</button></div>`;
  const edit=(fn,label)=>{ const M2=model(); const t2=M2.T[t.key]; if(!t2) return; if(fn(M2,t2)===false) return; commit(M2,label); };
  el.querySelectorAll("[data-ph]").forEach(b=>b.onclick=()=>edit((M2,t2)=>{ t2.h=Math.max(0.5,H(t2)+ +b.dataset.ph); },`${t.name}: hours`));
  el.querySelectorAll("[data-phs]").forEach(b=>b.onclick=()=>edit((M2,t2)=>{ t2.h=+b.dataset.phs; },`${t.name}: ${b.dataset.phs}h`));
  $("#pNd").onchange=e=>edit((M2,t2)=>{ t2.needs=e.target.value?[e.target.value]:[]; },e.target.value?`${t.name} waits for ${M.T[e.target.value].name}`:`${t.name} waits for nothing`);
  el.querySelectorAll("[data-pw]").forEach(b=>b.onclick=()=>{ const q=b.dataset.pw;
    edit((M2,t2)=>{ if(t2.who.includes(q)){ rmK(M2,q,dayOf(M2,q,t2.key),t2.key); t2.who=t2.who.filter(w=>w!==q); return; }
      const w0=t2.who.find(w=>dayOf(M2,w,t2.key)!=null); if(!w0){ t2.who.push(q); return; }
      const d=dayOf(M2,w0,t2.key); if(isOff(q,d)){ say(`${q} is off ${dlabel(d)}.`); return false; } t2.who.push(q); L(M2,q,d).push(t2.key); },
      `${t.name}: ${t.who.includes(q)?"took off":"added"} ${q}`); });
  $("#pDone").onclick=()=>edit((M2,t2)=>{ t2.done=!t2.done; },`${t.name}: ${t.done?"not done":"done"}`);
  const bp=$("#pPool"); if(bp) bp.onclick=()=>edit((M2,t2)=>{ t2.who.forEach(w=>rmK(M2,w,dayOf(M2,w,t2.key),t2.key)); t2.who=[]; t2.at=null; },`${t.name} back to the pool`);
  const bd=$("#pDel"); if(bd) bd.onclick=()=>{ edit((M2,t2)=>{ CREW.forEach(w=>rmK(M2,w,dayOf(M2,w,t2.key),t2.key)); delete M2.T[t2.key]; },`Deleted ${t.name}`); sel=null; };
  const bo=$("#pOpen"); if(bo) bo.onclick=()=>openJob(t.jid);
  $("#pX").onclick=()=>{ sel=null; render(); };
}

/* ---------- drag (mouse + touch) ---------- */
let drag=null;
function target(x,y){ const el=document.elementFromPoint(x,y); if(!el) return null; const td=el.closest(".wkv td[data-p]"); if(td) return {td}; if(el.closest(".wkv .ppool")) return {pool:true}; return null; }
function idxIn(td,y){ const bs=[...td.querySelectorAll(".pblk")].filter(b=>!b.classList.contains("fx")&&!(b.dataset.k===drag.k&&b.dataset.p===drag.fp&&b.dataset.d===drag.fd));
  let i=bs.findIndex(b=>{const r=b.getBoundingClientRect();return y<r.top+r.height/2;}); return {i:i<0?bs.length:i,bs}; }
document.addEventListener("pointerdown",e=>{ if(cur!=="crew"||view!=="week") return; const b=e.target.closest(".wkv .pblk"); if(!b) return;
  drag={k:b.dataset.k,fp:b.dataset.p||null,fd:b.dataset.d||null,x0:e.clientX,y0:e.clientY,el:b,moved:false}; });
document.addEventListener("pointermove",e=>{ if(!drag) return;
  if(!drag.moved&&Math.hypot(e.clientX-drag.x0,e.clientY-drag.y0)<7) return;
  const W=document.querySelector(".wkv"); if(!W){ drag=null; return; }
  if(!drag.moved){ drag.moved=true; drag.g=drag.el.cloneNode(true); drag.g.classList.add("pghost"); W.appendChild(drag.g); drag.el.style.opacity=".3"; }
  e.preventDefault();
  const wr=W.getBoundingClientRect(); drag.g.style.left=(e.clientX-wr.left-24)+"px"; drag.g.style.top=(e.clientY-wr.top-14)+"px";
  W.querySelectorAll(".pind").forEach(n=>n.remove()); W.querySelectorAll(".hot").forEach(n=>n.classList.remove("hot"));
  const tg=target(e.clientX,e.clientY); if(!tg) return;
  if(tg.pool){ W.querySelector(".ppool").classList.add("hot"); return; }
  tg.td.classList.add("hot"); if(tg.td.classList.contains("off")) return;
  const {i,bs}=idxIn(tg.td,e.clientY); const ind=document.createElement("div"); ind.className="pind"; if(bs[i]) bs[i].before(ind); else tg.td.appendChild(ind);
},{passive:false});
function endDrag(e,cancel){ if(!drag) return; const d=drag; drag=null;
  if(d.g) d.g.remove();
  if(!d.moved){ if(!cancel){ sel=sel===d.k?null:d.k; render(); } return; }
  const tg=cancel?null:target(e.clientX,e.clientY);
  if(tg&&tg.pool) doMove(d.k,d.fp,d.fd,null);
  else if(tg&&tg.td){ const dd={k:d.k,fp:d.fp,fd:d.fd}; drag=dd; const {i}=idxIn(tg.td,e.clientY); drag=null; doMove(d.k,d.fp,d.fd,tg.td.dataset.p,tg.td.dataset.d,i); }
  else render();
}
document.addEventListener("pointerup",e=>endDrag(e,false));
document.addEventListener("pointercancel",e=>endDrag(e,true));

/* ---------- hooks into the app ---------- */
const bar=document.createElement("div"); bar.id="crewBar"; bar.style.display="none";
bar.innerHTML=`<button class="btn sm" data-cv="week">Week plan</button><button class="btn sm" data-cv="lanes">Lanes</button>`;
const board=document.getElementById("board"); board.parentNode.insertBefore(bar,board);
bar.querySelectorAll("[data-cv]").forEach(b=>b.onclick=()=>{ view=b.dataset.cv; lsSet("gvc_crew_view",view); render(); });
const _renderCrew=renderCrew;
renderCrew=function(items){ if(view==="week") renderWeek(); else _renderCrew(items); };
const _render=render;
render=function(){ _render(); bar.style.display=cur==="crew"?"":"none"; bar.querySelectorAll("[data-cv]").forEach(b=>b.classList.toggle("on",b.dataset.cv===view)); };
const _auto=autoTodos;
autoTodos=function(){ const out=_auto(); if(!planLoaded) return out;
  try{ const M=model(),R=compute(M),today=iso(new Date()),lim=iso(new Date(Date.now()+2*86400000));
    const hidden=new Set(todos.filter(t=>t.source==="auto").map(t=>t.text));
    conflicts(M,R).forEach(c=>{ const t=M.T[c.id],p=M.T[c.pid]; const d=dayOf(M,t.who[0],c.id); if(!d||d<today||d>lim) return;
      const text=`Schedule clash ${dlabel(d)}: ${t.name} (${t.who.join(", ")} ${clock(c.ds)}) needs ${p.name} first`;
      if(!hidden.has(text)) out.unshift({text,c:"var(--red)",view:"crew"}); });
  }catch(e){}
  return out; };
window.planLines=function(){ if(!planLoaded) return [];
  try{ const M=model(),R=compute(M),today=iso(new Date()),out=[];
    weekDays().filter(d=>d>=today).forEach(d=>CREW.forEach(p=>{ if(isOff(p,d)){ out.push(`[crew schedule] ${dlabel(d)} · ${p}: day off`); return; }
      const ids=M.S[p][d]||[]; if(!ids.length) return;
      out.push(`[crew schedule] ${dlabel(d)} · ${p}: `+ids.map(k=>{const r=R[p][k],t=M.T[k];return `${clock(r.s)}-${clock(r.e)} ${t.name} (${t.job}${t.who.length>1?", with "+t.who.filter(w=>w!==p).join("+"):""}${t.done?", done":""})`;}).join("; ")); }));
    conflicts(M,R).forEach(c=>out.push(`[crew schedule clash] ${M.T[c.id].name} needs ${M.T[c.pid].name} done first but it isn't`));
    const placed=new Set(); CREW.forEach(p=>{for(const d in M.S[p]) M.S[p][d].forEach(k=>placed.add(k));});
    const un=Object.values(M.T).filter(t=>!t.done&&!placed.has(t.key)); if(un.length) out.push(`[crew schedule] not scheduled yet: `+un.map(t=>`${t.name} (${t.job}, ${fh(H(t))})`).join("; "));
    return out; }catch(e){ return []; } };
if(db) loadPlan();
})();
