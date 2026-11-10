/* ---------- Home = To do, plus Punch and Drawings tabs (Kyle, 2026-11-09) ----------
   - Home (Kyle): only the To do list. "Next up", crew today and My day moved off it.
   - PUNCH tab (Kyle): the punch clock - My day with Punch in / Done, My time this week, the crew.
     Crew (Colton) already has this as his Home, so he doesn't get a second copy.
   - DRAWINGS tab (Kyle + crew): active jobs that have parts & drawings, tap one to open its parts list.
     Jobs with no drawings yet and finished jobs are folded underneath, with a search. */
(()=>{
const isAdmin=()=>!(window.ME&&(ME.role==="crew"||ME.role==="parts"));
const showDrawings=()=>!(window.ME&&ME.role==="parts");
window.gvcHomeIsTodo=()=>isAdmin();

const css=document.createElement("style");
css.textContent=`
.dw{max-width:900px;margin-top:10px}
.dw h4{margin:16px 0 8px;font:500 12px Oswald,sans-serif;letter-spacing:.16em;color:var(--muted);display:flex;justify-content:space-between;align-items:baseline}
.dw h4:first-child{margin-top:0}
.dw input[type=search]{font:inherit;font-size:15px;background:var(--panel2);color:var(--text);border:1px solid var(--line);border-radius:10px;padding:10px 12px;width:100%;box-sizing:border-box}
.dw .dj{display:grid;grid-template-columns:auto 1fr auto;column-gap:12px;align-items:center;width:100%;text-align:left;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 14%,#17191d),#15171a 60%);border:1px solid #2a2e34;border-left:4px solid var(--c);border-radius:12px;padding:12px;margin-bottom:8px;color:var(--text);cursor:pointer;font:inherit}
.dw .dj:active{transform:scale(.985)}
.dw .dj.none{opacity:.55}
.dw .dn{font:600 14px Oswald,sans-serif;letter-spacing:.06em;background:rgba(0,0,0,.35);border:1px solid #3a3e45;border-radius:8px;padding:7px 9px;min-width:64px;text-align:center}
.dw .dt{font-weight:600;font-size:15.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dw .ds{font-size:12.5px;color:var(--muted);margin-top:2px}
.dw .dc{font:600 15px Oswald,sans-serif;color:#ffb36b;text-align:right;line-height:1.1}
.dw .dc small{display:block;font:500 10px Oswald,sans-serif;letter-spacing:.12em;color:var(--muted)}
.dw .fold{width:100%;display:flex;justify-content:space-between;align-items:center;background:none;border:1px solid var(--line);border-radius:10px;color:#cfd3d8;font:500 13px Oswald,sans-serif;letter-spacing:.12em;padding:11px 12px;cursor:pointer;margin:8px 0}
.dw .fold span:last-child{transition:transform .15s}
.dw .fold.open span:last-child{transform:rotate(90deg)}
.dw .empty2{font-size:13px;color:var(--muted);padding:8px 2px}
.shnav .ni.nx{font-size:12px}
@media (max-width:899px){ body.nav7 .shnav .ni{font-size:10.5px;letter-spacing:.04em} body.nav7 .shnav .ni svg{width:21px;height:21px} body.nav7 .shnav .plus{width:58px;height:58px} }
`;
document.head.appendChild(css);

/* ---- nav buttons ---- */
const I={
  draw:'<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  punch:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
};
const svg=k=>`<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[k]}</svg>`;
const nav=document.querySelector(".shnav");
let bD=null, bP=null;
if(nav){
  bD=document.createElement("button"); bD.className="ni nx"; bD.type="button"; bD.dataset.n="drawings"; bD.innerHTML=svg("draw")+"DRAWINGS";
  bP=document.createElement("button"); bP.className="ni nx"; bP.type="button"; bP.dataset.n="punch"; bP.innerHTML=svg("punch")+"PUNCH";
  const pw=nav.querySelector(".pluswrap"); nav.insertBefore(bD,pw); pw.after(bP);
  bD.onclick=()=>{ dwQ=""; showFin=false; shellGo("drawings"); };
  bP.onclick=()=>shellGo("punch");
}
function navState(){
  if(!nav) return;
  bD.style.display=showDrawings()?"":"none";
  bP.style.display=isAdmin()?"":"none";
  const on=cur==="todo"&&isAdmin()?"home":cur;
  if(["home","drawings","punch"].includes(on)) nav.querySelectorAll("[data-n]").forEach(b=>b.classList.toggle("on",b.dataset.n===on));
  const n=[...nav.children].filter(el=>!el.classList.contains("railcrew")&&getComputedStyle(el).display!=="none").length;
  const phone=window.innerWidth<900;
  if(phone) nav.style.setProperty("grid-template-columns",`repeat(${n},minmax(0,1fr))`,"important"); else nav.style.removeProperty("grid-template-columns");
  document.body.classList.toggle("nav7",n>=7);
}
window.addEventListener("resize",navState);

/* ---- Punch tab ---- */
function renderPunch(){
  const B=$("#board"); B.className="home"; B.style.gridTemplateColumns="";
  if(window.crewHome) window.crewHome(B); else B.innerHTML=`<div class="tnote">Punch clock not loaded.</div>`;
  const hm=B.querySelector(".hm"); if(hm) hm.classList.add("shanim");
}

/* ---- Drawings tab ---- */
let counts=null, countsAt=0, dwQ="", showNone=false, showFin=false;
function loadCounts(force){
  if(!force&&counts&&Date.now()-countsAt<60e3) return;
  countsAt=Date.now();
  if(window.jpCount) window.jpCount().then(c=>{ counts=c; if(cur==="drawings") render(); }).catch(()=>{});
}
const rest=n=>{ const num=window.jobNum?window.jobNum(n):""; return num?String(n).replace(/^\s*\S+\s*[-–:]?\s*/,"").trim()||n:n; };
function card(no,name,jid,c){
  const col=jid&&window.jobColor?window.jobColor(jid):"#6c727a";
  return `<button class="dj ${c?"":"none"}" type="button" style="--c:${col}" data-dj="${esc(no)}" data-dn="${esc(name||no)}"><span class="dn">${esc(no)}</span>
    <span style="min-width:0"><div class="dt">${esc(rest(name||no))}</div><div class="ds">${c?`${c.bent} bent · ${c.n-c.bent} flat`:"No drawings loaded yet"}</div></span>
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
  const withD=live.filter(j=>C[num(j)]).sort(byNo), noD=live.filter(j=>!C[num(j)]).sort(byNo);
  const finD=fin.sort((a,b)=>(C[num(b)]?1:0)-(C[num(a)]?1:0)||byNo(b,a));
  const list=(arr)=>arr.filter(j=>hit(j.name)).map(j=>card(num(j),j.name,j.id,C[num(j)])).join("");
  const act=list(withD)+orphans.filter(hit).map(no=>card(no,no,null,C[no])).join("");
  const none=list(noD), done=list(finD);
  const searching=words.length>0;
  B.innerHTML=`<div class="dw shanim">
    <input type="search" id="dwQ" placeholder="Find a job - number or name…" value="${esc(dwQ)}">
    <h4><span>ACTIVE JOBS</span><span>${counts?"":"LOADING…"}</span></h4>
    ${act||`<div class="empty2">${counts?(searching?"No active job with drawings matches.":"No drawings loaded on any active job yet. Open a job → Parts & drawings → Import zip."):""}</div>`}
    ${none?`<button class="fold ${showNone||searching?"open":""}" type="button" id="dwNone"><span>ACTIVE · NO DRAWINGS YET (${(none.match(/data-dj=/g)||[]).length})</span><span>▶</span></button>${showNone||searching?none:""}`:""}
    <button class="fold ${showFin||searching?"open":""}" type="button" id="dwFin"><span>FINISHED JOBS (${(done.match(/data-dj=/g)||[]).length})</span><span>▶</span></button>
    ${showFin||searching?(done||`<div class="empty2">No finished jobs${searching?" match":""}.</div>`):""}
  </div>`;
  const qi=$("#dwQ"); qi.oninput=()=>{ dwQ=qi.value; const p=qi.selectionStart; renderDrawings(); const n=$("#dwQ"); n.focus(); n.setSelectionRange(p,p); };
  const fn=$("#dwNone"); if(fn) fn.onclick=()=>{ showNone=!showNone; renderDrawings(); };
  $("#dwFin").onclick=()=>{ showFin=!showFin; renderDrawings(); };
  B.querySelectorAll("[data-dj]").forEach(b=>b.onclick=()=>{ if(window.jpFresh) window.jpFresh(); openJobParts(b.dataset.dj,b.dataset.dn,"drawings"); });
}
window.extraViews=Object.assign(window.extraViews||{},{punch:renderPunch,drawings:renderDrawings});
// when parts are imported or refreshed in the panel, the counts here go stale
const _ojp=window.openJobParts; if(_ojp) window.openJobParts=function(...a){ countsAt=0; return _ojp.apply(this,a); };

/* ---- render: Kyle's Home is the To do list ---- */
const _render=render;
render=function(){
  if(cur==="home"&&isAdmin()) cur="todo";        // "todo" is Home for Kyle; everything that refreshes To do keeps working
  if(cur==="punch"&&!isAdmin()) cur="home";
  if(cur==="drawings"&&!showDrawings()) cur="home";
  _render();
  if((cur==="todo"&&isAdmin())||cur==="punch"||cur==="drawings"){ const sub=$("#subnav"); if(sub) sub.hidden=true; }
  navState();
};
})();
