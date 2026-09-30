import XCTest

/*
 * Banc iOS — défaut 2 : la zone de saisie passe sous le clavier ; défaut 3 : la
 * barre d'onglets du bas n'est pas couverte (elle flotte au-dessus du clavier).
 *
 * Mesure GÉOMÉTRIQUE : le cadre réel du clavier d'iOS contre celui de
 * l'élément. Validée d'abord sur une page témoin, dans les deux sens.
 */
final class ClavierSafariTests: XCTestCase {
    private let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")
    private var env: [String: String] { ProcessInfo.processInfo.environment }

    private func joindreCapture(_ nom: String) {
        let piece = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        piece.name = nom
        piece.lifetime = .keepAlways
        add(piece)
    }

    private var page: XCUIElement { safari.webViews.firstMatch }

    private func ouvrir(_ url: String) {
        safari.terminate()
        safari.launch()
        XCUIDevice.shared.system.open(URL(string: url)!)
        sleep(6)
    }

    /// Touche le champ jusqu'à ce que le clavier s'ouvre (4 essais) ; valide l'écran d'accueil du clavier s'il s'interpose.
    /// Mesuré le 30/09 : un seul `tap()` laisse parfois la page sans focus ni clavier.
    private func toucher(_ champ: XCUIElement) {
        for essai in 0..<4 {
            if essai == 0 { champ.tap() } else { champ.coordinate(withNormalizedOffset: CGVector(dx: 0.3, dy: 0.5)).tap() }
            sleep(2)
            for bouton in [safari.buttons["Continuer"], XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Continuer"]] where bouton.exists {
                bouton.tap()
                sleep(2)
                champ.tap()
                sleep(2)
            }
            if safari.keyboards.firstMatch.exists && champ.value(forKey: "hasKeyboardFocus") as? Bool == true { return }
            print("BANC-MESURE toucher essai=\(essai) clavier=\(safari.keyboards.firstMatch.exists)")
        }
    }

    /// Haut du clavier, en points d'écran. Échoue si aucun clavier : la mesure ne vaudrait rien.
    private func hautDuClavier() -> CGFloat {
        let clavier = safari.keyboards.firstMatch
        XCTAssertTrue(clavier.waitForExistence(timeout: 10), "aucun clavier : la mesure ne vaut rien")
        return clavier.frame.minY
    }

    func test1_temoins_laMesureDistingueCouvertEtNonCouvert() {
        ouvrir(env["BANC_CLAVIER_URL"] ?? "http://127.0.0.1:8765/clavier.html")
        let champ = page.descendants(matching: .any).matching(NSPredicate(format: "label == 'champ-clavier'")).firstMatch
        XCTAssertTrue(champ.waitForExistence(timeout: 60), "page témoin non chargée (champ-clavier absent)")
        toucher(champ)
        let haut = hautDuClavier()
        sleep(1)
        let pied = page.buttons["temoin-pied-fixe"].frame
        let barre = page.buttons["temoin-barre-visuelle"].frame
        joindreCapture("clavier-temoins")
        print("BANC-MESURE temoins hautClavier=\(haut) pied=\(pied.minY)-\(pied.maxY) barre=\(barre.minY)-\(barre.maxY)")
        XCTAssertGreaterThan(pied.maxY, haut + 1, "le pied fixe devrait être SOUS le clavier (couvert)")
        XCTAssertLessThanOrEqual(barre.maxY, haut + 1, "la barre replacée devrait être AU-DESSUS du clavier")
    }

    /*
     * L'IDE LOCAL (127.0.0.1, compte de TEST) : taper des identifiants de test
     * n'est permis que parce que l'hôte est local. Jamais sur la prod.
     */
    func test2_ide_zoneDeSaisieEtBarreDuBas() throws {
        guard let base = env["BANC_IDE_BASE"], let courriel = env["BANC_COURRIEL"], let secret = env["BANC_SECRET"], let projet = env["BANC_PROJET"] else {
            throw XCTSkip("BANC_IDE_BASE / BANC_COURRIEL / BANC_SECRET / BANC_PROJET absents")
        }
        XCTAssertTrue(base.hasPrefix("http://127.0.0.1") || base.hasPrefix("http://localhost"), "identifiants de test : hôte LOCAL uniquement")

        ouvrir("\(base)/login")
        // Dans la PAGE : `safari.textFields.firstMatch` attrape la barre d'adresse de Safari (mesuré le 30/09).
        let champCourriel = page.textFields["Adresse e-mail"]
        XCTAssertTrue(champCourriel.waitForExistence(timeout: 90), "formulaire de connexion absent")
        toucher(champCourriel)
        champCourriel.typeText(courriel)
        // La barre « Précédent / Suivant / OK » et la suggestion « Mots de passe » RECOUVRENT le champ
        // mot de passe une fois le clavier ouvert (y 456–553 contre 480–525, mesuré le 30/09) : on y passe par « Suivant ».
        let champSecret = page.secureTextFields.firstMatch
        let suivant = safari.buttons["Suivant"]
        if suivant.waitForExistence(timeout: 5) { suivant.tap(); sleep(2) } else { toucher(champSecret) }
        champSecret.typeText(secret + "\n")
        sleep(10)
        // Contrôle : la connexion a abouti (sinon tout ce qui suit mesurerait la page de connexion).
        XCTAssertFalse(page.buttons["Se connecter"].exists, "connexion locale refusée ou non soumise")

        // SANS fermer Safari : le cookie de session (sans « Se souvenir de moi ») meurt avec l'app — mesuré le 30/09.
        XCUIDevice.shared.system.open(URL(string: "\(base)/projects/\(projet)/ide?panel=agent")!)
        sleep(25)
        let saisie = page.textViews.firstMatch
        XCTAssertTrue(saisie.waitForExistence(timeout: 120), "zone de saisie de l'agent absente")
        joindreCapture("ide-avant-clavier")
        // Contrôle positif : sans clavier, la barre d'onglets est là et touchable — sinon « non visible » ne mesure rien.
        let ongletAvant = page.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Passer à l’onglet'")).firstMatch
        XCTAssertTrue(ongletAvant.exists && ongletAvant.isHittable, "barre d'onglets introuvable avant le clavier : la mesure du défaut 3 serait vide")
        print("BANC-MESURE ide barreAvantClavier=\(ongletAvant.frame.minY)-\(ongletAvant.frame.maxY)")
        toucher(saisie)
        let haut = hautDuClavier()
        sleep(1)
        let cadreSaisie = saisie.frame
        let onglet = page.buttons.matching(NSPredicate(format: "label BEGINSWITH 'Passer à l’onglet'")).firstMatch
        let barreVisible = onglet.exists && onglet.isHittable
        let cadreBarre = onglet.exists ? onglet.frame : .zero
        joindreCapture("ide-clavier-ouvert")
        print("BANC-MESURE ide hautClavier=\(haut) saisie=\(cadreSaisie.minY)-\(cadreSaisie.maxY) barre=\(cadreBarre.minY)-\(cadreBarre.maxY) barreVisible=\(barreVisible)")

        XCTAssertLessThanOrEqual(cadreSaisie.maxY, haut + 1, "DÉFAUT 2 : la zone de saisie passe sous le clavier (bas \(cadreSaisie.maxY) > haut du clavier \(haut))")
        XCTAssertFalse(barreVisible && cadreBarre.maxY <= haut + 1, "DÉFAUT 3 : la barre d'onglets du bas flotte au-dessus du clavier au lieu d'être couverte")
    }
}
