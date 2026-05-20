import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

  return (
    <main className="page-shell">
      <section className="status-panel">
        <p className="eyebrow">Phase 0 Runtime</p>
        <h1>Fleet Management GPS Platform</h1>
        <p>
          TanStack Start is running. The monitoring surface will connect to
          FastAPI through HTTP in the next phase.
        </p>
        <dl>
          <div>
            <dt>Backend</dt>
            <dd>{apiBaseUrl}</dd>
          </div>
          <div>
            <dt>Web Runtime</dt>
            <dd>TanStack Start</dd>
          </div>
        </dl>
      </section>
    </main>
  )
}
