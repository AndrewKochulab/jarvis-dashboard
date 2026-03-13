import Security
import Foundation

enum KeychainService {
    private static let service = "com.jarvis.dashboard"

    static func save(key: String, value: String) {
        guard let data = value.data(using: .utf8) else { return }

        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
        ]

        // Delete existing item first
        SecItemDelete(query as CFDictionary)

        var addQuery = query
        addQuery[kSecValueData] = data
        addQuery[kSecAttrAccessible] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly

        SecItemAdd(addQuery as CFDictionary, nil)
    }

    static func load(key: String) -> String? {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(key: String) {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrService: service,
            kSecAttrAccount: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}

// MARK: - Settings Store

class SettingsStore: ObservableObject {
    @Published var host: String {
        didSet { UserDefaults.standard.set(host, forKey: "jarvis_host") }
    }
    @Published var port: String {
        didSet { UserDefaults.standard.set(port, forKey: "jarvis_port") }
    }
    @Published var token: String {
        didSet {
            KeychainService.save(key: "auth_token", value: token)
            UserDefaults.standard.set(token, forKey: "jarvis_token")
        }
    }
    @Published var ttsMode: String {
        didSet { UserDefaults.standard.set(ttsMode, forKey: "jarvis_tts_mode") }
    }

    init() {
        self.host = UserDefaults.standard.string(forKey: "jarvis_host") ?? ""
        self.port = UserDefaults.standard.string(forKey: "jarvis_port") ?? "7777"
        // Prefer UserDefaults (can be pre-configured), fallback to Keychain
        let udToken = UserDefaults.standard.string(forKey: "jarvis_token") ?? ""
        let kcToken = KeychainService.load(key: "auth_token") ?? ""
        self.token = !udToken.isEmpty ? udToken : kcToken
        self.ttsMode = UserDefaults.standard.string(forKey: "jarvis_tts_mode") ?? "server"
    }
}
