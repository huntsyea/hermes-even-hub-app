import './style.css'
import {
  CreateStartUpPageContainer,
  OsEventTypeList,
  StartUpPageCreateResult,
  TextContainerProperty,
  waitForEvenAppBridge,
} from '@evenrealities/even_hub_sdk'

const READY_MARKER = '[even-development] ready'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
  throw new Error('Missing #app root element')
}

app.innerHTML = `
<main class="shell">
  <section class="panel">
    <div>
      <p class="eyebrow">Even G2</p>
      <h1>Development Environment</h1>
      <p class="status" id="status">Waiting for Even Hub bridge...</p>
    </div>
    <div class="display" aria-label="G2 display preview">
      <span>Hello from G2!</span>
      <small>576 x 288</small>
    </div>
    <div class="tools">
      <span>SDK 0.0.10</span>
      <span>Simulator 0.7.3</span>
      <span>CLI 0.1.13</span>
    </div>
  </section>
</main>
`

const status = document.querySelector<HTMLParagraphElement>('#status')

function setStatus(message: string) {
  if (status) {
    status.textContent = message
  }
}

async function bootGlasses() {
  const bridge = await waitForEvenAppBridge()
  setStatus('Bridge ready. Creating startup page...')

  const title = new TextContainerProperty({
    xPosition: 0,
    yPosition: 20,
    width: 576,
    height: 72,
    borderWidth: 0,
    borderColor: 5,
    paddingLength: 4,
    containerID: 1,
    containerName: 'title',
    content: 'Even G2 Dev',
    isEventCapture: 0,
  })

  const body = new TextContainerProperty({
    xPosition: 0,
    yPosition: 116,
    width: 576,
    height: 96,
    borderWidth: 0,
    borderColor: 5,
    paddingLength: 4,
    containerID: 2,
    containerName: 'body',
    content: 'Hello from G2!',
    isEventCapture: 1,
  })

  const result = await bridge.createStartUpPageContainer(
    new CreateStartUpPageContainer({
      containerTotalNum: 2,
      textObject: [title, body],
    }),
  )

  if (result !== StartUpPageCreateResult.success) {
    throw new Error(`createStartUpPageContainer failed with result ${result}`)
  }

  bridge.onEvenHubEvent((event) => {
    console.log('[even-development] event', event)

    if (event.sysEvent?.eventType === OsEventTypeList.DOUBLE_CLICK_EVENT) {
      console.log('[even-development] double click exit requested')
      void bridge.shutDownPageContainer(1)
    }
  })

  setStatus('Ready in simulator or on G2 hardware.')
  console.log(READY_MARKER)
}

bootGlasses().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error)
  setStatus(`Even Hub startup failed: ${message}`)
  console.error('[even-development] startup failed', error)
})
