import { describe, expect, it } from 'vitest'
import { CONFIG_PEOPLE, validateAdminSnapshot } from './adminModel'

describe('administration boundary', () => {
  it('keeps all twelve configuration identities unbound without fabricated credentials', () => {
    expect(CONFIG_PEOPLE).toHaveLength(12)
    expect(new Set(CONFIG_PEOPLE.map((person) => person.key)).size).toBe(12)
    expect(CONFIG_PEOPLE.every((person) => person.email === null && person.auth_user_id === null && person.enrollment_state === 'unbound')).toBe(true)
  })
  it('rejects a fabricated login in a redacted roster response', () => {
    const person = { ...CONFIG_PEOPLE[0], email: 'invented@example.test' }
    expect(() => validateAdminSnapshot({ revision: 1, can_manage_grants: true, people: [person], grants: [] })).toThrow()
  })
  it('rejects duplicate or unknown grant bindings', () => {
    expect(() => validateAdminSnapshot({ revision: 1, can_manage_grants: true, people: [CONFIG_PEOPLE[0]], grants: [{ person_key: 'elev-person-002', role: 'organization_admin' }] })).toThrow()
    expect(() => validateAdminSnapshot({ revision: 1, can_manage_grants: true, people: [CONFIG_PEOPLE[0], CONFIG_PEOPLE[0]], grants: [] })).toThrow()
  })
})
