import SwiftUI
import AuthenticationServices
import ElevateoCore

// AIDEV-NOTE: Elevateo SSO (Authentik) only — no Google or password UI. Uses ASWebAuthenticationSession
// with the OIDCAuthFlow state/PKCE binding from ElevateoCore.

struct SignInView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var signingIn = false

    var body: some View {
        VStack(spacing: 24) {
            if model.offline { OfflineBanner() }
            Spacer()
            Image(systemName: "envelope.badge.shield.half.filled")
                .font(.system(size: 56))
                .accessibilityHidden(true)
            Text("Elevateo Mail")
                .font(.largeTitle.bold())
            Text("Sign in with your Elevateo account")
                .foregroundStyle(.secondary)

            Button {
                Task { await signIn() }
            } label: {
                if signingIn {
                    ProgressView()
                        .accessibilityLabel("Signing in")
                } else {
                    Text("Sign in with Elevateo SSO")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(signingIn)
            .padding(.horizontal, 32)
            .accessibilityHint("Opens the Elevateo single sign-on page")

            if let notice = model.signInNotice {
                Text(notice)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal)
                    .accessibilityAddTraits(.updatesFrequently)
            }
            Spacer()
        }
        .animation(reduceMotion ? nil : .default, value: signingIn)
    }

    private func signIn() async {
        signingIn = true
        defer { signingIn = false }
        do {
            let pending = try await model.beginSignIn()
            guard let callbackURL = try await WebAuthenticationRunner.shared.run(
                authorizationURL: pending.authorizationURL
            ) else {
                await model.authFlow.cancelPending()
                return // user cancelled; no error state
            }
            await model.handleSignInCallback(callbackURL)
        } catch {
            await model.authFlow.cancelPending()
            model.signInFailed("Sign-in could not start: \(error.localizedDescription)")
        }
    }
}

/// Bridges ASWebAuthenticationSession's delegate API into async/await.
@MainActor
final class WebAuthenticationRunner: NSObject, ASWebAuthenticationPresentationContextProviding {
    static let shared = WebAuthenticationRunner()

    /// Returns the callback URL, or nil when the user cancelled.
    func run(authorizationURL: URL) async throws -> URL? {
        try await withCheckedThrowingContinuation { continuation in
            // callbackURLScheme form: the .customScheme callback API needs iOS 17.4, our floor is 17.0.
            let session = ASWebAuthenticationSession(
                url: authorizationURL,
                callbackURLScheme: "elevateo"
            ) { url, error in
                if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    continuation.resume(returning: nil)
                } else if let error {
                    continuation.resume(throwing: error)
                } else {
                    continuation.resume(returning: url)
                }
            }
            session.presentationContextProvider = self
            // Ephemeral: SSO cookies stay out of the shared Safari cookie jar.
            session.prefersEphemeralWebBrowserSession = true
            session.start()
        }
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes
                .compactMap { ($0 as? UIWindowScene)?.keyWindow }
                .first ?? ASPresentationAnchor()
        }
    }
}
