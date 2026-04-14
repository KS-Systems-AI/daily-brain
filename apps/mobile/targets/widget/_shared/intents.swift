import AppIntents
import SwiftUI
import WidgetKit

@available(iOS 18.0, *)
struct DailyBrainVoiceControl: ControlWidget {
    static let kind: String = "com.dailybrain.app.voicecontrol"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenVoiceTaskIntent()) {
                Label("Aufgabe diktieren", systemImage: "mic.fill")
            }
        }
        .displayName("Aufgabe diktieren")
        .description("Öffnet Daily Brain zur Spracheingabe einer neuen Aufgabe.")
    }
}

@available(iOS 18.0, *)
struct OpenVoiceTaskIntent: ControlConfigurationIntent {
    static let title: LocalizedStringResource = "Aufgabe diktieren"
    static let description = IntentDescription(stringLiteral: "Öffnet Daily Brain zur Spracheingabe einer neuen Aufgabe.")
    static let isDiscoverable = true
    static let openAppWhenRun: Bool = true

    @MainActor
    func perform() async throws -> some IntentResult & OpensIntent {
        let defaults = UserDefaults(suiteName: "group.com.dailybrain.app")
        defaults?.set("voice", forKey: "pending_action")
        defaults?.synchronize()
        return .result(opensIntent: OpenURLIntent(URL(string: "dailybrain://task/voice")!))
    }
}
