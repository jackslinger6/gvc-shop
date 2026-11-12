-- Shop assemblies + new part numbers (Kyle, Nov 11 2026).
-- Old part numbers (part_no) stay as they are - Robin's sheet and the scanner still use them.
-- new_no: one counter for all parts, letter = kind: S sheet/plate, T tube/bar/angle, H bought. Mirrored pairs share a number with -L (driver) / -R (passenger).
-- Assemblies are W- numbers; asm_no on a part = the smallest assembly it belongs to. The nightly sync never touches new_no / asm_no.
create table if not exists public.gvc_assemblies(
  asm_no text primary key, name text not null, parent_no text references public.gvc_assemblies(asm_no), product text, ord int default 0, updated_at timestamptz default now());
alter table public.gvc_assemblies enable row level security;
drop policy if exists gvc_assemblies_read on public.gvc_assemblies;
create policy gvc_assemblies_read on public.gvc_assemblies for select to authenticated using (gvc_is_member());
alter table public.gvc_parts add column if not exists new_no text unique;
alter table public.gvc_parts add column if not exists asm_no text references public.gvc_assemblies(asm_no);

insert into public.gvc_assemblies(asm_no,name,parent_no,product,ord) values
('W-20001','Ford picker deck',null,'Ford picker deck',0),('W-20010','Subframe','W-20001','Ford picker deck',1),('W-20020','Rear apron','W-20001','Ford picker deck',2),('W-20021','Vise pockets','W-20020','Ford picker deck',3),
('W-20030','Big cabinet','W-20001','Ford picker deck',4),('W-20031','Cabinet shell','W-20030','Ford picker deck',5),('W-20032','Picker pad holders','W-20030','Ford picker deck',6),('W-20033','Lower drawer box (5" + 7" drawers)','W-20030','Ford picker deck',7),('W-20034','48" drawer','W-20030','Ford picker deck',8),('W-20035','Upper drawer box (3" drawers)','W-20030','Ford picker deck',9),('W-20036','Tool hangers','W-20030','Ford picker deck',10),('W-20037','Cabinet mounts','W-20030','Ford picker deck',11),('W-20038','Mudflap hangers','W-20030','Ford picker deck',12),('W-20039','Light hangers','W-20030','Ford picker deck',13),('W-20040','Doors','W-20030','Ford picker deck',14),('W-20041','Front covers','W-20030','Ford picker deck',15),('W-20042','Cabinet wood','W-20030','Ford picker deck',16),
('W-20050','Headache rack','W-20001','Ford picker deck',17),('W-20051','Spare tire holder','W-20050','Ford picker deck',18),('W-20060','Deck frame','W-20001','Ford picker deck',19),('W-20061','Rub rails','W-20060','Ford picker deck',20),('W-20062','Tube rack','W-20060','Ford picker deck',21),
('W-20070','Shovel rack','W-20001','Ford picker deck',22),('W-20071','Shovel rack body','W-20070','Ford picker deck',23),('W-20072','Tool holders','W-20070','Ford picker deck',24),('W-20073','Bent lid','W-20070','Ford picker deck',25),('W-20074','Shovel rack lights','W-20070','Ford picker deck',26),
('W-20080','Belly boxes','W-20001','Ford picker deck',27),('W-20090','Picker mount','W-20001','Ford picker deck',28),('W-20100','5th wheel / coupler hitch','W-20001','Ford picker deck',29)
on conflict (asm_no) do nothing;

with p as (select part_no, sort, description,
  case when part_no='Spacer' then '1' when part_no='Bungee Clip' then '3.7.x' when part_no='11-20104' then '6.14.x' when part_no='Wood Deck' then '5.x'
       else substring(replace(part_no,'-REV1','') from '^(?:SFF|SFD|SF|RA|BC29|BC|B|TR|D76\.875|D|SHV|BB28|PM|HC28|HFB28)\.(.*)$') end q from public.gvc_parts where asm_no is null),
m as (select p.*, case
  when part_no like 'BB28%' then 'W-20080'
  when q ~ '^1(\.|$)' then 'W-20010' when q ~ '^2\.5(\.|$)' then 'W-20021' when q ~ '^2(\.|$)' then 'W-20020'
  when q ~ '^3\.2(\.|$)' then 'W-20031' when q ~ '^3\.3(\.|$)' then 'W-20032' when q ~ '^3\.4(\.|$)' then 'W-20033' when q ~ '^3\.5(\.|$)' then 'W-20034' when q ~ '^3\.6(\.|$)' then 'W-20035'
  when q ~ '^3\.(7|10)(\.|$)' then 'W-20036' when q ~ '^3\.8(\.|$)' then 'W-20037' when q ~ '^3\.9(\.|$)' then 'W-20038' when q ~ '^3\.11(\.|$)' then 'W-20039' when q ~ '^3\.1[23](\.|$)' then 'W-20040' when q ~ '^3\.14(\.|$)' then 'W-20041' when q ~ '^3\.16(\.|$)' then 'W-20042'
  when q ~ '^4\.7(\.|$)' then 'W-20051' when q ~ '^4(\.|$)' then 'W-20050'
  when q ~ '^5\.2\.[23](\.|$)' then 'W-20061' when q ~ '^5\.5(\.|$)' then 'W-20062' when q ~ '^5(\.|$)' then 'W-20060'
  when q ~ '^6\.([2-5])(\.|$)' then 'W-20072' when q ~ '^6\.14(\.|$)' then 'W-20073' when q ~ '^6\.1[03](\.|$)' then 'W-20074' when q ~ '^6(\.|$)' then 'W-20071'
  when q ~ '^8(\.|$)' then 'W-20090' when q ~ '^11(\.|$)' then 'W-20100' end asm_no,
  case when part_no in ('11-20104','Wood Deck') then 'H' when description ~* '(HSS|FLB|F;B|RND|^C[0-9]|^L[0-9])' then 'T' else 'S' end k from p),
pairs(l,r) as (values ('RA.2.7.2','RA.2.7.1'),('BC.3.5.1.3','BC.3.5.1.2'),('BC.3.6.6','BC.3.6.7'),('BC.3.12.1.5','BC.3.12.2.5'),('BC.3.12.1.6','BC.3.12.2.6'),('BC.3.14.2','BC.3.14.1'),
  ('SHV.6.1.2.1','SHV.6.1.2.2'),('SHV.6.6.7.1','SHV.6.6.7.3-REV1'),('SHV.6.6.5-REV1','SHV.6.6.6-REV1'),('SHV.6.14.3','SHV.6.14.4'),('SHV.6.14.5','SHV.6.14.10'),('BB28.7.2','BB28.10.2')),
base as (select m.*, a.ord, row_number() over (order by a.ord, m.sort) + 10000 as n from m join public.gvc_assemblies a using(asm_no) where m.part_no not in (select r from pairs)),
nums as (select part_no, asm_no, k||'-'||n||case when part_no in (select l from pairs) then '-L' else '' end new_no from base
  union all select pr.r, m.asm_no, b.k||'-'||b.n||'-R' from pairs pr join base b on b.part_no=pr.l join m on m.part_no=pr.r)
update public.gvc_parts g set asm_no=nums.asm_no, new_no=nums.new_no from nums where g.part_no=nums.part_no;
