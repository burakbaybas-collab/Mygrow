-- MyGrow 1.0 — Yetki yardımcıları, bütünlük tetikleyicileri ve Row Level Security

-- ---------------------------------------------------------------------------
-- Yetki yardımcıları (SECURITY DEFINER: memberships üzerindeki RLS döngüsünü önler)
-- ---------------------------------------------------------------------------
create or replace function public.is_org_member(org uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org and m.user_id = auth.uid()
  );
$$;

create or replace function public.has_org_role(org uuid, roles public.member_role[])
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.organization_id = org and m.user_id = auth.uid() and m.role = any (roles)
  );
$$;

create or replace function public.try_uuid(v text)
returns uuid
language plpgsql immutable
as $$
begin
  return v::uuid;
exception when others then
  return null;
end;
$$;

revoke execute on function public.is_org_member(uuid) from public, anon;
revoke execute on function public.has_org_role(uuid, public.member_role[]) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, public.member_role[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Bütünlük tetikleyicileri
-- ---------------------------------------------------------------------------

-- Parti: tür/protokol sistem kataloğundan ya da aynı işletmeden olmalı;
-- suş seçilen türe ait olmalı; protokol anlık görüntüsü değiştirilemez;
-- tamamlanmış/arşivlenmiş partiyi yalnızca sahip/yönetici düzeltebilir.
create or replace function public.check_batch_integrity()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_org uuid;
  v_species uuid;
begin
  select organization_id into v_org from public.species where id = new.species_id;
  if v_org is not null and v_org <> new.organization_id then
    raise exception 'Seçilen tür bu işletmeye ait değil' using errcode = '42501';
  end if;

  if new.strain_id is not null then
    select species_id into v_species from public.strains where id = new.strain_id;
    if v_species is distinct from new.species_id then
      raise exception 'Seçilen suş/izolat, partinin mantar türüne ait değil' using errcode = '23514';
    end if;
  end if;

  if new.protocol_id is not null then
    select organization_id into v_org from public.protocols where id = new.protocol_id;
    if v_org is not null and v_org <> new.organization_id then
      raise exception 'Seçilen protokol bu işletmeye ait değil' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    if new.organization_id <> old.organization_id then
      raise exception 'Parti başka bir işletmeye taşınamaz' using errcode = '42501';
    end if;
    if new.protocol_snapshot is distinct from old.protocol_snapshot then
      raise exception 'Partinin protokol kaydı (anlık görüntü) değiştirilemez' using errcode = '42501';
    end if;
    if old.status <> 'aktif'
       and auth.uid() is not null
       and not public.has_org_role(old.organization_id, array['owner', 'manager']::public.member_role[]) then
      raise exception 'Tamamlanmış veya arşivlenmiş partiyi yalnızca işletme sahibi ya da yönetici düzeltebilir'
        using errcode = '42501';
    end if;
    if new.status = 'tamamlandi' and old.status <> 'tamamlandi' and new.completed_at is null then
      new.completed_at := now();
    end if;
    if new.status = 'arsivlendi' and old.status <> 'arsivlendi' and new.archived_at is null then
      new.archived_at := now();
    end if;
  end if;
  return new;
end;
$$;

create trigger batches_integrity
  before insert or update on public.batches
  for each row execute function public.check_batch_integrity();

-- Suş: tür, sistem kataloğundan ya da aynı işletmeden olmalı
create or replace function public.check_strain_species()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_org uuid;
begin
  select organization_id into v_org from public.species where id = new.species_id;
  if v_org is not null and v_org <> new.organization_id then
    raise exception 'Seçilen tür bu işletmeye ait değil' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger strains_species_check
  before insert or update on public.strains
  for each row execute function public.check_strain_species();

-- Protokol: tür/suş aynı işletmeden ya da sistem kataloğundan olmalı
create or replace function public.check_protocol_refs()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_org uuid;
begin
  if new.organization_id is null and auth.uid() is not null then
    raise exception 'Sistem şablonları uygulama üzerinden oluşturulamaz' using errcode = '42501';
  end if;
  select organization_id into v_org from public.species where id = new.species_id;
  if v_org is not null and v_org is distinct from new.organization_id then
    raise exception 'Seçilen tür bu işletmeye ait değil' using errcode = '42501';
  end if;
  if new.strain_id is not null then
    select organization_id into v_org from public.strains where id = new.strain_id;
    if v_org is distinct from new.organization_id then
      raise exception 'Seçilen suş bu işletmeye ait değil' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger protocols_refs_check
  before insert or update on public.protocols
  for each row execute function public.check_protocol_refs();

-- Kayıp: aynı partide yeni imha edilen birimler toplamı başlangıç birimini aşamaz
create or replace function public.check_loss_units()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_units integer;
  v_sum integer;
begin
  select unit_count into v_units from public.batches where id = new.batch_id;
  select coalesce(sum(newly_discarded_units), 0) into v_sum
  from public.loss_events
  where batch_id = new.batch_id and id <> new.id;
  if v_units is not null and v_sum + new.newly_discarded_units > v_units then
    raise exception 'İmha edilen toplam birim (%) partinin başlangıç birim sayısını (%) aşamaz. Daha önce imha edilen birimleri tekrar girmeyin.',
      v_sum + new.newly_discarded_units, v_units using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger loss_events_units_check
  before insert or update on public.loss_events
  for each row execute function public.check_loss_units();

-- Parti son kayıt zamanı (kontrol gerektiren partileri bulmak için)
create or replace function public.touch_batch_last_record()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.batch_id is not null then
    update public.batches
       set last_record_at = greatest(last_record_at, now())
     where id = new.batch_id and status = 'aktif';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['batch_stage_history', 'harvests', 'loss_events', 'photos', 'environment_readings'] loop
    execute format(
      'create trigger %1$s_touch_batch after insert on public.%1$I
         for each row execute function public.touch_batch_last_record()', t);
  end loop;
end $$;

-- Üyelik: son sahip (owner) kaldırılamaz / rolü düşürülemez
create or replace function public.protect_last_owner()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare v_owners integer;
begin
  if old.role = 'owner' and (tg_op = 'DELETE' or new.role <> 'owner') then
    select count(*) into v_owners from public.memberships
     where organization_id = old.organization_id and role = 'owner' and id <> old.id;
    if v_owners = 0 and exists (select 1 from public.organizations where id = old.organization_id) then
      raise exception 'İşletmenin en az bir sahibi olmalıdır' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger memberships_protect_owner
  before update or delete on public.memberships
  for each row execute function public.protect_last_owner();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.organizations       enable row level security;
alter table public.memberships         enable row level security;
alter table public.species             enable row level security;
alter table public.protocols           enable row level security;
alter table public.protocol_stages     enable row level security;
alter table public.recipe_components   enable row level security;

-- organizations: oluşturma yalnızca create_organization() fonksiyonu ile
create policy organizations_select on public.organizations
  for select to authenticated using (public.is_org_member(id));
create policy organizations_update on public.organizations
  for update to authenticated
  using (public.has_org_role(id, array['owner', 'manager']::public.member_role[]))
  with check (public.has_org_role(id, array['owner', 'manager']::public.member_role[]));
create policy organizations_delete on public.organizations
  for delete to authenticated using (public.has_org_role(id, array['owner']::public.member_role[]));

-- memberships: üyeler listeyi görür; yalnızca sahip yönetir
create policy memberships_select on public.memberships
  for select to authenticated using (public.is_org_member(organization_id));
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (public.has_org_role(organization_id, array['owner']::public.member_role[]));
create policy memberships_update on public.memberships
  for update to authenticated
  using (public.has_org_role(organization_id, array['owner']::public.member_role[]))
  with check (public.has_org_role(organization_id, array['owner']::public.member_role[]));
create policy memberships_delete on public.memberships
  for delete to authenticated
  using (public.has_org_role(organization_id, array['owner']::public.member_role[]) or user_id = auth.uid());

-- species & protocols: sistem kataloğu herkese okunur, düzenlenemez
do $$
declare t text;
begin
  foreach t in array array['species', 'protocols'] loop
    execute format($f$
      create policy %1$s_select on public.%1$I for select to authenticated
        using (organization_id is null or public.is_org_member(organization_id))$f$, t);
    execute format($f$
      create policy %1$s_insert on public.%1$I for insert to authenticated
        with check (organization_id is not null
          and public.has_org_role(organization_id, array['owner','manager','staff']::public.member_role[]))$f$, t);
    execute format($f$
      create policy %1$s_update on public.%1$I for update to authenticated
        using (organization_id is not null
          and public.has_org_role(organization_id, array['owner','manager','staff']::public.member_role[]))
        with check (organization_id is not null
          and public.has_org_role(organization_id, array['owner','manager','staff']::public.member_role[]))$f$, t);
    execute format($f$
      create policy %1$s_delete on public.%1$I for delete to authenticated
        using (organization_id is not null
          and public.has_org_role(organization_id, array['owner','manager']::public.member_role[]))$f$, t);
  end loop;
end $$;

-- protocol_stages: üst protokolün yetkisini izler
create policy protocol_stages_select on public.protocol_stages
  for select to authenticated using (
    exists (select 1 from public.protocols p where p.id = protocol_id
            and (p.organization_id is null or public.is_org_member(p.organization_id))));
create policy protocol_stages_write on public.protocol_stages
  for all to authenticated
  using (exists (select 1 from public.protocols p where p.id = protocol_id
            and p.organization_id is not null
            and public.has_org_role(p.organization_id, array['owner','manager','staff']::public.member_role[])))
  with check (exists (select 1 from public.protocols p where p.id = protocol_id
            and p.organization_id is not null
            and public.has_org_role(p.organization_id, array['owner','manager','staff']::public.member_role[])));

-- recipe_components: üst reçetenin yetkisini izler
create policy recipe_components_select on public.recipe_components
  for select to authenticated using (
    exists (select 1 from public.substrate_recipes r where r.id = recipe_id
            and public.is_org_member(r.organization_id)));
create policy recipe_components_write on public.recipe_components
  for all to authenticated
  using (exists (select 1 from public.substrate_recipes r where r.id = recipe_id
            and public.has_org_role(r.organization_id, array['owner','manager','staff']::public.member_role[])))
  with check (exists (select 1 from public.substrate_recipes r where r.id = recipe_id
            and public.has_org_role(r.organization_id, array['owner','manager','staff']::public.member_role[])));

-- Standart işletme tabloları:
--   okuma: bütün üyeler (salt okunur dahil)
--   ekleme/güncelleme: sahip, yönetici, üretim personeli (tesis/oda: sahip, yönetici)
--   silme: sahip, yönetici
do $$
declare
  t text;
  writers text;
begin
  foreach t in array array[
    'facilities', 'rooms', 'strains', 'substrate_recipes', 'batches', 'batch_materials',
    'batch_stage_history', 'environment_readings', 'harvests', 'loss_events',
    'cost_entries', 'sales', 'photos', 'alerts'
  ] loop
    writers := case when t in ('facilities', 'rooms')
                    then $w$array['owner','manager']$w$
                    else $w$array['owner','manager','staff']$w$ end;
    execute format('alter table public.%I enable row level security', t);
    execute format($f$
      create policy %1$s_select on public.%1$I for select to authenticated
        using (public.is_org_member(organization_id))$f$, t);
    execute format($f$
      create policy %1$s_insert on public.%1$I for insert to authenticated
        with check (public.has_org_role(organization_id, %2$s::public.member_role[]))$f$, t, writers);
    execute format($f$
      create policy %1$s_update on public.%1$I for update to authenticated
        using (public.has_org_role(organization_id, %2$s::public.member_role[]))
        with check (public.has_org_role(organization_id, %2$s::public.member_role[]))$f$, t, writers);
    execute format($f$
      create policy %1$s_delete on public.%1$I for delete to authenticated
        using (public.has_org_role(organization_id, array['owner','manager']::public.member_role[]))$f$, t);
  end loop;
end $$;

-- Anonim kullanıcılar hiçbir tabloya erişemez
revoke all on all tables in schema public from anon;
