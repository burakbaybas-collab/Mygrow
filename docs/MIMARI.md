# MyGrow 1.0 — Teknik Mimari

Bu belge MyGrow'un mimarisini, veri modelini, yetki sistemini, geliştirme sırasını ve test senaryolarını açıklar.

---

## 1. Teknik mimari

```
┌──────────────────────────────┐        HTTPS (anon anahtar + kullanıcı JWT)        ┌─────────────────────────────────┐
│  İstemci (PWA / Android)     │  ───────────────────────────────────────────────▶  │ Supabase                        │
│  React + TypeScript + Vite   │                                                    │  • Auth (e-posta + parola)      │
│  Tailwind CSS                │  ◀───────────────────────────────────────────────  │  • PostgREST (tablo API'si)     │
│  React Hook Form + Zod       │        JSON / imzalı fotoğraf URL'leri             │  • PostgreSQL + RLS             │
│  src/lib/calc (saf hesaplar) │                                                    │  • RPC (plpgsql fonksiyonları)  │
└──────────────────────────────┘                                                    │  • Storage (özel kova)          │
                                                                                     └─────────────────────────────────┘
```

**Temel ilkeler**

- **Güvenlik veri tabanında:** Her tablo Row Level Security ile korunur. İstemci yalnızca `anon` anahtarını taşır; yetki kararı kullanıcının JWT'si ve `memberships` tablosu üzerinden PostgreSQL'de verilir. Arayüzdeki buton gizleme yalnızca kullanım kolaylığıdır.
- **Çok tablolu kayıtlar tek işlemde:** Parti oluşturma, aşama değiştirme, protokol ve reçete kaydetme `create_batch`, `change_batch_stage`, `save_protocol`, `save_recipe` fonksiyonlarıyla tek transaction içinde yapılır; yarım kayıt oluşmaz.
- **Hesaplamalar tek tanımlı:** Formüller `src/lib/calc` altında saf TypeScript fonksiyonlarıdır ve birim testlidir. Kalıcı kaydedilen değerler (toplam kuru substrat, misel oranı) veri tabanında **aynı formülle** yeniden hesaplanır; istemciden gelen sonuca güvenilmez.
- **Uydurma veri yok:** Sistem şablonlarında sıcaklık/nem/CO₂/ışık değeri yoktur. Supabase bağlantısı yoksa uygulama sahte veriyle çalışmaz, “Kurulum gerekli” ekranında durur. Henüz geliştirilmemiş modüller boş grafik yerine açık bilgilendirme gösterir.
- **Değişmez geçmiş:** Parti oluşturulduğunda protokolün o anki hali `batches.protocol_snapshot` alanına kopyalanır ve bir tetikleyiciyle değiştirilmesi engellenir.

---

## 2. Teknolojiler ve kütüphaneler

| Katman | Seçim | Neden |
|---|---|---|
| Arayüz | React 19, TypeScript 5.8 (strict), Vite 6 | Hızlı geliştirme, tip güvenliği |
| Stil | Tailwind CSS 4 (`@theme` ile anlamsal renk değişkenleri) | Mobil öncelikli, koyu temaya hazır |
| Yönlendirme | React Router 7 | Türkçe URL'ler (`/partiler/yeni` vb.) |
| Formlar | React Hook Form 7 + Zod 3 (`@hookform/resolvers`) | Adım bazlı doğrulama, dinamik bileşen satırları |
| İkonlar | lucide-react | Sade, tutarlı ikon seti |
| Yazı tipi | Inter Variable (`@fontsource-variable/inter`, yerel paket) | Harici CDN'e veri gitmez |
| Arka uç | Supabase: PostgreSQL, Auth, Storage, RLS | Yönetilen, açık kaynak, kendi sunucunuza taşınabilir |
| Testler | Node test çalıştırıcısı + tsx (hesaplar, şemalar), SQL test betiği (RLS) | Ek çerçeve gerektirmez |
| Grafikler (Aşama 5) | Recharts | Planlandı |
| Excel dışa aktarma (Aşama 5) | SheetJS veya ExcelJS | Planlandı |
| Mobil (Aşama 6) | PWA + Capacitor (Android, AAB) | Tek kod tabanı |

---

## 3. Klasör yapısı

