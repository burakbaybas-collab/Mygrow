-- MyGrow — RLS ve iş kuralı testleri
-- Çalıştırma (yerel Supabase):  psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_and_rules.test.sql
-- Bütün test tek bir işlem içinde çalışır ve sonunda geri alınır (ROLLBACK); veri bırakmaz.
-- Herhangi bir doğrulama başarısız olursa betik hata vererek durur.

begin;

-- Test kullanıcıları
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'sahip-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'sahip-b@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'okuyucu-a@test.local'),
  ('44444444-4444-4444-4444-444444444444', 'personel-a@test.local');

create temp table ctx (k text primary key, v uuid);
grant all on ctx to authenticated;

-- ---------------------------------------------------------------- Kullanıcı A
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

insert into ctx values ('org_a', public.create_organization('A Mantar İşletmesi', 'isletme', 'Yalova', 'Sahip A'));
insert into public.facilities (organization_id, name) select v, 'A Tesis' from ctx where k = 'org_a';
insert into ctx select 'fac_a', id from public.facilities where name = 'A Tesis';
insert into public.rooms (organization_id, facility_id, name)
  select (select v from ctx where k = 'org_a'), (select v from ctx where k = 'fac_a'), 'Oda 1';
insert into ctx select 'room_a', id from public.rooms where name = 'Oda 1';
insert into ctx select 'sp_po', id from public.species where scientific_name = 'Pleurotus ostreatus';
insert into ctx select 'sp_le', id from public.species where scientific_name = 'Lentinula edodes';
insert into ctx select 'proto_po', id from public.protocols where species_id = (select v from ctx where k = 'sp_po') and organization_id is null;

insert into public.strains (organization_id, species_id, code)
  select (select v from ctx where k = 'org_a'), (select v from ctx where k = 'sp_po'), 'PO-01';
insert into ctx select 'strain_po', id from public.strains where code = 'PO-01';

-- Parti oluştur: 100 torba × 2 kg; karışım 90 kg saman (%70 nem) + 10 kg kepek (%10 nem) + 20 kg su
insert into ctx select 'batch_a', public.create_batch(
  jsonb_build_object(
    'organization_id', (select v from ctx where k = 'org_a'),
    'batch_code', 'A-001',
    'species_id', (select v from ctx where k = 'sp_po'),
    'strain_id', (select v from ctx where k = 'strain_po'),
    'protocol_id', (select v from ctx where k = 'proto_po'),
    'cultivation_method', 'torba',
    'facility_id', (select v from ctx where k = 'fac_a'),
    'room_id', (select v from ctx where k = 'room_a'),
    'start_date', '2026-11-01',
    'inoculation_date', '2026-11-02',
    'unit_type', 'torba', 'unit_count', 100, 'wet_substrate_per_unit_kg', 2,
    'spawn_weight_kg', 10, 'spawn_rate_basis', 'yas'),
  jsonb_build_array(
    jsonb_build_object('component_name', 'Buğday samanı', 'role', 'substrat', 'wet_weight_kg', 90, 'moisture_percent', 70),
    jsonb_build_object('component_name', 'Kepek', 'role', 'katki', 'wet_weight_kg', 10, 'moisture_percent', 10),
    jsonb_build_object('component_name', 'Su', 'role', 'su', 'wet_weight_kg', 20, 'moisture_percent', 100),
    jsonb_build_object('component_name', 'Örtü', 'role', 'sonradan_eklenen', 'wet_weight_kg', 50, 'moisture_percent', 50)));

do $$
declare b record;
begin
  select * into b from public.batches where batch_code = 'A-001';
  -- karışım yaş = 120, kuru = 27 + 9 + 0 = 36 → oran 0.3; dolum 200 kg → kuru 60 kg
  assert b.total_wet_substrate_kg = 200, 'toplam yaş substrat 200 olmalı';
  assert round(b.total_dry_substrate_kg, 6) = 60, format('toplam kuru 60 olmalı, bulunan %s', b.total_dry_substrate_kg);
  assert b.dry_substrate_method = 'dolum_x_karisim_kuru_orani', 'kuru madde yöntemi';
  assert round(b.spawn_rate_percent, 6) = 5, 'misel oranı %5 (yaş) olmalı';
  assert b.current_stage_name = 'Hazırlık', 'ilk aşama protokolden gelmeli';
  assert b.protocol_snapshot is not null, 'protokol anlık görüntüsü kaydedilmeli';
  assert (select count(*) from public.batch_materials where batch_id = b.id) = 4, '4 bileşen';
  raise notice 'OK: parti oluşturma ve kuru madde hesabı';
