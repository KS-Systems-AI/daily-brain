import Foundation

struct SharedDataStore {
    static let suiteName = "group.com.dailybrain.app"

    static func getString(_ key: String) -> String? {
        guard let defaults = UserDefaults(suiteName: suiteName) else { return nil }
        return defaults.string(forKey: key)
    }

    static var supabaseUrl: String? { getString("supabase_url") }
    static var supabaseAnonKey: String? { getString("supabase_anon_key") }
    static var accessToken: String? { getString("supabase_token") }
    static var workspaceId: String? { getString("workspace_id") }
    static var userId: String? { getString("user_id") }
}
