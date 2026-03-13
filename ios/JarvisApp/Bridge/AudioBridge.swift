import AVFoundation

enum AudioBridge {
    /// Configure the shared audio session for voice recording + playback.
    /// Must be called before WKWebView loads to ensure MediaRecorder works.
    static func configureAudioSession() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(
                .playAndRecord,
                mode: .default,
                options: [.defaultToSpeaker, .allowBluetooth, .mixWithOthers]
            )
            try session.setActive(true)
        } catch {
            print("[AudioBridge] Failed to configure audio session: \(error)")
        }
    }

    /// Request microphone permission explicitly.
    /// WKWebView will also prompt, but this pre-warms the permission state.
    static func requestMicrophonePermission(completion: @escaping (Bool) -> Void) {
        switch AVAudioSession.sharedInstance().recordPermission {
        case .granted:
            completion(true)
        case .denied:
            completion(false)
        case .undetermined:
            AVAudioSession.sharedInstance().requestRecordPermission { granted in
                DispatchQueue.main.async { completion(granted) }
            }
        @unknown default:
            completion(false)
        }
    }
}
