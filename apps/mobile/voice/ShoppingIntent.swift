import AppIntents
import Foundation

private let voiceQueueKey = "MyKitchenPendingVoiceItems"
private let voiceQueueChanged = Notification.Name("MyKitchenVoiceItemsChanged")

@available(iOS 16.0, *)
struct AddShoppingItemIntent: AppIntent {
  static var title: LocalizedStringResource = "Add shopping item"
  static var description = IntentDescription("Add an item and quantity to your My Kitchen shopping list.")
  static var openAppWhenRun: Bool = true

  @Parameter(title: "Item")
  var item: String

  @Parameter(title: "Quantity")
  var quantity: Double

  static var parameterSummary: some ParameterSummary {
    Summary("Add \(\.$quantity) \(\.$item) to the shopping list")
  }

  @MainActor
  func perform() async throws -> some IntentResult & ProvidesDialog {
    let name = item.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !name.isEmpty, name.utf16.count <= 100 else {
      return .result(dialog: "Please provide an item name of at most 100 characters.")
    }
    guard quantity.isFinite, quantity > 0, quantity <= 9999,
          Double(String(format: "%.9f", locale: Locale(identifier: "en_US_POSIX"), quantity)) == quantity else {
      return .result(dialog: "Please provide a quantity greater than zero and at most 9999, with up to 9 decimal places.")
    }
    let defaults = UserDefaults.standard
    let stored = defaults.object(forKey: voiceQueueKey)
    guard stored == nil || stored is [[String: Any]] else {
      throw NSError(domain: "MyKitchenVoiceShopping", code: 1, userInfo: [
        NSLocalizedDescriptionKey: "The Siri shopping request queue is invalid."
      ])
    }
    var pending = stored as? [[String: Any]] ?? []
    pending.append(["id": UUID().uuidString, "name": name, "quantity": quantity])
    defaults.set(pending, forKey: voiceQueueKey)
    NotificationCenter.default.post(name: voiceQueueChanged, object: nil)
    return .result(dialog: "Opening My Kitchen to add the item to your shopping list.")
  }
}

@available(iOS 16.0, *)
struct ShoppingShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: AddShoppingItemIntent(),
      phrases: [
        "Add an item in \(.applicationName)",
        "Add to my shopping list in \(.applicationName)"
      ],
      shortTitle: "Add shopping item",
      systemImageName: "cart.badge.plus"
    )
  }
}
