-- 3D models on job parts (Nov 10 2026). Applied as migration gvc_job_parts_model_path.
-- STEP (folded part from Fusion) in bucket gvc-parts at jobs/<job_no>/model/<part_no>.step.
alter table public.gvc_job_parts add column if not exists model_path text;
comment on column public.gvc_job_parts.model_path is '3D model (STEP, folded) in bucket gvc-parts at jobs/<job_no>/model/<part_no>.step - shop reference, the bend drawing is the boss';

-- Inventory parts get a 3D model too (Nov 10 2026, migration gvc_parts_model_path)
alter table public.gvc_parts add column if not exists model_path text;
-- Whole-job assembly: bucket gvc-parts at jobs/<job_no>/model/_assembly.glb (Draco GLB; node extras {comp, body, path, mat, pn})
