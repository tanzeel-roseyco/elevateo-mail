import SwiftUI
import ElevateoCore

// AIDEV-NOTE: app entry; all server state flows through AppModel, views never build URLRequests.

@main
struct ElevateoApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            switch model.phase {
            case .signedOut:
                SignInView()
            case .loadingSession:
                ProgressView("Checking session…")
                    .accessibilityLabel("Checking session")
            case .signedIn:
                MailboxListView()
            }
        }
        .task { await model.restoreSession() }
    }
}
