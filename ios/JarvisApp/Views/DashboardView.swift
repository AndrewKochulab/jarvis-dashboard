import SwiftUI
import WebKit

struct DashboardView: View {
    @EnvironmentObject var settings: SettingsStore
    @State private var showSettings = false
    @State private var connectionStatus: ConnectionStatus = .disconnected

    var body: some View {
        ZStack {
            Color(red: 0.04, green: 0.04, blue: 0.10)
                .ignoresSafeArea()

            WebViewContainer(
                settings: settings,
                connectionStatus: $connectionStatus,
                showSettings: $showSettings
            )
            .ignoresSafeArea()
            .onAppear {
                // Pre-request mic permission so WKWebView getUserMedia works
                AudioBridge.requestMicrophonePermission { granted in
                    NSLog("[Mic] Permission: \(granted ? "granted" : "denied")")
                }
            }

            // Connection indicator
            VStack {
                HStack {
                    Spacer()
                    ConnectionBadge(status: connectionStatus)
                        .onTapGesture { showSettings = true }
                        .padding(.trailing, 16)
                        .padding(.top, 8)
                }
                Spacer()
            }
        }
        .sheet(isPresented: $showSettings) {
            SettingsView()
                .environmentObject(settings)
        }
    }
}

// MARK: - Connection Badge

enum ConnectionStatus: String {
    case connected, disconnected, connecting, reconnecting
}

struct ConnectionBadge: View {
    let status: ConnectionStatus

    var body: some View {
        HStack(spacing: 6) {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)
            Text(status.rawValue.uppercased())
                .font(.system(size: 9, weight: .semibold, design: .monospaced))
                .foregroundColor(.white.opacity(0.6))
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 5)
        .background(.ultraThinMaterial)
        .cornerRadius(12)
    }

    private var statusColor: Color {
        switch status {
        case .connected: return Color(red: 0.27, green: 0.79, blue: 0.56)
        case .disconnected: return Color(red: 0.91, green: 0.30, blue: 0.24)
        case .connecting: return Color(red: 1.0, green: 0.58, blue: 0.0)
        case .reconnecting: return Color(red: 1.0, green: 0.42, blue: 0.21)
        }
    }
}

// MARK: - WKWebView Container

struct WebViewContainer: UIViewRepresentable {
    let settings: SettingsStore
    @Binding var connectionStatus: ConnectionStatus
    @Binding var showSettings: Bool

    func makeCoordinator() -> Coordinator {
        Coordinator(settings: settings, connectionStatus: $connectionStatus, showSettings: $showSettings)
    }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let controller = WKUserContentController()

        // Register message handlers
        let bridge = context.coordinator.bridge
        controller.add(bridge, name: "jarvis_getConfig")
        controller.add(bridge, name: "jarvis_showNotice")
        controller.add(bridge, name: "jarvis_openSettings")
        controller.add(bridge, name: "jarvis_connectionStatus")

