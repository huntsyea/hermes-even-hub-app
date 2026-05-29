const BASE = process.env.EVEN_SIM_BASE ?? 'http://127.0.0.1:9898'
const READY_MARKER = '[even-development] ready'

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

const boot = await getBytes('/api/screenshot/glasses')
if (boot.byteLength < 1000) {
  throw new Error(`Framebuffer screenshot is too small: ${boot.byteLength} bytes`)
}

await postJson('/api/input', { action: 'double_click' })
await new Promise((resolve) => setTimeout(resolve, 500))

const after = await getBytes('/api/screenshot/glasses')
if (Math.abs(after.byteLength - boot.byteLength) < 100) {
  throw new Error('Framebuffer did not change after double_click')
}

console.log('OK - simulator responded, app rendered, and double_click changed the framebuffer')
