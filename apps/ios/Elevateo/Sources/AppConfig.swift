import Foundation
import ElevateoCore

// AIDEV-NOTE: single typed config boundary; values come from Info.plist (build settings), never
// hardcoded in views. Validation rules live in ElevateoCore.ClientSettings so they are unit-tested.

enum AppConfig {
    /// The URL scheme registered in Info.plist CFBundleURLTypes and awaited by SignInView.
    static let callbackScheme = "elevateo"

    /// Fails loud on a malformed bundle rather than silently pointing at a wrong host.
    static func load(bundle: Bundle = .main) throws -> ClientSettings {
        func value(_ key: String) -> String? { bundle.object(forInfoDictionaryKey: key) as? String }
        return try ClientSettings(
            apiBaseURL: value("ElevateoAPIBaseURL"),
            authorizationEndpoint: value("ElevateoSSOAuthorizationEndpoint"),
            clientID: value("ElevateoSSOClientID"),
            redirectURI: value("ElevateoSSORedirectURI"),
            callbackScheme: callbackScheme
        )
    }
}
