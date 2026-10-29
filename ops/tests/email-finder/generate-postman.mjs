import { readFileSync, writeFileSync } from 'node:fs'
import { buildPostmanCollection, serializePostmanCollection } from '/workspace/apps/web/src/lib/postmanCollection.ts'

// AIDEV-NOTE: Use the app's canonical builder so new v2 routes also appear in its downloadable collection.
const readContract = (version) => JSON.parse(readFileSync(`/workspace/contracts/${version}/openapi.json`, 'utf8'))
writeFileSync('/workspace/apps/web/public/developer/elevateo-mail.postman_collection.json',
  serializePostmanCollection(buildPostmanCollection(readContract('v1'), readContract('v2'))))
