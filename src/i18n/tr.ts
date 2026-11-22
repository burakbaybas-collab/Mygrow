// Türkçe sözlük. Yeni dil eklemek için aynı anahtarlarla (ör. en.ts) bir dosya oluşturup
// src/i18n/index.ts içindeki `dictionaries` nesnesine eklemek yeterlidir.

export const tr = {
  app: {
    name: 'MyGrow',
    tagline: 'Akıllı Mantar Üretim ve Yönetim Sistemi',
  },
  nav: {
    home: 'Ana Sayfa',
    batches: 'Partiler',
    addRecord: 'Kayıt Ekle',
    analytics: 'Analizler',
    settings: 'Ayarlar',
    species: 'Türler',
    protocols: 'Protokoller',
    recipes: 'Substrat Reçeteleri',
    facilities: 'Tesis ve Odalar',
    team: 'Ekip',
    reports: 'Raporlar',
  },
  roles: {
    owner: 'İşletme sahibi',
    manager: 'Yönetici',
    staff: 'Üretim personeli',
    viewer: 'Salt okunur',
  },
  methods: {
    torba: 'Torba',
    blok: 'Blok',
    sise: 'Şişe',
    kasa: 'Kasa',
    raf_yatak: 'Raf/yatak',
    kutuk: 'Kütük',
    diger: 'Diğer',
  },
  verification: {
    dogrulanmamis: 'Doğrulanmamış',
    kaynakli: 'Kaynaklı',
    uzman_dogrulamali: 'Uzman doğrulamalı',
  },
  stageCategories: {
    hazirlik: 'Hazırlık',
    inokulasyon: 'İnokülasyon',
    inkubasyon: 'İnkübasyon',
    induksiyon: 'İndüksiyon',
    primordium: 'Primordium',
    fruktifikasyon: 'Fruktifikasyon',
    hasat: 'Hasat',
    dinlenme: 'Dinlenme',
    kurutma: 'Kurutma',
    diger: 'Diğer',
  },
  batchStatus: {
    aktif: 'Aktif',
    tamamlandi: 'Tamamlandı',
    arsivlendi: 'Arşivlendi',
  },
  treatments: {
    pastorizasyon: 'Pastörizasyon',
    sterilizasyon: 'Sterilizasyon',
    kompostlama: 'Kompostlama',
    yok: 'Uygulanmadı',
    diger: 'Diğer',
  },
  materialRoles: {
    substrat: 'Substrat (ana bileşen)',
    katki: 'Katkı',
    su: 'Su',
    ortu_topragi: 'Örtü toprağı',
    sonradan_eklenen: 'Sonradan eklenen',
  },
  spawnBasis: {
    yas: 'Yaş substrata göre',
    kuru: 'Kuru substrata göre',
  },
  identity: {
    dogrulanmis: 'Tür kimliği doğrulanmış',
    dogrulanmamis: 'Tür kimliği doğrulanmamış',
    bilinmiyor: 'Tür kimliği bilinmiyor',
  },
  orgTypes: {
    isletme: 'Üretim işletmesi',
    laboratuvar: 'Araştırma laboratuvarı',
    universite: 'Üniversite',
    arastirma_enstitusu: 'Araştırma enstitüsü',
    girisim: 'Girişim',
    diger: 'Diğer',
  },
  roomTypes: {
    hazirlik: 'Hazırlık',
    inkubasyon: 'İnkübasyon',
    uretim: 'Üretim (fruktifikasyon)',
    laboratuvar: 'Laboratuvar',
    depo: 'Depo',
    diger: 'Diğer',
  },
  strainSources: {
    kendi_izolasyonu: 'Kendi izolasyonu',
    ticari: 'Ticari misel',
    kultur_koleksiyonu: 'Kültür koleksiyonu',
    diger: 'Diğer',
  },
} as const

export type Dictionary = typeof tr
