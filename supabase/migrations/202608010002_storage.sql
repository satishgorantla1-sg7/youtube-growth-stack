insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('voice-private', 'voice-private', false, 26214400, array['audio/webm','audio/mpeg','audio/mp4','audio/wav']),
  ('exports-private', 'exports-private', false, 52428800, array['application/pdf','text/markdown','application/json'])
on conflict (id) do nothing;

create policy "workspace voice read" on storage.objects for select to authenticated
using (bucket_id = 'voice-private' and app_private.is_workspace_member((storage.foldername(name))[1]::uuid));
create policy "workspace voice upload" on storage.objects for insert to authenticated
with check (bucket_id = 'voice-private' and app_private.is_workspace_member((storage.foldername(name))[1]::uuid));
create policy "workspace exports read" on storage.objects for select to authenticated
using (bucket_id = 'exports-private' and app_private.is_workspace_member((storage.foldername(name))[1]::uuid));
