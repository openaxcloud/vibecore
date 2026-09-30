import XCTest

/*
 * Banc iOS — UN SEUL défaut d'abord : le zoom de Safari au toucher d'un champ
 * dont la police est sous 16 px.
 *
 * Pourquoi XCUITest : mesuré le 30/09, Safari piloté par WebDriver ne réagit
 * pas comme un doigt (ni focus au toucher, ni clavier, ni zoom — même sur un
 * champ témoin à 12 px). XCUITest, lui, touche l'écran du simulateur.
 *
 * La page de test affiche le facteur de zoom RÉEL (`visualViewport.scale`) dans
 * un texte que XCUITest lit : on juge ce que Safari fait, pas une supposition.
 */
final class ZoomSafariTests: XCTestCase {
    private let safari = XCUIApplication(bundleIdentifier: "com.apple.mobilesafari")

    private var urlPage: URL {
        URL(string: ProcessInfo.processInfo.environment["BANC_URL"] ?? "http://127.0.0.1:8765/index.html")!
    }

    private var texteEchelle: XCUIElement {
        safari.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'echelle='")).firstMatch
    }

    private func echelle() -> Double {
        Double(texteEchelle.label.replacingOccurrences(of: "echelle=", with: "")) ?? -1
    }

    private func joindreCapture(_ nom: String) {
        let piece = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        piece.name = nom
        piece.lifetime = .keepAlways
        add(piece)
    }

    /*
     * Au PREMIER usage du clavier, iOS pose son écran d'accueil (« Saisissez du
     * texte en français et anglais — Continuer ») par-dessus le clavier : la
     * saisie est interrompue et rien ne zoome. Mesuré le 30/09 sur la capture du
     * premier passage. On le valide s'il est là, puis on retouche le champ.
     */
    private func toucher(_ champ: XCUIElement) {
        champ.tap()
        sleep(2)

        let continuer = XCUIApplication(bundleIdentifier: "com.apple.springboard").buttons["Continuer"]
        let continuerSafari = safari.buttons["Continuer"]

        for bouton in [continuerSafari, continuer] where bouton.exists {
            bouton.tap()
            sleep(2)
            champ.tap()
        }
    }

    override func setUp() {
        continueAfterFailure = false
        safari.terminate()
        safari.launch()
        XCUIDevice.shared.system.open(urlPage)
        XCTAssertTrue(texteEchelle.waitForExistence(timeout: 60), "la page de test n'a pas chargé (texte « echelle= » absent)")
    }

    func test1_champ12pxFaitZoomer() {
        let avant = echelle()
        let cadreAvant = safari.textFields["champ-12px"].frame.width
        toucher(safari.textFields["champ-12px"])
        sleep(3)
        let apres = echelle()
        let rapportCadre = safari.textFields["champ-12px"].frame.width / cadreAvant
        print("BANC-MESURE methode-cadre champ=12px rapport=\(rapportCadre)")
        let clavier = safari.keyboards.firstMatch.exists
        joindreCapture("zoom-12px-apres-toucher")
        print("BANC-MESURE champ=12px avant=\(avant) apres=\(apres) clavier=\(clavier)")
        XCTAssertTrue(clavier, "le clavier ne s'est pas ouvert : le toucher n'a pas fonctionné, la mesure ne vaut rien")
        XCTAssertGreaterThan(apres, avant + 0.05, "Safari n'a PAS zoomé sur le champ de 12 px (avant \(avant), après \(apres))")
    }

    func test2_champ16pxNeFaitPasZoomer() {
        let avant = echelle()
        toucher(safari.textFields["champ-16px"])
        sleep(3)
        let apres = echelle()
        let clavier = safari.keyboards.firstMatch.exists
        joindreCapture("zoom-16px-apres-toucher")
        print("BANC-MESURE champ=16px avant=\(avant) apres=\(apres) clavier=\(clavier)")
        XCTAssertTrue(clavier, "le clavier ne s'est pas ouvert : le toucher n'a pas fonctionné, la mesure ne vaut rien")
        XCTAssertEqual(apres, avant, accuracy: 0.01, "Safari a zoomé sur un champ de 16 px (avant \(avant), après \(apres))")
    }

    /*
     * Champs PUBLICS de la prod (pas de connexion : on ne saisit jamais
     * d'identifiants). Faute de pouvoir afficher `visualViewport.scale` dans une
     * page qu'on ne contrôle pas, on mesure l'élargissement du champ touché —
     * méthode validée par le témoin (rapport ≈ 1,33 sur 12 px).
     */
    func test3_champsPublicsDeLaProdNeZoomentPas() {
        let cibles: [(String, String)] = [
            ("https://app.e-code.ai/", "accueil-idee"),
            ("https://app.e-code.ai/login", "connexion-email"),
        ]

        for (url, nom) in cibles {
            safari.terminate()
            safari.launch()
            XCUIDevice.shared.system.open(URL(string: url)!)
            sleep(12)

            // Bulle d'aide de Safari (« Afficher les signets… ») : fermée si elle masque la page.
            let fermerAide = safari.buttons["Fermer"]
            if fermerAide.exists { fermerAide.tap(); sleep(1) }

            let saisissables = safari.webViews.firstMatch.descendants(matching: .any).matching(
                NSPredicate(format: "elementType == %d OR elementType == %d", XCUIElement.ElementType.textView.rawValue, XCUIElement.ElementType.textField.rawValue))
            let champ = saisissables.firstMatch
            if !champ.waitForExistence(timeout: 30) {
                joindreCapture("prod-\(nom)-champ-introuvable")
                print("BANC-ARBRE \(nom)\n" + safari.debugDescription.prefix(4000))
                XCTFail("\(nom) : champ introuvable")
                continue
            }
            let avant = champ.frame.width
            toucher(champ)
            sleep(3)
            let rapport = champ.frame.width / avant
            let clavier = safari.keyboards.firstMatch.exists
            joindreCapture("prod-\(nom)")
            print("BANC-MESURE prod=\(nom) rapport=\(rapport) clavier=\(clavier)")
            XCTAssertTrue(clavier, "\(nom) : le clavier ne s'est pas ouvert, la mesure ne vaut rien")
            XCTAssertLessThan(rapport, 1.02, "\(nom) : Safari a zoomé (champ élargi ×\(rapport))")
        }
    }
}
