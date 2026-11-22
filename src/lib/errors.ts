interface PgLikeError {
  code?: string
  message?: string
  details?: string | null
  hint?: string | null
}

/**
 * Supabase/PostgreSQL hatalarını kullanıcıya anlaşılır Türkçe mesaja çevirir.
 * Veri tabanı fonksiyonlarının kendi Türkçe mesajları (RAISE) olduğu gibi gösterilir.
 */
export function friendlyError(err: unknown, context?: { unique?: string }): string {
  if (!err) return 'Bilinmeyen bir hata oluştu.'
  const e = err as PgLikeError
  const msg = e.message ?? String(err)

  switch (e.code) {
    case '23505':
      return context?.unique ?? 'Bu kayıt zaten mevcut (benzersiz olması gereken bir alan tekrar ediyor).'
    case '23503':
      return /still referenced|is still referenced/i.test(msg)
        ? 'Bu kayda bağlı başka kayıtlar olduğu için silinemiyor. Önce ilişkili kayıtları kaldırın veya kaydı arşivleyin.'
        : msg.includes('violates foreign key')
          ? 'Seçilen ilişkili kayıt bulunamadı veya bu işletmeye ait değil.'
          : msg
    case '23514':
    case 'P0001':
      return msg.includes('violates check constraint') ? 'Girilen değerlerden biri izin verilen aralığın dışında.' : msg
    case '42501':
      return msg.includes('row-level security')
        ? 'Bu işlem için yetkiniz yok.'
        : msg
    case 'PGRST116':
      return 'Kayıt bulunamadı veya erişim yetkiniz yok.'
  }

  if (/Invalid login credentials/i.test(msg)) return 'E-posta veya parola hatalı.'
  if (/Email not confirmed/i.test(msg)) return 'E-posta adresiniz henüz doğrulanmamış. Gelen kutunuzu kontrol edin.'
  if (/User already registered/i.test(msg)) return 'Bu e-posta adresiyle zaten bir hesap var.'
  if (/Password should be at least/i.test(msg)) return 'Parola en az 6 karakter olmalıdır.'
  if (/Failed to fetch|NetworkError/i.test(msg)) return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.'
  return msg
}