```
mygrow/
├── index.html, vite.config.ts, tsconfig.json, package.json
├── public/                       PWA manifesti ve simge
├── docs/MIMARI.md                bu belge
├── supabase/
│   ├── migrations/               sürümlenmiş veri tabanı değişiklikleri (sırayla uygulanır)
│   │   ├── …0001_core_schema.sql      20 tablo, sayımlar, indeksler
│   │   ├── …0002_security_rls.sql     yetki fonksiyonları, bütünlük tetikleyicileri, RLS
│   │   ├── …0003_functions.sql        create_organization, create_batch, change_batch_stage, save_protocol, save_recipe
│   │   ├── …0004_storage.sql          özel fotoğraf kovası ve politikaları
│   │   └── …0005_seed_catalog.sql     7 sistem türü + değer içermeyen aşama şablonları
│   └── tests/rls_and_rules.test.sql   işletmeler arası izolasyon ve iş kuralı testleri
└── src/
    ├── main.tsx, App.tsx          giriş noktası, yönlendirme, oturum/işletme korumaları
    ├── index.css                  tasarım sistemi (renk, yazı tipi, köşe yarıçapı)
    ├── i18n/                      sözlük (tr.ts) ve label()/options() yardımcıları
    ├── context/                   AuthContext (oturum), OrgContext (aktif işletme + yetki)
    ├── components/                AppShell (yan menü + mobil alt menü), ui.tsx, Toast.tsx
    ├── lib/
    │   ├── calc/                  substrat, verim, maliyet hesapları + testleri
    │   ├── supabase.ts            istemci (yapılandırma yoksa hata verir)
    │   ├── types.ts               tablo satır tipleri
    │   ├── errors.ts              PostgreSQL hatalarını Türkçe mesaja çevirir
    │   ├── format.ts              tr-TR sayı/tarih biçimleri
    │   └── useAsync.ts            veri yükleme kancası
    └── pages/
        ├── auth/                  Giriş, Kayıt
        ├── CreateOrganization.tsx, Dashboard.tsx, Facilities.tsx, Team.tsx, Settings.tsx, AddRecord.tsx, Upcoming.tsx
        ├── batches/               BatchList, NewBatchWizard (+ batchSchema), BatchDetail
        ├── species/               SpeciesList, SpeciesDetail (suşlar), SpeciesForm
        ├── protocols/             ProtocolList, ProtocolEditor
        └── recipes/               RecipeList, RecipeEditor
```

---

## 4. Sayfalar ve bileşenler

| Yol | Sayfa | Durum |
|---|---|---|
| `/giris`, `/kayit` | Giriş ve hesap oluşturma | Çalışıyor |
| `/isletme-olustur` | İşletme oluşturma (oluşturan sahip olur) | Çalışıyor |
| `/` | Üretim kontrol paneli: 6 bilgi kartı, aktif üretim kartları, hızlı işlemler | Çalışıyor (iklim/hasat/fotoğraf/sorun butonları “Yakında” olarak devre dışı) |
| `/partiler` | Parti listesi, durum/tür/kod filtresi | Çalışıyor |
| `/partiler/yeni` | 4 adımlı sihirbaz: parti → substrat → birimler → kontrol | Çalışıyor |
| `/partiler/:id` | 8 sekmeli detay; Genel, Aşamalar (zaman çizelgesi, aşama değiştirme), Analizler çalışıyor | Diğer 5 sekme Aşama 3–4 |
| `/turler`, `/turler/:id` | Tür kataloğu, tür bilgi kartı, suş/izolat yönetimi | Çalışıyor |
| `/protokoller`, `/protokoller/:id` | Protokol listesi; aşama + hedef aralık düzenleyici, kopyalama, sürümleme, arşivleme | Çalışıyor |
| `/receteler`, `/receteler/:id` | Sürümlü substrat reçeteleri | Çalışıyor |
| `/tesisler` | Tesis ve oda yönetimi | Çalışıyor |
| `/ekip` | Üyeler ve yetki değiştirme | Çalışıyor (e-posta daveti sonraki aşama) |
| `/ayarlar` | İşletme bilgileri, işletme değiştirme, hesap, çıkış | Çalışıyor |
| `/kayit-ekle` | Mobil “+” menüsü | Çalışıyor |
| `/analizler`, `/raporlar`, `/bildirimler` | Bilgilendirme sayfası (sahte grafik yok) | Aşama 5 |

Ortak bileşenler (`components/ui.tsx`): `Button`, `LinkButton`, `Card`, `PageHeader`, `Field`, `Input`, `Select`, `Textarea`, `Badge`, `Notice`, `Spinner`, `ErrorBox`, `EmptyState`, `SciName` (bilimsel adı italik, “spp.” düz), `StatCard`, `DefinitionList`, `Modal`, `ConfirmDialog`.

---

