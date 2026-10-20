// The committed Postman download must be exactly what the builder produces from the canonical
// contracts, carry no credential, and describe every operation in both OpenAPI documents.
import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { POSTMAN_SCHEMA, buildPostmanCollection, serializePostmanCollection, type OpenApiDocument } from './postmanCollection'

const read = (relative: string) => readFileSync(new NodeURL(relative, import.meta.url), 'utf8')
const v1 = JSON.parse(read('../../../../contracts/v1/openapi.json')) as OpenApiDocument
const v2 = JSON.parse(read('../../../../contracts/v2/openapi.json')) as OpenApiDocument
const committed = read('../../public/developer/elevateo-mail.postman_collection.json')

function operationCount(document: OpenApiDocument): number {
  let count = 0
  for (const entry of Object.values(document.paths)) for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) if (entry[method]) count += 1
  return count
}

describe('Postman collection download', () => {
  it('matches the committed file byte for byte (regenerate after a contract change)', () => {
    expect(serializePostmanCollection(buildPostmanCollection(v1, v2))).toBe(committed)
  })

  it('covers every v1 and v2 operation with Postman-style path variables and no credential', () => {
    const collection = buildPostmanCollection(v1, v2)
    expect(collection.info.schema).toBe(POSTMAN_SCHEMA)
    expect(collection.item[0]?.item).toHaveLength(operationCount(v1))
    expect(collection.item[1]?.item).toHaveLength(operationCount(v2))
    const threads = collection.item[0]?.item.find((item) => item.request.url.raw.includes('/threads') && item.request.method === 'GET')
    expect(threads?.request.url.path).toContain(':mailbox_id')
    expect(threads?.request.header.find((h) => h.key === 'X-Session-Context')?.value).toBe('{{sessionContext}}')
    // No credential: no auth block anywhere, empty session variables, header values only empty or {{variables}}.
    expect(committed).not.toMatch(/"auth"\s*:/)
    expect(collection.variable.every((v) => v.key === 'baseUrl' || v.value === '')).toBe(true)
    for (const folder of collection.item) for (const item of folder.item) for (const h of item.request.header) expect(h.value === '' || /^\{\{\w+\}\}$/.test(h.value)).toBe(true)
  })

  it('falls back to the operation id and marks optional query parameters disabled', () => {
    const doc: OpenApiDocument = {
      info: { title: 'T', version: '0' },
      paths: { '/x/{id}': { get: { operationId: 'getX', parameters: [{ name: 'id', in: 'path', required: true }, { name: 'cursor', in: 'query' }] } } },
    }
    const [folder] = buildPostmanCollection(doc, { info: { title: 'E', version: '0' }, paths: {} }).item
    expect(folder?.item[0]?.name).toBe('getX')
    expect(folder?.item[0]?.request.url.query?.[0]).toEqual({ key: 'cursor', value: '', disabled: true })
    expect(folder?.item[0]?.request.body).toBeUndefined()
  })
})
