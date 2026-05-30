#!/usr/bin/env node
// Drive a RUNNING Even Hub simulator through its automation HTTP API.
//
// The simulator (`npm run sim`, started with `--automation-port 9898`) exposes
// a tiny HTTP control surface. This is the button-clicker: a future agent uses
// it to poke the live app and screenshot the 576x288 glasses render without
// touching real hardware.
//
// Prereqs (both must already be running — see SKILL.md):
//   1. npm run dev          (Vite on :5173)
//   2. npm run sim          (simulator with automation port 9898)
//
// Usage (from the glasses-app/ package root):
//   node .claude/skills/run-glasses-app/sim-drive.mjs ready
//   node .claude/skills/run-glasses-app/sim-drive.mjs shot [name]
//   node .claude/skills/run-glasses-app/sim-drive.mjs input <gesture>
//   node .claude/skills/run-glasses-app/sim-drive.mjs console [n]
//   node .claude/skills/run-glasses-app/sim-drive.mjs turn "text" [name]   # click -> wait -> screenshot
//
// Gestures accepted by the simulator's /api/input (others return HTTP 400):
//   click  double_click  up  down
//   NOTE: `click` in a session triggers a turn; `double_click` is EXIT;
//   up/down scroll. (App-side these map to the router's
//   click/doubleClick/scrollUp/scrollDown in src/input/router.ts.)
//
// Env: EVEN_SIM_BASE (default http://127.0.0.1:9898)

import { writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = process.env.EVEN_SIM_BASE ?? 'http://127.0.0.1:9898'
// Screenshots land in the repo's existing e2e dir so they sit next to the
// committed smoke artifacts.
const SHOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'docs', 'e2e')
const READY_MARKER = '[glasses] ready'

async function getJson(path) {
  const r = await fetch(`${BASE}${path}`)
  if (!r.ok) throw new Error(`${path} -> ${r.status}`)
  const t = await r.text()
  return t === 'pong' ? 'pong' : JSON.parse(t)
}
async function getBytes(path) {
  const r = await fetch(`${BASE}${path}`)
  if (!r.ok) throw new Error(`${path} -> ${r.status}`)
  return new Uint8Array(await r.arrayBuffer())
}
async function postJson(path, body) {
  const r = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) throw new Error(`${path} -> ${r.status}`)
}
const sleep = (ms) => new Promise((res) => setTimeout(res, ms))

async function waitReady(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  let sinceId = 0
  await getJson('/api/ping') // throws if the automation server isn't up
  while (Date.now() < deadline) {
    const data = await getJson(`/api/console?since_id=${sinceId}`)
    for (const e of data.entries ?? []) {
      sinceId = Math.max(sinceId, e.id)
      if (e.message?.includes(READY_MARKER)) return
    }
    await sleep(250)
  }
  throw new Error(`app never logged "${READY_MARKER}" within ${timeoutMs}ms`)
}

async function shot(name = `shot-${Date.now()}`) {
  const png = await getBytes('/api/screenshot/glasses')
  mkdirSync(SHOT_DIR, { recursive: true })
  const path = join(SHOT_DIR, `${name}.png`)
  writeFileSync(path, png)
  console.log(`screenshot: ${path} (${png.byteLength} bytes)`)
  return path
}

async function printConsole(n = 20) {
  const data = await getJson('/api/console?since_id=0')
  const tail = (data.entries ?? []).slice(-n)
  for (const e of tail) console.log(`  [${e.id}] ${e.message}`)
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2)
  switch (cmd) {
    case 'ready':
      await waitReady()
      console.log('OK - simulator up and app logged ready')
      break
    case 'shot':
      await getJson('/api/ping')
      await shot(rest[0])
      break
    case 'input': {
      const gesture = rest[0]
      if (!gesture) throw new Error('usage: input <gesture>')
      await postJson('/api/input', { action: gesture })
      console.log(`sent gesture: ${gesture}`)
      break
    }
    case 'console':
      await printConsole(rest[0] ? Number(rest[0]) : 20)
      break
    case 'turn': {
      // click -> wait for the turn to stream -> screenshot. The default flow a
      // future agent wants after changing UI/render code.
      const text = rest[0] ?? '(click)'
      const name = rest[1]
      await waitReady()
      console.log(`triggering a turn (click): ${text}`)
      await postJson('/api/input', { action: 'click' })
      await sleep(3_000)
      await shot(name)
      console.log('--- last console lines ---')
      await printConsole(15)
      break
    }
    default:
      console.error(
        'commands: ready | shot [name] | input <gesture> | console [n] | turn "text" [name]')
      process.exit(2)
  }
}

main().catch((e) => {
  console.error(`ERROR: ${e.message}`)
  console.error('Is the simulator running with --automation-port 9898? (npm run sim)')
  process.exit(1)
})