## 5. Veri tabanı ilişkileri

```
organizations ─┬─< memberships >── auth.users
               ├─< facilities ─< rooms
               ├─< strains >── species (sistem veya işletme)
               ├─< protocols ─< protocol_stages        (protocols.organization_id NULL ⇒ sistem şablonu)
               ├─< substrate_recipes ─< recipe_components
               ├─< batches ──┬─< batch_materials
               │             ├─< batch_stage_history
               │             ├─< harvests
               │             ├─< loss_events ─< photos (isteğe bağlı bağlantı)
               │             ├─< photos
               │             ├─< cost_entries (batch_id NULL ⇒ genel gider)
               │             └─< sales
               ├─< environment_readings >── rooms (batch_id isteğe bağlı)
               └─< alerts (oda / parti / ölçüm)
```

- **Kiracı (işletme) tutarlılığı:** `rooms`, `batches` ve bütün parti alt tabloları `(id, organization_id)` bileşik yabancı anahtarlarıyla bağlanır. Böylece bir partinin başka işletmenin odasına veya bir hasat kaydının başka işletmenin partisine bağlanması veri tabanı düzeyinde imkânsızdır.
- **Sistem kataloğu:** `species` ve `protocols` tablolarında `organization_id IS NULL` satırları herkese okunur, kimse tarafından düzenlenemez. İşletmeler şablonu kendine kopyalar (`based_on_protocol_id`).
- **Tür grubu:** `species.is_species_group` (ör. *Flammulina* spp.). Kesin tür `strains.exact_species_name` ve `strains.identity_status` ile ayrı tutulur.
- **İklim verisi kopyalanmaz:** Ölçüm odaya bağlıdır; aynı odadaki partiler ölçümlere oda + zaman aralığı üzerinden ilişkilendirilir. `batch_id` yalnızca partiye özgü ölçümler (ör. substrat sıcaklığı) içindir. `source` (manuel/sensör/tahmini) ve `device_ref` IoT için ayrılmıştır.
- **Kayıpların tekilleştirilmesi:** `loss_events.newly_discarded_units` yalnızca o olayda *yeni* imha edilen birimleri tutar; bir tetikleyici toplamın başlangıç birim sayısını aşmasını engeller.
- **Teşhis:** `suspected_agent` yalnızca şüphedir; `diagnosis_status` (şüpheli / uzman doğruladı / uzman reddetti) ayrı tutulur.
- **Başlangıç kuru substrat tanımı (BE paydası):** Rolü `substrat`, `katki` veya `su` olan bileşenlerin karışımı. Birim dolumu girildiyse `toplam kuru = (birim sayısı × birim yaş ağırlığı) × (Σ kuru / Σ yaş)`, girilmediyse `Σ kuru`. Örtü toprağı ve sonradan eklenenler dahil edilmez. Kullanılan yöntem `batches.dry_substrate_method` alanında saklanır.
- **Görüntü analizi için hazırlık:** `photos.ai_analysis` (jsonb) MyGrow 2.0 için ayrılmıştır; 1.0'da yazılmaz.

---

## 6. Kullanıcı yetki sistemi

Yetki **işletme bazındadır**: aynı kullanıcı bir işletmede sahip, diğerinde salt okunur olabilir.

| İşlem | Sahip | Yönetici | Üretim personeli | Salt okunur |
|---|:-:|:-:|:-:|:-:|
| İşletme kayıtlarını görme | ✓ | ✓ | ✓ | ✓ |
| Parti, aşama, suş, protokol, reçete, ölçüm, hasat ekleme/düzenleme | ✓ | ✓ | ✓ | – |
| Tesis ve oda tanımlama | ✓ | ✓ | – | – |
| Kayıt silme, arşivleme | ✓ | ✓ | – | – |
| Tamamlanmış/arşivlenmiş partiyi düzeltme | ✓ | ✓ | – | – |
| İşletme bilgilerini değiştirme | ✓ | ✓ | – | – |
| Üye yetkilerini yönetme | ✓ | – | – | – |
| İşletmeyi silme | ✓ | – | – | – |

Uygulama: `is_org_member(org)` ve `has_org_role(org, roller[])` fonksiyonları (SECURITY DEFINER, `search_path=''`) bütün RLS politikalarında kullanılır. Son sahip kaldırılamaz. Fotoğraf dosyaları `{organization_id}/{batch_id}/…` yoluyla aynı kurallara bağlıdır. Silme işlemleri arayüzde onay ister; parti silmede parti kodunun yazılması istenir ve arşivleme önerilir. Bağlı kaydı olan tür/tesis/oda silinemez (yabancı anahtar korur).

