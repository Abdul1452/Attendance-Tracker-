import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { once } from 'node:events'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const client = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = resolve(client, '..')
const dotnet = process.env.DOTNET_EXE || 'dotnet'
const apiDll = resolve(root, 'src/AttendanceTracker.Api/bin/Debug/net10.0/AttendanceTracker.Api.dll')
const gatewayDll = resolve(root, 'src/AttendanceTracker.Gateway/bin/Debug/net10.0/AttendanceTracker.Gateway.dll')
const playwrightCli = resolve(client, 'node_modules/@playwright/test/cli.js')
for (const file of [apiDll, gatewayDll, playwrightCli]) {
  if (!existsSync(file)) {
    console.error(`Missing ${file}. Build the backend and install client dependencies first.`)
    process.exit(1)
  }
}

const env = {
  ...process.env,
  ASPNETCORE_ENVIRONMENT: 'Development',
  DOTNET_ROOT: process.env.DOTNET_ROOT || process.env.DOTNET_ROOT_X64 || '',
}
const children = []
const start = (command, args, cwd) => {
  const child = spawn(command, args, { cwd, env, stdio: 'inherit', windowsHide: true })
  children.push(child)
  return child
}
const waitFor = async (url, child) => {
  const deadline = Date.now() + 45000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`A local service stopped before becoming ready (${url}).`)
    try {
      const response = await fetch(url)
      if (response.ok) return
    } catch { /* service is still starting */ }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 300))
  }
  throw new Error(`Timed out waiting for ${url}.`)
}
const stop = async () => {
  for (const child of children) if (child.exitCode === null) child.kill()
  await Promise.all(children.map(child => child.exitCode !== null ? Promise.resolve() : Promise.race([once(child, 'exit'), new Promise(resolveDelay => setTimeout(resolveDelay, 3000))])))
}

try {
  const api = start(dotnet, [apiDll, '--urls', 'http://127.0.0.1:5080'], resolve(root, 'src/AttendanceTracker.Api'))
  await waitFor('http://127.0.0.1:5080/health', api)
  const gateway = start(dotnet, [gatewayDll, '--urls', 'http://127.0.0.1:5050'], resolve(root, 'src/AttendanceTracker.Gateway'))
  await waitFor('http://127.0.0.1:5050/health', gateway)
  const vite = start(process.execPath, [resolve(client, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1'], client)
  await waitFor('http://127.0.0.1:5173', vite)
  const result = spawnSync(process.execPath, [playwrightCli, 'test', '--config', resolve(client, 'playwright.config.ts')], { cwd: client, env, stdio: 'inherit', windowsHide: true })
  if (result.error) throw result.error
  process.exitCode = result.status ?? 1
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await stop()
}