        // Pre-load bundled JS/JSON files and inject into WKWebView context.
        // fetch() fails for file:// URLs in WKWebView, so we read files from
        // the app bundle in Swift and make them available as window.__preloadedFiles.
        if let htmlURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web") {
            let webDir = htmlURL.deletingLastPathComponent()
            let moduleFiles = [
                "src/config/config.example.json",
                "src/config/config.json",
                "src/core/theme.js",
                "src/core/styles.js",
                "src/core/helpers.js",
                "src/core/markdown-renderer.js",
                "src/services/network-client.js",
                "src/widgets/voice-command/mobile.js",
                "src/config/config.local.json",
                // Voice command sub-modules
                "src/widgets/voice-command/core/utilities.js",
                "src/widgets/voice-command/core/state-machine.js",
                "src/widgets/voice-command/core/arc-reactor.js",
                "src/widgets/voice-command/core/text-input.js",
                "src/widgets/voice-command/core/connection-bar.js",
                "src/widgets/voice-command/core/terminal-panel.js",
                "src/widgets/voice-command/core/interaction-cards.js",
                "src/widgets/voice-command/core/reconnect-manager.js",
                "src/widgets/voice-command/adapters/storage-adapter.js",
                "src/widgets/voice-command/adapters/recorder-adapter.js",
                "src/widgets/voice-command/adapters/tts-adapter.js",
                "src/services/session-manager-core.js",
                "src/services/session-manager-mobile.js",
                "src/widgets/voice-command/core/session-tabs.js",
                "src/widgets/voice-command/core/project-selector.js",
            ]
            var filesDict: [String: String] = [:]
            for file in moduleFiles {
                let fileURL = webDir.appendingPathComponent(file)
                if let content = try? String(contentsOf: fileURL, encoding: .utf8) {
                    filesDict[file] = content
                }
            }
            if let jsonData = try? JSONSerialization.data(withJSONObject: filesDict),
               let jsonStr = String(data: jsonData, encoding: .utf8) {
                let preloadJS = "window.__preloadedFiles = \(jsonStr);"
                let userScript = WKUserScript(source: preloadJS, injectionTime: .atDocumentStart, forMainFrameOnly: true)
                controller.addUserScript(userScript)
                NSLog("[WebView] Pre-loaded \(filesDict.count) files into JS context")
            }
        }

        config.userContentController = controller
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.navigationDelegate = context.coordinator
        webView.uiDelegate = context.coordinator

        #if DEBUG
        if #available(iOS 16.4, *) {
            webView.isInspectable = true
        }
        #endif

        // Set up audio session
        AudioBridge.configureAudioSession()

        // Load bundled HTML
        if let htmlURL = Bundle.main.url(forResource: "index", withExtension: "html", subdirectory: "web") {
            webView.loadFileURL(htmlURL, allowingReadAccessTo: htmlURL.deletingLastPathComponent())
        }

        // Listen for app lifecycle
        NotificationCenter.default.addObserver(
            forName: .appDidBecomeActive, object: nil, queue: .main
        ) { _ in
            webView.evaluateJavaScript("document.dispatchEvent(new Event('visibilitychange'))")
        }
        NotificationCenter.default.addObserver(
            forName: .appDidEnterBackground, object: nil, queue: .main
        ) { _ in
            webView.evaluateJavaScript("document.dispatchEvent(new Event('visibilitychange'))")
        }

        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        // Push updated config when settings change
        context.coordinator.bridge.settings = settings
    }

    // MARK: - Coordinator (WKNavigationDelegate + Bridge)

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        let bridge: WebViewBridge

        init(settings: SettingsStore, connectionStatus: Binding<ConnectionStatus>, showSettings: Binding<Bool>) {
            self.bridge = WebViewBridge(settings: settings, connectionStatus: connectionStatus, showSettings: showSettings)
        }

        // MARK: WKUIDelegate — Grant microphone access for voice commands
        func webView(
            _ webView: WKWebView,
            requestMediaCapturePermissionFor origin: WKSecurityOrigin,
            initiatedByFrame frame: WKFrameInfo,
            type: WKMediaCaptureType,
            decisionHandler: @escaping (WKPermissionDecision) -> Void
        ) {
            // Auto-grant microphone for our local page
            decisionHandler(.grant)
        }

        /// Accept self-signed certificates for local companion server connections.
        func webView(
            _ webView: WKWebView,
            didReceive challenge: URLAuthenticationChallenge,
            completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void
        ) {
            if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
               let trust = challenge.protectionSpace.serverTrust {
                completionHandler(.useCredential, URLCredential(trust: trust))
            } else {
                completionHandler(.performDefaultHandling, nil)
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            NSLog("[WebView] Page loaded successfully: \(webView.url?.absoluteString ?? "nil")")
            // Check JS state after dashboard loads
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) {
                let diagnosticJS = """
                (function() {
                    var info = {};
                    info.hasBootstrap = typeof window.__iosBootstrap;
                    info.hasLoadDashboard = typeof window.loadDashboard;
                    info.loadingClass = document.getElementById('loading')?.className || 'NOT_FOUND';
                    info.dashboardChildren = document.getElementById('dashboard')?.children?.length || 0;
                    info.hasNetworkClient = !!(window.__jarvisCtx && window.__jarvisCtx.networkClient);
                    if (window.__jarvisCtx && window.__jarvisCtx.networkClient) {
                        info.networkState = window.__jarvisCtx.networkClient.state;
                        info.networkConnected = window.__jarvisCtx.networkClient.isConnected;
                    }
                    info.wsConstructor = typeof WebSocket;
                    info.errors = window.__jarvisErrors || [];
                    return JSON.stringify(info);
                })()
                """
                webView.evaluateJavaScript(diagnosticJS) { result, error in
                    NSLog("[WebView] Diagnostics: \(result ?? "nil"), error: \(error?.localizedDescription ?? "none")")
                }

                // Mic diagnostic: test getUserMedia and record 2s, report via message handler
                let micTestJS = """
                (function() {
                  function report(msg) {
                    try { window.webkit.messageHandlers.jarvis_showNotice.postMessage({message: msg}); } catch(e) {}
                  }
                  navigator.mediaDevices.getUserMedia({audio: true}).then(function(stream) {
                    var tracks = stream.getAudioTracks();
                    var info = "tracks:" + tracks.length;
                    if (tracks.length > 0) {
                      var t = tracks[0];
                      info += " label:" + t.label + " enabled:" + t.enabled + " muted:" + t.muted + " state:" + t.readyState;
                      var s = t.getSettings();
                      info += " rate:" + (s.sampleRate||"?") + " ch:" + (s.channelCount||"?");
                    }
                    var mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/mp4";
                    info += " mime:" + mime;
                    var rec = new MediaRecorder(stream, {mimeType: mime});
                    var chunks = [];
                    rec.ondataavailable = function(e) { chunks.push(e.data); };
                    rec.start();
                    setTimeout(function() {
                      rec.stop();
                      rec.onstop = function() {
                        var total = chunks.reduce(function(s,c) { return s + c.size; }, 0);
                        info += " chunks:" + chunks.length + " bytes:" + total;
                        stream.getTracks().forEach(function(t) { t.stop(); });
                        report("MIC_OK: " + info);
                      };
                    }, 2000);
                  }).catch(function(e) {
                    report("MIC_FAIL: " + e.name + ": " + e.message);
                  });
                  return "mic test started";
                })()
                """
                webView.evaluateJavaScript(micTestJS) { _, _ in }
            }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            NSLog("[WebView] Navigation failed: \(error.localizedDescription)")
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            NSLog("[WebView] Provisional navigation failed: \(error.localizedDescription)")
        }
    }
}
