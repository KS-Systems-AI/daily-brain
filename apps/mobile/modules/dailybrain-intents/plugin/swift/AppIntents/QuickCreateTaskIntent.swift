import AppIntents
import Foundation
import UIKit

@available(iOS 16.0, *)
struct QuickCreateTaskIntent: AppIntent {
    static let title: LocalizedStringResource = "Neue Aufgabe anlegen"
    static let description = IntentDescription("Öffnet Daily Brain zum Erstellen einer neuen Aufgabe")
    static let openAppWhenRun = true

    func perform() async throws -> some IntentResult {
        guard let url = URL(string: "dailybrain://task/new") else {
            return .result()
        }

        await MainActor.run {
            UIApplication.shared.open(url)
        }

        return .result()
    }
}
