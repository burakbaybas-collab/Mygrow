-- MyGrow 1.0 — İşlem fonksiyonları (RPC)
-- Çok tablolu kayıtlar tek işlem (transaction) içinde yapılır; yarım kayıt oluşmaz.
-- create_organization dışındaki fonksiyonlar SECURITY INVOKER çalışır: RLS geçerlidir.

-- ---------------------------------------------------------------------------
-- İşletme oluştur + oluşturanı sahip yap
-- ---------------------------------------------------------------------------
create or replace function public.create_organization(
  p_name text,
  p_org_type text default 'isletme',
  p_city text default null,
  p_display_name text default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_org   uuid;
  v_email text;
begin
  if v_uid is null then
    raise exception 'Oturum bulunamadı' using errcode = '28000';
  end if;
  if p_name is null or length(trim(p_name)) < 2 then
    raise exception 'İşletme adı en az 2 karakter olmalıdır' using errcode = '23514';
  end if;

  insert into public.organizations (name, org_type, city, created_by)
  values (trim(p_name), coalesce(nullif(p_org_type, ''), 'isletme'), nullif(trim(p_city), ''), v_uid)
  returning id into v_org;

  select email into v_email from auth.users where id = v_uid;

  insert into public.memberships (organization_id, user_id, role, display_name, email)
  values (v_org, v_uid, 'owner', nullif(trim(p_display_name), ''), v_email);

  return v_org;
end;
$$;

revoke execute on function public.create_organization(text, text, text, text) from public, anon;
grant execute on function public.create_organization(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Yeni üretim partisi (parti + substrat bileşenleri + ilk aşama + protokol anlık görüntüsü)
-- Kuru madde hesabı src/lib/calc/substrate.ts ile AYNI tanımı kullanır:
--   karışım (substrat+katkı+su) kuru oranı = Σ kuru / Σ yaş
--   birim dolumu varsa: toplam kuru = (birim sayısı × birim yaş ağırlığı) × kuru oran
--   yoksa:              toplam kuru = Σ bileşen kuru ağırlığı
-- Örtü toprağı ve sonradan eklenenler başlangıç kuru substratına dahil edilmez.
-- ---------------------------------------------------------------------------
create or replace function public.create_batch(p_batch jsonb, p_materials jsonb default '[]'::jsonb)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_org         uuid := public.try_uuid(p_batch ->> 'organization_id');
  v_batch       uuid;
  v_snapshot    jsonb;
  v_recipe_name text;
  v_recipe_ver  integer;
  v_mix_wet     numeric;
  v_mix_dry     numeric;
  v_missing     integer;
  v_total_wet   numeric;
  v_total_dry   numeric;
  v_method      text;
  v_unit_count  integer := nullif(p_batch ->> 'unit_count', '')::integer;
  v_per_unit    numeric := nullif(p_batch ->> 'wet_substrate_per_unit_kg', '')::numeric;
  v_spawn       numeric := nullif(p_batch ->> 'spawn_weight_kg', '')::numeric;
  v_basis       public.spawn_basis := nullif(p_batch ->> 'spawn_rate_basis', '')::public.spawn_basis;
  v_rate        numeric;
  v_stage_name  text := nullif(trim(p_batch ->> 'initial_stage_name'), '');
  v_stage_cat   public.stage_category := coalesce(nullif(p_batch ->> 'initial_stage_category', ''), 'diger')::public.stage_category;
  v_stage_order integer := nullif(p_batch ->> 'initial_stage_order', '')::integer;
  v_stage_id    uuid := public.try_uuid(p_batch ->> 'initial_protocol_stage_id');
  v_start       date := coalesce(nullif(p_batch ->> 'start_date', '')::date, current_date);
begin
  if v_org is null then
    raise exception 'İşletme belirtilmelidir' using errcode = '23502';
  end if;
  if not public.has_org_role(v_org, array['owner', 'manager', 'staff']::public.member_role[]) then
    raise exception 'Bu işletmede parti oluşturma yetkiniz yok' using errcode = '42501';
  end if;

  -- Protokol anlık görüntüsü (sonradan protokol değişse de parti geçmişi korunur)
  if public.try_uuid(p_batch ->> 'protocol_id') is not null then
    select jsonb_build_object(
             'protocol', to_jsonb(p),
             'stages', coalesce((select jsonb_agg(to_jsonb(s) order by s.stage_order)
                                   from public.protocol_stages s where s.protocol_id = p.id), '[]'::jsonb),
             'snapshot_at', now())
      into v_snapshot
      from public.protocols p
     where p.id = (p_batch ->> 'protocol_id')::uuid;
    if v_snapshot is null then
      raise exception 'Seçilen protokol bulunamadı' using errcode = '23503';
    end if;
  end if;

  if public.try_uuid(p_batch ->> 'recipe_id') is not null then
    select name, version into v_recipe_name, v_recipe_ver
      from public.substrate_recipes
     where id = (p_batch ->> 'recipe_id')::uuid and organization_id = v_org;
  end if;

  -- Başlangıç substratı karışımı
  select coalesce(sum(nullif(m ->> 'wet_weight_kg', '')::numeric), 0),
         coalesce(sum(nullif(m ->> 'wet_weight_kg', '')::numeric
                       * (1 - nullif(m ->> 'moisture_percent', '')::numeric / 100)), 0),
         count(*) filter (where nullif(m ->> 'moisture_percent', '') is null)
    into v_mix_wet, v_mix_dry, v_missing
    from jsonb_array_elements(coalesce(p_materials, '[]'::jsonb)) as m
   where coalesce(nullif(m ->> 'role', ''), 'substrat') in ('substrat', 'katki', 'su');

  if v_unit_count is not null and v_per_unit is not null then
    v_total_wet := v_unit_count * v_per_unit;
  elsif v_mix_wet > 0 then
    v_total_wet := v_mix_wet;
  end if;

  if v_mix_wet > 0 and v_missing = 0 then
    if v_unit_count is not null and v_per_unit is not null then
      v_total_dry := v_total_wet * (v_mix_dry / v_mix_wet);
      v_method := 'dolum_x_karisim_kuru_orani';
    else
      v_total_dry := v_mix_dry;
      v_method := 'karisim_toplami';
    end if;
  end if;

  if v_spawn is not null and v_basis is not null then
    v_rate := case
      when v_basis = 'yas'  and v_total_wet > 0 then v_spawn / v_total_wet * 100
      when v_basis = 'kuru' and v_total_dry > 0 then v_spawn / v_total_dry * 100
    end;
  end if;

  insert into public.batches (
    organization_id, batch_code, species_id, strain_id, protocol_id, protocol_snapshot,
    recipe_id, recipe_name, recipe_version, cultivation_method, facility_id, room_id,
    responsible_name, start_date, inoculation_date, unit_type, unit_count,
    wet_substrate_per_unit_kg, total_wet_substrate_kg, total_dry_substrate_kg, dry_substrate_method,
    spawn_weight_kg, spawn_rate_basis, spawn_rate_percent, substrate_ph,
    treatment_method, treatment_date, substrate_notes, notes, is_demo
  ) values (
    v_org,
    trim(p_batch ->> 'batch_code'),
    (p_batch ->> 'species_id')::uuid,
    public.try_uuid(p_batch ->> 'strain_id'),
    public.try_uuid(p_batch ->> 'protocol_id'),
    v_snapshot,
    public.try_uuid(p_batch ->> 'recipe_id'),
    coalesce(v_recipe_name, nullif(trim(p_batch ->> 'recipe_name'), '')),
    coalesce(v_recipe_ver, nullif(p_batch ->> 'recipe_version', '')::integer),
    (p_batch ->> 'cultivation_method')::public.cultivation_method,
    (p_batch ->> 'facility_id')::uuid,
    public.try_uuid(p_batch ->> 'room_id'),
    nullif(trim(p_batch ->> 'responsible_name'), ''),
    v_start,
    nullif(p_batch ->> 'inoculation_date', '')::date,
    nullif(p_batch ->> 'unit_type', ''),
    v_unit_count,
    v_per_unit,
    v_total_wet,
    v_total_dry,
    v_method,
    v_spawn,
    v_basis,
    v_rate,
    nullif(p_batch ->> 'substrate_ph', '')::numeric,
    nullif(p_batch ->> 'treatment_method', '')::public.substrate_treatment,
    nullif(p_batch ->> 'treatment_date', '')::date,
    nullif(trim(p_batch ->> 'substrate_notes'), ''),
    nullif(trim(p_batch ->> 'notes'), ''),
    coalesce((p_batch ->> 'is_demo')::boolean, false)
  )
  returning id into v_batch;

  insert into public.batch_materials (
    organization_id, batch_id, sort_order, component_name, role, wet_weight_kg, moisture_percent, added_on, notes
  )
  select v_org, v_batch, (t.ord - 1)::integer,
         trim(t.m ->> 'component_name'),
         coalesce(nullif(t.m ->> 'role', ''), 'substrat')::public.material_role,
         nullif(t.m ->> 'wet_weight_kg', '')::numeric,
         nullif(t.m ->> 'moisture_percent', '')::numeric,
         nullif(t.m ->> 'added_on', '')::date,
         nullif(trim(t.m ->> 'notes'), '')
    from jsonb_array_elements(coalesce(p_materials, '[]'::jsonb)) with ordinality as t(m, ord);

  -- İlk aşama: verilmediyse protokolün ilk aşaması
  if v_stage_name is null and v_snapshot is not null and jsonb_array_length(v_snapshot -> 'stages') > 0 then
    v_stage_name  := v_snapshot -> 'stages' -> 0 ->> 'name';
    v_stage_cat   := (v_snapshot -> 'stages' -> 0 ->> 'category')::public.stage_category;
    v_stage_order := (v_snapshot -> 'stages' -> 0 ->> 'stage_order')::integer;
    v_stage_id    := (v_snapshot -> 'stages' -> 0 ->> 'id')::uuid;
  end if;

  if v_stage_name is not null then
    insert into public.batch_stage_history (
      organization_id, batch_id, protocol_stage_id, stage_order, stage_name, category, started_at, notes
    ) values (
      v_org, v_batch, v_stage_id, v_stage_order, v_stage_name, v_stage_cat, v_start::timestamptz,
      'Parti oluşturulurken başlatıldı'
    );
    update public.batches
       set current_stage_name = v_stage_name,
           current_stage_category = v_stage_cat,
           current_stage_started_at = v_start::timestamptz
     where id = v_batch;
  end if;

  return v_batch;
end;
$$;

revoke execute on function public.create_batch(jsonb, jsonb) from public, anon;
grant execute on function public.create_batch(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Gelişim aşaması değiştir (açık aşamayı kapatır, yenisini açar)
-- ---------------------------------------------------------------------------
create or replace function public.change_batch_stage(
  p_batch_id uuid,
  p_stage_name text,
  p_category public.stage_category default 'diger',
  p_stage_order integer default null,
  p_protocol_stage_id uuid default null,
  p_started_at timestamptz default null,
  p_notes text default null
)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_org     uuid;
  v_status  public.batch_status;
  v_open_id uuid;
  v_open_at timestamptz;
  v_start   timestamptz := coalesce(p_started_at, now());
  v_id      uuid;
begin
  if p_stage_name is null or length(trim(p_stage_name)) = 0 then
    raise exception 'Aşama adı boş olamaz' using errcode = '23514';
  end if;

  select organization_id, status into v_org, v_status from public.batches where id = p_batch_id;
  if v_org is null then
    raise exception 'Parti bulunamadı' using errcode = '23503';
  end if;
  if not public.has_org_role(v_org, array['owner', 'manager', 'staff']::public.member_role[]) then
    raise exception 'Bu partide aşama değiştirme yetkiniz yok' using errcode = '42501';
  end if;
  if v_status <> 'aktif' then
    raise exception 'Yalnızca aktif partilerde aşama değiştirilebilir' using errcode = '23514';
  end if;

  select id, started_at into v_open_id, v_open_at
    from public.batch_stage_history
   where batch_id = p_batch_id and ended_at is null;

  if v_open_id is not null then
    if v_start < v_open_at then
      raise exception 'Yeni aşamanın başlangıcı, mevcut aşamanın başlangıcından önce olamaz' using errcode = '23514';
    end if;
    update public.batch_stage_history set ended_at = v_start where id = v_open_id;
  end if;

  insert into public.batch_stage_history (
    organization_id, batch_id, protocol_stage_id, stage_order, stage_name, category, started_at, notes
  ) values (
    v_org, p_batch_id, p_protocol_stage_id, p_stage_order, trim(p_stage_name),
    coalesce(p_category, 'diger'), v_start, nullif(trim(p_notes), '')
  ) returning id into v_id;

  update public.batches
     set current_stage_name = trim(p_stage_name),
         current_stage_category = coalesce(p_category, 'diger'),
         current_stage_started_at = v_start
   where id = p_batch_id;

  return v_id;
end;
$$;

revoke execute on function public.change_batch_stage(uuid, text, public.stage_category, integer, uuid, timestamptz, text) from public, anon;
grant execute on function public.change_batch_stage(uuid, text, public.stage_category, integer, uuid, timestamptz, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Protokol kaydet (başlık + aşamalar tek işlemde)
-- ---------------------------------------------------------------------------
create or replace function public.save_protocol(p_protocol jsonb, p_stages jsonb)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id  uuid := public.try_uuid(p_protocol ->> 'id');
  v_org uuid := public.try_uuid(p_protocol ->> 'organization_id');
begin
  if v_org is null then
    raise exception 'Protokol bir işletmeye ait olmalıdır' using errcode = '23502';
  end if;
  if not public.has_org_role(v_org, array['owner', 'manager', 'staff']::public.member_role[]) then
    raise exception 'Protokol düzenleme yetkiniz yok' using errcode = '42501';
  end if;

  if v_id is null then
    insert into public.protocols (
      organization_id, species_id, strain_id, cultivation_method, name, version,
      verification_status, source_reference, verified_by, notes, based_on_protocol_id
    ) values (
      v_org,
      (p_protocol ->> 'species_id')::uuid,
      public.try_uuid(p_protocol ->> 'strain_id'),
      nullif(p_protocol ->> 'cultivation_method', '')::public.cultivation_method,
      trim(p_protocol ->> 'name'),
      coalesce(nullif(p_protocol ->> 'version', '')::integer, 1),
      coalesce(nullif(p_protocol ->> 'verification_status', ''), 'dogrulanmamis')::public.verification_status,
      nullif(trim(p_protocol ->> 'source_reference'), ''),
      nullif(trim(p_protocol ->> 'verified_by'), ''),
      nullif(trim(p_protocol ->> 'notes'), ''),
      public.try_uuid(p_protocol ->> 'based_on_protocol_id')
    ) returning id into v_id;
  else
    update public.protocols set
      species_id          = (p_protocol ->> 'species_id')::uuid,
      strain_id           = public.try_uuid(p_protocol ->> 'strain_id'),
      cultivation_method  = nullif(p_protocol ->> 'cultivation_method', '')::public.cultivation_method,
      name                = trim(p_protocol ->> 'name'),
      version             = coalesce(nullif(p_protocol ->> 'version', '')::integer, version),
      verification_status = coalesce(nullif(p_protocol ->> 'verification_status', ''), 'dogrulanmamis')::public.verification_status,
      source_reference    = nullif(trim(p_protocol ->> 'source_reference'), ''),
      verified_by         = nullif(trim(p_protocol ->> 'verified_by'), ''),
      notes               = nullif(trim(p_protocol ->> 'notes'), '')
    where id = v_id and organization_id = v_org;
    if not found then
      raise exception 'Protokol bulunamadı veya düzenlenemez (sistem şablonları kopyalanarak düzenlenir)'
        using errcode = '42501';
    end if;
    delete from public.protocol_stages where protocol_id = v_id;
  end if;

  insert into public.protocol_stages (
    protocol_id, stage_order, name, category, duration_days_min, duration_days_max,
    air_temp_min, air_temp_max, substrate_temp_min, substrate_temp_max,
    rh_min, rh_max, co2_min, co2_max, light_lux_min, light_lux_max, light_hours_per_day, notes
  )
  select v_id, t.ord::integer, trim(t.s ->> 'name'),
         coalesce(nullif(t.s ->> 'category', ''), 'diger')::public.stage_category,
         nullif(t.s ->> 'duration_days_min', '')::numeric, nullif(t.s ->> 'duration_days_max', '')::numeric,
         nullif(t.s ->> 'air_temp_min', '')::numeric, nullif(t.s ->> 'air_temp_max', '')::numeric,
         nullif(t.s ->> 'substrate_temp_min', '')::numeric, nullif(t.s ->> 'substrate_temp_max', '')::numeric,
         nullif(t.s ->> 'rh_min', '')::numeric, nullif(t.s ->> 'rh_max', '')::numeric,
         nullif(t.s ->> 'co2_min', '')::numeric, nullif(t.s ->> 'co2_max', '')::numeric,
         nullif(t.s ->> 'light_lux_min', '')::numeric, nullif(t.s ->> 'light_lux_max', '')::numeric,
         nullif(t.s ->> 'light_hours_per_day', '')::numeric,
         nullif(trim(t.s ->> 'notes'), '')
    from jsonb_array_elements(coalesce(p_stages, '[]'::jsonb)) with ordinality as t(s, ord);

  return v_id;
end;
$$;

revoke execute on function public.save_protocol(jsonb, jsonb) from public, anon;
grant execute on function public.save_protocol(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Substrat reçetesi kaydet (başlık + bileşenler tek işlemde)
-- ---------------------------------------------------------------------------
create or replace function public.save_recipe(p_recipe jsonb, p_components jsonb)
returns uuid
language plpgsql security invoker set search_path = ''
as $$
declare
  v_id  uuid := public.try_uuid(p_recipe ->> 'id');
  v_org uuid := public.try_uuid(p_recipe ->> 'organization_id');
begin
  if v_org is null then
    raise exception 'Reçete bir işletmeye ait olmalıdır' using errcode = '23502';
  end if;
  if not public.has_org_role(v_org, array['owner', 'manager', 'staff']::public.member_role[]) then
    raise exception 'Reçete düzenleme yetkiniz yok' using errcode = '42501';
  end if;

  if v_id is null then
    insert into public.substrate_recipes (organization_id, name, version, species_id, default_treatment, description, notes)
    values (
      v_org, trim(p_recipe ->> 'name'),
      coalesce(nullif(p_recipe ->> 'version', '')::integer, 1),
      public.try_uuid(p_recipe ->> 'species_id'),
      nullif(p_recipe ->> 'default_treatment', '')::public.substrate_treatment,
      nullif(trim(p_recipe ->> 'description'), ''),
      nullif(trim(p_recipe ->> 'notes'), '')
    ) returning id into v_id;
  else
    update public.substrate_recipes set
      name              = trim(p_recipe ->> 'name'),
      version           = coalesce(nullif(p_recipe ->> 'version', '')::integer, version),
      species_id        = public.try_uuid(p_recipe ->> 'species_id'),
      default_treatment = nullif(p_recipe ->> 'default_treatment', '')::public.substrate_treatment,
      description       = nullif(trim(p_recipe ->> 'description'), ''),
      notes             = nullif(trim(p_recipe ->> 'notes'), '')
    where id = v_id and organization_id = v_org;
    if not found then
      raise exception 'Reçete bulunamadı' using errcode = '23503';
    end if;
    delete from public.recipe_components where recipe_id = v_id;
  end if;

  insert into public.recipe_components (recipe_id, sort_order, component_name, role, proportion_percent, default_moisture_percent, notes)
  select v_id, (t.ord - 1)::integer, trim(t.c ->> 'component_name'),
         coalesce(nullif(t.c ->> 'role', ''), 'substrat')::public.material_role,
         nullif(t.c ->> 'proportion_percent', '')::numeric,
         nullif(t.c ->> 'default_moisture_percent', '')::numeric,
         nullif(trim(t.c ->> 'notes'), '')
    from jsonb_array_elements(coalesce(p_components, '[]'::jsonb)) with ordinality as t(c, ord);

  return v_id;
end;
$$;

revoke execute on function public.save_recipe(jsonb, jsonb) from public, anon;
grant execute on function public.save_recipe(jsonb, jsonb) to authenticated;
