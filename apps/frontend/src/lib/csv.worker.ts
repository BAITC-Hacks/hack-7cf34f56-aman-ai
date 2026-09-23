import { parseCsvAnalysis } from './csv-analytics'

self.onmessage = async (event: MessageEvent<File>) => {
  try {
    const file = event.data
    let text: string
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer())
    } catch {
      throw new Error('Не удалось прочитать файл. Сохраните CSV в кодировке UTF-8 и повторите загрузку.')
    }
    self.postMessage({ analysis: parseCsvAnalysis(text, file.name) })
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Не удалось обработать CSV.' })
  }
}
