import { useEffect, useRef, useState } from 'react'

import {
  initialMonitoringState,
  MonitoringRuntime,
  type MonitoringRuntimeState,
} from '../lib/monitoringRuntime'

export function useMonitoringRuntime(enabled: boolean): {
  state: MonitoringRuntimeState
  refreshNow: () => void
} {
  const runtimeRef = useRef<MonitoringRuntime | null>(null)
  const [state, setState] = useState<MonitoringRuntimeState>(
    initialMonitoringState,
  )

  useEffect(() => {
    if (!enabled) {
      runtimeRef.current?.stop()
      runtimeRef.current = null
      setState(initialMonitoringState)
      return undefined
    }

    const runtime = new MonitoringRuntime()
    runtimeRef.current = runtime
    const unsubscribe = runtime.subscribe(setState)
    runtime.start()

    return () => {
      unsubscribe()
      runtime.stop()
      if (runtimeRef.current === runtime) {
        runtimeRef.current = null
      }
    }
  }, [enabled])

  return {
    state,
    refreshNow: () => runtimeRef.current?.refreshNow(),
  }
}
