# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: ide-mobile-chrome.spec.ts >> chrome de l’IDE sur téléphone — 390 >> zone de saisie : le menu « ••• » se rend hors du composeur, entier, et chacune de ses entrées s’ouvre dans l’écran — tablette 820
- Location: tests/e2e/ide-mobile-chrome.spec.ts:1398:5

# Error details

```
Error: « Design palette » : la surface a disparu après un appui dedans

expect(received).toBeGreaterThan(expected)

Expected: > 0
Received:   0
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - status [ref=e2]: Checking the active session…
  - main [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e7]:
        - generic [ref=e8]:
          - button "Back to dashboard" [ref=e9] [cursor=pointer]
          - button "Activity" [ref=e11] [cursor=pointer]
        - button "Search tools and files" [ref=e13] [cursor=pointer]:
          - img [ref=e14]
          - generic [ref=e19]:
            - strong [ref=e20]: Agent
            - generic [ref=e21]: 0 messages
        - generic [ref=e22]:
          - button "Open tools" [ref=e23] [cursor=pointer]
          - button "Agent options" [ref=e25] [cursor=pointer]
      - status: Connection healthy
      - generic [ref=e28]:
        - region "Agent workspace context" [ref=e29]:
          - generic [ref=e30]:
            - generic [ref=e31]:
              - img [ref=e33]
              - generic [ref=e38]:
                - strong [ref=e39]: Agent ready
                - generic [ref=e40]: Workspace context ready
              - generic [ref=e41]: Idle
            - generic "Workspace readiness" [ref=e42]:
              - generic [ref=e45]: Context loaded
              - generic [ref=e48]: Files ready
              - generic [ref=e51]: Preview available
          - generic "Agent quick actions" [ref=e52]:
            - button "Add a feature" [ref=e53] [cursor=pointer]:
              - generic [ref=e55]: Add a feature
            - button "Find next best step" [ref=e56] [cursor=pointer]:
              - generic [ref=e58]: Find next best step
        - generic [ref=e59]:
          - log "Agent conversation history" [ref=e61]
          - generic [ref=e65]:
            - img
            - generic [ref=e66]:
              - textbox "Agent prompt" [ref=e68]:
                - /placeholder: Build, fix or refactor — describe it…
              - generic [ref=e69]:
                - generic [ref=e70]:
                  - button "Agent" [ref=e72] [cursor=pointer]:
                    - generic [ref=e73]: Agent
                  - generic [ref=e76]:
                    - 'button "Agent mode: Power. Opens advanced settings." [ref=e77] [cursor=pointer]':
                      - generic [ref=e78]: Power
                    - paragraph [ref=e80]: The right balance.
                - generic [ref=e81]:
                  - button "Attach images" [ref=e82] [cursor=pointer]
                  - button "Dictate a message" [ref=e84] [cursor=pointer]:
                    - status [ref=e87]
                  - button "More composer & tools" [ref=e89] [cursor=pointer]
      - navigation "IDE panels":
        - generic [ref=e91]:
          - button "Starting project" [pressed] [ref=e92]
          - generic [ref=e93]:
            - button "Open tab switcher" [ref=e94] [cursor=pointer]
            - group "Open tabs" [ref=e97]:
              - button "Switch to Webview tab" [ref=e98] [cursor=pointer]
              - button "Switch to Agent tab" [pressed] [ref=e100] [cursor=pointer]:
                - img [ref=e101]
              - button "Switch to Publish tab" [ref=e107] [cursor=pointer]
            - button "Add new tab" [ref=e110] [cursor=pointer]
          - button "More options" [ref=e112] [cursor=pointer]
  - status "Loading page"
  - generic:
    - generic:
      - generic:
        - img
      - generic: Loading E-Code…
  - region "Notifications Alt+T"
```

# Test source

