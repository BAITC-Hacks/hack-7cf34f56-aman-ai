import { Component, type ReactNode } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

/** A failed optional development tool must never unmount the investigator. */
export class AnnotationBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return <div className="fixed right-4 bottom-4 max-w-sm" role="status">
      <Alert>
        <AlertTitle>Аннотации недоступны</AlertTitle>
        <AlertDescription>
          MoneyGraph продолжает работать. Перезагрузите страницу, чтобы повторить загрузку инструмента аннотаций.
          <Button className="mt-2" variant="outline" onClick={() => window.location.reload()}>Перезагрузить</Button>
        </AlertDescription>
      </Alert>
    </div>
  }
}
