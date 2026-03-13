import WebKit
import SwiftUI

class WebViewBridge: NSObject, WKScriptMessageHandler {
    var settings: SettingsStore
    @Binding var connectionStatus: ConnectionStatus
    @Binding var showSettings: Bool

    init(settings: SettingsStore, connectionStatus: Binding<ConnectionStatus>, showSettings: Binding<Bool>) {
        self.settings = settings
        self._connectionStatus = connectionStatus
        self._showSettings = showSettings
        super.init()
    }

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage
    ) {
        guard let body = message.body as? [String: Any] else { return }
        let callId = body["id"] as? Int

        switch message.name {
        case "jarvis_getConfig":
            let config: [String: Any] = [
                "network": [
                    "host": settings.host,
                    "port": Int(settings.port) ?? 7777,
                    "token": settings.token,
                    "autoConnect": true,
                ],
                "mobileTts": settings.ttsMode,
            ]
            NSLog("[Bridge] getConfig: host=\(settings.host) port=\(settings.port) token_len=\(settings.token.count) tts=\(settings.ttsMode)")
            resolveJS(webView: message.webView, id: callId, data: config)

        case "jarvis_showNotice":
            if let msg = body["message"] as? String {
                showToast(msg)
            }

        case "jarvis_openSettings":
            DispatchQueue.main.async {
                self.showSettings = true
            }

        case "jarvis_connectionStatus":
            if let status = body["status"] as? String {
                DispatchQueue.main.async {
                    self.connectionStatus = ConnectionStatus(rawValue: status) ?? .disconnected
                }
            }

        default:
            break
        }
    }

    private func resolveJS(webView: WKWebView?, id: Int?, data: Any) {
        guard let webView, let id else { return }
        do {
            let jsonData = try JSONSerialization.data(withJSONObject: data)
            let jsonStr = String(data: jsonData, encoding: .utf8) ?? "{}"
            let js = "window.jarvisBridge.resolve(\(id), \(jsonStr))"
            DispatchQueue.main.async {
                webView.evaluateJavaScript(js)
            }
        } catch {
            let js = "window.jarvisBridge.reject(\(id), '\(error.localizedDescription)')"
            DispatchQueue.main.async {
                webView.evaluateJavaScript(js)
            }
        }
    }

    private func showToast(_ message: String) {
        NSLog("[Toast] \(message)")
    }
}
