import AppIntents
import SwiftUI
import WidgetKit

@available(iOS 18.0, *)
struct DailyBrainVoiceNote: ControlWidget {
    static let kind: String = "com.dailybrain.app.voicenoteswidget"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenVoiceNoteIntent()) {
                Label("Notiz diktieren", systemImage: "mic.badge.plus")
            }
        }
        .displayName("Notiz diktieren")
        .description("Öffnet Daily Brain zur Spracheingabe einer neuen Notiz.")
    }
}

@available(iOS 18.0, *)
struct OpenVoiceNoteIntent: ControlConfigurationIntent {
    static let title: LocalizedStringResource = "Notiz diktieren"
    static let description = IntentDescription(stringLiteral: "Öffnet Daily Brain zur Spracheingabe einer neuen Notiz.")
    static let isDiscoverable = true
    static let openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & OpensIntent {
        let defaults = UserDefaults(suiteName: "group.com.dailybrain.app")
        defaults?.set("voice_note", forKey: "pending_voice_note")
        defaults?.synchronize()
        return .result(opensIntent: OpenURLIntent(URL(string: "dailybrain://note/voice")!))
    }
}
