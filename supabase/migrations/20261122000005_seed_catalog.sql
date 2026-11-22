-- MyGrow 1.0 — Başlangıç kataloğu (sistem türleri ve aşama şablonları)
--
-- ÖNEMLİ: Bu dosya hiçbir sayısal sıcaklık, nem, CO₂, ışık veya süre değeri İÇERMEZ.
-- Aşama şablonlarındaki bütün hedef alanlar bilinçli olarak NULL bırakılmıştır ve
-- doğrulama durumu 'dogrulanmamis' olarak işaretlenmiştir. Kullanıcılar şablonu
-- kendi işletmelerine kopyalayıp kaynaklı/doğrulanmış değerlerini girer.
-- Yöntem ve substrat listeleri genel literatür bilgisidir; parametre değildir.

insert into public.species
  (organization_id, scientific_name, turkish_name, genus, specific_epithet, is_species_group,
   cultivation_methods, substrates, description, source_notes)
values
  (null, 'Pleurotus ostreatus', 'İstiridye mantarı', 'Pleurotus', 'ostreatus', false,
   array['torba', 'blok', 'sise']::public.cultivation_method[],
   array['Buğday samanı', 'Kayın talaşı', 'Pamuk çırçır atığı', 'Mısır koçanı'],
   'Lignoselülozik atıklar üzerinde yaygın olarak yetiştirilen beyaz çürükçül tür.',
   'MyGrow başlangıç verisi. Yöntem/substrat listesi genel bilgidir; yetiştirme parametresi içermez.'),
  (null, 'Pleurotus eryngii', 'Kral istiridye', 'Pleurotus', 'eryngii', false,
   array['sise', 'torba']::public.cultivation_method[],
   array['Kayın talaşı', 'Mısır koçanı', 'Buğday kepeği (katkı)'],
   'Kalın, etli sapı ile bilinen Pleurotus türü.',
   'MyGrow başlangıç verisi. Yöntem/substrat listesi genel bilgidir; yetiştirme parametresi içermez.'),
  (null, 'Agaricus bisporus', 'Kültür mantarı', 'Agaricus', 'bisporus', false,
   array['raf_yatak', 'kasa', 'torba']::public.cultivation_method[],
   array['Kompost (buğday samanı + gübre)', 'Örtü toprağı (torf esaslı)'],
   'Kompost üzerinde yetiştirilen, örtü toprağı gerektiren tür.',
   'MyGrow başlangıç verisi. Yöntem/substrat listesi genel bilgidir; yetiştirme parametresi içermez.'),
  (null, 'Lentinula edodes', 'Shiitake', 'Lentinula', 'edodes', false,
   array['kutuk', 'blok', 'torba']::public.cultivation_method[],
   array['Meşe kütüğü', 'Meşe/kayın talaşı', 'Buğday kepeği (katkı)'],
   'Kütük veya talaş bloklarında yetiştirilen odun çürükçülü tür.',
   'MyGrow başlangıç verisi. Yöntem/substrat listesi genel bilgidir; yetiştirme parametresi içermez.'),
  (null, 'Hericium erinaceus', 'Aslan yelesi', 'Hericium', 'erinaceus', false,
   array['torba', 'blok', 'sise']::public.cultivation_method[],
   array['Sert ağaç talaşı', 'Buğday kepeği (katkı)'],
   'Dişli (sarkık dikenli) meyve gövdesi oluşturan tür.',
   'MyGrow başlangıç verisi. Yöntem/substrat listesi genel bilgidir; yetiştirme parametresi içermez.'),
  (null, 'Flammulina spp.', 'Enoki grubu', 'Flammulina', null, true,
   array['sise', 'torba']::public.cultivation_method[],
   array['Talaş', 'Mısır koçanı', 'Kepek (katkı)'],
   'Tür grubudur. Kesin tür kimliği suş/izolat kaydında ayrıca belirtilmeli; belirsizse doğrulanmamış olarak bırakılmalıdır.',
   'MyGrow başlangıç verisi. Yöntem/substrat listesi genel bilgidir; yetiştirme parametresi içermez.'),
  (null, 'Ganoderma lucidum', 'Reishi', 'Ganoderma', 'lucidum', false,
   array['torba', 'kutuk']::public.cultivation_method[],
   array['Sert ağaç talaşı', 'Kütük', 'Buğday kepeği (katkı)'],
   'Genellikle kurutularak değerlendirilen, sert dokulu tür. Ticari kültürlerde tür adı taksonomik olarak tartışmalı olabilir; suş kaydında kaynak belirtilmelidir.',
   'MyGrow başlangıç verisi. Yöntem/substrat listesi genel bilgidir; yetiştirme parametresi içermez.');

