import { Logo } from '../components/AppShell'
import { Card, Notice } from '../components/ui'

/** Supabase bağlantısı yoksa gösterilir. Uygulama sahte veriyle çalışıyormuş gibi davranmaz. */
export default function SetupRequired() {
  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-5 p-6">
      <Logo />
      <Card>
        <h1 className="text-lg font-semibold">Veri tabanı bağlantısı yapılandırılmamış</h1>
        <p className="mt-2 text-sm text-muted">
          MyGrow gerçek kayıtları Supabase (PostgreSQL) üzerinde saklar. Bağlantı bilgileri olmadan hiçbir kayıt
          kalıcı olarak saklanamayacağı için uygulama bu ekranda durur.
        </p>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm">
          <li>supabase.com üzerinde bir proje oluşturun.</li>
          <li>
            <code>supabase/migrations</code> klasöründeki SQL dosyalarını sırasıyla çalıştırın (README'deki adımlar).
          </li>
          <li>
            Proje kökünde <code>.env.local</code> dosyası oluşturup <code>VITE_SUPABASE_URL</code> ve{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> değerlerini girin.
          </li>
          <li>Geliştirme sunucusunu yeniden başlatın.</li>
        </ol>
        <div className="mt-4">
          <Notice tone="warn">Yalnızca “anon/public” anahtarını kullanın; service_role anahtarı tarayıcı koduna asla konmamalıdır.</Notice>
        </div>
      </Card>
    </div>
  )
}
