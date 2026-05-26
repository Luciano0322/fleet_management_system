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
    <main className="center-shell">
      <div className="loading-mark" aria-live="polite">
        Opening Fleet Monitor
      </div>
    </main>
  )
}