end $$;

-- Aşama değişikliği: önceki aşama kapanır
select public.change_batch_stage((select v from ctx where k = 'batch_a'), 'İnkübasyon', 'inkubasyon', 3, null, '2026-11-03'::timestamptz, null);
do $$
begin
  assert (select count(*) from public.batch_stage_history where batch_id = (select v from ctx where k = 'batch_a')) = 2, '2 aşama kaydı';
  assert (select count(*) from public.batch_stage_history where batch_id = (select v from ctx where k = 'batch_a') and ended_at is null) = 1, 'tek açık aşama';
  assert (select current_stage_category from public.batches where batch_code = 'A-001') = 'inkubasyon', 'güncel aşama';
  raise notice 'OK: aşama geçişi';
end $$;

-- Suş-tür uyumsuzluğu reddedilmeli (shiitake partisine istiridye suşu)
do $$
begin
  begin
    perform public.create_batch(jsonb_build_object(
      'organization_id', (select v from ctx where k = 'org_a'), 'batch_code', 'A-ERR',
      'species_id', (select v from ctx where k = 'sp_le'), 'strain_id', (select v from ctx where k = 'strain_po'),
      'cultivation_method', 'kutuk', 'facility_id', (select v from ctx where k = 'fac_a')), '[]');
    raise exception 'TEST BAŞARISIZ: uyumsuz suş kabul edildi';
  exception when check_violation then
    raise notice 'OK: suş-tür uyumsuzluğu reddedildi';
  end;
end $$;

-- Kayıp birimleri çift sayılamaz: 100 birimlik partide 60 + 50 reddedilmeli
insert into public.loss_events (organization_id, batch_id, occurred_on, category, affected_units, newly_discarded_units)
  select (select v from ctx where k = 'org_a'), (select v from ctx where k = 'batch_a'), '2026-11-10', 'kontaminasyon_suphesi', 70, 60;
do $$
begin
  begin
    insert into public.loss_events (organization_id, batch_id, occurred_on, category, affected_units, newly_discarded_units)
      select (select v from ctx where k = 'org_a'), (select v from ctx where k = 'batch_a'), '2026-11-12', 'kontaminasyon_suphesi', 60, 50;
    raise exception 'TEST BAŞARISIZ: imha toplamı birim sayısını aştı';
  exception when check_violation then
    raise notice 'OK: imha edilen birimler başlangıç birimini aşamaz';
  end;
end $$;

-- Sistem şablonu düzenlenemez
do $$
declare n integer;
begin
  update public.protocols set name = 'hack' where id = (select v from ctx where k = 'proto_po');
  get diagnostics n = row_count;
  assert n = 0, 'TEST BAŞARISIZ: sistem şablonu güncellendi';
  raise notice 'OK: sistem şablonu salt okunur';
end $$;

-- Okuyucu ve personel üyeliği ekle (yalnızca sahip ekleyebilir)
insert into public.memberships (organization_id, user_id, role) values
  ((select v from ctx where k = 'org_a'), '33333333-3333-3333-3333-333333333333', 'viewer'),
  ((select v from ctx where k = 'org_a'), '44444444-4444-4444-4444-444444444444', 'staff');

-- ---------------------------------------------------------------- Kullanıcı B (başka işletme)
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
insert into ctx values ('org_b', public.create_organization('B Laboratuvarı', 'laboratuvar', null, 'Sahip B'));

do $$
declare n integer;
begin
  assert (select count(*) from public.organizations) = 1, 'B yalnızca kendi işletmesini görmeli';
  assert (select count(*) from public.batches) = 0, 'B, A partilerini görmemeli';
  assert (select count(*) from public.batch_materials) = 0, 'B, A substratlarını görmemeli';
  assert (select count(*) from public.facilities) = 0, 'B, A tesislerini görmemeli';
  assert (select count(*) from public.strains) = 0, 'B, A suşlarını görmemeli';
  assert (select count(*) from public.loss_events) = 0, 'B, A kayıplarını görmemeli';
  assert (select count(*) from public.memberships) = 1, 'B, A üyelerini görmemeli';
  assert (select count(*) from public.species where organization_id is null) = 7, 'sistem kataloğu herkese açık';

  update public.batches set notes = 'x' where batch_code = 'A-001';
  get diagnostics n = row_count;
  assert n = 0, 'B, A partisini güncelleyememeli';
  delete from public.batches where batch_code = 'A-001';
  get diagnostics n = row_count;
  assert n = 0, 'B, A partisini silememeli';
  raise notice 'OK: işletmeler arası okuma/yazma izolasyonu';
