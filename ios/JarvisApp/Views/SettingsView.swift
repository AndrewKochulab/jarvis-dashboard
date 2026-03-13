import SwiftUI

struct SettingsView: View {
    @EnvironmentObject var settings: SettingsStore
    @Environment(\.dismiss) private var dismiss
    @State private var testResult: TestResult?
    @State private var isTesting = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(spacing: 4) {
                        Text("J.A.R.V.I.S.")
                            .font(.system(size: 20, weight: .heavy, design: .monospaced))
                            .foregroundColor(Color(red: 0, green: 0.83, blue: 1))
                        Text("Mobile Command Interface")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(.secondary)
                            .tracking(2)
                    }
                    .frame(maxWidth: .infinity)
                    .listRowBackground(Color.clear)
                }

                Section("Server Connection") {
                    HStack {
                        Image(systemName: "server.rack")
                            .foregroundColor(.secondary)
                        TextField("Host (e.g. macbook.local)", text: $settings.host)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .keyboardType(.URL)
                    }

                    HStack {
                        Image(systemName: "number")
                            .foregroundColor(.secondary)
                        TextField("Port", text: $settings.port)
                            .keyboardType(.numberPad)
                    }

                    HStack {
                        Image(systemName: "key")
                            .foregroundColor(.secondary)
                        SecureField("Auth Token", text: $settings.token)
                            .textInputAutocapitalization(.never)
                    }
                }

                Section("TTS Mode") {
                    Picker("Text-to-Speech", selection: $settings.ttsMode) {
                        Text("Local (Device)").tag("local")
                        Text("Server (Piper)").tag("server")
                    }
                    .pickerStyle(.segmented)
                }

                Section {
                    Button {
                        testConnection()
                    } label: {
                        HStack {
                            if isTesting {
                                ProgressView()
                                    .scaleEffect(0.8)
                            } else {
                                Image(systemName: "antenna.radiowaves.left.and.right")
                            }
                            Text("Test Connection")
                        }
                        .frame(maxWidth: .infinity)
                    }
                    .disabled(isTesting || settings.host.isEmpty)

                    if let result = testResult {
                        HStack {
                            Image(systemName: result.success ? "checkmark.circle.fill" : "xmark.circle.fill")
                                .foregroundColor(result.success ? .green : .red)
                            Text(result.message)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                }

                Section("About") {
                    LabeledContent("Version", value: "1.0.0")
                    LabeledContent("Platform", value: "iOS")
                }
            }
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func testConnection() {
        isTesting = true
        testResult = nil

        // Test with HTTPS GET first (server responds with a text page)
        let urlString = "https://\(settings.host):\(settings.port)"
        guard let url = URL(string: urlString) else {
            testResult = TestResult(success: false, message: "Invalid URL")
            isTesting = false
            return
        }

        let delegate = SelfSignedSessionDelegate()
        let session = URLSession(configuration: .default, delegate: delegate, delegateQueue: nil)
        var request = URLRequest(url: url)
        request.timeoutInterval = 10

        let task = session.dataTask(with: request) { data, response, error in
            DispatchQueue.main.async {
                isTesting = false
                if let error {
                    let nsError = error as NSError
                    testResult = TestResult(success: false, message: nsError.localizedDescription)
                } else if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                    testResult = TestResult(
                        success: true,
                        message: "Connected (token: \(settings.token.isEmpty ? "missing" : "set"))"
                    )
                } else {
                    testResult = TestResult(success: false, message: "Server responded with error")
                }
            }
        }
        task.resume()

        // Timeout fallback
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) {
            if isTesting {
                isTesting = false
                testResult = TestResult(success: false, message: "Connection timed out")
                task.cancel()
            }
        }
    }
}

struct TestResult {
    let success: Bool
    let message: String
}

/// Allows self-signed certificates for development/local server connections.
final class SelfSignedSessionDelegate: NSObject, URLSessionDelegate {
    func urlSession(
        _ session: URLSession,
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
}
