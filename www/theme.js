/* ---------- Girly mode (Kyle, Nov 6 - for Robin) ----------
   More > "Girly mode" (saved per phone/browser, localStorage gvc_theme). A LIGHT pastel-rainbow theme built from the
   "Daydreaming" palette Kyle picked (coral, peach, butter, mint, aqua, sky, periwinkle, lavender, orchid, rose).
   Design rules followed: pastels are the backgrounds and accents, text is a deep plum from the same colour family (never
   white on pastel), buttons use the stronger pink with dark text, a soft blush page with white cards.
   How: every colour in the app's stylesheets is re-mapped at load (dark surfaces -> blush/white, light text -> deep
   plum, orange -> rose pink, green -> mint, blue -> periwinkle, purple -> lavender...) into one extra stylesheet that only
   applies under body.girly - so new screens get the theme without listing them here. */
(()=>{
const KEY="gvc_theme";
// palette: [pastel for backgrounds, deep shade for text/borders on a light page]
const P={rose:["#ffb3d1","#b8346f"],coral:["#ffa9a0","#b8443a"],peach:["#ffc8a6","#a8582a"],butter:["#ffe9a6","#8a6a0c"],mint:["#a9e8c8","#23805a"],
  aqua:["#a8e6e2","#1f7d79"],sky:["#a9d6f3","#2d6d9e"],peri:["#b7c6f6","#4057b8"],lav:["#cbb6f3","#6a45bd"],orchid:["#f1b3e6","#a33d93"]};
const TEXT="#3b2342", MUTED="#7d6184", DIM="#a58aa9";
const hueFam=h=>h<15||h>=345?"coral":h<45?"rose":h<68?"butter":h<170?"mint":h<200?"aqua":h<235?"sky":h<262?"peri":h<292?"lav":"orchid";

function parse(c){
  c=c.trim(); let m;
  if(c[0]==="#"){ let x=c.slice(1); if(x.length<=4) x=[...x].map(ch=>ch+ch).join(""); const n=parseInt(x.slice(0,6),16); return [n>>16&255,n>>8&255,n&255,x.length===8?parseInt(x.slice(6),16)/255:1]; }
  if((m=c.match(/rgba?\(([^)]+)\)/i))){ const p=m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat); return [p[0],p[1],p[2],p[3]==null||isNaN(p[3])?1:p[3]]; }
  return null;
}
function hsl([r,g,b]){ r/=255; g/=255; b/=255; const mx=Math.max(r,g,b), mn=Math.min(r,g,b), l=(mx+mn)/2; let h=0,s=0;
  if(mx!==mn){ const d=mx-mn; s=l>.5?d/(2-mx-mn):d/(mx+mn); h=mx===r?(g-b)/d+(g<b?6:0):mx===g?(b-r)/d+2:(r-g)/d+4; h*=60; } return [h,s,l]; }
const rgbStr=(hex,a)=>{ if(a>=1) return hex; const [r,g,b]=parse(hex); return `rgba(${r},${g},${b},${+a.toFixed(3)})`; };
// role: "bg" (backgrounds, gradients), "fg" (text, icons), "line" (borders), "shadow"
function mapColor(c,role){
  const p=parse(c); if(!p) return c; const a=p[3]; const [h,s,l]=hsl(p);
  const neutral=s<.22||l<.07||l>.97;
  if(role==="shadow") return neutral&&l<.5?`rgba(176,96,150,${Math.min(.2,a*.45).toFixed(3)})`:rgbStr(P[hueFam(h)][0],Math.min(.45,a));
  if(neutral){
    if(role==="fg") return rgbStr(l>.8?TEXT:l>.55?MUTED:l>.35?DIM:TEXT,a);   // dark text on buttons stays dark
    if(role==="line") return rgbStr(l>.6?"#f3d9ea":"#ebd0e3",a);
    if(l<.06) return rgbStr("#fff4fa",a);        // page
    if(l<.13) return rgbStr("#ffffff",a);        // cards
    if(l<.2) return rgbStr("#fdeef7",a);
    if(l<.35) return rgbStr("#f6dcec",a);
    if(l>.85&&a<.5) return `rgba(214,120,180,${Math.min(.2,a*1.6).toFixed(3)})`;   // white overlays -> pink tint
    return rgbStr(l>.6?"#fbe7f2":"#f1d6e8",a);
  }
  const f=P[hueFam(h)];
  if(role==="fg") return rgbStr(f[1],a);
  if(role==="line") return rgbStr(f[1],Math.min(1,a*.7));
  return rgbStr(f[0],a);
}
const COLRE=/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi;
const roleOf=prop=>/^--(text|muted|dim)$/.test(prop)?"fg":/^--line$/.test(prop)?"line":/^--(bg|panel|panel2)$/.test(prop)?"bg":/^--/.test(prop)?"accent"
  :/shadow/.test(prop)?"shadow":/^(border|outline)/.test(prop)?"line":/^(color|fill|stroke|caret-color|-webkit-text-fill-color)$/.test(prop)?"fg":/^background/.test(prop)?"bg":null;
