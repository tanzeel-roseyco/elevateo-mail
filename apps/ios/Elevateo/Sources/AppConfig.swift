import Foundation

// AIDEV-NOTE: single typed config boundary; API base URL comes from Info.plist (build setting), never hardcoded in views.

enum AppConfigError: Error {
    case missingOrInvalid(key: String)
}

struct AppConfig: Sendable {
    let apiBaseURL: URL
    let ssoAuthorizationEndpoint: URL
    let ssoClientID: String
    let ssoRedirectURI: URL

    /// Fails loud on a malformed bundle rather than silently pointing at a wrong host.
    static func load(bundle: Bundle = .main) throws -> AppConfig {
        func url(_ key: String) throws -> URL {
            guard let raw = bundle.object(forInfoDictionaryKey: key) as? String,
                  let url = URL(string: raw), url.scheme != nil
            else { throw AppConfigError.missingOrInvalid(key: key) }
            return url
        }
        guard let clientID = bundle.object(forInfoDictionaryKey: "ElevateoSSOClientID") as? String, !clientID.isEmpty else {
            throw AppConfigError.missingOrInvalid(key: "ElevateoSSOClientID")
        }
        return AppConfig(
            apiBaseURL: try url("ElevateoAPIBaseURL"),
            ssoAuthorizationEndpoint: try url("ElevateoSSOAuthorizationEndpoint"),
            ssoClientID: clientID,
            ssoRedirectURI: try url("ElevateoSSORedirectURI")
        )
    }
}
