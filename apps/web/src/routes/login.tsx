import { createFileRoute } from '@tanstack/react-router'
import { type FormEvent, useEffect, useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
    <main className="flex min-h-screen items-center bg-background p-6">
      <Card className="w-full max-w-sm" aria-labelledby="login-title">
        <CardHeader>
          <CardDescription>Fleet Monitor</CardDescription>
          <CardTitle className="text-2xl" id="login-title">
            Sign in
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSubmit}>
            <div className="grid gap-2">
              <Label htmlFor="account">Account</Label>
              <Input
                autoComplete="username"
                id="account"
                value={account}
                onChange={(event) => setAccount(event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                autoComplete="current-password"
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Button disabled={isSubmitting}>
              {isSubmitting ? 'Signing in' : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  )
}