---

## 7. İlk sürümün geliştirme sırası

| Aşama | Kapsam | Durum |
|---|---|---|
| 1 — Temel sistem | Proje kurulumu, tasarım sistemi, giriş/kayıt, işletme, tesis ve oda, ana sayfa | **Tamamlandı** |
| 2 — Mantar üretimi | Tür ve suş kataloğu, protokoller, substrat reçeteleri, parti sihirbazı, parti detayı, aşama geçişleri | **Tamamlandı** |
| 3 — Üretim kayıtları | İklim ölçüm formu ve oda grafikleri, fotoğraf yükleme/karşılaştırma, hasat formu (aynı flush çok gün), sorun/kayıp formu | Sırada (tablolar ve RLS hazır) |
| 4 — Hesaplamalar | Maliyet ve satış formları; parti analizlerinde maliyet/gelir; flush karşılaştırmaları | Hesap fonksiyonları ve testleri hazır |
| 5 — Raporlama | Recharts grafikleri, filtreli karşılaştırmalar, CSV/Excel, protokol aralığı uyarıları | Planlandı |
| 6 — Yayın | Uçtan uca testler, mobil görünüm testleri, PWA servis çalışanı, Capacitor Android, AAB | Planlandı |

---

## 8. Temel test senaryoları

**Otomatik — hesaplamalar (`npm test`, 40 test):** toplam yaş substrat; bileşen bazlı kuru madde (su %100 nem, örtü toprağı hariç); dolum × kuru oran yöntemi; yaş/kuru bazlı misel oranı; BE (%100 üstü geçerli, payda yoksa “hesaplanamıyor”); birim verimi; aynı flush'ın farklı günlerde toplanması; ilk hasada kadar gün; kayıp oranı ve çift sayım engeli; kategori bazlı maliyet, birim maliyet, para birimi karışımı engeli; “kayıtlı katkı” etiketinin asla net kâr olmaması; sıfıra bölme, negatif, NaN, %100 üstü yüzde kontrolleri; parti formu doğrulamaları.

**Otomatik — veri tabanı (`supabase/tests/rls_and_rules.test.sql`, 14 kontrol):**
1. Parti oluşturma; kuru madde ve misel oranının veri tabanında doğru hesaplanması; protokol anlık görüntüsü; ilk aşama.
2. Aşama geçişinde önceki aşamanın kapanması ve tek açık aşama kuralı.
3. Suş–tür uyumsuzluğunun reddi.
4. İmha edilen birim toplamının başlangıç birimini aşamaması.
5. Sistem şablonunun düzenlenememesi.
6. B işletmesinin A'nın parti, substrat, tesis, suş, kayıp ve üye kayıtlarını görememesi, güncelleyememesi, silememesi.
7. B'nin A'ya parti ekleyememesi ve kendini A'ya üye yapamaması.
8. Salt okunur kullanıcının yazamaması ve aşama değiştirememesi.
9. Personelin düzenleyip silememesi.
10. Tamamlanmış partiyi personelin düzeltememesi, `completed_at`'in otomatik dolması.
11. Protokol anlık görüntüsünün sahip için bile değiştirilememesi.
12. Son sahibin düşürülememesi.
13. Fotoğraf deposunda başka işletmenin klasörüne yükleme yapılamaması.

**Elle kabul testleri (her sürümde, mobil ~380 px ve masaüstü ≥1280 px):**
- Kayıt → e-posta doğrulama → giriş → işletme oluşturma → tesis + oda ekleme.
- Altı farklı türle (ör. *P. ostreatus* torba, *P. eryngii* şişe, *A. bisporus* raf, *L. edodes* blok, *Flammulina* spp. şişe, *H. erinaceus* torba) parti açma.
- Sihirbazda eksik alanla ilerleyememe, son adımda hata özeti, aynı parti koduyla ikinci kaydın anlaşılır mesajla reddi.
- Sistem şablonunu kopyalayıp hedef değer girme; kaynak/uzman alanı zorunluluğu; yeni sürüm olarak kaydetme; eski partinin protokolünün değişmediğinin görülmesi.
- Parti tamamlama, arşivleme, personel hesabıyla düzeltme denemesi.
- İki farklı tarayıcıda iki farklı işletmeyle giriş yapıp birbirinin kayıtlarının görünmediğinin doğrulanması.
- Mobilde alt menü, tek elle “+” erişimi, formların klavye açıkken kullanılabilirliği.
