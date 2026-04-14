import AppIntents
import Foundation

@available(iOS 16.0, *)
struct CreateTaskIntent: AppIntent {
    static let title: LocalizedStringResource = "Aufgabe erstellen"
    static let description = IntentDescription("Erstellt eine neue Aufgabe in Daily Brain")

    @Parameter(title: "Titel")
    var taskTitle: String?

    func perform() async throws -> some IntentResult & ProvidesDialog {
        var title = taskTitle ?? ""
        if title.isEmpty {
            title = try await $taskTitle.requestValue("Wie soll die Aufgabe heißen?")
        }

        guard let url = SharedDataStore.supabaseUrl,
              let anonKey = SharedDataStore.supabaseAnonKey,
              let token = SharedDataStore.accessToken,
              let workspaceId = SharedDataStore.workspaceId,
              let userId = SharedDataStore.userId else {
            return .result(dialog: "Bitte öffne Daily Brain und melde dich an.")
        }

        guard let apiUrl = URL(string: "\(url)/rest/v1/tasks") else {
            return .result(dialog: "Fehler: Ungültige API-URL.")
        }

        var request = URLRequest(url: apiUrl)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let now = ISO8601DateFormatter().string(from: Date())
        let body: [String: Any] = [
            "workspace_id": workspaceId,
            "author_id": userId,
            "title": title,
            "status": "todo",
            "priority": "none",
            "position": 0,
            "created_at": now,
            "updated_at": now
        ]

        request.httpBody = try? JSONSerialization.data(withJSONObject: body)

        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 201 {
                return .result(dialog: "Aufgabe erstellt: \(title)")
            } else {
                return .result(dialog: "Fehler beim Erstellen der Aufgabe. Bitte öffne die App.")
            }
        } catch {
            return .result(dialog: "Netzwerkfehler. Bitte versuche es später erneut.")
        }
    }
}
