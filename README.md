# MyGrow

**Akıllı Mantar Üretim ve Yönetim Sistemi**: mantar üretim partilerini; tür, suş, protokol, substrat, gelişim aşaması, iklim, hasat, verim ve maliyet bilgileriyle kayıt altına alan çok işletmeli web uygulaması (PWA; ileride Android).

- Teknik mimari, veri modeli, yetkiler ve test senaryoları: [`docs/MIMARI.md`](docs/MIMARI.md)
- Teknolojiler: React 19 + TypeScript + Vite + Tailwind CSS 4 · Supabase (PostgreSQL, Auth, Storage, RLS) · React Hook Form + Zod

## Bu sürümde çalışanlar (Aşama 1–2)

- E-posta/parola ile kayıt ve giriş
- İşletme oluşturma (bir kullanıcı birden çok işletmeye bağlı olabilir), işletme değiştirme
- Tesis ve üretim odası yönetimi
- Üretim kontrol paneli (gerçek verilerle 6 bilgi kartı ve aktif üretim kartları)
- 7 türlük sistem kataloğu, işletmeye özel tür ekleme, suş/izolat yönetimi (tür kimliği doğrulama durumu ile)
- Yetiştirme protokolleri: aşama + hedef aralıklar, kaynak/uzman doğrulama durumu, sistem şablonunu kopyalama, sürümleme
- Sürümlü substrat reçeteleri
- 4 adımlı yeni parti sihirbazı: bileşen bazlı kuru madde, misel oranı (yaş/kuru paydası açık), canlı hesap önizlemesi
- Parti detayı: genel bilgiler, substrat tablosu, aşama zaman çizelgesi, aşama değiştirme, tamamlama/arşivleme/silme (onaylı), parti analizi (BE, birim verimi, flush payları; hasat kaydı geldikçe)
- Ekip yetkileri (sahip, yönetici, üretim personeli, salt okunur)

İklim, fotoğraf, hasat, sorun, maliyet formları ve grafik/raporlar sonraki aşamalardadır. Bu ekranlar sahte veri göstermez; hangi aşamada ekleneceklerini açıkça belirtir. Veri tabanı tabloları ve yetki kuralları şimdiden hazırdır.

## Kurulum

### 1. Gereksinimler

- Node.js 20.11 veya üzeri
- Bir Supabase projesi (supabase.com, ücretsiz katman yeterli)
- İsteğe bağlı: [Supabase CLI](https://supabase.com/docs/guides/cli)

### 2. Veri tabanını kurun

**A) Supabase CLI ile (önerilen)**

```bash
supabase login
supabase init                 # yalnızca ilk sefer; supabase/config.toml oluşturur
supabase link --project-ref PROJE_KIMLIGI
supabase db push              # supabase/migrations klasöründeki dosyaları sırayla uygular
```

**B) Supabase panelinden**

Proje → **SQL Editor** bölümünde `supabase/migrations` içindeki 5 dosyayı **ad sırasıyla** (0001 → 0005) açıp çalıştırın.

### 3. Kimlik doğrulama ayarları

Supabase panelinde **Authentication → URL Configuration**:

- *Site URL*: `http://localhost:5173` (yayına alınca gerçek alan adınız)
- E-posta doğrulaması açıksa, kayıttan sonra gelen bağlantıya tıklanınca giriş yapılabilir.

### 4. Ortam değişkenleri

```bash
cp .env.example .env.local
```

`.env.local` içine **Project Settings → API** sayfasındaki *Project URL* ve *anon public* anahtarını yazın. `service_role` anahtarını asla bu dosyaya veya ön yüz koduna koymayın.

### 5. Çalıştırma

```bash
npm install
npm run dev        # http://localhost:5173
```

İlk kullanım: **Kayıt ol → İşletme oluştur → Tesis ve oda ekle → (isteğe bağlı) suş, protokol, reçete → Yeni parti**.

### 6. Testler

```bash
npm test           # hesaplama ve form doğrulama birim testleri (40 test)
npm run typecheck  # TypeScript tip kontrolü
npm run build      # üretim derlemesi (dist/)
```

Veri tabanı izolasyon ve iş kuralı testleri, tek bir işlem içinde çalışıp sonunda geri alınır (veri bırakmaz). Yalnızca **yerel/test** veri tabanında çalıştırın:

```bash
supabase start
SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run test:db
```

## Doğrulama durumu

- Bütün migration dosyaları PostgreSQL 16 üzerinde (Supabase `auth`/`storage` şemalarının taklidiyle) hatasız uygulandı; `supabase/tests/rls_and_rules.test.sql` içindeki 14 kontrolün tamamı geçti.
- `npm test` altındaki 40 birim testi geçti.
- Ön yüz kodu, kütüphane tip tanımları olmadan sözdizimi ve kendi iç tip tutarlılığı açısından denetlendi. Geliştirme ortamında paket indirme erişimi olmadığı için **`npm install` ve `npm run build` henüz çalıştırılmadı**; ilk kurulumda bu iki komutun çıktısını kontrol edin.

## Klasör yapısı

```
supabase/migrations   veri tabanı şeması, RLS, fonksiyonlar, depolama, başlangıç kataloğu
supabase/tests        RLS ve iş kuralı testleri
src/lib/calc          hesaplama fonksiyonları ve testleri
src/pages             ekranlar
src/components        yerleşim ve ortak arayüz bileşenleri
src/i18n              dil sözlüğü (Türkçe; yeni diller aynı anahtarlarla eklenir)
docs                  mimari belge
```

## Bilimsel veri ilkesi

Sistem şablonları yalnızca aşama **adlarını** içerir. Sıcaklık, nem, CO₂, ışık ve süre hedefleri bilinçli olarak boştur. Her protokol doğrulama durumu (doğrulanmamış / kaynaklı / uzman doğrulamalı) ve kaynak bilgisiyle saklanır. Fotoğraftan kesin patojen adı verilmez; sorun kayıtları “şüphe” ve “uzman doğrulaması” olarak ayrılır.