```ts
  1499 |           await page.keyboard.press('Escape');
  1500 |           continue;
  1501 |         }
  1502 |
  1503 |         // On marque les surfaces déjà là : celle qui s'ouvre est celle qui n'est pas marquée (un compte se trompe quand une surface précédente finit de disparaître).
  1504 |         await page.locator(surfaces).evaluateAll((els) => {
  1505 |           els.forEach((el) => el.setAttribute('data-vc-avant', '1'));
  1506 |         });
  1507 |
  1508 |         await entree.tap({ timeout: 10_000 });
  1509 |         await page.waitForTimeout(700);
  1510 |
  1511 |         const ouverture = await page.evaluate(
  1512 |           ({ surfaces }) => {
  1513 |             const candidats = [...document.querySelectorAll<HTMLElement>(surfaces)].filter(
  1514 |               (el) => el.getBoundingClientRect().height > 0 && !el.hasAttribute('data-vc-avant'),
  1515 |             );
  1516 |
  1517 |             const surface = candidats.length > 0 ? candidats[candidats.length - 1] : null;
  1518 |             const composeur = document.querySelector('.bolt-project-agent-composer')!.getBoundingClientRect();
  1519 |             const r = surface?.getBoundingClientRect();
  1520 |             const entete = document.querySelector('.bolt-mobile-ecode-header')?.getBoundingClientRect();
  1521 |
  1522 |             // Ce qui est peint au centre de la surface doit être la surface : rien ne passe devant (feuille, en-tête).
  1523 |             const dessus = r ? document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2) : null;
  1524 |
  1525 |             return {
  1526 |               enteteBas: entete ? Math.round(entete.bottom) : 0,
  1527 |               peinteDessus: Boolean(surface && dessus && surface.contains(dessus)),
  1528 |               surface: r
  1529 |                 ? {
  1530 |                     top: Math.round(r.top),
  1531 |                     bottom: Math.round(r.bottom),
  1532 |                     left: Math.round(r.left),
  1533 |                     right: Math.round(r.right),
  1534 |                   }
  1535 |                 : null,
  1536 |               composeur: {
  1537 |                 top: Math.round(composeur.top),
  1538 |                 bottom: Math.round(composeur.bottom),
  1539 |                 left: Math.round(composeur.left),
  1540 |                 right: Math.round(composeur.right),
  1541 |               },
  1542 |               vw: innerWidth,
  1543 |               vh: innerHeight,
  1544 |             };
  1545 |           },
  1546 |           { surfaces },
  1547 |         );
  1548 |
  1549 |         /*
  1550 |          * Une surface neuve, ou (paramètres de l'agent) le composeur lui-même
  1551 |          * qui grandit : dans les deux cas, dans l'écran. Hors « paramètres »,
  1552 |          * la surface est EXIGÉE : mesuré le 07/09, « Ouvrir Supabase »
  1553 |          * n'ouvrait rien (le menu se fermait à l'ouverture et démontait son
  1554 |          * dialogue), sur téléphone comme sur bureau.
  1555 |          */
  1556 |         if (!/param|settings/i.test(texte)) {
  1557 |           expect(ouverture.surface, `« ${texte} » n’a rien ouvert`).not.toBeNull();
  1558 |         }
  1559 |
  1560 |         const boite = ouverture.surface ?? ouverture.composeur;
  1561 |
  1562 |         expect(boite.left, `« ${texte} » : bord gauche à ${boite.left}px`).toBeGreaterThanOrEqual(0);
  1563 |
  1564 |         // Sous l'en-tête fixé, jamais dessous (la palette avait son titre caché par l'en-tête) ; et rien devant elle.
  1565 |         expect(
  1566 |           boite.top,
  1567 |           `« ${texte} » : haut à ${boite.top}px pour un en-tête jusqu’à ${ouverture.enteteBas}px`,
  1568 |         ).toBeGreaterThanOrEqual(ouverture.enteteBas);
  1569 |
  1570 |         if (ouverture.surface) {
  1571 |           expect(
  1572 |             ouverture.peinteDessus,
  1573 |             `« ${texte} » : quelque chose passe devant la surface (feuille, en-tête)`,
  1574 |           ).toBe(true);
  1575 |         }
  1576 |
  1577 |         expect(boite.right, `« ${texte} » : bord droit à ${boite.right}px pour ${ouverture.vw}px`).toBeLessThanOrEqual(
  1578 |           ouverture.vw,
  1579 |         );
  1580 |         expect(boite.bottom, `« ${texte} » : bas à ${boite.bottom}px pour ${ouverture.vh}px`).toBeLessThanOrEqual(
  1581 |           ouverture.vh,
  1582 |         );
  1583 |
  1584 |         // Un appui DANS la surface ne la fait pas disparaître (mesuré : un clic dans le dialogue MCP le démontait).
  1585 |         if (ouverture.surface) {
  1586 |           await page.touchscreen.tap(
  1587 |             (ouverture.surface.left + ouverture.surface.right) / 2,
  1588 |             Math.min(ouverture.surface.top + 24, ouverture.surface.bottom - 4),
  1589 |           );
  1590 |           await page.waitForTimeout(400);
  1591 |
  1592 |           const encoreLa = await page
  1593 |             .locator(surfaces)
  1594 |             .evaluateAll(
  1595 |               (els) =>
  1596 |                 els.filter((el) => el.getBoundingClientRect().height > 0 && !el.hasAttribute('data-vc-avant')).length,
  1597 |             );
  1598 |
> 1599 |           expect(encoreLa, `« ${texte} » : la surface a disparu après un appui dedans`).toBeGreaterThan(0);
       |                                                                                         ^ Error: « Design palette » : la surface a disparu après un appui dedans
  1600 |         }
  1601 |
  1602 |         // Refermer ce qui s'est ouvert, puis le menu s'il est resté ouvert.
  1603 |         await page.keyboard.press('Escape');
  1604 |         await page.waitForTimeout(300);
  1605 |
  1606 |         if (await menu.isVisible().catch(() => false)) {
  1607 |           await page.keyboard.press('Escape');
  1608 |           await page.waitForTimeout(300);
  1609 |         }
  1610 |
  1611 |         if (await menu.isVisible().catch(() => false)) {
  1612 |           await page.touchscreen.tap(largeur / 2, 120);
  1613 |           await page.waitForTimeout(300);
  1614 |         }
  1615 |       }
  1616 |     });
  1617 |   }
  1618 |
  1619 |   test('Webview : l’URL se lit en 13 px et s’édite à 16 px ; les journaux se referment', async ({ page, request }) => {
  1620 |     test.setTimeout(150_000);
  1621 |     await ouvrirIde(page, request, { fil: true });
  1622 |     await ouvrirOutil(page, 'preview');
  1623 |
  1624 |     const barre = page.locator('.bolt-preview-addressbar');
  1625 |
  1626 |     await expect(barre).toBeVisible({ timeout: 30_000 });
  1627 |     await expect(page.locator('.bolt-preview-port-button')).toBeVisible({ timeout: 30_000 });
  1628 |
  1629 |     /*
  1630 |      * Avi, 07/09 08:19 : « tu as réduis la police du contenu comme le reste,
  1631 |      * où il y a l'URL ». Le champ garde 16 px (plancher iOS, IOS-ZOOM-001) ;
  1632 |      * hors édition, c'est un bouton en 13 px qui montre l'adresse.
  1633 |      */
  1634 |     const lecture = barre.locator('.bolt-preview-url-text');
  1635 |     const champ = barre.locator('input');
  1636 |
  1637 |     await expect(lecture).toBeVisible();
  1638 |
  1639 |     const polices = await page.evaluate(() => ({
  1640 |       lecture: getComputedStyle(document.querySelector('.bolt-preview-url-text')!).fontSize,
  1641 |       champ: getComputedStyle(document.querySelector('.bolt-preview-addressbar input')!).fontSize,
  1642 |       champVisible: getComputedStyle(document.querySelector('.bolt-preview-addressbar input')!).opacity !== '0',
  1643 |     }));
  1644 |
  1645 |     expect(polices.lecture, 'l’URL se lit à l’échelle du reste').toBe('13px');
  1646 |     expect(polices.champ, 'le champ garde le plancher iOS').toBe('16px');
  1647 |     expect(polices.champVisible, 'hors édition, le champ est retiré de la vue').toBe(false);
  1648 |
  1649 |     // Un appui sur l'adresse révèle le champ et le focalise, à 16 px.
  1650 |     if (await lecture.isEnabled()) {
  1651 |       await lecture.tap();
  1652 |       await expect(champ).toBeFocused({ timeout: 5_000 });
  1653 |
  1654 |       const enEdition = await champ.evaluate((el) => ({
  1655 |         largeur: el.getBoundingClientRect().width,
  1656 |         police: getComputedStyle(el).fontSize,
  1657 |       }));
  1658 |
  1659 |       expect(enEdition.largeur).toBeGreaterThan(80);
  1660 |       expect(enEdition.police).toBe('16px');
  1661 |       await champ.blur();
  1662 |       await expect(lecture).toBeVisible();
  1663 |     }
  1664 |
  1665 |     /*
  1666 |      * « Quand j'ouvre les journaux je ne peux pas les fermer » : « Ancrer à
  1667 |      * droite » est caché sur téléphone et rien ne refermait le panneau.
  1668 |      */
  1669 |     // Le chemin d'Avi : « Afficher les journaux » sur la carte de démarrage ; à défaut (carte absente), le bouton de la barre d'outils.
  1670 |     const boutonCarte = page
  1671 |       .locator('.bolt-preview-splash button')
  1672 |       .filter({ hasText: /journaux|logs/i })
  1673 |       .first();
  1674 |
  1675 |     if (await boutonCarte.isVisible().catch(() => false)) {
  1676 |       await boutonCarte.tap();
  1677 |     } else {
  1678 |       await page
  1679 |         .locator(
  1680 |           '.bolt-project-webview-toolbar button[title*="ournaux"], .bolt-project-webview-toolbar button[title*="logs" i]',
  1681 |         )
  1682 |         .first()
  1683 |         .evaluate((el) => (el as HTMLElement).click());
  1684 |     }
  1685 |
  1686 |     const journaux = page.locator('.bolt-preview-logs-panel');
  1687 |
  1688 |     await expect(journaux).toBeVisible({ timeout: 10_000 });
  1689 |
  1690 |     const croix = journaux.locator('.bolt-preview-logs-close');
  1691 |
  1692 |     await expect(croix, 'la croix qui referme les journaux').toBeVisible();
  1693 |
  1694 |     const boiteCroix = await croix.boundingBox();
  1695 |
  1696 |     expect(boiteCroix!.width, 'cible tactile').toBeGreaterThanOrEqual(44);
  1697 |     expect(boiteCroix!.x + boiteCroix!.width).toBeLessThanOrEqual(390);
  1698 |     await croix.tap();
  1699 |     await expect(journaux, 'les journaux se referment').toBeHidden({ timeout: 5_000 });
```