function mapValue(prop,val){
  const role=roleOf(prop); if(!role) return null;
  if(role==="accent") return val.replace(COLRE,c=>{ const p=parse(c); if(!p) return c; const [h,s]=hsl(p); return s<.22?c:P[hueFam(h)][1]; });
  const out=val.replace(COLRE,c=>mapColor(c,role));
  return out===val?null:out;
}
const prefix=sel=>sel.split(",").map(s=>{ s=s.trim();
  if(/^(html|:root)\b/.test(s)) return "body.girly"+s.replace(/^(html|:root)\s*/,"").replace(/^body\b/,"");
  if(/^body\b/.test(s)) return "body.girly"+s.slice(4); return "body.girly "+s; }).join(",");
function themeRules(rules,out){
  for(const r of rules){
    if(r.cssRules&&r.media){ const inner=[]; themeRules(r.cssRules,inner); if(inner.length) out.push(`@media ${r.media.mediaText}{${inner.join("")}}`); continue; }
    if(!r.style||!r.selectorText) continue;
    const decl=[];
    for(let i=0;i<r.style.length;i++){ const prop=r.style[i]; const val=r.style.getPropertyValue(prop); if(!val) continue;
      if(/^font/.test(prop)&&/Oswald/.test(val)){ decl.push(`${prop}:${val.replace(/Oswald/g,"Quicksand")}!important`); continue; }
      const nv=mapValue(prop,val); if(nv) decl.push(`${prop}:${nv}${prop.startsWith("--")?"":"!important"}`); }
    if(decl.length) out.push(`${prefix(r.selectorText)}{${decl.join(";")}}`);
  }
}
const EXTRA=`
body.girly{--bg:#fff4fa;--panel:#ffffff;--panel2:#fdeef7;--line:#efd3e5;--text:${TEXT};--muted:${MUTED};--dim:${DIM};color:${TEXT};
  background-color:#fff4fa!important;background-image:radial-gradient(900px 520px at 8% -10%,rgba(255,179,209,.45),transparent 60%),radial-gradient(800px 520px at 100% 0%,rgba(203,182,243,.42),transparent 60%),
  radial-gradient(800px 600px at 50% 115%,rgba(169,214,243,.35),transparent 60%),radial-gradient(600px 400px at 0% 100%,rgba(255,233,166,.35),transparent 60%),linear-gradient(180deg,#fff7fb,#fdf0f8)!important}
body.girly .btn.primary,body.girly .shnav .plus,body.girly .talk,body.girly .whl .ctr,body.girly button.primary{background:linear-gradient(180deg,#ffc2dc,#ff97c4)!important;border-color:#ff97c4!important;color:#4a1430!important;box-shadow:0 6px 16px rgba(255,120,180,.35)!important}
body.girly .shnav .plus svg *,body.girly .talk svg *,body.girly .whl .ctr svg *{stroke:#4a1430!important}
body.girly .shnav{background:rgba(255,255,255,.94)!important;backdrop-filter:blur(8px);border-color:#f3d2e6!important}
body.girly .shtop .nm{color:#b8346f!important;letter-spacing:.06em}
body.girly .shtop .nm::after{content:" ♡";color:#ff8fc0}
body.girly .shsheet{background:#fffafd!important;box-shadow:0 -10px 40px rgba(200,100,160,.18)!important}
body.girly .shov.on{background:rgba(90,40,80,.22)!important}
body.girly .scrim{background:rgba(90,40,80,.28)!important}
body.girly .hereMic,body.girly .chatfab{background:linear-gradient(180deg,#d8c4fb,#b79cf3)!important;color:#2f1a5c!important}
body.girly .hereMic svg *{stroke:#2f1a5c!important}
body.girly .pnums button:nth-child(1){border-top-color:#a9d6f3!important}body.girly .pnums button:nth-child(2){border-top-color:#cbb6f3!important}body.girly .pnums button:nth-child(3){border-top-color:#ffc8a6!important}
body.girly .pcard,body.girly .mgrid button,body.girly .pnums button,body.girly .rqc,body.girly .hwr,body.girly .rc,body.girly .mycard,body.girly .mtr,body.girly .ti,body.girly .dlg{box-shadow:0 4px 14px rgba(214,120,180,.13)!important}
body.girly .mpv{background:linear-gradient(135deg,rgba(255,179,209,.25),rgba(203,182,243,.25))!important;border-color:#f1b3e6!important}
body.girly .mpvb button{background:#ffffff!important;border-color:#cbb6f3!important}
body.girly .mpvb .av{background:#cbb6f3!important;color:#2f1a5c!important}
body.girly ::selection{background:#ffc2dc}
body.girly .mgrid button:nth-child(9n+1) svg *{stroke:#d94f8c!important}body.girly .mgrid button:nth-child(9n+2) svg *{stroke:#e07a3a!important}body.girly .mgrid button:nth-child(9n+3) svg *{stroke:#c99a10!important}body.girly .mgrid button:nth-child(9n+4) svg *{stroke:#2f9a6a!important}body.girly .mgrid button:nth-child(9n+5) svg *{stroke:#2a9a95!important}body.girly .mgrid button:nth-child(9n+6) svg *{stroke:#3a7fc0!important}body.girly .mgrid button:nth-child(9n+7) svg *{stroke:#5a6fd0!important}body.girly .mgrid button:nth-child(9n+8) svg *{stroke:#7c55d0!important}body.girly .mgrid button:nth-child(9n+9) svg *{stroke:#b04aa0!important}
body.girly .mgrid button[data-m=signout] svg *{stroke:#c0453b!important}
body.girly #shChat svg *,body.girly #shBell svg *{stroke:#b8346f!important}
body.girly .shnav .ni svg *{stroke:currentColor!important}
body.girly .hwr{--c:#cbb6f3}body.girly .hwr.low{--c:#ff8fa0}
body.girly .mgrid button{background:#ffffff!important}`;
let sheet=null;
function build(){
  const out=[];
  for(const ss of [...document.styleSheets]){ if(ss.ownerNode&&ss.ownerNode.id==="gvcGirly") continue; let rs; try{ rs=ss.cssRules; }catch(e){ continue; } if(rs) themeRules(rs,out); }
  if(!sheet){ sheet=document.createElement("style"); sheet.id="gvcGirly"; }
  sheet.textContent=out.join("\n")+EXTRA;
  document.head.appendChild(sheet);   // keep it last so it wins ties
}
function font(){ if(document.getElementById("gvcQuicksand")) return; const l=document.createElement("link"); l.id="gvcQuicksand"; l.rel="stylesheet";
  l.href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&display=swap"; document.head.appendChild(l); }
const get=()=>{ try{ return localStorage.getItem(KEY)||""; }catch(e){ return ""; } };
let t=null; const rebuild=()=>{ clearTimeout(t); t=setTimeout(()=>{ if(get()==="girly") build(); },250); };
function apply(){ const on=get()==="girly"; if(on){ font(); build(); } document.body.classList.toggle("girly",on); }
window.gvcTheme={ get, set:v=>{ try{ localStorage.setItem(KEY,v); }catch(e){} apply(); }, toggle:()=>window.gvcTheme.set(get()==="girly"?"":"girly"), rebuild:build };
// screens add their own <style> tags as they load - re-map when new ones appear
new MutationObserver(ms=>{ if(ms.some(m=>[...m.addedNodes].some(n=>n.tagName==="STYLE"&&n.id!=="gvcGirly"))) rebuild(); }).observe(document.head,{childList:true});
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",apply); else apply();
window.addEventListener("load",()=>{ if(get()==="girly") build(); });
})();
