import { createFileRoute } from '@tanstack/react-router'
import { FormEvent, useEffect, useState } from 'react'

import { useAuthSession } from '../hooks/useAuthSession'
import { login } from '../lib/api'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

function LoginPage() {
  const navigate = Route.useNavigate()
  const { hydrated, session } = useAuthSession()
  const [account, setAccount] = useState('operator001')
  const [password, setPassword] = useState('password123')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (hydrated && session) {
      void navigate({ to: '/monitoring', replace: true })
    }
  }, [hydrated, navigate, session])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      await login(account.trim(), password)
      void navigate({ to: '/monitoring', replace: true })
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Unable to sign in',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel" aria-labelledby="login-title">
        <p className="eyebrow">Fleet Monitor</p>
        <h1 id="login-title">Sign in</h1>
        <form className="auth-form" onSubmit={handleSubmit}>
          <label>
            <span>Account</span>
            <input
              autoComplete="username"
              value={account}
              onChange={(event) => setAccount(event.target.value)}
            />
          </label>
          <label>
            <span>Password</span>
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <button className="primary-button" disabled={isSubmitting}>
            {isSubmitting ? 'Signing in' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  )
}
