/* ---------- Grouped navigation ----------
   Top: To do · Jobs · My time · Inventory   (+ small App ideas button)
   Jobs sub-tabs: Pipeline · Orders · Shop floor · Crew · NCRs · Revisions · Finished jobs (+ New job lives here)
   Inventory sub-tabs: Truck parts · Consumables */
(()=>{
const SECT={todo:"todo",pipeline:"jobs",ordering:"jobs",build:"jobs",crew:"jobs",ncr:"jobs",revs:"jobs",archive:"jobs",time:"time",inv:"inv",ideas:"more"};
const ls={get:k=>{try{return localStorage.getItem(k)}catch(e){return null}},set:(k,v)=>{try{localStorage.setItem(k,v)}catch(e){}}};
let lastJobs=ls.get("gvc_last_jobs")||"build";
const css=document.createElement("style");
css.textContent=`
.subnav{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0 0;padding:6px;border:1px solid var(--line);border-radius:10px;background:rgba(0,0,0,.25)}
.subnav[hidden]{display:none}
.subnav .sn{font:inherit;font-size:13px;font-weight:600;color:#cfc9c0;background:transparent;border:1px solid transparent;border-radius:8px;padding:6px 11px;cursor:pointer;display:flex;gap:6px;align-items:center}
.subnav .sn:hover{border-color:var(--line)}
.subnav .sn.on{background:rgba(255,255,255,.07);border-color:var(--c,#5a5f68);color:#fff;box-shadow:inset 0 -2px 0 var(--c,#ff8a2a)}
.subnav .sn .ct{font-size:11.5px;color:var(--muted);font-weight:600}
.subnav .sn .at{font-size:10.5px;font-weight:600;background:rgba(229,72,59,.18);color:#ff9b91;border:1px solid rgba(229,72,59,.5);border-radius:999px;padding:0 6px}
.subnav .sep{width:1px;background:var(--line);margin:4px 4px}
.subnav .grow{flex:1}
.invmode{display:none !important}
#ideasBtn{font-size:12.5px;padding:6px 10px}
#ncrBtn,#revBtn,#archBtn{display:none !important}
@media (max-width:900px){ .tabs{grid-template-columns:1fr 1fr !important} .tab[data-s]{grid-column:auto !important} .subnav .sep{display:none} .subnav .sn{padding:6px 9px} }
`;
document.head.appendChild(css);
const bar=document.querySelector("#app .bar");
const sub=document.createElement("div"); sub.className="subnav"; sub.id="subnav"; bar.after(sub);
const num=id=>{ const el=document.getElementById(id); const m=el&&el.textContent.match(/\((\d+)/); return m?+m[1]:0; };
function go(v){ cur=v; try{history.replaceState(null,"","#"+v)}catch(e){} render(); window.scrollTo({top:0}); }
const _render=render;
render=function(){
  _render();
  const T=$("#tabs"); const info={};
  T.querySelectorAll(".tab").forEach(b=>{ info[b.dataset.b]={ct:(b.querySelector(".ct")||{}).textContent||"",at:(b.querySelector(".at")||{}).outerHTML||"",atN:parseInt(((b.querySelector(".at")||{}).textContent||"0"))||0}; });
  const sec=SECT[cur]||"jobs"; if(sec==="jobs"&&lastJobs!==cur){ lastJobs=cur; ls.set("gvc_last_jobs",cur); }
  const ncrN=num("ncrBtn"), revN=num("revBtn"), archN=num("archBtn");
  const jobsAttn=["pipeline","ordering","build"].reduce((a,k)=>a+((info[k]||{}).atN||0),0)+((info.crew||{}).atN||0)+ncrN+revN;
  const invLow=(window.invMode?window.invMode.low():0);
  const top=[
    ["todo","To do","#ffd28a",(info.todo||{}).ct,(info.todo||{}).at],
    ["jobs","Jobs","#ff8a2a",jobs.length,jobsAttn?`<span class="at">${jobsAttn} need you</span>`:""],
    ["time","My time","#7fe3a0","",(info.time||{}).at],
    ["inv","Inventory","#9fb3c8",(info.inv||{}).ct,((info.inv||{}).at||"")+(invLow?`<span class="at">${invLow} low</span>`:"")],
  ];
  T.innerHTML=top.map(([k,t,c,ct,at])=>`<button class="tab ${sec===k?"on":""}" style="--c:${c}" role="tab" aria-selected="${sec===k}" data-s="${k}">${t}${ct!==""&&ct!=null?`<span class="ct">${ct}</span>`:""}${at||""}</button>`).join("");
  T.querySelectorAll("[data-s]").forEach(b=>b.onclick=()=>{ const s=b.dataset.s; go(s==="todo"?"todo":s==="jobs"?lastJobs:s==="time"?"time":"inv"); });
  // right side: + New job only in Jobs; App ideas small
  const add=$("#addJob"); if(add) add.style.display=sec==="jobs"?"":"none";
  const st=$("#status"); if(st) st.style.display=sec==="jobs"?"":"none";
  const ib=$("#ideasBtn"); if(ib){ ib.classList.toggle("primary",cur==="ideas"); const right=add&&add.parentNode; if(right&&ib.parentNode!==right) right.insertBefore(ib,$("#undoBtn")); }
  // sub navigation
  let h="";
  if(sec==="jobs"){
    const sn=(k,t,c,ct,at)=>`<button class="sn ${cur===k?"on":""}" style="--c:${c}" type="button" data-sv="${k}">${t}${ct!==""&&ct!=null?`<span class="ct">${ct}</span>`:""}${at||""}</button>`;
    const i=k=>info[k]||{};
    h=sn("pipeline","Pipeline","var(--pipe)",i("pipeline").ct,i("pipeline").at)+sn("ordering","Orders","var(--order)",i("ordering").ct,i("ordering").at)+sn("build","Shop floor","var(--build)",i("build").ct,i("build").at)
      +`<span class="sep"></span>`+sn("crew","Crew & week plan","#e9e6e1",i("crew").ct,i("crew").at)
      +`<span class="sep"></span>`+sn("ncr","NCRs","#e5483b","",ncrN?`<span class="at">${ncrN} open</span>`:"")+sn("revs","Revisions","#2f8ff0","",revN?`<span class="at">${revN}</span>`:"")
      +`<span class="grow"></span>`+sn("archive","Finished jobs","#6c727a",archN||"","");
  } else if(sec==="inv"&&window.invMode){
    const m=window.invMode.get();
    h=`<button class="sn ${m==="parts"?"on":""}" style="--c:#9fb3c8" type="button" data-im2="parts">Truck parts<span class="ct">${parts.length||""}</span></button><button class="sn ${m==="cons"?"on":""}" style="--c:#f5b041" type="button" data-im2="cons">Consumables${invLow?`<span class="at">${invLow} low</span>`:""}</button>`;
  }
  sub.innerHTML=h; sub.hidden=!h;
  sub.querySelectorAll("[data-sv]").forEach(b=>b.onclick=()=>go(b.dataset.sv));
  sub.querySelectorAll("[data-im2]").forEach(b=>b.onclick=()=>window.invMode.set(b.dataset.im2));
};
})();
