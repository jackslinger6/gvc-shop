/* ---------- Girly mode (Kyle, Nov 6 - for Robin) ----------
   A colour theme anyone can switch on from More > "Girly mode" (saved per phone/browser in localStorage gvc_theme).
   Pastel pink + lavender on a soft plum background. Only colours change - nothing else in the app. */
(()=>{
const KEY="gvc_theme";
const css=document.createElement("style");
css.textContent=`
body.girly{
  --bg:#2b1730; --panel:#3b2142; --panel2:#47294f; --line:#7a5482; --text:#fff3f9; --muted:#e9c3dc; --dim:#c39ab6;
  --orange:#ff9ecd; --amber:#ffc4e1; --red:#ff7aa8; --blue:#bba6ff; --purple:#d3a8ff; --cyan:#a9e4ff; --green:#a7f0cf; --pink:#ff9ecd;
  --pipe:#d3a8ff; --order:#ff9ecd; --build:#a7f0cf;
  background-color:var(--bg)!important;
  background-image:radial-gradient(900px 500px at 10% -10%,rgba(255,158,205,.28),transparent 60%),radial-gradient(800px 500px at 95% 5%,rgba(187,166,255,.25),transparent 60%),
    radial-gradient(700px 600px at 50% 110%,rgba(255,196,225,.14),transparent 60%),linear-gradient(180deg,#341c3a,#24132a)!important;
}
body.girly .btn.primary,body.girly .shnav .plus,body.girly .whl .ctr,body.girly button.primary{background:linear-gradient(180deg,#ffb3d6,#f07bb5)!important;border-color:#ffb3d6!important;color:#3a0d24!important;box-shadow:0 6px 18px rgba(255,120,190,.35)!important}
body.girly .shnav{background:#33193a!important;border-color:var(--line)!important}
body.girly .shnav .ni{color:#e0b6d3!important}
body.girly .shnav .ni.on{color:#ff9ecd!important}
body.girly .shsheet{background:#3a1f41!important;border-color:#8a5f92!important}
body.girly .mgrid button,body.girly .pcard,body.girly .pnums button,body.girly .mycard,body.girly .mtr,body.girly .mttot div,body.girly .mlist button,body.girly .cw .p,
body.girly .rqc,body.girly .hwr,body.girly .rc,body.girly .ci,body.girly .dlg,body.girly .card,body.girly .ti,body.girly .hm section>div:not(.cw):not(.pnums),body.girly .listhead,body.girly .tabs .tab,body.girly .subnav{
  background:linear-gradient(160deg,rgba(255,170,215,.10),rgba(190,160,255,.08)),#3b2142!important;border-color:#7a5482!important}
body.girly .mday .row2,body.girly .pkt{background:linear-gradient(90deg,rgba(255,158,205,.16),#3b2142 60%)!important}
body.girly .shtop .nm{color:#ffd1e8!important;text-shadow:0 0 18px rgba(255,140,200,.55)}
body.girly .shtop .nm::after{content:" ♡";color:#ff9ecd}
body.girly .ib,body.girly .btn{background:#47294f;border-color:#8a5f92}
body.girly .hereMic,body.girly .chatfab{background:linear-gradient(180deg,#d9b3ff,#a77ef0)!important;color:#25103a!important}
body.girly .soon{border-color:#9b72a3!important}
body.girly .mpv{border-color:rgba(255,158,205,.5)!important;background:rgba(255,158,205,.08)!important}
body.girly .mpvb button{border-color:#ff9ecd!important;background:linear-gradient(135deg,rgba(255,158,205,.3),rgba(190,160,255,.12))!important}
body.girly .mpvb .av,body.girly .pvbar{background:#ff9ecd!important}
body.girly h4,body.girly .hm h4{color:#f0bfdc!important}
body.girly input,body.girly select,body.girly textarea{background:#2f1934!important;border-color:#8a5f92!important;color:var(--text)!important}
body.girly #shChat svg{stroke:#ffb3d6!important}
body.girly .hereMic+*,body.girly [class*=hereMic] span,body.girly .hmLbl{color:#ffb3d6!important}
body.girly .scrim{background:rgba(30,10,30,.6)!important}
`;
document.head.appendChild(css);
const get=()=>{ try{ return localStorage.getItem(KEY)||""; }catch(e){ return ""; } };
const apply=()=>document.body.classList.toggle("girly",get()==="girly");
window.gvcTheme={ get, set:t=>{ try{ localStorage.setItem(KEY,t); }catch(e){} apply(); }, toggle:()=>window.gvcTheme.set(get()==="girly"?"":"girly") };
if(document.body) apply(); else document.addEventListener("DOMContentLoaded",apply);
})();
