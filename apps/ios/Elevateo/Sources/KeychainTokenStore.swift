import Foundation
import ElevateoCore
#if canImport(Security)
import Security

// AIDEV-NOTE: device-only keychain item (no iCloud sync); errors surface, never silently return nil on real failures.

struct KeychainTokenStore: TokenStore {
    private let service = "co.elevateo.mail.tokens"
    private let account = "primary"

    func load() async throws -> TokenSet? {
        var query = baseQuery()
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            guard let data = item as? Data else {
                throw TokenStoreError.storageUnavailable("keychain returned a non-data item")
            }
            return try JSONDecoder().decode(TokenSet.self, from: data)
        case errSecItemNotFound:
            return nil
        default:
            throw TokenStoreError.storageUnavailable("keychain read failed: \(status)")
        }
    }

    func save(_ tokens: TokenSet) async throws {
        let data = try JSONEncoder().encode(tokens)
        var attributes = baseQuery()
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly

        let status = SecItemAdd(attributes as CFDictionary, nil)
        if status == errSecDuplicateItem {
            let update = [kSecValueData as String: data] as CFDictionary
            let updateStatus = SecItemUpdate(baseQuery() as CFDictionary, update)
            guard updateStatus == errSecSuccess else {
                throw TokenStoreError.storageUnavailable("keychain update failed: \(updateStatus)")
            }
        } else if status != errSecSuccess {
            throw TokenStoreError.storageUnavailable("keychain write failed: \(status)")
        }
    }

    func clear() async throws {
        let status = SecItemDelete(baseQuery() as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw TokenStoreError.storageUnavailable("keychain delete failed: \(status)")
        }
    }

    private func baseQuery() -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}
#endif
