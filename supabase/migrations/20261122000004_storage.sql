-- MyGrow 1.0 — Özel fotoğraf deposu
-- Dosya yolu kuralı: {organization_id}/{batch_id}/{rastgele_ad}.jpg
-- Kova herkese açık DEĞİLDİR; görüntüleme imzalı (süreli) URL ile yapılır.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('batch-photos', 'batch-photos', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do nothing;

create policy batch_photos_select on storage.objects
  for select to authenticated
  using (bucket_id = 'batch-photos'
         and public.is_org_member(public.try_uuid((storage.foldername(name))[1])));

create policy batch_photos_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'batch-photos'
              and public.has_org_role(public.try_uuid((storage.foldername(name))[1]),
                                      array['owner', 'manager', 'staff']::public.member_role[]));

create policy batch_photos_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'batch-photos'
         and public.has_org_role(public.try_uuid((storage.foldername(name))[1]),
                                 array['owner', 'manager']::public.member_role[]));
