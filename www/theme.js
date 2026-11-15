/* ---------- Appearance: Dark (default) / Light / System, and Girly mode (Kyle, Nov 6 - for Robin) ----------
   Stage 9 (Nov 14): Light mode uses the same re-map engine as Girly with a neutral palette (THEMES.light).
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
function mapColorGirly(c,role){
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
/* ---- Light mode (stage 9, Kyle Nov 14): same re-map engine, a neutral palette - soft gray page, white cards, slate text,
   burnt-orange accent (white text on it), and every coloured TEXT darkened so it reads on white. Translucent coloured
   tints are kept (they show as light tints on white). ---- */
const L_TEXT="#182230", L_MUTED="#536174", L_DIM="#7a8696";
const hex=(r,g,b)=>"#"+[r,g,b].map(v=>Math.round(Math.max(0,Math.min(255,v))).toString(16).padStart(2,"0")).join("");
function hslHex(h,s,l){ const k=n=>(n+h/30)%12, a=s*Math.min(l,1-l), f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1))); return hex(f(0)*255,f(8)*255,f(4)*255); }
function mapColorLight(c,role){
  const p=parse(c); if(!p) return c; const a=p[3]; const [h,s,l]=hsl(p);
  const neutral=s<.22||l<.07||l>.97;
  if(role==="shadow") return `rgba(16,24,40,${Math.min(.12,a*.3).toFixed(3)})`;
  if(neutral){
    if(role==="fg") return rgbStr(l>.8?L_TEXT:l>.55?L_MUTED:l>.35?L_DIM:L_TEXT,a);
    if(role==="line") return rgbStr(l>.6?"#c3ccd7":"#d2d9e2",a);
    if(l<.06) return rgbStr("#f3f5f7",a);
    if(l<.13) return rgbStr("#ffffff",a);
    if(l<.2) return rgbStr("#f7f9fb",a);
    if(l<.35) return rgbStr("#e9edf2",a);
    if(l>.85&&a<.5) return `rgba(24,34,48,${Math.min(.08,a*1.2).toFixed(3)})`;   // white overlays -> faint slate
    return rgbStr(l>.6?"#eef1f4":"#e3e8ee",a);
  }
  if(role==="fg") return rgbStr(hslHex(h,Math.min(1,s*1.05),Math.min(.36,l)),a);           // coloured text: deep shade of the same hue
  if(role==="line") return rgbStr(hslHex(h,Math.min(.9,s),.5),Math.min(1,a));
  if(a<1) return c;                                                                        // tints stay tints
  return rgbStr(hslHex(h,Math.min(.85,s),Math.min(.5,Math.max(.4,l*.85))),a);              // solid fills a touch deeper
}
const THEMES={girly:{map:mapColorGirly,accent:(h,c)=>P[hueFam(h)][1]},light:{map:mapColorLight,accent:(h,c)=>c}};
let CUR="girly";
const mapColor=(c,role)=>THEMES[CUR].map(c,role);
const COLRE=/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)/gi;
const roleOf=prop=>/^--(text|muted|dim)$/.test(prop)?"fg":/^--line$/.test(prop)?"line":/^--(bg|panel|panel2)$/.test(prop)?"bg":/^--/.test(prop)?"accent"
  :/shadow/.test(prop)?"shadow":/^(border|outline)/.test(prop)?"line":/^(color|fill|stroke|caret-color|-webkit-text-fill-color)$/.test(prop)?"fg":/^background/.test(prop)?"bg":null;
function mapValue(prop,val){
  const role=roleOf(prop); if(!role) return null;
  if(role==="accent") return val.replace(COLRE,c=>{ const p=parse(c); if(!p) return c; const [h,s]=hsl(p); return s<.22?c:THEMES[CUR].accent(h,c); });
  const out=val.replace(COLRE,c=>mapColor(c,role));
  return out===val?null:out;
}
const prefix=sel=>sel.split(",").map(s=>{ s=s.trim();
  const B="body."+CUR;
  if(/^(html|:root)\b/.test(s)) return B+s.replace(/^(html|:root)\s*/,"").replace(/^body\b/,"");
  if(/^body\b/.test(s)) return B+s.slice(4); return B+" "+s; }).join(",");
