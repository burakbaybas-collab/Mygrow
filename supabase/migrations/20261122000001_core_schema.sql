-- MyGrow 1.0 — Çekirdek şema (20 tablo)
-- Bütün tablolarda UUID birincil anahtar kullanılır.
-- İşletme (organization) tutarlılığı, mümkün olan yerlerde (id, organization_id)
-- bileşik yabancı anahtarlarıyla veri tabanı düzeyinde zorlanır.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Sayımlar (enum)
-- ---------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'manager', 'staff', 'viewer');
create type public.cultivation_method as enum ('torba', 'blok', 'sise', 'kasa', 'raf_yatak', 'kutuk', 'diger');
create type public.verification_status as enum ('dogrulanmamis', 'kaynakli', 'uzman_dogrulamali');
create type public.stage_category as enum (
  'hazirlik', 'inokulasyon', 'inkubasyon', 'induksiyon', 'primordium',
  'fruktifikasyon', 'hasat', 'dinlenme', 'kurutma', 'diger'
);
create type public.batch_status as enum ('aktif', 'tamamlandi', 'arsivlendi');
create type public.substrate_treatment as enum ('pastorizasyon', 'sterilizasyon', 'kompostlama', 'yok', 'diger');
-- substrat/katki/su => başlangıç substratı; ortu_topragi/sonradan_eklenen => BE paydasına girmez
create type public.material_role as enum ('substrat', 'katki', 'su', 'ortu_topragi', 'sonradan_eklenen');
create type public.spawn_basis as enum ('yas', 'kuru');
create type public.measurement_source as enum ('manuel', 'sensor', 'tahmini');
create type public.loss_category as enum (
  'kontaminasyon_suphesi', 'zayif_misel', 'yetersiz_primordium',
  'morfolojik_anormallik', 'iklim_sapmasi', 'mekanik_hasar', 'diger'
);
create type public.diagnosis_status as enum ('supheli', 'uzman_dogrulandi', 'uzman_reddetti');
create type public.cost_category as enum ('substrat', 'misel', 'enerji', 'su', 'iscilik', 'ambalaj', 'diger');
create type public.alert_severity as enum ('bilgi', 'uyari', 'kritik');
create type public.identity_status as enum ('dogrulanmis', 'dogrulanmamis', 'bilinmiyor');

-- ---------------------------------------------------------------------------
-- Ortak tetikleyici: updated_at
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. organizations — İşletmeler ve kurumlar
-- ---------------------------------------------------------------------------
create table public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 2 and 200),
  org_type    text not null default 'isletme'
              check (org_type in ('isletme', 'laboratuvar', 'universite', 'arastirma_enstitusu', 'girisim', 'diger')),
  city        text,
  country     text not null default 'TR',
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. memberships — Kullanıcılar ve işletme bazlı yetkiler
-- ---------------------------------------------------------------------------
create table public.memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  role            public.member_role not null default 'viewer',
  display_name    text,
  email           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index memberships_user_idx on public.memberships (user_id);

