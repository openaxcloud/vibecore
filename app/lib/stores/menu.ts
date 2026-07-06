import { atom } from 'nanostores';

/*
 * Open state of the left chat/history sidebar drawer. Shared in a store so the
 * header toggle button and the drawer's own controls (mobile button, cursor-edge
 * heuristic, Esc) all read/write the same value — which lets the header button
 * expose an accurate aria-expanded.
 */
export const sidebarMenuStore = atom<boolean>(false);
