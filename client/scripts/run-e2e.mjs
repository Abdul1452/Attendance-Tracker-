import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { once } from 'node:events'
import { resolve } from 'node:path'

const client = process.cwd()
const vite = resolve(client, 'node_modules/vite/bin/vite.js')
const playwright = resolve(client, 'node_modules/@playwright/test/cli.js')
for (const file of [vite, playwright]) {
  if (!existsSync(file)) {
    console.error('Run npm install in the client folder before the end-to-end test.')
    process.exit(1)
  }
}

const server = spawn(process.execPath, [vite, '--host', '127.0.0.1'], { cwd: client, stdio: 'inherit', windowsHide: true })
const waitForServer = async () => {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error('The local web server stopped during startup.')
    try { if ((await fetch('http://127.0.0.1:5173')).ok) return } catch { /* keep waiting while Vite starts */ }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 250))
  }
  throw new Error('Timed out waiting for the local web server.')
}

let resultCode = 1
try {
  await waitForServer()
  const result = spawnSync(process.execPath, [playwright, 'test', '--config', resolve(client, 'playwright.config.ts')], { cwd: client, stdio: 'inherit', windowsHide: true })
  if (result.error) throw result.error
  resultCode = result.status ?? 1
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
} finally {
  if (server.exitCode === null) server.kill()
  if (server.exitCode === null) await Promise.race([once(server, 'exit'), new Promise(resolveDelay => setTimeout(resolveDelay, 3000))])
}
process.exitCode = resultCode
