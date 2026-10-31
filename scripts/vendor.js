// Copies the Supabase browser bundle into www/vendor so the app works without a CDN.
const fs=require('fs'),path=require('path');
const src=require.resolve('@supabase/supabase-js/dist/umd/supabase.js');
fs.mkdirSync(path.join(__dirname,'..','www','vendor'),{recursive:true});
fs.copyFileSync(src,path.join(__dirname,'..','www','vendor','supabase.js'));
console.log('vendored',src);
