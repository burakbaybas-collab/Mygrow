import type { ReactNode } from 'react'
import { dict } from '../../i18n'

export function AuthLayout({ children }: { children: ReactNode }) {
  const t = dict()
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <img src="/icon.svg" alt="" className="size-14" />
        <p className="mt-3 text-2xl font-semibold tracking-tight text-primary">{t.app.name}</p>
        <p className="text-sm text-muted">{t.app.tagline}</p>
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
