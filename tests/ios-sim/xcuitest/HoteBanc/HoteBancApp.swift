import SwiftUI

// Application hôte VIDE : XCUITest exige une cible hôte, mais les tests pilotent Safari.
@main
struct HoteBancApp: App {
    var body: some Scene {
        WindowGroup { Text("Banc iOS — hôte des tests") }
    }
}
