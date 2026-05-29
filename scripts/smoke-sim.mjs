import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.env.EVEN_SIM_BASE ?? 'http://127.0.0.1:9898'
const READY_MARKER = '[glasses] ready'
const SCREENSHOT_DIR = join(import.meta.dirname, '..', 'docs', 'e2e')

async function getJson(path) {
  const response = await fetch(`${BASE}${path}`)
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`)
  }

  const text = await response.text()
  return text === 'pong' ? 'pong' : JSON.parse(text)
}

async function getBytes(path) {
  const response = await fetch(`${BASE}${path}`)
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`)
  }

  return new Uint8Array(await response.arrayBuffer())
}

async function postJson(path, body) {
  const response = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}`)
  }
}

async function waitForReady(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let sinceId = 0

  while (Date.now() < deadline) {
    const data = await getJson(`/api/console?since_id=${sinceId}`)

    for (const entry of data.entries ?? []) {
      sinceId = Math.max(sinceId, entry.id)
      if (entry.message?.includes(READY_MARKER)) {
        return
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  throw new Error(`App did not log "${READY_MARKER}" within ${timeoutMs}ms`)
}

await getJson('/api/ping')
await waitForReady()

// Send a single click to trigger a turn (double_click is the EXIT gesture)
await postJson('/api/input', { action: 'click' })

// Wait a few seconds for the turn to complete and the UI to update
await new Promise((resolve) => setTimeout(resolve, 3_000))

// Capture glasses screenshot and save to docs/e2e/
const screenshot = await getBytes('/api/screenshot/glasses')
mkdirSync(SCREENSHOT_DIR, { recursive: true })
const screenshotPath = join(SCREENSHOT_DIR, `smoke-${Date.now()}.png`)
writeFileSync(screenshotPath, screenshot)
console.log(`Screenshot saved: ${screenshotPath} (${screenshot.byteLength} bytes)`)

// Print last 20 console lines
const consoleData = await getJson('/api/console?since_id=0')
const entries = consoleData.entries ?? []
const tail = entries.slice(-20)
console.log(`\n--- last ${tail.length} console lines ---`)
for (const entry of tail) {
  console.log(`  [${entry.id}] ${entry.message}`)
}
console.log('--- end console ---\n')

console.log('OK - simulator responded, app rendered, click triggered a turn')