-- Aşama şablonu yardımcı fonksiyonu (yalnızca bu migration içinde)
create function pg_temp.seed_template(p_sci text, p_name text, p_stages text[], p_cats text[])
returns void language plpgsql as $$
declare
  v_species uuid;
  v_protocol uuid;
  i integer;
begin
  select id into v_species from public.species
   where organization_id is null and scientific_name = p_sci;
  insert into public.protocols (organization_id, species_id, name, version, verification_status, notes)
  values (null, v_species, p_name, 1, 'dogrulanmamis',
          'Sistem şablonu: yalnızca aşama adlarını içerir. Sıcaklık, nem, CO₂, ışık ve süre hedefleri boştur. '
          || 'Kendi işletmenize kopyalayıp kaynaklı ve doğrulanmış değerlerinizi girin.')
  returning id into v_protocol;
  for i in 1 .. array_length(p_stages, 1) loop
    insert into public.protocol_stages (protocol_id, stage_order, name, category)
    values (v_protocol, i, p_stages[i], p_cats[i]::public.stage_category);
  end loop;
end;
$$;

select pg_temp.seed_template('Pleurotus ostreatus', 'Genel aşama şablonu — Pleurotus',
  array['Hazırlık', 'İnokülasyon', 'İnkübasyon', 'Primordium', 'Fruktifikasyon', 'Hasat', 'Dinlenme', 'Sonraki flush'],
  array['hazirlik', 'inokulasyon', 'inkubasyon', 'primordium', 'fruktifikasyon', 'hasat', 'dinlenme', 'diger']);

select pg_temp.seed_template('Pleurotus eryngii', 'Genel aşama şablonu — Pleurotus',
  array['Hazırlık', 'İnokülasyon', 'İnkübasyon', 'Primordium', 'Fruktifikasyon', 'Hasat', 'Dinlenme', 'Sonraki flush'],
  array['hazirlik', 'inokulasyon', 'inkubasyon', 'primordium', 'fruktifikasyon', 'hasat', 'dinlenme', 'diger']);

select pg_temp.seed_template('Agaricus bisporus', 'Genel aşama şablonu — Agaricus',
  array['Kompost hazırlığı', 'İnokülasyon', 'Misel sarımı', 'Örtü toprağı', 'Pin oluşumu', 'Hasat'],
  array['hazirlik', 'inokulasyon', 'inkubasyon', 'diger', 'primordium', 'hasat']);

select pg_temp.seed_template('Lentinula edodes', 'Genel aşama şablonu — Shiitake',
  array['İnokülasyon', 'İnkübasyon', 'Kahverengileşme', 'İndüksiyon', 'Fruktifikasyon', 'Hasat'],
  array['inokulasyon', 'inkubasyon', 'inkubasyon', 'induksiyon', 'fruktifikasyon', 'hasat']);

select pg_temp.seed_template('Flammulina spp.', 'Genel aşama şablonu — Enoki',
  array['Şişeleme', 'Sterilizasyon', 'İnokülasyon', 'İnkübasyon', 'Yüzey işlemi (uygunsa)', 'Primordium', 'Sap gelişimi', 'Hasat'],
  array['hazirlik', 'hazirlik', 'inokulasyon', 'inkubasyon', 'diger', 'primordium', 'fruktifikasyon', 'hasat']);

select pg_temp.seed_template('Hericium erinaceus', 'Genel aşama şablonu — Hericium',
  array['İnkübasyon', 'Meyve oluşumu', 'Hasat'],
  array['inkubasyon', 'fruktifikasyon', 'hasat']);

select pg_temp.seed_template('Ganoderma lucidum', 'Genel aşama şablonu — Ganoderma',
  array['İnkübasyon', 'Primordium', 'Meyve gelişimi', 'Hasat/Kurutma'],
  array['inkubasyon', 'primordium', 'fruktifikasyon', 'hasat']);
