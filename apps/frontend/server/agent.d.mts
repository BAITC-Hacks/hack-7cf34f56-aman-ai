import type { IncomingMessage, ServerResponse } from 'node:http'
export function createAgentHandler(options: { env: Record<string, string | undefined>; dataMode: 'project' | 'demo' | 'api' }): (req: IncomingMessage, res: ServerResponse, next?: () => void) => Promise<void>
