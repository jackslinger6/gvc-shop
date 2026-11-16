/* ---------- Home = To do, plus Punch and Drawings tabs (Kyle, 2026-11-09) ----------
   - Home (Kyle): only the To do list. "Next up", crew today and My day moved off it.
   - PUNCH tab (Kyle): the punch clock - My day with Punch in / Done, My time this week, the crew.
     Crew (Colton) already has this as his Home, so he doesn't get a second copy.
   - DRAWINGS tab (Kyle + crew): active jobs that have parts & drawings, tap one to open its parts list.
     Jobs with no drawings yet and finished jobs are folded underneath, with a search.
   - Same layout for the crew (Colton, Aaron), Nov 9: HOME · JOBS · DRAWINGS · + · PUNCH · CREW · MORE.
     Their Home is their To do (the tasks on them: today, next days, also on you - tick to finish), Punch is the clock
     screen that used to be their Home, Jobs is the All jobs list (look-only, no boards). Robin (parts) unchanged. */
(()=>{
const isAdmin=()=>!(window.ME&&(ME.role==="crew"||ME.role==="parts"));
const isCrewM=()=>!!(window.ME&&ME.role==="crew");
const homeView=()=>isAdmin()?"todo":isCrewM()?"today":"home";
const showDrawings=()=>!(window.ME&&ME.role==="parts");
window.gvcHomeIsTodo=()=>isAdmin();
window.gvcHomeView=homeView;

const css=document.createElement("style");
css.textContent=`
.dw{max-width:900px;margin-top:10px}
.dw h4{margin:16px 0 8px;font:500 12px var(--font-display);letter-spacing:.16em;color:var(--muted);display:flex;justify-content:space-between;align-items:baseline}
.dw h4:first-child{margin-top:0}
.dw input[type=search]{font:inherit;font-size:15px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:10px 12px;width:100%;box-sizing:border-box}
.dw .dj{display:grid;grid-template-columns:auto 1fr auto;column-gap:12px;align-items:center;width:100%;text-align:left;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 14%,#17191d),#15171a 60%);border:1px solid #2a2e34;border-left:4px solid var(--c);border-radius:12px;padding:12px;margin-bottom:8px;color:var(--text);cursor:pointer;font:inherit}
.dw .dj:active{transform:scale(.985)}
.dw .dj.none{opacity:.55}
.dw .dn{font:600 14px var(--font-display);letter-spacing:.06em;background:rgba(0,0,0,.35);border:1px solid #3a3e45;border-radius:8px;padding:7px 9px;min-width:64px;text-align:center}
.dw .dt{font-weight:600;font-size:15.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dw .ds{font-size:12.5px;color:var(--muted);margin-top:2px}
.dw .dc{font:600 15px var(--font-display);color:#ffb36b;text-align:right;line-height:1.1}
.dw .dc small{display:block;font:500 10px var(--font-display);letter-spacing:.12em;color:var(--muted)}
.dw .fold{width:100%;display:flex;justify-content:space-between;align-items:center;background:none;border:1px solid var(--line);border-radius:10px;color:#cfd3d8;font:500 13px var(--font-display);letter-spacing:.12em;padding:11px 12px;cursor:pointer;margin:8px 0}
.dw .fold span:last-child{transition:transform .15s}
.dw .fold.open span:last-child{transform:rotate(90deg)}
.dw .empty2{font-size:13px;color:var(--muted);padding:8px 2px}
.shnav .ni.nx{font-size:12px}
@media (max-width:899px){ body.nav5 .shnav .ni{font-size:12px;letter-spacing:.02em} body.nav5 .shnav .ni svg{width:24px;height:24px} body.nav5 .shnav{height:calc(72px + env(safe-area-inset-bottom))} }
body.crew:not(.parts) .shnav [data-n="jobs"]{display:flex!important}
.ctodo .ti .body{cursor:pointer;min-width:0}
.ctodo .ti.dn .tt{text-decoration:line-through;opacity:.55}
.ctodo .ti .ck:disabled{cursor:default;border-color:#3ad06b;color:#3ad06b}
.ctodo .jb{font:600 11.5px var(--font-display);letter-spacing:.06em;color:#111;border-radius:5px;padding:0 6px}
.cjobs{margin-top:10px}
@media (max-width:899px){ body.nav7 .shnav .ni{font-size:10.5px;letter-spacing:.04em} body.nav7 .shnav .ni svg{width:21px;height:21px} body.nav7 .shnav .plus{width:58px;height:58px} }
`;
document.head.appendChild(css);

/* ---- nav buttons ---- */
const I={
  draw:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  punch:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  today:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M8 15l2.5 2.5L16 13"/>',
  cart:'<path d="M3 4h2l2.4 11h10.2L20 7H6.2"/><circle cx="9" cy="19.5" r="1.5"/><circle cx="17" cy="19.5" r="1.5"/>',
};
const svg=k=>`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]}</svg>`;
const nav=document.querySelector(".shnav");
let bD=null, bP=null, bPu=null, bT=null;
if(nav){
  bD=document.createElement("button"); bD.className="ni nx"; bD.type="button"; bD.dataset.n="drawings"; bD.innerHTML=svg("draw")+"Drawings";
  bP=document.createElement("button"); bP.className="ni nx"; bP.type="button"; bP.dataset.n="today"; bP.innerHTML=svg("today")+"<span>Today</span>";
  bPu=document.createElement("button"); bPu.className="ni nx"; bPu.type="button"; bPu.dataset.n="purchasing"; bPu.innerHTML=svg("cart")+"<span>Purchasing</span><span class=\"bd\" id=\"shPurN\" hidden></span>";
  bT=document.createElement("button"); bT.className="ni nx"; bT.type="button"; bT.dataset.n="time"; bT.innerHTML=svg("punch")+"<span>Time</span>";
  const pw=nav.querySelector(".pluswrap"); nav.insertBefore(bD,pw); pw.after(bP); nav.append(bPu,bT);
  bD.onclick=()=>{ dwQ=""; showFin=false; shellGo("drawings"); };
  bP.onclick=()=>shellGo("today");
  bPu.onclick=()=>shellGo("purchasing");
  bT.onclick=()=>{ if(isCrewM()&&window.openMyTime) window.openMyTime(); else shellGo("time"); };
}
/* five buttons on a phone, per role (usability pass, Nov 15 - Kyle OK'd the mockup):
     Kyle  Home · Jobs · Purchasing · Crew · More      (+ in the top bar, timer bar on every screen, Today in More)
     crew  Today · Jobs · Drawings · Time · More
     Robin Today · Purchasing · Inventory · Jobs · More
   The desktop rail keeps more (Drawings, Today and the + wheel for Kyle). Old links (#punch, #mytodo, #porders) still work. */
const NAVS={
  admin:{phone:["home","jobs","purchasing","crew","more"], desk:["home","jobs","purchasing","drawings","today","crew","more","plus"]},
  crew: {phone:["home","jobs","drawings","time","more"],   desk:["home","jobs","drawings","time","crew","more","plus"]},
  parts:{phone:["home","purchasing","inv","jobs","more"],  desk:["home","purchasing","inv","jobs","more","plus"]},
};
function navState(){
  if(!nav) return;
  const role=isAdmin()?"admin":isCrewM()?"crew":"parts", phone=window.innerWidth<900;
  const want=NAVS[role][phone?"phone":"desk"];
  const el=k=>k==="plus"?nav.querySelector(".pluswrap"):nav.querySelector(`[data-n="${k}"]`);
  const all=["home","jobs","orders","purchasing","drawings","today","punch","inv","time","crew","more","plus"];
  all.forEach(k=>{ const e=el(k); if(e&&!want.includes(k)) e.style.setProperty("display","none","important"); });
  want.forEach(k=>{ const e=el(k); if(!e) return; e.style.setProperty("display","flex","important"); nav.insertBefore(e,nav.querySelector(".railcrew")); });
  const hl=nav.querySelector('[data-n="home"]'); if(hl){ const t=role==="admin"?"Home":"Today"; const tn=[...hl.childNodes].find(n=>n.nodeType===3&&n.textContent.trim()); if(tn&&tn.textContent.trim()!==t) tn.textContent=t; }
  // which button is lit
  const on=cur===homeView()?"home":cur==="today"?"today":["crewjobs","overview","pipeline","ordering","build","archive"].includes(cur)?"jobs":
    ["purchasing","pos","porders","requests"].includes(cur)?"purchasing":cur;
  nav.querySelectorAll("[data-n]").forEach(b=>{ const lit=b.dataset.n===on; b.classList.toggle("on",lit); if(lit) b.setAttribute("aria-current","page"); else b.removeAttribute("aria-current"); });
  if(phone) nav.style.setProperty("grid-template-columns",`repeat(${want.length},minmax(0,1fr))`,"important"); else nav.style.removeProperty("grid-template-columns");
  document.body.classList.toggle("nav7",false);
  document.body.classList.toggle("nav5",phone);
}
window.addEventListener("resize",navState);

/* ---- Punch tab ---- */
function renderPunch(){
  const B=$("#board"); B.className="home"; B.style.gridTemplateColumns="";
  if(window.crewHome) window.crewHome(B); else B.innerHTML=`<div class="tnote">Punch clock not loaded.</div>`;
  const hm=B.querySelector(".hm"); if(hm) hm.classList.add("shanim");
}

/* ---- Drawings tab ---- */
let counts=null, countsAt=0, dwQ="", showNone=new Set(), showFin=false;
function loadCounts(force){
  if(!force&&counts&&Date.now()-countsAt<60e3) return;
  countsAt=Date.now();
  if(window.jpCount) window.jpCount().then(c=>{ counts=c; if(cur==="drawings") render(); }).catch(()=>{});
}
const rest=n=>{ const num=window.jobNum?window.jobNum(n):""; return num?String(n).replace(/^\s*\S+\s*[-–:]?\s*/,"").trim()||n:n; };
function card(no,name,jid,c){
  const col=jid&&window.jobColor?window.jobColor(jid):"#6c727a";
  return `<button class="dj ${c?"":"none"}" type="button" style="--c:${col}" data-dj="${esc(no)}" data-dn="${esc(name||no)}"><span class="dn">${esc(no)}</span>
    <span style="min-width:0"><div class="dt">${esc(rest(name||no))}</div><div class="ds">${c?`${c.n} parts · ${c.bent} with bends · ${c.n-c.bent} flat parts`:"No drawings loaded yet"}</div></span>
    <span class="dc">${c?`${c.n}<small>PARTS</small>`:""}</span></button>`;
}
function renderDrawings(){
  loadCounts(false);
  const B=$("#board"); B.className="home"; B.style.gridTemplateColumns="";
  const C=counts||{};
  const words=dwQ.toLowerCase().split(/\s+/).filter(Boolean);
  const hit=n=>words.every(w=>String(n).toLowerCase().includes(w));
  const num=j=>window.jobNum?window.jobNum(j.name):"";
  const live=jobs.filter(j=>!j.archived&&j.stage!=="done"&&num(j)&&num(j)!=="INV");
  const fin=archivedJobs.concat(jobs.filter(j=>!j.archived&&j.stage==="done")).filter(j=>num(j));
  const known=new Set(jobs.concat(archivedJobs).map(num));
  // drawings loaded for a job number that has no job card yet
  const orphans=Object.keys(C).filter(no=>!known.has(no));
  const byNo=(a,b)=>String(num(a)).localeCompare(String(num(b)),undefined,{numeric:true});
  // same lifecycle as Jobs (Kyle's review, Nov 14): Active / Planned / Shop, each with its "no drawings yet" folded
  const life=j=>window.lifeOf?window.lifeOf(j):"active";
  const finD=fin.sort((a,b)=>(C[num(b)]?1:0)-(C[num(a)]?1:0)||byNo(b,a));
  const list=(arr)=>arr.filter(j=>hit(j.name)).map(j=>card(num(j),j.name,j.id,C[num(j)])).join("");
  const searching=words.length>0;
  const SECT=[["active","ACTIVE JOBS"],["planned","PLANNED JOBS"],["shop","SHOP JOBS"]];
  let html="";
  SECT.forEach(([k,t])=>{ const L=live.filter(j=>life(j)===k), withD=L.filter(j=>C[num(j)]).sort(byNo), noD=L.filter(j=>!C[num(j)]).sort(byNo);
    let act=list(withD); if(k==="active") act+=orphans.filter(hit).map(no=>card(no,no,null,C[no])).join("");
    const none=list(noD), nn=(none.match(/data-dj=/g)||[]).length, open=showNone.has(k)||searching;
    if(!act&&!nn&&k!=="active") return;
    html+=`<h4><span>${t}</span><span>${k==="active"&&!counts?"LOADING…":""}</span></h4>`+
      (act||(k==="active"?`<div class="empty2">${counts?(searching?"No active job with drawings matches.":"No drawings loaded on an active job yet. Open a job → Parts & drawings → More → Import ZIP."):""}</div>`:""))+
      (nn?`<button class="fold ${open?"open":""}" type="button" data-dwn="${k}"><span>${t.split(" ")[0]} · NO DRAWINGS YET (${nn})</span><span>▶</span></button>${open?none:""}`:""); });
  const done=list(finD);
  B.innerHTML=`<div class="dw shanim">
    <input type="search" id="dwQ" placeholder="Find a job - number or name…" value="${esc(dwQ)}">
    ${html}
    <button class="fold ${showFin||searching?"open":""}" type="button" id="dwFin"><span>FINISHED JOBS (${(done.match(/data-dj=/g)||[]).length})</span><span>▶</span></button>
    ${showFin||searching?(done||`<div class="empty2">No finished jobs${searching?" match":""}.</div>`):""}
  </div>`;
  const qi=$("#dwQ"); qi.oninput=()=>{ dwQ=qi.value; const p=qi.selectionStart; renderDrawings(); const n=$("#dwQ"); n.focus(); n.setSelectionRange(p,p); };
  B.querySelectorAll("[data-dwn]").forEach(b=>b.onclick=()=>{ const k=b.dataset.dwn; showNone.has(k)?showNone.delete(k):showNone.add(k); renderDrawings(); });
  $("#dwFin").onclick=()=>{ showFin=!showFin; renderDrawings(); };
  B.querySelectorAll("[data-dj]").forEach(b=>b.onclick=()=>{ if(window.jpFresh) window.jpFresh(); openJobParts(b.dataset.dj,b.dataset.dn,"drawings"); });
}
function renderMyTodo(){
  const B=$("#board"); B.className="home"; B.style.gridTemplateColumns="";
  B.innerHTML=`<div class="hm shanim">${window.myTodoHtml?window.myTodoHtml():""}</div>`;
  if(window.myTodoWire) window.myTodoWire(B);
}
function renderCrewJobs(){ const B=$("#board"); B.className="home cjobs"; B.style.gridTemplateColumns=""; B.innerHTML=""; }
window.extraViews=Object.assign(window.extraViews||{},{punch:renderPunch,drawings:renderDrawings,mytodo:renderMyTodo,crewjobs:renderCrewJobs});
// when parts are imported or refreshed in the panel, the counts here go stale
const _ojp=window.openJobParts; if(_ojp) window.openJobParts=function(...a){ countsAt=0; return _ojp.apply(this,a); };

/* ---- render: Kyle's Home is the To do list ---- */
GVC.on("render:before",()=>{
  if(cur==="home") cur=homeView();              // "todo" is Home for Kyle, "mytodo" for the crew; everything that refreshes To do keeps working
  if(cur==="mytodo") cur=isCrewM()?"today":homeView();          // old crew Home link
  if(cur==="punch") cur=(isAdmin()||isCrewM())?"today":homeView(); // old Punch tab link
  if(cur==="today"&&!(isAdmin()||isCrewM())) cur=homeView();
  if(cur==="purchasing"&&isCrewM()) cur=homeView();               // crew don't see orders (same as the job card)
  if(cur==="drawings"&&!showDrawings()) cur=homeView();
  if(!isAdmin()&&["pipeline","ordering","build","overview"].includes(cur)) cur="crewjobs";   // crew + Robin: Jobs = the All jobs list, no boards
});
GVC.on("render:after",()=>{
  if(cur===homeView()||["punch","today","purchasing","drawings","mytodo","crewjobs","crew"].includes(cur)){ const sub=$("#subnav"); if(sub) sub.hidden=true; }
  { const L=document.querySelector("#app>section.list"); if(L){ if(!(window.ME&&ME.role==="parts")) L.classList.toggle("shhide",!(cur==="crewjobs"||["overview","pipeline","ordering","build","archive"].includes(cur)));
    else L.classList.toggle("shhide",cur!=="crewjobs"); } }
  navState();
});
})();
