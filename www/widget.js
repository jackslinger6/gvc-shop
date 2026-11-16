/* ---------- Home-screen widget data (widget redesign, Nov 15 - preview) ----------
   The widget shows THIS phone's person, not the shop board: the app hands it a small snapshot of what that person's
   own Home / Today screen says, worked out by the same functions the screens use (shellNextUp for Kyle, the Today
   model for the crew, robinNextList for Robin). It's kept on the phone only (WidgetBridge.setState -> Android
   SharedPreferences) - nothing is written to the server, so a crew or parts phone never touches Kyle's list and the
   widget never shows manager information to the crew.
   Every card and button carries a "link" that opens the exact record when tapped (gvcWidgetLink below):
     {v:view} · {job,sec} · {task:[job,task],why:"start"|"stop"} · {draw:job} · {count:[job,supplier]}
     {po:order,count:1} · {inv:"hw"|"cons"} · {req:"approved"} · {rec:1}
   The widget never starts/stops a timer, finishes a task or starts a recording by itself: those buttons open the
   screen where the person confirms. */
(()=>{
const W=()=>window.gvcWidgetBridge;   // set in index.html when running in the Android app
const sc=t=>{ t=String(t||"").trim().toLowerCase(); return t.charAt(0).toUpperCase()+t.slice(1); };
const roleOf=()=>{ const r=window.ME&&ME.role; return r==="admin"||r==="crew"||r==="parts"?r:null; };
const theme=()=>{ try{ return window.gvcTheme?gvcTheme.active():"dark"; }catch(e){ return "dark"; } };
const hex=c=>{ c=String(c||""); if(/^#[0-9a-f]{6}$/i.test(c)) return c; if(/^#[0-9a-f]{3}$/i.test(c)) return "#"+[...c.slice(1)].map(x=>x+x).join("");
  const m=c.match(/var\((--[a-z0-9-]+)\)/i); if(m){ const v=getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim(); if(/^#[0-9a-f]{3,6}$/i.test(v)) return hex(v); } return "#8e96a3"; };
/* button wording on the widget: what the tap opens, never a promise it does something by itself */
const actLabel=t=>{ const a=String(t||"").toUpperCase();
  if(!a) return "Open";
  if(a==="DONE"||a==="EMAIL ROBIN"||a==="RANDY") return "Open";
  if(a.startsWith("OPEN ")) return "Open";
  return sc(a.replace(" - "," – ")); };

const NAV={
  admin:[{label:"Home",link:{v:"home"}},{label:"Jobs",link:{v:"overview"}},{label:"Purchasing",link:{v:"purchasing"}},{label:"Crew",link:{v:"crew"}}],
  crew:[{label:"Today",link:{v:"today"}},{label:"Jobs",link:{v:"build"}},{label:"Drawings",link:{v:"drawings"}},{label:"Time",link:{v:"time"}}],
  parts:[{label:"Today",link:{v:"home"}},{label:"Purchasing",link:{v:"purchasing"}},{label:"Inventory",link:{v:"inv"}},{label:"Jobs",link:{v:"build"}}]};

function admin(){
  const L=(window.shellNextUp?window.shellNextUp():[]).map(t=>({tag:sc(t.tag||"Next"),title:t.text,sub:t.sub||"",c:hex(t.c),act:actLabel(t.act&&t.act.t),link:t.link||(t.job?{job:t.job}:{v:"todo"})}));
  const rev=(typeof suggs!=="undefined"&&Array.isArray(suggs))?suggs.filter(x=>x.status==="new").length:0;
  if(rev) L.unshift({tag:"Review",title:`${rev} suggestion${rev>1?"s":""} from texts & recordings`,sub:"Check them before they go on the list",c:"#ffd28a",act:"Review",link:{v:"todo"}});
  return {hero:L[0]||null, items:L.slice(1), total:L.length, empty:{title:"All caught up",sub:"Nothing needs you right now."}};
}
function crew(){
  const M=window.todayModel?window.todayModel():null;
  if(!M) return {hero:null,items:[],total:0,empty:{title:"Open the app to load your day",sub:""}};
  const lab=j=>j?[M.num(j),M.rest(j)].filter(Boolean).join(" · "):"";
  const row=(r,tag)=>({tag,title:r.a.name,sub:lab(r.j)+(r.why&&r.why.length?" · "+r.why[0]:""),c:hex(window.jobColor?jobColor(r.jid):"#8e96a3"),act:"Open",link:{task:[r.jid,r.aid]}});
  let timer=null, hero=null; const items=[];
  if(M.open){ const o=M.open;
    timer={since:new Date(o.start_at).getTime(),task:M.curA?M.curA.name:(o.task_name||"Whole job"),job:M.curJ?lab(M.curJ):(o.job_name||""),
      c:hex(M.curJ&&window.jobColor?jobColor(M.curJ.id):"#3ad06b"),
      link:M.curJ?(M.curA?{task:[M.curJ.id,M.curA.id],why:"stop"}:{job:M.curJ.id}):{v:"today"},
      draw:M.curJ&&M.num(M.curJ)?{draw:M.curJ.id}:null};
    M.ready.forEach(r=>items.push(row(r,"Next up")));
  } else if(M.ready.length){ const r=M.ready[0];
    hero={tag:"Next up",title:r.a.name,sub:lab(r.j),c:hex(window.jobColor?jobColor(r.jid):"#8e96a3"),act:"Start work",link:{task:[r.jid,r.aid],why:"start"},
      act2:M.num(r.j)?"Drawings":"",link2:M.num(r.j)?{draw:r.jid}:null};
    M.ready.slice(1).forEach(r=>items.push(row(r,"Next up")));
  }
  M.blocked.forEach(r=>items.push(row(r,"Blocked")));
  return {timer,hero,items,total:(timer?1:0)+(hero?1:0)+items.length,
    empty:{title:"Nothing ready for you",sub:M.blocked.length?"Your tasks are waiting on something.":"No tasks are on you today."}};
}
function parts(){
  const L=(window.robinNextList?window.robinNextList():[]).map(t=>({tag:sc(t.tag),title:t.text,sub:t.sub||"",c:hex(t.c),
    act:t.tag==="TO DO"?"Open":actLabel(t.act&&t.act.t),link:t.link||{v:"home"}}));
  return {hero:L[0]||null,items:L.slice(1),total:L.length,empty:{title:"All caught up",sub:"No quotes to compare, nothing to order, pick up or count."}};
}
function snapshot(){
  const role=roleOf(); if(!role) return null;
  const body=role==="admin"?admin():role==="crew"?crew():parts();
  return {v:2,at:Date.now(),role,name:(window.ME&&ME.name)||"",theme:theme(),...body,items:body.items.slice(0,12),nav:NAV[role]};
}
window.gvcWidgetSnapshot=snapshot;

let last="", t=null;
function push(now){
  clearTimeout(t); t=setTimeout(async()=>{
    if(!W()||typeof jobs==="undefined"||!jobs.length) return;
    let s; try{ s=snapshot(); }catch(e){ return; } if(!s) return;
    const key=JSON.stringify({...s,at:0});
    if(key===last&&!now) return;
    try{ await W().setState({json:JSON.stringify(s)}); last=key; }catch(e){}
  },now?0:1500);
}
window.gvcWidgetPush=push;
if(window.GVC&&GVC.on) GVC.on("render:after",()=>push(false),{order:99});
document.addEventListener("visibilitychange",()=>{ if(document.hidden) push(true); });
setInterval(()=>push(false),60e3);

/* a tap on the widget: open exactly what the card / button points at */
function ready(){ return typeof jobs!=="undefined"&&jobs.length&&window.ME; }
function open(link){
  if(!link) return false;
  const job=id=>jobs.find(x=>x.id===id);
  if(link.v==="time"&&roleOf()==="crew"&&window.openMyTime){ openMyTime(); return true; }   // same as the crew's Time button
  if(link.v){ (window.shellGo||(()=>{}))(link.v); return true; }
  if(link.task){ const [j,a]=link.task;
    if(roleOf()!=="admin"&&window.shellGo) shellGo("today");
    if(window.openTaskDetail){ openTaskDetail(j,a);
      if(link.why) setTimeout(()=>{ const b=document.querySelector(link.why==="stop"?"[data-dout]":"[data-dstart]"); if(b){ b.classList.add("gvcwfocus"); b.focus(); } },250);
      return true; }
    if(window.openJob){ openJob(j,"tasks"); return true; } return false; }
  if(link.draw){ const j=job(link.draw); if(j&&window.openJobParts&&window.jobNum){ openJobParts(jobNum(j.name),j.name,"widget"); return true; } if(j&&window.openJob){ openJob(j.id); return true; } return false; }
  if(link.count){ const [j,s]=link.count; if(window.openCount){ openCount(j,s); return true; } if(window.openJob){ openJob(j); return true; } return false; }
  if(link.po){ if(window.pordersOpenId) pordersOpenId(link.po); if(link.count&&window.robinCountOrder) setTimeout(()=>robinCountOrder(link.po),200); return true; }
  if(link.inv){ if(window.invMode&&invMode.set) invMode.set(link.inv); if(window.shellGo) shellGo("inv"); return true; }
  if(link.req){ if(window.reqGo){ reqGo(link.req); return true; } if(window.shellGo){ shellGo("requests"); return true; } return false; }
  if(link.job){ if(job(link.job)&&window.openJob){ openJob(link.job,link.sec); return true; } return false; }
  return false;
}
let pending=null;
window.gvcWidgetLink=link=>{ if(ready()) return open(link); pending=link;
  const iv=setInterval(()=>{ if(!pending){ clearInterval(iv); return; } if(ready()){ const l=pending; pending=null; clearInterval(iv); open(l); } },300);
  setTimeout(()=>{ clearInterval(iv); pending=null; },20000); return true; };
const st=document.createElement("style"); st.textContent=`.gvcwfocus{outline:3px solid #ff8a2a!important;outline-offset:3px}`; document.head.appendChild(st);
})();
