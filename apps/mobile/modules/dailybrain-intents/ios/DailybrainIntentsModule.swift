import ExpoModulesCore

public class DailybrainIntentsModule: Module {
    static let suiteName = "group.com.dailybrain.app"

    public func definition() -> ModuleDefinition {
        Name("DailybrainIntents")

        Function("getSharedData") { (key: String) -> String? in
            let defaults = UserDefaults(suiteName: DailybrainIntentsModule.suiteName)
            return defaults?.string(forKey: key)
        }

        Function("setSharedData") { (key: String, value: String) in
            let defaults = UserDefaults(suiteName: DailybrainIntentsModule.suiteName)
            defaults?.set(value, forKey: key)
            defaults?.synchronize()
        }

        Function("removeSharedData") { (key: String) in
            let defaults = UserDefaults(suiteName: DailybrainIntentsModule.suiteName)
            defaults?.removeObject(forKey: key)
            defaults?.synchronize()
        }
    }
}