function themeRules(rules,out){
  for(const r of rules){
    if(r.cssRules&&r.media){ const inner=[]; themeRules(r.cssRules,inner); if(inner.length) out.push(`@media ${r.media.mediaText}{${inner.join("")}}`); continue; }
    if(!r.style||!r.selectorText) continue;
    const decl=[];
    for(let i=0;i<r.style.length;i++){ const prop=r.style[i]; const val=r.style.getPropertyValue(prop); if(!val) continue;
      if(CUR==="girly"&&/^font/.test(prop)&&/Oswald/.test(val)){ decl.push(`${prop}:${val.replace(/Oswald/g,"Quicksand")}!important`); continue; }
      const nv=mapValue(prop,val); if(nv) decl.push(`${prop}:${nv}${prop.startsWith("--")?"":"!important"}`); }
    if(decl.length) out.push(`${prefix(r.selectorText)}{${decl.join(";")}}`);
  }
}
const EXTRA=`
body.girly{--font-display:Quicksand,Inter,system-ui,sans-serif;--bg:#fff4fa;--panel3:#fbe7f2;--inset:#fff7fb;--line2:#e7c3da;--accent:#ff97c4;--accent-hi:#ff97c4;--on-accent:#4a1430;--accent-soft:rgba(255,151,196,.18);--accent-line:rgba(255,151,196,.6);--focus:0 0 0 2px #fff4fa,0 0 0 4px #e0569a;--panel:#ffffff;--panel2:#fdeef7;--line:#efd3e5;--text:${TEXT};--muted:${MUTED};--dim:${DIM};color:${TEXT};
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
const EXTRA_LIGHT=`
body.light{color-scheme:light;--bg:#f3f5f7;--panel:#ffffff;--panel2:#f7f9fb;--panel3:#e9edf2;--inset:#eef1f4;--line:#d2d9e2;--line2:#c3ccd7;--text:#182230;--muted:#536174;--dim:#7a8696;
  --accent:#b84d00;--accent-hi:#9c4100;--on-accent:#ffffff;--accent-soft:rgba(184,77,0,.10);--accent-line:rgba(184,77,0,.45);
  --orange:#b84d00;--amber:#a86a00;--red:#c62828;--blue:#1d64c8;--purple:#6d3fd1;--cyan:#0b7285;--green:#1b7f3b;--pink:#b8246e;--pipe:#6d55c9;--order:#b84d00;--build:#1b7f3b;
  --shadow-1:0 1px 2px rgba(16,24,40,.08);--shadow-2:0 8px 24px rgba(16,24,40,.10);--shadow-3:0 16px 48px rgba(16,24,40,.14);--focus:0 0 0 2px #fff,0 0 0 4px #b84d00;
  background:#f3f5f7!important;color:#182230}
body.light .btn.primary,body.light button.primary,body.light .shnav .plus,body.light .talk,body.light .whl .ctr,body.light .nu .nac .go,body.light #gFlat .cfpa .go{background:#b84d00!important;border-color:#b84d00!important;color:#ffffff!important}
body.light .shnav .plus svg *,body.light .talk svg *,body.light .whl .ctr svg *{stroke:#ffffff!important}
body.light .shnav{background:#ffffff!important;border-color:#d2d9e2!important}
body.light .shnav .ni.on{color:#182230!important}body.light .shnav .ni.on svg{color:#b84d00!important}
body.light .shtop .nm{color:#182230!important}body.light .shtop .nm b{color:#b84d00!important}
body.light .shsheet{background:#ffffff!important;box-shadow:0 -10px 40px rgba(16,24,40,.12)!important}
body.light .shov.on{background:rgba(16,24,40,.35)!important}body.light .scrim{background:rgba(16,24,40,.40)!important}
body.light .ti,body.light .dlg,body.light .jlrow,body.light .ncard,body.light .grp{box-shadow:none}
body.light ::selection{background:rgba(184,77,0,.2)}
body.light .pvtag{color:#111}`;
let sheet=null;
function build(){
  const out=[];
  for(const ss of [...document.styleSheets]){ if(ss.ownerNode&&ss.ownerNode.id==="gvcGirly") continue; let rs; try{ rs=ss.cssRules; }catch(e){ continue; } if(rs) themeRules(rs,out); }
  if(!sheet){ sheet=document.createElement("style"); sheet.id="gvcGirly"; }
  sheet.textContent=out.join("\n")+(CUR==="light"?EXTRA_LIGHT:EXTRA);
  document.head.appendChild(sheet);   // keep it last so it wins ties
}
function font(){ if(document.getElementById("gvcQuicksand")) return; const l=document.createElement("link"); l.id="gvcQuicksand"; l.rel="stylesheet";
  l.href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&display=swap"; document.head.appendChild(l); }
const get=()=>{ try{ return localStorage.getItem(KEY)||""; }catch(e){ return ""; } };
const AKEY="gvc_appear";
const getAppear=()=>{ try{ return localStorage.getItem(AKEY)||"dark"; }catch(e){ return "dark"; } };
const mq=window.matchMedia?matchMedia("(prefers-color-scheme: light)"):null;
// what's on screen: girly (Robin's pastel theme) wins; otherwise light / dark, "system" follows the phone / computer
const active=()=>get()==="girly"?"girly":(getAppear()==="light"||(getAppear()==="system"&&mq&&mq.matches))?"light":"dark";
let forced=null;   // Robin's-view preview
let t=null; const rebuild=()=>{ clearTimeout(t); t=setTimeout(()=>{ const a=forced||active(); if(a!=="dark"){ CUR=a; build(); } },250); };
function apply(){ const a=forced||active();
  if(a==="girly") font();
  if(a!=="dark"){ CUR=a; build(); } else if(sheet) sheet.textContent="";
  document.body.classList.toggle("girly",a==="girly"); document.body.classList.toggle("light",a==="light");
  const m=document.querySelector('meta[name="theme-color"]'); if(m) m.setAttribute("content",a==="light"?"#f3f5f7":a==="girly"?"#fff4fa":"#111315"); }
if(mq&&mq.addEventListener) mq.addEventListener("change",()=>{ if(getAppear()==="system") apply(); });
window.gvcTheme={ get, active, appear:getAppear,
  set:v=>{ try{ localStorage.setItem(KEY,v); }catch(e){} apply(); },
  setAppear:v=>{ try{ localStorage.setItem(AKEY,v); }catch(e){} apply(); },
  toggle:()=>window.gvcTheme.set(get()==="girly"?"":"girly"), rebuild:()=>{ CUR=forced||active(); if(CUR!=="dark") build(); },
  // Kyle's "Robin's view" preview shows her girly mode without changing his own setting
  preview:on=>{ forced=on?"girly":null; apply(); } };
// screens add their own <style> tags as they load - re-map when new ones appear
new MutationObserver(ms=>{ if(ms.some(m=>[...m.addedNodes].some(n=>n.tagName==="STYLE"&&n.id!=="gvcGirly"))) rebuild(); }).observe(document.head,{childList:true});
if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",apply); else apply();
window.addEventListener("load",()=>{ const a=forced||active(); if(a!=="dark"){ CUR=a; build(); } });
})();
