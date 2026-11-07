/* Hardware photos.
   (Stock photos per part type were tried and dropped Nov 6 - Kyle prefers the drawn icons.)
   ITEM photos: Robin/Kyle tap "Add / replace photo" on any item and snap it on the desk. Stored at
      gvc-parts/hwimg/item/<hash of item key>.jpg - no database column, so the daily spreadsheet sync never touches it.
   Order shown: item photo > drawn icon (hw-icons.js) > nothing. */
(function(){
// short stable hash of the item key (cyrb53) -> safe file name
const hash=s=>{ let h1=0xdeadbeef,h2=0x41c6ce57; for(let i=0;i<s.length;i++){ const c=s.charCodeAt(i); h1=Math.imul(h1^c,2654435761); h2=Math.imul(h2^c,1597334677); }
  h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909); h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
  return (h2>>>0).toString(16).padStart(8,"0")+(h1>>>0).toString(16).padStart(8,"0"); };
const itemPath=h=>`hwimg/item/${hash(String(h.key))}.jpg`;
const URL_={}; // storage path -> signed url
const ITEMS=new Set(); // item paths that exist
let ready=false;
const rerender=()=>{ try{ if(typeof cur!=="undefined"&&(cur==="inv"||cur==="home")) render(); }catch(e){} };
async function sign(paths){ for(let i=0;i<paths.length;i+=100){ const r=await sb.storage.from("gvc-parts").createSignedUrls(paths.slice(i,i+100),60*60*12);
  (r.data||[]).forEach(u=>{ if(u.signedUrl) URL_[u.path]=u.signedUrl; }); } }
async function load(){
  try{ const l=await sb.storage.from("gvc-parts").list("hwimg/item",{limit:2000}); (l.data||[]).forEach(f=>{ if(f.name&&f.name.endsWith(".jpg")) ITEMS.add("hwimg/item/"+f.name); }); }catch(e){}
  try{ if(ITEMS.size) await sign([...ITEMS]); }catch(e){}
  ready=true; rerender();
}
let started=false;
setInterval(()=>{ if(!started&&typeof sb!=="undefined"&&sb&&window.ME){ started=true; load(); } },1500);

const drawn=window.hwPic; // drawn-icon fallback from hw-icons.js
const img=(u,cls,alt)=>`<span class="hwpic photo ${cls}"><img src="${u}" alt="${String(alt||"").replace(/"/g,"&quot;")}" loading="lazy" decoding="async"></span>`;
window.hwPic=(h,cls="")=>{
  const ip=itemPath(h); if(ITEMS.has(ip)&&URL_[ip]) return img(URL_[ip],cls,h.description);
  return drawn?drawn(h,cls):"";
};
window.hwHasOwnPhoto=h=>ITEMS.has(itemPath(h));
window.hwPhotoCredit=()=>"";

// shrink a camera photo to ~900px JPEG before upload (phone photos are 3-5 MB)
async function shrink(file){
  const bmp=await new Promise((res,rej)=>{ const im=new Image(); im.onload=()=>res(im); im.onerror=rej; im.src=URL.createObjectURL(file); });
  const s=Math.min(1,900/Math.max(bmp.naturalWidth,bmp.naturalHeight)); const c=document.createElement("canvas");
  c.width=Math.round(bmp.naturalWidth*s); c.height=Math.round(bmp.naturalHeight*s); c.getContext("2d").drawImage(bmp,0,0,c.width,c.height);
  URL.revokeObjectURL(bmp.src); return await new Promise(r=>c.toBlob(r,"image/jpeg",0.85));
}
window.hwPhotoSet=async(h,file)=>{
  const p=itemPath(h); const b=await shrink(file);
  const r=await sb.storage.from("gvc-parts").upload(p,b,{contentType:"image/jpeg",upsert:true}); if(r.error) throw r.error;
  ITEMS.add(p); await sign([p]); rerender();
};
window.hwPhotoRemove=async h=>{
  const p=itemPath(h); const r=await sb.storage.from("gvc-parts").remove([p]); if(r.error) throw r.error;
  ITEMS.delete(p); delete URL_[p]; rerender();
};
const css=document.createElement("style");
css.textContent=`.hwpic.photo{overflow:hidden;background:#fff}.hwpic.photo img{width:100%;height:100%;object-fit:cover;display:block}
.hwsheetpic.photo{width:180px;height:180px;border-radius:14px}
.hwcred{font-size:11px;color:var(--muted);text-align:center;margin:-4px 0 8px}.hwcred a{color:inherit}`;
document.head.appendChild(css);
})();