end $$;

-- B, A işletmesine parti ekleyemez
do $$
begin
  begin
    perform public.create_batch(jsonb_build_object(
      'organization_id', (select v from ctx where k = 'org_a'), 'batch_code', 'B-HACK',
      'species_id', (select v from ctx where k = 'sp_po'), 'cultivation_method', 'torba',
      'facility_id', (select v from ctx where k = 'fac_a')), '[]');
    raise exception 'TEST BAŞARISIZ: başka işletmeye parti eklendi';
  exception when insufficient_privilege then
    raise notice 'OK: başka işletmeye parti eklenemez';
  end;
end $$;

-- B kendini A'ya üye yapamaz
do $$
begin
  begin
    insert into public.memberships (organization_id, user_id, role)
      values ((select v from ctx where k = 'org_a'), '22222222-2222-2222-2222-222222222222', 'owner');
    raise exception 'TEST BAŞARISIZ: yetkisiz üyelik eklendi';
  exception when insufficient_privilege then
    raise notice 'OK: yetkisiz üyelik eklenemez';
  end;
end $$;

-- ---------------------------------------------------------------- Okuyucu (viewer)
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
do $$
declare n integer;
begin
  assert (select count(*) from public.batches) = 1, 'okuyucu partiyi görebilmeli';
  update public.batches set notes = 'x' where batch_code = 'A-001';
  get diagnostics n = row_count;
  assert n = 0, 'okuyucu güncelleyememeli';
  begin
    perform public.change_batch_stage((select v from ctx where k = 'batch_a'), 'Primordium', 'primordium');
    raise exception 'TEST BAŞARISIZ: okuyucu aşama değiştirdi';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK: salt okunur kullanıcı yazamaz';
end $$;

-- ---------------------------------------------------------------- Personel (staff)
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
do $$
declare n integer;
begin
  delete from public.batches where batch_code = 'A-001';
  get diagnostics n = row_count;
  assert n = 0, 'personel parti silememeli';
  update public.batches set notes = 'personel notu' where batch_code = 'A-001';
  get diagnostics n = row_count;
  assert n = 1, 'personel aktif partiyi güncelleyebilmeli';
  raise notice 'OK: personel düzenler ama silemez';
end $$;

-- Sahip partiyi tamamlar; personel artık düzeltemez
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
update public.batches set status = 'tamamlandi' where batch_code = 'A-001';
select set_config('request.jwt.claim.sub', '44444444-4444-4444-4444-444444444444', true);
do $$
begin
  begin
    update public.batches set notes = 'geç düzeltme' where batch_code = 'A-001';
    raise exception 'TEST BAŞARISIZ: personel tamamlanmış partiyi düzeltti';
  exception when insufficient_privilege then
    raise notice 'OK: tamamlanmış parti yalnızca sahip/yönetici tarafından düzeltilir';
  end;
end $$;

-- Protokol anlık görüntüsü değiştirilemez (sahip için bile)
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$
begin
  assert (select completed_at is not null from public.batches where batch_code = 'A-001'), 'completed_at otomatik dolmalı';
  begin
    update public.batches set protocol_snapshot = '{}'::jsonb where batch_code = 'A-001';
    raise exception 'TEST BAŞARISIZ: protokol anlık görüntüsü değişti';
  exception when insufficient_privilege then
    raise notice 'OK: geçmiş protokol bilgisi değişmez';
  end;
end $$;

-- Son sahip kaldırılamaz
do $$
begin
  begin
    update public.memberships set role = 'manager'
     where user_id = '11111111-1111-1111-1111-111111111111'
       and organization_id = (select v from ctx where k = 'org_a');
    raise exception 'TEST BAŞARISIZ: son sahip düşürüldü';
  exception when check_violation then
    raise notice 'OK: işletmenin en az bir sahibi kalır';
  end;
end $$;

-- Fotoğraf deposu: B, A klasörüne dosya yükleyemez
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$
begin
  begin
    insert into storage.objects (bucket_id, name)
      values ('batch-photos', (select v from ctx where k = 'org_a')::text || '/x/foto.jpg');
    raise exception 'TEST BAŞARISIZ: başka işletmenin klasörüne yüklendi';
  exception when insufficient_privilege then
    raise notice 'OK: fotoğraf deposu işletmeye özel';
  end;
end $$;

reset role;
rollback;