-- ---------------------------------------------------------------------------
-- 3. species — Mantar türleri (organization_id NULL => sistem kataloğu)
-- ---------------------------------------------------------------------------
create table public.species (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid references public.organizations (id) on delete cascade,
  scientific_name     text not null check (length(trim(scientific_name)) > 1),
  turkish_name        text,
  genus               text not null,
  specific_epithet    text,            -- tür grubu (ör. Flammulina spp.) ise NULL
  is_species_group    boolean not null default false,
  cultivation_methods public.cultivation_method[] not null default '{}',
  substrates          text[] not null default '{}',
  description         text,
  source_notes        text,
  created_by          uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index species_unique_name
  on public.species (coalesce(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(scientific_name));

-- ---------------------------------------------------------------------------
-- 4. facilities — Üretim tesisleri
-- ---------------------------------------------------------------------------
create table public.facilities (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name            text not null check (length(trim(name)) > 0),
  city            text,
  address         text,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, name)
);

-- ---------------------------------------------------------------------------
-- 5. rooms — Üretim odaları
-- ---------------------------------------------------------------------------
create table public.rooms (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  facility_id     uuid not null,
  name            text not null check (length(trim(name)) > 0),
  room_type       text not null default 'uretim'
                  check (room_type in ('hazirlik', 'inkubasyon', 'uretim', 'laboratuvar', 'depo', 'diger')),
  area_m2         numeric check (area_m2 > 0),
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (facility_id, organization_id) references public.facilities (id, organization_id),
  unique (id, organization_id),
  unique (facility_id, name)
);

-- ---------------------------------------------------------------------------
-- 6. strains — İzolat ve suşlar (işletmeye özgü)
-- ---------------------------------------------------------------------------
create table public.strains (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid not null references public.organizations (id) on delete cascade,
  species_id           uuid not null references public.species (id),
  code                 text not null check (length(trim(code)) > 0),
  name                 text,
  source_type          text check (source_type in ('kendi_izolasyonu', 'ticari', 'kultur_koleksiyonu', 'diger')),
  origin               text,
  identity_status      public.identity_status not null default 'dogrulanmamis',
  exact_species_name   text,   -- tür grubu seçildiyse doğrulanmış kesin tür adı
  collection_reference text,
  isolation_date       date,
  notes                text,
  is_active            boolean not null default true,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (organization_id, code),
  unique (id, organization_id)
);

-- ---------------------------------------------------------------------------
-- 7. protocols — Yetiştirme protokolleri (organization_id NULL => sistem şablonu)
-- ---------------------------------------------------------------------------
create table public.protocols (
  id                   uuid primary key default gen_random_uuid(),
  organization_id      uuid references public.organizations (id) on delete cascade,
  species_id           uuid not null references public.species (id),
  strain_id            uuid references public.strains (id) on delete set null,
  cultivation_method   public.cultivation_method,
  name                 text not null check (length(trim(name)) > 0),
  version              integer not null default 1 check (version >= 1),
  verification_status  public.verification_status not null default 'dogrulanmamis',
  source_reference     text,
  verified_by          text,
  notes                text,
  based_on_protocol_id uuid references public.protocols (id) on delete set null,
  is_archived          boolean not null default false,
  created_by           uuid references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index protocols_org_idx on public.protocols (organization_id);
create index protocols_species_idx on public.protocols (species_id);

-- ---------------------------------------------------------------------------
-- 8. protocol_stages — Protokol aşamaları ve (isteğe bağlı) hedef aralıklar
--    Bütün sayısal hedefler NULL olabilir: değer uydurulmaz, kullanıcı kaynağıyla girer.
-- ---------------------------------------------------------------------------
create table public.protocol_stages (
  id                  uuid primary key default gen_random_uuid(),
  protocol_id         uuid not null references public.protocols (id) on delete cascade,
  stage_order         integer not null check (stage_order >= 1),
  name                text not null check (length(trim(name)) > 0),
  category            public.stage_category not null default 'diger',
  duration_days_min   numeric check (duration_days_min >= 0),
  duration_days_max   numeric check (duration_days_max >= 0),
  air_temp_min        numeric,
  air_temp_max        numeric,
  substrate_temp_min  numeric,
  substrate_temp_max  numeric,
  rh_min              numeric check (rh_min between 0 and 100),
  rh_max              numeric check (rh_max between 0 and 100),
  co2_min             numeric check (co2_min >= 0),
  co2_max             numeric check (co2_max >= 0),
  light_lux_min       numeric check (light_lux_min >= 0),
  light_lux_max       numeric check (light_lux_max >= 0),
  light_hours_per_day numeric check (light_hours_per_day between 0 and 24),
  notes               text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (protocol_id, stage_order) deferrable initially deferred,
  check (duration_days_min is null or duration_days_max is null or duration_days_min <= duration_days_max),
  check (air_temp_min is null or air_temp_max is null or air_temp_min <= air_temp_max),
  check (substrate_temp_min is null or substrate_temp_max is null or substrate_temp_min <= substrate_temp_max),
  check (rh_min is null or rh_max is null or rh_min <= rh_max),
  check (co2_min is null or co2_max is null or co2_min <= co2_max),
  check (light_lux_min is null or light_lux_max is null or light_lux_min <= light_lux_max)
);

-- ---------------------------------------------------------------------------
-- 9. substrate_recipes — Substrat reçeteleri (sürümlü)
-- ---------------------------------------------------------------------------
create table public.substrate_recipes (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations (id) on delete cascade,
  name              text not null check (length(trim(name)) > 0),
  version           integer not null default 1 check (version >= 1),
  species_id        uuid references public.species (id) on delete set null,
  default_treatment public.substrate_treatment,
  description       text,
  notes             text,
  is_archived       boolean not null default false,
  created_by        uuid references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (organization_id, name, version),
  unique (id, organization_id)
);

-- ---------------------------------------------------------------------------
-- 10. recipe_components — Reçete bileşenleri
-- ---------------------------------------------------------------------------
create table public.recipe_components (
  id                       uuid primary key default gen_random_uuid(),
  recipe_id                uuid not null references public.substrate_recipes (id) on delete cascade,
  sort_order               integer not null default 0,
  component_name           text not null check (length(trim(component_name)) > 0),
  role                     public.material_role not null default 'substrat',
  proportion_percent       numeric check (proportion_percent between 0 and 100),  -- yaş ağırlık payı
  default_moisture_percent numeric check (default_moisture_percent between 0 and 100),
  notes                    text,
  created_at               timestamptz not null default now()
);
create index recipe_components_recipe_idx on public.recipe_components (recipe_id);

-- ---------------------------------------------------------------------------
-- 11. batches — Üretim partileri
-- ---------------------------------------------------------------------------
create table public.batches (
  id                        uuid primary key default gen_random_uuid(),
  organization_id           uuid not null references public.organizations (id) on delete cascade,
  batch_code                text not null check (length(trim(batch_code)) between 1 and 60),
  species_id                uuid not null references public.species (id),
  strain_id                 uuid,
  protocol_id               uuid references public.protocols (id) on delete set null,
  protocol_snapshot         jsonb,       -- oluşturma anındaki protokol + aşamalar (değişmez)
  recipe_id                 uuid,
  recipe_name               text,
  recipe_version            integer,
  cultivation_method        public.cultivation_method not null,
  facility_id               uuid not null,
  room_id                   uuid,
  responsible_name          text,
  start_date                date not null default current_date,
  inoculation_date          date,
  status                    public.batch_status not null default 'aktif',
  current_stage_name        text,
  current_stage_category    public.stage_category,
  current_stage_started_at  timestamptz,
  unit_type                 text,
  unit_count                integer check (unit_count > 0),
  wet_substrate_per_unit_kg numeric check (wet_substrate_per_unit_kg > 0),
  total_wet_substrate_kg    numeric check (total_wet_substrate_kg >= 0),
  total_dry_substrate_kg    numeric check (total_dry_substrate_kg >= 0),
  dry_substrate_method      text check (dry_substrate_method in ('dolum_x_karisim_kuru_orani', 'karisim_toplami')),
  spawn_weight_kg           numeric check (spawn_weight_kg >= 0),
  spawn_rate_basis          public.spawn_basis,
  spawn_rate_percent        numeric check (spawn_rate_percent >= 0),
  substrate_ph              numeric check (substrate_ph between 0 and 14),
  treatment_method          public.substrate_treatment,
  treatment_date            date,
  substrate_notes           text,
  notes                     text,
  is_demo                   boolean not null default false,
  last_record_at            timestamptz not null default now(),
  completed_at              timestamptz,
  archived_at               timestamptz,
  created_by                uuid references auth.users (id) on delete set null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  unique (organization_id, batch_code),
  unique (id, organization_id),
  foreign key (strain_id, organization_id)   references public.strains (id, organization_id),
  foreign key (recipe_id, organization_id)   references public.substrate_recipes (id, organization_id),
  foreign key (facility_id, organization_id) references public.facilities (id, organization_id),
  foreign key (room_id, organization_id)     references public.rooms (id, organization_id)
);
create index batches_org_status_idx on public.batches (organization_id, status);
create index batches_species_idx on public.batches (species_id);

-- ---------------------------------------------------------------------------
-- 12. batch_materials — Partide kullanılan gerçek substrat bileşenleri
-- ---------------------------------------------------------------------------
create table public.batch_materials (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  batch_id        uuid not null,
  sort_order      integer not null default 0,
  component_name  text not null check (length(trim(component_name)) > 0),
  role            public.material_role not null default 'substrat',
  wet_weight_kg   numeric not null check (wet_weight_kg >= 0),
  moisture_percent numeric check (moisture_percent between 0 and 100),
  dry_weight_kg   numeric generated always as (wet_weight_kg * (1 - moisture_percent / 100)) stored,
  added_on        date,
  notes           text,
  created_at      timestamptz not null default now(),
  foreign key (batch_id, organization_id) references public.batches (id, organization_id) on delete cascade
);
create index batch_materials_batch_idx on public.batch_materials (batch_id);

-- ---------------------------------------------------------------------------
-- 13. batch_stage_history — Gelişim aşaması geçmişi
-- ---------------------------------------------------------------------------
create table public.batch_stage_history (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null,
  batch_id          uuid not null,
  protocol_stage_id uuid,   -- bilerek FK yok: protokol değişse de geçmiş korunur
  stage_order       integer,
  stage_name        text not null check (length(trim(stage_name)) > 0),
  category          public.stage_category not null default 'diger',
  started_at        timestamptz not null,
  ended_at          timestamptz,
  notes             text,
  created_by        uuid references auth.users (id) on delete set null default auth.uid(),
  created_at        timestamptz not null default now(),
  check (ended_at is null or ended_at >= started_at),
  foreign key (batch_id, organization_id) references public.batches (id, organization_id) on delete cascade
);
create index batch_stage_history_batch_idx on public.batch_stage_history (batch_id, started_at);
create unique index batch_stage_history_one_open
  on public.batch_stage_history (batch_id) where ended_at is null;

-- ---------------------------------------------------------------------------
-- 14. environment_readings — İklim ölçümleri (oda bazlı; parti bağlantısı isteğe bağlı)
-- ---------------------------------------------------------------------------
create table public.environment_readings (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null,
  room_id          uuid not null,
  batch_id         uuid,
  measured_at      timestamptz not null,
  air_temp_c       numeric check (air_temp_c between -30 and 80),
  substrate_temp_c numeric check (substrate_temp_c between -30 and 100),
  rh_percent       numeric check (rh_percent between 0 and 100),
  co2_ppm          numeric check (co2_ppm between 0 and 100000),
  light_lux        numeric check (light_lux >= 0),
  ph               numeric check (ph between 0 and 14),
  source           public.measurement_source not null default 'manuel',
  device_ref       text,     -- ileride IoT cihaz kimliği
  notes            text,
  created_by       uuid references auth.users (id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  check (coalesce(air_temp_c, substrate_temp_c, rh_percent, co2_ppm, light_lux, ph) is not null),
  foreign key (room_id, organization_id)  references public.rooms (id, organization_id),
  foreign key (batch_id, organization_id) references public.batches (id, organization_id) on delete cascade
);
create index environment_readings_room_time_idx on public.environment_readings (room_id, measured_at);
create index environment_readings_batch_idx on public.environment_readings (batch_id);

-- ---------------------------------------------------------------------------
-- 15. harvests — Hasat kayıtları (aynı flush birden fazla günde kaydedilebilir)
-- ---------------------------------------------------------------------------
create table public.harvests (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  batch_id        uuid not null,
  harvested_at    timestamptz not null,
  flush_number    integer not null check (flush_number >= 1),
  total_fresh_kg  numeric not null check (total_fresh_kg >= 0),
  marketable_kg   numeric check (marketable_kg >= 0),
  cull_kg         numeric check (cull_kg >= 0),
  units_harvested integer check (units_harvested >= 0),
  quality_grade   text,
  notes           text,
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (coalesce(marketable_kg, 0) + coalesce(cull_kg, 0) <= total_fresh_kg + 0.0005),
  foreign key (batch_id, organization_id) references public.batches (id, organization_id) on delete cascade
);
create index harvests_batch_idx on public.harvests (batch_id, harvested_at);

-- ---------------------------------------------------------------------------
-- 16. loss_events — Sorun, kontaminasyon şüphesi ve kayıplar
--     newly_discarded_units: YALNIZCA bu olayda yeni imha edilen birimler (çift sayım önlenir)
-- ---------------------------------------------------------------------------
create table public.loss_events (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null,
  batch_id              uuid not null,
  occurred_on           date not null,
  category              public.loss_category not null,
  affected_units        integer check (affected_units >= 0),
  newly_discarded_units integer not null default 0 check (newly_discarded_units >= 0),
  suspected_agent       text,  -- yalnızca şüphe; kesin teşhis diagnosis_status ile ayrılır
  diagnosis_status      public.diagnosis_status not null default 'supheli',
  action_taken          text,
  outcome               text,
  is_resolved           boolean not null default false,
  notes                 text,
  created_by            uuid references auth.users (id) on delete set null default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  foreign key (batch_id, organization_id) references public.batches (id, organization_id) on delete cascade
);
create index loss_events_batch_idx on public.loss_events (batch_id);

-- ---------------------------------------------------------------------------
-- 17. cost_entries — Üretim giderleri (batch_id NULL => genel işletme gideri)
-- ---------------------------------------------------------------------------
create table public.cost_entries (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  batch_id        uuid,
  category        public.cost_category not null,
  amount          numeric not null check (amount >= 0),
  currency        text not null default 'TRY' check (length(currency) = 3),
  incurred_on     date not null default current_date,
  description     text,
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (batch_id, organization_id) references public.batches (id, organization_id) on delete cascade
);
create index cost_entries_org_idx on public.cost_entries (organization_id, incurred_on);
create index cost_entries_batch_idx on public.cost_entries (batch_id);

-- ---------------------------------------------------------------------------
-- 18. sales — Satışlar
-- ---------------------------------------------------------------------------
create table public.sales (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  batch_id        uuid,
  sold_on         date not null default current_date,
  quantity_kg     numeric not null check (quantity_kg > 0),
  unit_price      numeric not null check (unit_price >= 0),
  currency        text not null default 'TRY' check (length(currency) = 3),
  total_amount    numeric generated always as (quantity_kg * unit_price) stored,
  buyer           text,
  notes           text,
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (batch_id, organization_id) references public.batches (id, organization_id) on delete cascade
);
create index sales_org_idx on public.sales (organization_id, sold_on);

-- ---------------------------------------------------------------------------
-- 19. photos — Üretim fotoğrafları (dosyalar özel 'batch-photos' kovasında)
-- ---------------------------------------------------------------------------
create table public.photos (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  batch_id        uuid not null,
  loss_event_id   uuid references public.loss_events (id) on delete set null,
  storage_path    text not null unique,   -- {organization_id}/{batch_id}/{dosya}
  taken_at        timestamptz not null default now(),
  stage_name      text,
  category        text,
  description     text,
  observed_issue  text,
  ai_analysis     jsonb,                  -- MyGrow 2.0 için ayrıldı; 1.0'da yazılmaz
  created_by      uuid references auth.users (id) on delete set null default auth.uid(),
  created_at      timestamptz not null default now(),
  foreign key (batch_id, organization_id) references public.batches (id, organization_id) on delete cascade
);
create index photos_batch_idx on public.photos (batch_id, taken_at);

-- ---------------------------------------------------------------------------
-- 20. alerts — Kural tabanlı uyarılar
-- ---------------------------------------------------------------------------
create table public.alerts (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  room_id         uuid,
  batch_id        uuid,
  reading_id      uuid references public.environment_readings (id) on delete cascade,
  alert_type      text not null,
  severity        public.alert_severity not null default 'uyari',
  message         text not null,
  is_resolved     boolean not null default false,
  resolved_at     timestamptz,
  resolved_by     uuid references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  foreign key (room_id, organization_id)  references public.rooms (id, organization_id) on delete cascade,
  foreign key (batch_id, organization_id) references public.batches (id, organization_id) on delete cascade
);
create index alerts_org_open_idx on public.alerts (organization_id) where not is_resolved;

-- ---------------------------------------------------------------------------
-- Varsayılan created_by
-- ---------------------------------------------------------------------------
alter table public.organizations     alter column created_by set default auth.uid();
alter table public.species           alter column created_by set default auth.uid();
alter table public.strains           alter column created_by set default auth.uid();
alter table public.protocols         alter column created_by set default auth.uid();
alter table public.substrate_recipes alter column created_by set default auth.uid();
alter table public.batches           alter column created_by set default auth.uid();

-- ---------------------------------------------------------------------------
-- updated_at tetikleyicileri
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'organizations', 'memberships', 'species', 'facilities', 'rooms', 'strains',
    'protocols', 'protocol_stages', 'substrate_recipes', 'batches', 'harvests',
    'loss_events', 'cost_entries', 'sales'
  ] loop
    execute format(
      'create trigger %1$s_set_updated_at before update on public.%1$I
         for each row execute function public.set_updated_at()', t);
  end loop;
end $$;
