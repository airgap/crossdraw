// SPDX-License-Identifier: LicenseRef-Proprietary
import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

function resources(environment: string) {
  const source = readFileSync(new URL(`../k8s/${environment}.yaml`, import.meta.url), 'utf8')
  return source.split(/^---\s*$/m).map((document) => Bun.YAML.parse(document) as any)
}

function checkDeployment(deployment: any) {
  const spec = deployment.spec
  expect(spec.replicas).toBe(1)
  expect(spec.strategy.type).toBe('Recreate')
  expect(spec.strategy.rollingUpdate).toBeUndefined()
  const containers = spec.template.spec.containers
  expect(containers).toHaveLength(1)
  const server = containers[0]
  expect(server.name).toBe('server')
  const dataEnvironment = server.env.filter((entry: any) => entry.name === 'CROSSDRAW_DATA_DIR')
  expect(dataEnvironment).toEqual([{ name: 'CROSSDRAW_DATA_DIR', value: '/app/data' }])
  const dataMount = server.volumeMounts.find((mount: any) => mount.mountPath === dataEnvironment[0].value)
  expect(dataMount).toBeDefined()
  expect(dataMount.readOnly).not.toBe(true)
  const volume = spec.template.spec.volumes.find((entry: any) => entry.name === dataMount.name)
  expect(volume.persistentVolumeClaim.claimName).toBe('crossdraw-data')
}

for (const environment of ['beta', 'production']) {
  test(`${environment} keeps one native writer on the existing persistent data volume`, () => {
    const documents = resources(environment)
    const deployment = documents.find((document) => document.kind === 'Deployment')
    expect(deployment.metadata.namespace).toBe(`crossdraw-${environment}`)
    checkDeployment(deployment)
    const claim = documents.find((document) => document.kind === 'PersistentVolumeClaim')
    expect(claim.metadata.name).toBe('crossdraw-data')
    expect(claim.metadata.namespace).toBe(deployment.metadata.namespace)
    expect(claim.spec.accessModes).toEqual(['ReadWriteOnce'])
  })
}

test('the deployment guard rejects overlapping writers and an unmounted storage path', () => {
  const deployment = resources('production').find((document) => document.kind === 'Deployment')
  for (const mutate of [
    (candidate: any) => (candidate.spec.replicas = 2),
    (candidate: any) => (candidate.spec.strategy = { type: 'RollingUpdate', rollingUpdate: { maxSurge: 1 } }),
    (candidate: any) => {
      const env = candidate.spec.template.spec.containers[0].env
      env.find((entry: any) => entry.name === 'CROSSDRAW_DATA_DIR').value = '/unmounted/data'
    },
  ]) {
    const candidate = structuredClone(deployment)
    mutate(candidate)
    expect(() => checkDeployment(candidate)).toThrow()
  }
})

test('the explicitly staged native beta overlay keeps authentication inside the beta realm', () => {
  const source = readFileSync(new URL('../k8s/native-beta-auth.patch.yaml', import.meta.url), 'utf8')
  const patch = Bun.YAML.parse(source) as any
  expect(patch.metadata).toEqual({ name: 'crossdraw-server', namespace: 'crossdraw-beta' })
  const [server] = patch.spec.template.spec.containers
  expect(server.name).toBe('server')
  const environment = Object.fromEntries(server.env.map((entry: any) => [entry.name, entry.value]))
  expect(environment).toEqual({
    CROSSDRAW_JWKS_URL: 'https://beta-api.lyku.org/oauth-jwks',
    CROSSDRAW_JWT_ISSUER: 'https://beta.lyku.org',
    CROSSDRAW_JWT_AUDIENCE: 'crossdraw',
    CROSSDRAW_ALLOWED_ORIGINS: 'https://beta.crossdraw.app',
  })
  for (const environment of ['beta', 'production']) {
    const deployment = resources(environment).find((document) => document.kind === 'Deployment')
    const defaults = deployment.spec.template.spec.containers[0].env
    expect(defaults.some((entry: any) => ['CROSSDRAW_JWKS_URL', 'CROSSDRAW_JWT_ISSUER'].includes(entry.name))).toBe(
      false,
    )
  }
})
