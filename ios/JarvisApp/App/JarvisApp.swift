import SwiftUI

@main
struct JarvisApp: App {
    @StateObject private var settings = SettingsStore()
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            DashboardView()
                .environmentObject(settings)
                .preferredColorScheme(.dark)
        }
        .onChange(of: scenePhase) { _, phase in
            switch phase {
            case .active:
                NotificationCenter.default.post(name: .appDidBecomeActive, object: nil)
            case .background:
                NotificationCenter.default.post(name: .appDidEnterBackground, object: nil)
            default:
                break
            }
        }
    }
}

extension Notification.Name {
    static let appDidBecomeActive = Notification.Name("appDidBecomeActive")
    static let appDidEnterBackground = Notification.Name("appDidEnterBackground")
}
