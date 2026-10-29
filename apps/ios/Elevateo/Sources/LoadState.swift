import SwiftUI

// AIDEV-NOTE: one shared loading/empty/error vocabulary so every screen has explicit async states.

enum LoadState<Value> {
    case idle
    case loading
    case loaded(Value)
    case failed(message: String)
}

/// Error state with retry; announced to VoiceOver.
struct ErrorRetryView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.largeTitle)
                .accessibilityHidden(true)
            Text(message)
                .multilineTextAlignment(.center)
            Button("Try Again", action: retry)
                .buttonStyle(.borderedProminent)
        }
        .padding()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Error: \(message). Try again.")
    }
}

struct EmptyStateView: View {
    let title: String
    let detail: String

    var body: some View {
        ContentUnavailableView(title, systemImage: "tray", description: Text(detail))
    }
}

struct OfflineBanner: View {
    var body: some View {
        Label("Offline — showing nothing is sent or saved until you reconnect", systemImage: "wifi.slash")
            .font(.footnote)
            .padding(8)
            .frame(maxWidth: .infinity)
            .background(.yellow.opacity(0.3))
            .accessibilityLabel("You are offline. Nothing is sent or saved until you reconnect.")
    }
}
