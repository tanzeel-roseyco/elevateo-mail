import Foundation
#if canImport(CryptoKit)
import CryptoKit
#else
import Crypto
#endif

// AIDEV-NOTE: RFC 7636 S256 only; plain challenge is deliberately unsupported.

public struct PKCEPair: Sendable, Equatable {
    public let verifier: String
    public let challenge: String
    public let method = "S256"

    /// Generates a 43-character verifier from 32 random bytes and its S256 challenge.
    /// `randomBytes` is injectable so tests are deterministic; production uses the system RNG.
    public static func generate(randomBytes: @Sendable (Int) -> [UInt8] = systemRandomBytes) throws -> PKCEPair {
        let bytes = randomBytes(32)
        guard bytes.count == 32 else { throw AuthFlowError.randomSourceFailure }
        let verifier = base64URL(Data(bytes))
        return PKCEPair(verifier: verifier, challenge: challenge(forVerifier: verifier))
    }

    public static func challenge(forVerifier verifier: String) -> String {
        let digest = SHA256.hash(data: Data(verifier.utf8))
        return base64URL(Data(digest))
    }

    public static func systemRandomBytes(_ count: Int) -> [UInt8] {
        var generator = SystemRandomNumberGenerator()
        return (0..<count).map { _ in UInt8.random(in: .min ... .max, using: &generator) }
    }

    static func base64URL(_ data: Data) -> String {
        data.base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    init(verifier: String, challenge: String) {
        self.verifier = verifier
        self.challenge = challenge
    }
}
