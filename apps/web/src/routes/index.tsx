import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'

import { useAuthSession } from '../hooks/useAuthSession'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const navigate = Route.useNavigate()
  const { hydrated, session } = useAuthSession()

  useEffect(() => {
    if (!hydrated) {
      return
    }

    void navigate({
      to: session ? '/monitoring' : '/login',
      replace: true,
    })
  }, [hydrated, navigate, session])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="text-sm font-medium text-muted-foreground" aria-live="polite">
        Opening Fleet Monitor
      </div>
    </main>
  )
}
