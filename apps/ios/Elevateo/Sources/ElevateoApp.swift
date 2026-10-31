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
                .preferredColorScheme(.light)
                .tint(CorporateTheme.ink)
                .foregroundStyle(CorporateTheme.ink)
                .buttonStyle(CorporateButtonStyle())
                .textFieldStyle(CorporateTextFieldStyle())
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .background(CorporateTheme.surface)
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

// AIDEV-NOTE: Mirror web semantic tokens; gold is a border, never small-text ink.
enum CorporateTheme {
    static let surface = Color.white
    static let neutral = Color(red: 245 / 255, green: 245 / 255, blue: 244 / 255)
    static let ink = Color(red: 23 / 255, green: 23 / 255, blue: 23 / 255)
    static let muted = Color(red: 82 / 255, green: 82 / 255, blue: 82 / 255)
    static let gold = Color(red: 166 / 255, green: 124 / 255, blue: 0)
    static let danger = Color(red: 180 / 255, green: 35 / 255, blue: 24 / 255)
    static let success = Color(red: 23 / 255, green: 107 / 255, blue: 58 / 255)
    static let warning = Color(red: 133 / 255, green: 84 / 255, blue: 0)
}

struct CorporateButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var isEnabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .fontWeight(.semibold)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .foregroundStyle(CorporateTheme.ink)
            .background(configuration.isPressed ? CorporateTheme.neutral : CorporateTheme.surface)
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(CorporateTheme.gold, lineWidth: 1))
            .opacity(isEnabled ? 1 : 0.5)
    }
}

// AIDEV-NOTE: Fields share the measured gold boundary without changing validation or keyboard behavior.
struct CorporateTextFieldStyle: TextFieldStyle {
    func _body(configuration: TextField<Self._Label>) -> some View {
        configuration
            .padding(8)
            .background(CorporateTheme.surface)
            .overlay(RoundedRectangle(cornerRadius: 4).stroke(CorporateTheme.gold, lineWidth: 1))
    }
}
