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
        let lireVue = { self.page.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'ih='")).firstMatch.label }
        print("BANC-MESURE vue sans-clavier \(lireVue())")
        toucher(champ)
        sleep(2)
        print("BANC-MESURE vue clavier-ouvert \(lireVue())")
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
    /// Identifiants de TEST et hôte LOCAL, ou saut du test.
    private func contexteLocal() throws -> (base: String, courriel: String, secret: String, projet: String) {
        guard let base = env["BANC_IDE_BASE"], let courriel = env["BANC_COURRIEL"], let secret = env["BANC_SECRET"], let projet = env["BANC_PROJET"] else {
            throw XCTSkip("BANC_IDE_BASE / BANC_COURRIEL / BANC_SECRET / BANC_PROJET absents")
        }
        XCTAssertTrue(base.hasPrefix("http://127.0.0.1") || base.hasPrefix("http://localhost"), "identifiants de test : hôte LOCAL uniquement")
        return (base, courriel, secret, projet)
    }

    private func seConnecter(_ c: (base: String, courriel: String, secret: String, projet: String)) {
        ouvrir("\(c.base)/login")
        // Dans la PAGE : `safari.textFields.firstMatch` attrape la barre d'adresse de Safari (mesuré le 30/09).
        let champCourriel = page.textFields["Adresse e-mail"]
        XCTAssertTrue(champCourriel.waitForExistence(timeout: 90), "formulaire de connexion absent")
        toucher(champCourriel)
        champCourriel.typeText(c.courriel)
        // La barre « Précédent / Suivant / OK » et la suggestion « Mots de passe » RECOUVRENT le champ
        // mot de passe une fois le clavier ouvert (y 456–553 contre 480–525, mesuré le 30/09) : on y passe par « Suivant ».
        let champSecret = page.secureTextFields.firstMatch
        let suivant = safari.buttons["Suivant"]
        if suivant.waitForExistence(timeout: 5) { suivant.tap(); sleep(2) }
        // « Suivant » ne prend pas toujours (passage 10, 30/09) : sinon on ferme le clavier, le champ redevient touchable.
        if champSecret.value(forKey: "hasKeyboardFocus") as? Bool != true {
            print("BANC-MESURE connexion suivant-sans-effet → fermeture du clavier")
            if safari.buttons["OK"].exists { safari.buttons["OK"].tap(); sleep(2) }
            toucher(champSecret)
        }
        champSecret.typeText(c.secret + "\n")
        sleep(10)
        // Contrôle : la connexion a abouti (sinon tout ce qui suit mesurerait la page de connexion).
        XCTAssertFalse(page.buttons["Se connecter"].exists, "connexion locale refusée ou non soumise")
    }

    /// Ouvre un panneau de l'IDE SANS fermer Safari (le cookie de session meurt avec l'app — mesuré le 30/09).
    private func ouvrirIde(_ c: (base: String, courriel: String, secret: String, projet: String), panneau: String, attente: UInt32 = 25) {
        let url = URL(string: "\(c.base)/projects/\(c.projet)/ide?panel=\(panneau)")!
        XCUIDevice.shared.system.open(url)
        sleep(attente)
        // Attendre l'IDE RÉELLEMENT chargé, pas un délai fixe : serveur de dev + machine chargée = pages
        // encore blanches à 18 s (captures du 30/09, passage 20). Témoin : le bouton de la barre du bas.
        if !page.buttons["Ouvrir le sélecteur d’onglets"].waitForExistence(timeout: 90) {
            print("BANC-MESURE ide panneau=\(panneau) non-charge-apres-90s")
        }
        // Serveur de DÉVELOPPEMENT (le build de production ne tient pas en 8 Go) : au premier chargement de
        // l'IDE, Vite découvre une dépendance, ré-optimise et recharge ; la page déjà partie plante en
        // « Application Error » (mesuré le 30/09 : `@ai-sdk/react`). Artefact du mode dev — on recharge, et on le dit.
        for essai in 1...2 where page.staticTexts["Application Error"].exists {
            print("BANC-MESURE ide rechargement=\(essai) panneau=\(panneau) cause=application-error-vite-dev")
            XCUIDevice.shared.system.open(url)
            sleep(25)
        }
    }

    /// Bord bas de la zone VISIBLE clavier ouvert : le plus haut du clavier, de sa barre d'aide et de la pastille d'adresse.
    private func bordBasVisible(_ hautClavier: CGFloat) -> CGFloat {
        var bord = hautClavier
        for el in [safari.buttons["Précédent"], safari.textFields["TabBarItemTitle"]] where el.exists && el.frame.minY > 200 {
            bord = min(bord, el.frame.minY)
        }
        return bord
    }

    /// Bas de la zone VISIBLE clavier ouvert, en points d'écran, lu sur la page témoin : sa barre suit `visualViewport`.
    /// Il tient compte de tout ce que Safari pose au-dessus du clavier (pastille d'adresse flottante, barre ∧ ∨ ✓) —
    /// ce que le seul cadre du clavier ne dit pas (mesuré le 30/09 : champ à 398–446 « au-dessus du clavier » mais
    /// caché sous la pastille).
    private func basVisibleTemoin() -> CGFloat {
        ouvrir(env["BANC_CLAVIER_URL"] ?? "http://127.0.0.1:8765/clavier.html")
        let champ = page.descendants(matching: .any).matching(NSPredicate(format: "label == 'champ-clavier'")).firstMatch
        XCTAssertTrue(champ.waitForExistence(timeout: 60), "page témoin non chargée")
        toucher(champ)
        sleep(2)
        let bas = page.buttons["temoin-barre-visuelle"].frame.maxY
        print("BANC-MESURE basVisibleTemoin=\(bas)")
        return bas
    }

    func test2_ide_zoneDeSaisieEtBarreDuBas() throws {
        let c = try contexteLocal()
        let basVisible = basVisibleTemoin()
        seConnecter(c)
        ouvrirIde(c, panneau: "agent")
        let saisie = page.textViews.firstMatch
        XCTAssertTrue(saisie.waitForExistence(timeout: 120), "zone de saisie de l'agent absente")
        joindreCapture("ide-avant-clavier")
        // Témoin de la barre du bas : son bouton « Ouvrir le sélecteur d’onglets » (relevé dans l'arbre de Safari le 30/09 ;
        // les onglets eux-mêmes n'y sont PAS exposés en boutons « Passer à l’onglet… »).
        // Contrôle positif : sans clavier, la barre d'onglets est là et touchable — sinon « non visible » ne mesure rien.
        let ongletAvant = page.buttons["Ouvrir le sélecteur d’onglets"]
        XCTAssertTrue(ongletAvant.exists && ongletAvant.isHittable, "barre d'onglets introuvable avant le clavier : la mesure du défaut 3 serait vide")
        print("BANC-MESURE ide barreAvantClavier=\(ongletAvant.frame.minY)-\(ongletAvant.frame.maxY)")
        let lireDiag = { () -> String in let d = self.page.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'diag '")).firstMatch; return d.exists ? d.label : "diag-absent" }
        print("BANC-MESURE diag sans-clavier \(lireDiag())")
        toucher(saisie)
        for i in 1...4 { sleep(1); print("BANC-MESURE diag clavier+\(i)s \(lireDiag())") }
        let ch = page.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH 'diagchaine'")).firstMatch
        print("BANC-MESURE \(ch.exists ? ch.label : "diagchaine-absent")")
        let haut = hautDuClavier()
        sleep(1)
        let cadreSaisie = saisie.frame
        let onglet = page.buttons["Ouvrir le sélecteur d’onglets"]
        let barreVisible = onglet.exists && onglet.isHittable
        let cadreBarre = onglet.exists ? onglet.frame : .zero
        joindreCapture("ide-clavier-ouvert")
        print("BANC-MESURE ide hautClavier=\(haut) saisie=\(cadreSaisie.minY)-\(cadreSaisie.maxY) barre=\(cadreBarre.minY)-\(cadreBarre.maxY) barreVisible=\(barreVisible)")

        let bord = min(bordBasVisible(haut), basVisible)
        print("BANC-MESURE ide bordBasVisible=\(bord)")
        XCTAssertLessThanOrEqual(cadreSaisie.maxY, bord + 1, "DÉFAUT 2 : la zone de saisie passe sous le bord visible (bas \(cadreSaisie.maxY) > \(bord))")
        // La BARRE D'OUTILS du composeur (sous le champ) doit tenir aussi — pas seulement le champ.
        let joindre = page.buttons["Joindre des images"]
        XCTAssertTrue(joindre.exists, "bouton « Joindre des images » introuvable : la mesure de la barre d'outils serait vide")
        print("BANC-MESURE ide barreOutilsComposeur=\(joindre.frame.minY)-\(joindre.frame.maxY)")
        XCTAssertLessThanOrEqual(joindre.frame.maxY, bord + 1, "DÉFAUT 2 : la barre d'outils du composeur passe sous le bord visible (\(joindre.frame.maxY) > \(bord))")
        // Collée au bas de la zone visible : sa barre d'outils (Agent, Power, trombone…) tient sous le champ, ~70 pt.
        XCTAssertGreaterThanOrEqual(cadreSaisie.maxY, bord - 110, "DÉFAUT 2 : la zone de saisie est repoussée loin du clavier (bas \(cadreSaisie.maxY), bord visible \(bord)) — le fil est coupé")
        XCTAssertFalse(barreVisible && cadreBarre.maxY <= haut + 1, "DÉFAUT 3 : la barre d'onglets du bas flotte au-dessus du clavier au lieu d'être couverte")
    }

    /*
     * ZOOM DANS L'APPLICATION — chaque champ de l'IDE qu'un doigt atteint.
     *
     * L'inventaire (panneau, police CALCULÉE, libellé) vient de `champs-ide.mjs`
     * (WebKit, profil iPhone) par BANC_CHAMPS. Ici, le vrai Safari : on touche le
     * champ et on mesure l'élargissement de son cadre — méthode validée par le
     * témoin de ZoomSafariTests (rapport 1,33 sur un champ de 12 px, 1,00 sur 16 px).
     * Un rapport > 1,03 = Safari a zoomé = défaut, même rare.
     */
    func test3_ide_aucunChampNeFaitZoomer() throws {
        let c = try contexteLocal()
        guard let brut = env["BANC_CHAMPS"], !brut.isEmpty else { throw XCTSkip("BANC_CHAMPS absent : inventaire non fourni") }
        let champs = brut.components(separatedBy: ";;").map { $0.components(separatedBy: "|") }.filter { $0.count >= 4 }
            .filter { ch in (env["BANC_PANNEAUX"] ?? "").isEmpty || (env["BANC_PANNEAUX"] ?? "").components(separatedBy: " ").contains(ch[0]) }
        print("BANC-MESURE zoom inventaire=\(champs.count)")
        XCTAssertGreaterThan(champs.count, 0, "inventaire vide : la mesure ne mesurerait rien")
        seConnecter(c)
        var zoomes: [String] = [], introuvables: [String] = [], sansClavier: [String] = []
        var mesures = 0
        var panneauCourant = ""
        for ch in champs {
            let (panneau, police, libelle, indice) = (ch[0], ch[1], ch[2], ch[3])
            let nom = "\(panneau)/\(libelle.isEmpty ? indice : libelle)"
            // Recharger à CHAQUE champ : un zoom déjà pris fausserait la mesure du suivant.
            // « files>README.md » : ouvrir le panneau, puis toucher le fichier (l'éditeur n'a de champ qu'avec un fichier ouvert).
            let etapes = panneau.components(separatedBy: ">")
            ouvrirIde(c, panneau: etapes[0], attente: panneau == panneauCourant ? 10 : 18)
            panneauCourant = panneau
            if etapes.count > 1 {
                let f = page.staticTexts[etapes[1]].firstMatch
                if f.waitForExistence(timeout: 10) { f.tap(); sleep(8) } else { print("BANC-MESURE zoom \(etapes[1]) introuvable dans l'arbre") }
            }
            let pred = libelle == "@textview"
                ? NSPredicate(format: "elementType == %d", XCUIElement.ElementType.textView.rawValue)
                : libelle.isEmpty
                ? NSPredicate(format: "placeholderValue == %@", indice)
                : NSPredicate(format: "label == %@ OR placeholderValue == %@", libelle, indice.isEmpty ? libelle : indice)
            let el = page.descendants(matching: .any).matching(pred).firstMatch
            guard el.waitForExistence(timeout: 8), el.frame.width > 0, el.frame.minY >= 0 else {
                introuvables.append(nom); print("BANC-MESURE zoom champ=\(nom) police=\(police) introuvable"); joindreCapture("introuvable-\(panneau)"); continue
            }
            let avant = el.frame.width
            toucher(el)
            sleep(2)
            let apres = el.frame.width
            let clavier = safari.keyboards.firstMatch.exists
            let rapport = avant > 0 ? apres / avant : 0
            print("BANC-MESURE zoom champ=\(nom) police=\(police) rapport=\(String(format: "%.3f", rapport)) clavier=\(clavier)")
            if !clavier { sansClavier.append(nom); continue }
            mesures += 1
            if rapport > 1.03 { zoomes.append("\(nom) (\(police), ×\(String(format: "%.2f", rapport)))"); joindreCapture("zoom-\(panneau)") }
            if safari.buttons["OK"].exists { safari.buttons["OK"].tap() }
        }
        print("BANC-MESURE zoom bilan mesures=\(mesures) zoomes=\(zoomes.count) introuvables=\(introuvables.count) sansClavier=\(sansClavier.count)")
        XCTAssertGreaterThan(mesures, 0, "aucun champ réellement touché avec clavier : la mesure ne vaut rien")
        XCTAssertTrue(zoomes.isEmpty, "Safari zoome sur : \(zoomes.joined(separator: " ; "))")
        // Une absence de mesure n'est pas un verdict (règle 26) : un champ non atteint laisse le test ROUGE.
        XCTAssertTrue(introuvables.isEmpty && sansClavier.isEmpty, "champs NON MESURÉS : introuvables \(introuvables) ; sans clavier \(sansClavier)")
    }

    /*
     * Clavier levé sur un champ BAS d'un panneau service : « Nom du projet » (Paramètres).
     * Mesuré le 30/09 : il restait à y 446–484, sous la barre ∧ ∨ ✓ (bas visible 409) — le conteneur fixe
     * des panneaux service gardait la hauteur de la mise en page (699) quand la vue tombait à 362.
     */
    func test5_reglages_champBasVisibleClavierLeve() throws {
        let c = try contexteLocal()
        let basVisible = basVisibleTemoin()
        seConnecter(c)
        ouvrirIde(c, panneau: "settings", attente: 10)
        let champ = page.textFields["Nom du projet"]
        XCTAssertTrue(champ.waitForExistence(timeout: 30), "champ « Nom du projet » introuvable")
        // Précondition : au repos, le champ est plus bas que le futur bas visible — sinon on ne mesure rien.
        XCTAssertGreaterThan(champ.frame.maxY, basVisible, "le champ est déjà au-dessus du bas visible : mesure vide")
        toucher(champ)
        sleep(2)
        joindreCapture("reglages-clavier-leve")
        print("BANC-MESURE reglages champ=\(champ.frame.minY)-\(champ.frame.maxY) basVisible=\(basVisible)")
        XCTAssertTrue(safari.keyboards.firstMatch.exists, "aucun clavier : la mesure ne vaut rien")
        XCTAssertLessThanOrEqual(champ.frame.maxY, basVisible + 1, "le champ actif reste sous le bas visible (\(champ.frame.maxY) > \(basVisible))")
        XCTAssertGreaterThanOrEqual(champ.frame.minY, 40, "le champ actif est sorti par le haut")
    }

    /*
     * SERVICE WORKER DE L'APP, ISOLÉ (sans l'app) — page témoin qui installe EXACTEMENT
     * app/lib/pwa-service-worker.server.ts (chemins sous /sw/), serveur toujours en ligne.
     * Mesuré le 30/09 dans le banc : l'IDE affichait « Vous êtes hors ligne » alors que le serveur
     * répondait et n'avait reçu AUCUNE requête — l'échec venait du service worker.
     */
    func test6_serviceWorker_neServiraitPasHorsLigneServeurEnLigne() {
        let base = "http://127.0.0.1:8765/sw"
        ouvrir("\(base)/index.html")
        let pret = page.staticTexts.matching(NSPredicate(format: "label CONTAINS 'sw-pret'")).firstMatch
        XCTAssertTrue(pret.waitForExistence(timeout: 30), "service worker non installé : la mesure ne vaut rien")
        var etats: [String] = []
        let lire = { () -> String in
            let e = self.page.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'etat'")).firstMatch
            return e.waitForExistence(timeout: 15) ? e.label : "RIEN"
        }
        for n in 1...8 {
            XCUIDevice.shared.system.open(URL(string: "\(base)/page.html?n=\(n)")!)
            sleep(3)
            let e = lire(); etats.append(e); print("BANC-MESURE sw navigation=\(n) \(e)")
        }
        // Navigations RAPPROCHÉES : une nouvelle avant la fin de la précédente (ce que fait le banc).
        for n in 9...12 {
            XCUIDevice.shared.system.open(URL(string: "\(base)/page.html?n=\(n)a")!)
            XCUIDevice.shared.system.open(URL(string: "\(base)/page.html?n=\(n)b")!)
            sleep(4)
            let e = lire(); etats.append(e); print("BANC-MESURE sw navigation=\(n) rapprochee \(e)")
        }
        joindreCapture("sw-fin")
        let horsLigne = etats.filter { $0.contains("HORS-LIGNE") }.count
        print("BANC-MESURE sw bilan hors-ligne=\(horsLigne)/\(etats.count) controle=\(etats.filter { $0.contains("controle=true") }.count)")
        XCTAssertEqual(horsLigne, 0, "le service worker sert la page hors ligne alors que le serveur répond")
    }

    /*
     * PARCOURS — un défaut signalé par Avi se rejoue ici au vrai toucher, étape par étape.
     * BANC_PARCOURS = étapes séparées par « ;; » :
     *   ide:<panneau>        ouvre l'IDE sur ce panneau (attend le chargement réel)
     *   tap:<libellé>        touche l'élément de la PAGE dont le libellé vaut exactement <libellé>
     *   tapdebut:<préfixe>   … dont le libellé commence par <préfixe>
     *   saisie               touche la zone de saisie de l'agent (ouvre le clavier)
     *   ok                   referme le clavier (bouton « OK » de Safari) s'il est là
     *   attendre:<s>         pause
     *   capture:<nom>        capture d'écran + arbre complet (cadres) joints au résultat
     *   cadre:<libellé>      écrit le cadre de l'élément (BANC-MESURE cadre …)
     *   glisser:haut|bas     fait défiler la page d'un geste
     * Une étape introuvable est écrite et fait échouer le parcours : une capture d'un état
     * qu'on n'a pas atteint ne prouve rien.
     */
    func test4_parcours() throws {
        let c = try contexteLocal()
        guard let brut = env["BANC_PARCOURS"], !brut.isEmpty else { throw XCTSkip("BANC_PARCOURS absent") }
        seConnecter(c)
        var manques: [String] = []
        for etape in brut.components(separatedBy: ";;") where !etape.isEmpty {
            let (verbe, arg): (String, String) = {
                guard let i = etape.firstIndex(of: ":") else { return (etape, "") }
                return (String(etape[..<i]), String(etape[etape.index(after: i)...]))
            }()
            print("BANC-MESURE parcours étape=\(etape)")
            let parLibelle = { (p: NSPredicate) -> XCUIElement in self.page.descendants(matching: .any).matching(p).firstMatch }
            switch verbe {
            case "ide": ouvrirIde(c, panneau: arg, attente: 10)
            case "tap", "tapdebut", "cadre":
                let el = parLibelle(verbe == "tapdebut" ? NSPredicate(format: "label BEGINSWITH %@", arg) : NSPredicate(format: "label == %@", arg))
                if !el.waitForExistence(timeout: 10) { manques.append(etape); print("BANC-MESURE parcours INTROUVABLE \(etape)"); continue }
                if verbe == "cadre" { print("BANC-MESURE cadre \(arg)=\(el.frame.minX),\(el.frame.minY),\(el.frame.maxX),\(el.frame.maxY)") }
                else { el.tap(); sleep(2) }
            case "tapbas":
                // Plusieurs éléments portent ce libellé (« Agent » : titre de l'en-tête ET bouton de mode) : le plus bas.
                let tous = page.descendants(matching: .any).matching(NSPredicate(format: "label == %@", arg)).allElementsBoundByIndex.filter { $0.exists && $0.frame.width > 0 }
                guard let bas = tous.max(by: { $0.frame.minY < $1.frame.minY }) else { manques.append(etape); print("BANC-MESURE parcours INTROUVABLE \(etape)"); continue }
                bas.tap(); sleep(2)
            case "cadres":
                for (i, e) in page.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", arg)).allElementsBoundByIndex.enumerated() where e.exists {
                    print("BANC-MESURE cadres \(arg)#\(i) type=\(e.elementType.rawValue) \(e.frame.minX),\(e.frame.minY),\(e.frame.maxX),\(e.frame.maxY) libellé=\(e.label.prefix(300))")
                }
            case "glisserfil":
                // Vrai glissé au doigt sur le fil (remonter) : `swipeDown()` sur la page ne faisait rien défiler (30/09).
                // glisserfil = remonter (doigt vers le bas) ; glisserfil:bas = descendre (doigt vers le haut).
                let (y0, y1): (CGFloat, CGFloat) = arg == "bas" ? (0.7, 0.2) : (0.25, 0.7)
                page.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: y0))
                    .press(forDuration: 0.05, thenDragTo: page.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: y1)))
                sleep(2)
            case "theme":
                // Cookie `ecode_theme` posé depuis la page du banc (même hôte, autre port) : passe avant le thème du compte.
                XCUIDevice.shared.system.open(URL(string: "http://127.0.0.1:8765/theme.html?t=\(arg)")!)
                if !page.staticTexts.matching(NSPredicate(format: "label BEGINSWITH 'theme'")).firstMatch.waitForExistence(timeout: 20) { manques.append(etape) }
                sleep(1)
            case "appuilong":
                // Appui long au doigt (1,2 s) sur le plus bas des éléments dont le libellé commence par <arg>.
                let cibles = page.descendants(matching: .any).matching(NSPredicate(format: "label BEGINSWITH %@", arg)).allElementsBoundByIndex.filter { $0.exists && $0.frame.minY > 60 && $0.frame.maxY < 680 }
                guard let cible = cibles.max(by: { $0.frame.minY < $1.frame.minY }) else { manques.append(etape); print("BANC-MESURE parcours INTROUVABLE \(etape)"); continue }
                // Au centre de son CADRE : `press` sur l'élément échoue (« Not hittable ») pour un texte recouvert par un calque (30/09).
                cible.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5)).press(forDuration: 1.2); sleep(1)
            case "url":
                // Page publique de l'app locale (marketing) : base + chemin, SANS fermer Safari.
                XCUIDevice.shared.system.open(URL(string: "\(c.base)\(arg)")!); sleep(8)
            case "taper":
                // Saisie dans le champ qui a le focus (ex. faire apparaître le bouton d'envoi du composeur).
                safari.typeText(arg); sleep(1)
            case "saisie":
                let z = page.textViews["Prompt de l’agent"]
                if !z.waitForExistence(timeout: 20) { manques.append(etape); continue }
                toucher(z)
            case "ok": if safari.buttons["OK"].exists { safari.buttons["OK"].tap(); sleep(1) }
            case "attendre": sleep(UInt32(arg) ?? 2)
            case "glisser": arg == "haut" ? page.swipeDown() : page.swipeUp(); sleep(1)
            case "capture":
                joindreCapture(arg)
                let arbre = XCTAttachment(string: page.debugDescription)
                arbre.name = "arbre-\(arg)"; arbre.lifetime = .keepAlways; add(arbre)
            default: manques.append(etape)
            }
        }
        XCTAssertTrue(manques.isEmpty, "étapes non atteintes : \(manques)")
    }
}
