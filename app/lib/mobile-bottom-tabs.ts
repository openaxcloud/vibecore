export type MobileBottomTab = {
  id: string;
};

/**
 * Which open tabs the mobile bottom row shows.
 *
 * Deux exigences se sont succédé sur cette rangée, et elles se contredisent en
 * partie — la fonction porte donc les deux, explicitement.
 *
 * 1. Signalé depuis un téléphone : « j'ouvre un panneau et je ne le vois pas
 *    dans le menu ». La rangée prenait les PREMIERS onglets et ne laissait au
 *    panneau actif qu'un unique créneau final, si bien que chaque panneau
 *    ouvert évinçait le précédent. Mesuré à 390 px :
 *
 *      départ         : editor · preview · agent · deployments
 *      après Sécurité : editor · preview · agent · security      (deployments parti)
 *      après Skills   : editor · preview · agent · skills        (security parti)
 *
 * 2. Demande d'Avi : la barre porte TROIS onglets fixes — Webview, Agent,
 *    Déploiement — et l'éditeur devient un panneau à la demande.
 *
 * D'où ce compromis : les onglets fixes (`coreTabIds`) sont épinglés en tête,
 * dans l'ordre canonique, et les créneaux restants vont aux onglets à la
 * demande les PLUS RÉCENTS — `ensureMobileOpenTab` déplace un onglet en fin de
 * liste quand on l'ouvre ou le réactive, donc « fin de liste » vaut « le plus
 * récent ». L'onglet actif est toujours inclus, quitte à prendre la place du
 * plus ancien créneau non fixe : la rangée ne masque jamais ce que l'utilisateur
 * regarde.
 *
 * ⚠️ Conséquence assumée du point 2 : avec trois fixes pour quatre créneaux, il
 * ne reste qu'UN créneau à la demande, donc le symptôme du point 1 revient
 * au-delà du premier panneau ouvert. Ce qui l'empêche d'être un défaut : la
 * pastille `+N` annonce le nombre d'onglets masqués et la grille du sélecteur
 * (`mobile-tab-switcher`) les rend tous atteignables en un geste.
 *
 * Sans `coreTabIds`, le comportement reste purement « plus récents », tel qu'il
 * était avant l'épinglage.
 */
export function selectVisibleMobileBottomTabs<Tab extends MobileBottomTab>(
  tabs: Tab[],
  activeTabId: string,
  maxVisible = 3,
  coreTabIds: readonly string[] = [],
) {
  const normalizedMax = Math.max(1, Math.floor(maxVisible));
  const coreIds = new Set(coreTabIds);

  /*
   * Ordonne les fixes en tête, dans l'ordre canonique, et laisse les onglets à
   * la demande dans l'ordre de la liste. Appliqué AUSSI quand tout tient dans la
   * rangée : un retour anticipé « rien à sélectionner » recopiait l'ordre de la
   * liste et remettait l'Agent en dernier — le défaut mesuré en production.
   */
  const ordonner = (selection: Tab[]): Tab[] => {
    const gardes = new Set(selection.map((tab) => tab.id));

    const fixes = coreTabIds
      .map((id) => selection.find((tab) => tab.id === id))
      .filter((tab): tab is Tab => tab !== undefined);

    return [...fixes, ...tabs.filter((tab) => gardes.has(tab.id) && !coreIds.has(tab.id))];
  };

  if (tabs.length <= normalizedMax) {
    return ordonner(tabs);
  }

  /*
   * Épinglés dans l'ordre CANONIQUE de `coreTabIds`, pas dans celui de la liste
   * ouverte. Mesuré en production le 19/08 à 390 px : la rangée affichait
   * « Webview · Déploiement · Agent » alors qu'Avi demandait
   * « Webview · Agent · Déploiement » — parce que `ensureMobileOpenTab('agent')`
   * déplace l'Agent en FIN de liste au chargement, et que l'ordre de la liste
   * était recopié tel quel. Les fixes étant permanents, leur ordre doit venir de
   * la déclaration, pas de la dernière activation.
   */
  const pinned = coreTabIds
    .map((id) => tabs.find((tab) => tab.id === id))
    .filter((tab): tab is Tab => tab !== undefined)
    .slice(0, normalizedMax);

  const remainingSlots = normalizedMax - pinned.length;

  /* Aucun onglet fixe : on retombe sur la sélection « plus récents » d'origine. */
  const optional = tabs.filter((tab) => !coreIds.has(tab.id));
  const recentOptional = remainingSlots > 0 ? optional.slice(-remainingSlots) : [];

  const kept = [...pinned, ...recentOptional];
  const activeIsVisible = kept.some((tab) => tab.id === activeTabId);
  const activeTab = tabs.find((tab) => tab.id === activeTabId);

  if (!activeIsVisible && activeTab) {
    /*
     * L'onglet actif est plus ancien que la fenêtre visible : on lui rend un
     * créneau en retirant le plus ancien créneau NON fixe — jamais un fixe, que
     * la demande d'Avi rend permanent.
     */
    const droppable = kept.filter((tab) => !coreIds.has(tab.id));
    const dropped = droppable.length > 0 ? droppable[0] : kept[0];

    kept.splice(
      kept.findIndex((tab) => tab.id === dropped.id),
      1,
    );
    kept.push(activeTab);
  }

  return ordonner(kept);
}

export function countHiddenMobileBottomTabs<Tab extends MobileBottomTab>(tabs: Tab[], visibleTabs: Tab[]) {
  const visibleTabIds = new Set(visibleTabs.map((tab) => tab.id));

  return tabs.filter((tab) => !visibleTabIds.has(tab.id)).length;
}
