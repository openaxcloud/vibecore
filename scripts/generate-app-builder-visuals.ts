import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { chromium, type Locator, type Page } from '@playwright/test';

type Locale = 'en' | 'fr';
type VisualName = 'live-booking-app' | 'mobile-booking' | 'team-schedule' | 'client-reminders';

const OUTPUT_ROOT = resolve(process.cwd(), 'public/assets/solutions/app-builder');
const OG_OUTPUT_ROOT = resolve(process.cwd(), 'public/assets/og/solutions');

const IBM_PLEX_SANS_URL =
  'https://fonts.gstatic.com/s/ibmplexsans/v23/zYXzKVElMYYaJe8bpLHnCwDKr932-G7dytD-Dmu1syxeKYbSB4Zh.woff2';

const IBM_PLEX_SANS_SHA256 = '056e4e2459f57a0033c8c9c844ff19d6e42ac8602027803d4345823bcc939818';

const COPY = {
  en: {
    languageTag: 'EN',
    demo: 'FICTIONAL DEMO DATA',
    salon: 'ATELIER 17',
    salonType: 'Independent hair studio',
    nav: ['Services', 'The team', 'My bookings'],
    live: {
      eyebrow: 'ONLINE BOOKING',
      title: 'Your next appointment, without the phone call.',
      intro: 'Choose a service, a stylist and an available time. Your booking is confirmed before you leave the page.',
      section: 'Choose your service',
      serviceOne: 'Cut & finish',
      serviceOneMeta: '45 min · €48',
      serviceTwo: 'Colour consultation',
      serviceTwoMeta: '30 min · Free',
      serviceThree: 'Cut & beard',
      serviceThreeMeta: '60 min · €62',
      selected: 'YOUR APPOINTMENT',
      stylistLabel: 'Stylist',
      stylist: 'Sofia',
      dateLabel: 'Date',
      date: 'Tuesday, 18 June',
      timeLabel: 'Time',
      time: '10:15',
      totalLabel: 'Total',
      total: '€48',
      cta: 'Continue to your details',
      availability: 'Next available times',
      available: 'Available',
      slots: ['09:30', '10:15', '11:00', '14:30'],
    },
    mobile: {
      title: 'Book an appointment',
      back: 'Back',
      step: 'STEP 2 OF 3',
      section: 'Choose a time',
      date: 'Tuesday, 18 June',
      service: 'Cut & finish',
      duration: '45 min with Sofia',
      morning: 'Morning',
      afternoon: 'Afternoon',
      cta: 'Confirm 10:15',
      note: 'No payment required today',
      confirmation: 'Appointment summary',
      confirmationText: 'A confirmation email will be sent to client@example.test.',
    },
    schedule: {
      product: 'Salon workspace',
      page: 'Team schedule',
      subtitle: 'Appointments and open capacity for the demo salon.',
      today: 'Today',
      week: '18–22 June',
      create: 'New appointment',
      sidebar: ['Schedule', 'Clients', 'Services', 'Reminders', 'Settings'],
      filters: ['All team members', 'All services'],
      open: 'Open slot',
      confirmed: 'Confirmed',
      pending: 'Pending',
      days: ['Tue 18', 'Wed 19', 'Thu 20', 'Fri 21', 'Sat 22'],
      appointments: [
        ['09:15', 'Amélie', 'Cut & finish'],
        ['10:15', 'Lina', 'Colour consultation'],
        ['11:15', 'Eva', 'Cut & finish'],
        ['09:30', 'Mila', 'Cut & beard'],
        ['12:15', 'Nora', 'Colour consultation'],
        ['13:15', 'Alex', 'Cut & finish'],
      ],
    },
    client: {
      product: 'Salon workspace',
      page: 'Client record',
      sidebar: ['Schedule', 'Clients', 'Services', 'Reminders', 'Settings'],
      back: 'Back to clients',
      name: 'Amélie Martin',
      since: 'Demo client · added 4 May',
      email: 'amelie@example.test',
      phone: '+33 6 00 00 00 00',
      next: 'NEXT APPOINTMENT',
      nextDate: 'Tuesday, 18 June · 10:15',
      nextService: 'Cut & finish with Sofia · 45 min',
      edit: 'Edit booking',
      reminders: 'Email reminders',
      remindersIntro: 'Messages are tied to this booking and use fictional contact data.',
      firstReminder: '24-hour reminder',
      firstTime: 'Scheduled · 17 June at 10:15',
      secondReminder: '2-hour reminder',
      secondTime: 'Scheduled · 18 June at 08:15',
      send: 'Send test reminder',
      history: 'Appointment history',
      headers: ['Date', 'Service', 'Stylist', 'Status'],
      rows: [
        ['4 May', 'Cut & finish', 'Noa', 'Completed'],
        ['16 March', 'Colour consultation', 'Sofia', 'Completed'],
        ['2 February', 'Cut & finish', 'Sofia', 'Completed'],
      ],
      profile: 'Client details',
      preferences: 'Prefers morning appointments · email reminders enabled',
    },
  },
  fr: {
    languageTag: 'FR',
    demo: 'DONNÉES FICTIVES DE DÉMONSTRATION',
    salon: 'ATELIER 17',
    salonType: 'Salon de coiffure indépendant',
    nav: ['Prestations', 'L’équipe', 'Mes rendez-vous'],
    live: {
      eyebrow: 'RÉSERVATION EN LIGNE',
      title: 'Votre prochain rendez-vous, sans passer d’appel.',
      intro:
        'Choisissez une prestation, un membre de l’équipe et un créneau disponible. Votre réservation est confirmée avant de quitter la page.',
      section: 'Choisissez votre prestation',
      serviceOne: 'Coupe & coiffage',
      serviceOneMeta: '45 min · 48 €',
      serviceTwo: 'Diagnostic couleur',
      serviceTwoMeta: '30 min · Gratuit',
      serviceThree: 'Coupe & barbe',
      serviceThreeMeta: '60 min · 62 €',
      selected: 'VOTRE RENDEZ-VOUS',
      stylistLabel: 'Coiffeuse',
      stylist: 'Sofia',
      dateLabel: 'Date',
      date: 'Mardi 18 juin',
      timeLabel: 'Heure',
      time: '10:15',
      totalLabel: 'Total',
      total: '48 €',
      cta: 'Continuer vers vos coordonnées',
      availability: 'Prochains créneaux disponibles',
      available: 'Disponible',
      slots: ['09:30', '10:15', '11:00', '14:30'],
    },
    mobile: {
      title: 'Prendre rendez-vous',
      back: 'Retour',
      step: 'ÉTAPE 2 SUR 3',
      section: 'Choisissez une heure',
      date: 'Mardi 18 juin',
      service: 'Coupe & coiffage',
      duration: '45 min avec Sofia',
      morning: 'Matin',
      afternoon: 'Après-midi',
      cta: 'Confirmer 10:15',
      note: 'Aucun paiement demandé aujourd’hui',
      confirmation: 'Récapitulatif du rendez-vous',
      confirmationText: 'Un email de confirmation sera envoyé à client@example.test.',
    },
    schedule: {
      product: 'Espace du salon',
      page: 'Agenda de l’équipe',
      subtitle: 'Rendez-vous et disponibilités du salon de démonstration.',
      today: 'Aujourd’hui',
      week: '18–22 juin',
      create: 'Nouveau rendez-vous',
      sidebar: ['Agenda', 'Clients', 'Prestations', 'Rappels', 'Réglages'],
      filters: ['Toute l’équipe', 'Toutes les prestations'],
      open: 'Créneau libre',
      confirmed: 'Confirmé',
      pending: 'En attente',
      days: ['Mar. 18', 'Mer. 19', 'Jeu. 20', 'Ven. 21', 'Sam. 22'],
      appointments: [
        ['09:15', 'Amélie', 'Coupe & coiffage'],
        ['10:15', 'Lina', 'Diagnostic couleur'],
        ['11:15', 'Eva', 'Coupe & coiffage'],
        ['09:30', 'Mila', 'Coupe & barbe'],
        ['12:15', 'Nora', 'Diagnostic couleur'],
        ['13:15', 'Alex', 'Coupe & coiffage'],
      ],
    },
    client: {
      product: 'Espace du salon',
      page: 'Fiche client',
      sidebar: ['Agenda', 'Clients', 'Prestations', 'Rappels', 'Réglages'],
      back: 'Retour aux clients',
      name: 'Amélie Martin',
      since: 'Cliente fictive · ajoutée le 4 mai',
      email: 'amelie@example.test',
      phone: '+33 6 00 00 00 00',
      next: 'PROCHAIN RENDEZ-VOUS',
      nextDate: 'Mardi 18 juin · 10:15',
      nextService: 'Coupe & coiffage avec Sofia · 45 min',
      edit: 'Modifier le rendez-vous',
      reminders: 'Rappels par email',
      remindersIntro: 'Les messages sont liés à cette réservation et utilisent des coordonnées fictives.',
      firstReminder: 'Rappel 24 heures avant',
      firstTime: 'Programmé · 17 juin à 10:15',
      secondReminder: 'Rappel 2 heures avant',
      secondTime: 'Programmé · 18 juin à 08:15',
      send: 'Envoyer un rappel test',
      history: 'Historique des rendez-vous',
      headers: ['Date', 'Prestation', 'Coiffeur', 'Statut'],
      rows: [
        ['4 mai', 'Coupe & coiffage', 'Noa', 'Terminé'],
        ['16 mars', 'Diagnostic couleur', 'Sofia', 'Terminé'],
        ['2 février', 'Coupe & coiffage', 'Sofia', 'Terminé'],
      ],
      profile: 'Coordonnées client',
      preferences: 'Préfère les rendez-vous le matin · rappels email activés',
    },
  },
} as const;

const BASE_CSS = String.raw`
  :root {
    color-scheme: light;
    font-family: 'IBM Plex Sans', sans-serif;
    font-synthesis: none;
    --ink: #122033;
    --muted: #667386;
    --line: #DCE3EA;
    --soft-line: #E9EEF3;
    --canvas: #EDF2F6;
    --surface: #FFFFFF;
    --soft: #F6F8FA;
    --navy: #091522;
    --navy-2: #102337;
    --blue: #246B9E;
    --blue-soft: #E8F2F9;
    --green: #187A57;
    --green-soft: #E8F5EF;
    --orange: #F26207;
    --orange-hover: #D94F00;
    --shadow: 0 22px 60px rgba(16, 35, 55, 0.16);
  }

  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  html, body { margin: 0; width: 100%; height: 100%; overflow: hidden; }
  body { background: var(--canvas); color: var(--ink); font-family: 'IBM Plex Sans', sans-serif; }
  button, input, select { font: inherit; }
  button { cursor: default; }

  .capture { width: 100%; height: 100%; padding: 32px; background:
    radial-gradient(circle at 9% 2%, rgba(36,107,158,.10), transparent 26%),
    linear-gradient(135deg, #F4F7F9 0%, #E8EEF3 100%); }
  .browser { width: 100%; height: 100%; overflow: hidden; border: 1px solid #C8D1DB; border-radius: 18px; background: var(--surface); box-shadow: var(--shadow); }
  .browser-bar { height: 54px; display: flex; align-items: center; gap: 16px; padding: 0 18px; border-bottom: 1px solid var(--line); background: #F7F9FB; }
  .browser-dots { display: flex; gap: 7px; }
  .browser-dot { width: 10px; height: 10px; border-radius: 50%; background: #C4CDD6; }
  .browser-url { display: flex; align-items: center; justify-content: center; flex: 1; max-width: 620px; height: 32px; margin: 0 auto; border: 1px solid #D8E0E7; border-radius: 8px; background: #FFFFFF; color: #657285; font-size: 12px; letter-spacing: .01em; }
  .secure-dot { width: 7px; height: 7px; margin-right: 8px; border-radius: 50%; background: var(--green); }
  .browser-tools { display: flex; gap: 8px; }
  .browser-tool { width: 28px; height: 28px; border: 1px solid #D8E0E7; border-radius: 7px; background: #FFFFFF; }

  .demo-pill { display: inline-flex; min-height: 26px; align-items: center; gap: 7px; border: 1px solid #C8D5DF; border-radius: 999px; padding: 5px 10px; background: #F6F9FB; color: #536274; font-size: 10px; font-weight: 700; letter-spacing: .11em; white-space: nowrap; }
  .demo-pill::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--blue); }
  .brand-mark { display: grid; width: 38px; height: 38px; place-items: center; border-radius: 11px; background: var(--navy); color: #FFFFFF; font-size: 13px; font-weight: 700; letter-spacing: .06em; }
  .brand-copy strong { display: block; color: var(--ink); font-size: 13px; letter-spacing: .12em; }
  .brand-copy span { display: block; margin-top: 2px; color: var(--muted); font-size: 11px; }
  .action { min-height: 42px; border: 0; border-radius: 9px; padding: 0 18px; background: var(--orange); color: #FFFFFF; font-size: 13px; font-weight: 700; box-shadow: 0 8px 18px rgba(242,98,7,.20); }
  .secondary-action { min-height: 40px; border: 1px solid #CAD4DE; border-radius: 9px; padding: 0 15px; background: #FFFFFF; color: var(--ink); font-size: 12px; font-weight: 600; }
  .status { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 5px 8px; font-size: 10px; font-weight: 600; }
  .status::before { content: ''; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .status--ok { background: var(--green-soft); color: var(--green); }
  .status--info { background: var(--blue-soft); color: var(--blue); }
  .status--neutral { background: #EEF2F5; color: #667386; }

  .salon-header { height: 82px; display: flex; align-items: center; gap: 14px; padding: 0 42px; border-bottom: 1px solid var(--soft-line); background: rgba(255,255,255,.98); }
  .salon-nav { display: flex; align-items: center; gap: 28px; margin-left: auto; color: #536274; font-size: 12px; font-weight: 500; }
  .salon-header .demo-pill { margin-left: 16px; }
  .salon-header .action { margin-left: 4px; }

  .live-main { display: grid; height: calc(100% - 136px); grid-template-columns: minmax(0, 1fr) 410px; }
  .live-content { overflow: hidden; padding: 48px 54px 30px; background:
    linear-gradient(90deg, rgba(255,255,255,.95), rgba(255,255,255,.82)),
    radial-gradient(circle at 80% 10%, #DCEAF3 0%, transparent 34%); }
  .eyebrow { color: var(--blue); font-size: 11px; font-weight: 700; letter-spacing: .15em; }
  .live-content h1 { max-width: 760px; margin: 12px 0 13px; color: #0C1A29; font-size: 42px; line-height: 1.08; letter-spacing: -.035em; }
  .live-content > p { max-width: 690px; margin: 0; color: var(--muted); font-size: 15px; line-height: 1.55; }
  .service-title { margin: 34px 0 15px; font-size: 15px; }
  .service-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 12px; }
  .service-card { position: relative; min-height: 152px; overflow: hidden; appearance: none; border: 1px solid var(--line); border-radius: 12px; background: #FFFFFF; color: var(--ink); padding: 18px; text-align: left; }
  .service-card.selected { border-color: var(--blue); box-shadow: inset 0 0 0 1px var(--blue); }
  .service-art { position: absolute; top: 0; right: 0; width: 82px; height: 65px; border-bottom-left-radius: 48px; background:
    linear-gradient(135deg, #DCEAF3, #B8D0DF); opacity: .9; }
  .service-art::after { content: ''; position: absolute; top: 17px; right: 19px; width: 26px; height: 26px; border: 2px solid rgba(18,32,51,.38); border-radius: 50% 50% 45% 55%; }
  .service-card small { display: block; margin-bottom: 42px; color: var(--blue); font-size: 10px; font-weight: 700; letter-spacing: .08em; }
  .service-card.selected small { visibility: hidden; }
  .service-card strong { display: block; font-size: 14px; }
  .service-card span { display: block; margin-top: 7px; color: var(--muted); font-size: 12px; }
  .selected-check { position: absolute; top: 12px; left: 14px; display: none; width: 20px; height: 20px; place-items: center; border-radius: 50%; background: var(--blue); color: white; font-size: 12px; }
  .service-card.selected .selected-check { display: grid; }
  .availability { display: flex; align-items: center; gap: 10px; margin-top: 20px; }
  .availability > strong { margin-right: 8px; font-size: 12px; }
  .time-chip { display: inline-flex; height: 34px; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 8px; padding: 0 11px; background: #FFFFFF; color: #314056; font-size: 11px; font-weight: 600; }
  .time-chip.active { border-color: var(--blue); background: var(--blue-soft); color: var(--blue); }
  .live-summary { border-left: 1px solid var(--line); padding: 48px 36px; background: #F7F9FB; }
  .summary-card { border: 1px solid var(--line); border-radius: 15px; background: #FFFFFF; padding: 25px; box-shadow: 0 10px 28px rgba(16,35,55,.08); }
  .summary-card h2 { margin: 7px 0 24px; font-size: 18px; }
  .summary-row { display: grid; grid-template-columns: 86px 1fr; gap: 12px; padding: 13px 0; border-top: 1px solid var(--soft-line); }
  .summary-row span { color: var(--muted); font-size: 11px; }
  .summary-row strong { font-size: 12px; text-align: right; }
  .summary-total { display: flex; align-items: center; justify-content: space-between; margin-top: 3px; padding: 18px 0; border-top: 1px solid var(--line); font-size: 13px; }
  .summary-total strong { font-size: 19px; }
  .summary-card .action { width: 100%; }
  .summary-foot { margin: 14px 0 0; color: var(--muted); font-size: 10px; line-height: 1.45; text-align: center; }

  .admin { display: grid; height: calc(100% - 54px); grid-template-columns: 218px minmax(0, 1fr); }
  .admin-sidebar { display: flex; flex-direction: column; background: var(--navy); color: #FFFFFF; padding: 24px 16px; }
  .admin-brand { display: flex; align-items: center; gap: 11px; padding: 0 10px 24px; border-bottom: 1px solid rgba(255,255,255,.10); }
  .admin-brand .brand-mark { background: #FFFFFF; color: var(--navy); }
  .admin-brand strong { display: block; font-size: 12px; letter-spacing: .1em; }
  .admin-brand span { display: block; margin-top: 3px; color: #9FB0C0; font-size: 10px; }
  .admin-nav { display: grid; gap: 6px; margin-top: 24px; }
  .admin-nav div { display: flex; height: 42px; align-items: center; gap: 11px; border-radius: 8px; padding: 0 12px; color: #BCC9D4; font-size: 12px; }
  .admin-nav div.active { background: rgba(255,255,255,.10); color: #FFFFFF; }
  .nav-icon { width: 17px; height: 17px; border: 1px solid currentColor; border-radius: 4px; opacity: .85; }
  .admin-sidebar .demo-pill { margin: auto 2px 0; border-color: rgba(255,255,255,.18); background: rgba(255,255,255,.08); color: #DCE5EC; white-space: normal; line-height: 1.35; }
  .admin-main { min-width: 0; overflow: hidden; background: #F5F7F9; }
  .admin-top { display: flex; height: 98px; align-items: center; gap: 12px; padding: 0 30px; border-bottom: 1px solid var(--line); background: #FFFFFF; }
  .admin-title { margin-right: auto; }
  .admin-title h1 { margin: 0; font-size: 24px; letter-spacing: -.02em; }
  .admin-title p { margin: 6px 0 0; color: var(--muted); font-size: 11px; }
  .filter { display: flex; height: 38px; align-items: center; justify-content: space-between; gap: 16px; border: 1px solid #CAD4DE; border-radius: 8px; padding: 0 12px; background: #FFFFFF; color: #47576A; font-size: 11px; }

  .schedule-area { height: calc(100% - 98px); padding: 18px 24px 22px; }
  .schedule-toolbar { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
  .schedule-toolbar strong { margin-right: auto; font-size: 13px; }
  .legend { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 10px; }
  .legend i { width: 8px; height: 8px; border-radius: 2px; background: var(--blue); }
  .legend i.open { border: 1px dashed #91A4B5; background: transparent; }
  .calendar { height: calc(100% - 46px); overflow: hidden; border: 1px solid var(--line); border-radius: 12px; background: #FFFFFF; }
  .calendar-head { display: grid; height: 55px; grid-template-columns: 62px repeat(5, minmax(0,1fr)); border-bottom: 1px solid var(--line); background: #F9FAFB; }
  .calendar-head div { display: flex; align-items: center; justify-content: center; border-left: 1px solid var(--soft-line); color: #405065; font-size: 11px; font-weight: 600; }
  .calendar-head div:first-child { border-left: 0; }
  .calendar-grid { position: relative; display: grid; height: calc(100% - 55px); grid-template-columns: 62px repeat(5, minmax(0,1fr)); }
  .time-axis { display: grid; grid-template-rows: repeat(7, 1fr); background: #FAFBFC; }
  .time-axis span { padding-top: 9px; color: #788699; font-size: 10px; text-align: center; }
  .day-column { position: relative; border-left: 1px solid var(--soft-line); background: repeating-linear-gradient(to bottom, transparent 0, transparent calc(14.285% - 1px), #EDF1F4 calc(14.285% - 1px), #EDF1F4 14.285%); }
  .appointment { position: absolute; left: 8px; right: 8px; min-height: 59px; overflow: hidden; border-left: 3px solid var(--blue); border-radius: 7px; background: var(--blue-soft); padding: 8px 9px; }
  .appointment.pending { border-left-color: #718295; background: #EEF2F5; }
  .appointment strong { display: block; color: #183B56; font-size: 10px; }
  .appointment span { display: block; margin-top: 3px; overflow: hidden; color: #536274; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
  .open-slot { position: absolute; left: 9px; right: 9px; display: flex; min-height: 45px; align-items: center; justify-content: center; border: 1px dashed #A8B6C3; border-radius: 7px; color: #788699; font-size: 9px; }

  .client-area { display: grid; height: calc(100% - 98px); grid-template-columns: minmax(0,1.45fr) minmax(320px,.75fr); gap: 18px; padding: 20px 24px 24px; }
  .client-column { display: grid; min-width: 0; align-content: start; gap: 16px; }
  .panel { overflow: hidden; border: 1px solid var(--line); border-radius: 12px; background: #FFFFFF; }
  .panel-head { display: flex; align-items: center; gap: 12px; padding: 18px 20px; border-bottom: 1px solid var(--soft-line); }
  .panel-head h2 { margin: 0; font-size: 14px; }
  .panel-head > span { margin-left: auto; color: var(--muted); font-size: 10px; }
  .profile-head { display: flex; align-items: center; gap: 15px; padding: 20px; }
  .avatar { display: grid; width: 52px; height: 52px; place-items: center; border-radius: 50%; background: #DCEAF3; color: #234C69; font-size: 17px; font-weight: 700; }
  .profile-head h2 { margin: 0; font-size: 18px; }
  .profile-head p { margin: 4px 0 0; color: var(--muted); font-size: 10px; }
  .profile-head .secondary-action { margin-left: auto; }
  .contact-grid { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid var(--soft-line); }
  .contact-grid div { padding: 14px 20px; border-right: 1px solid var(--soft-line); }
  .contact-grid div:last-child { border-right: 0; }
  .contact-grid span { display: block; color: var(--muted); font-size: 9px; text-transform: uppercase; letter-spacing: .08em; }
  .contact-grid strong { display: block; margin-top: 5px; font-size: 11px; }
  .booking-highlight { display: grid; grid-template-columns: 1fr auto; gap: 16px; padding: 20px; }
  .booking-highlight small { color: var(--blue); font-size: 9px; font-weight: 700; letter-spacing: .12em; }
  .booking-highlight h3 { margin: 8px 0 5px; font-size: 15px; }
  .booking-highlight p { margin: 0; color: var(--muted); font-size: 11px; }
  .table { width: 100%; border-collapse: collapse; }
  .table th, .table td { height: 43px; padding: 0 16px; border-bottom: 1px solid var(--soft-line); font-size: 10px; text-align: left; }
  .table th { color: var(--muted); font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
  .table tr:last-child td { border-bottom: 0; }
  .reminder-intro { margin: 0; padding: 14px 18px 0; color: var(--muted); font-size: 10px; line-height: 1.5; }
  .reminder-list { display: grid; gap: 10px; padding: 14px 18px 18px; }
  .reminder-row { display: grid; grid-template-columns: 34px 1fr; gap: 10px; border: 1px solid var(--soft-line); border-radius: 9px; padding: 11px; background: #FAFBFC; }
  .mail-icon { display: grid; width: 34px; height: 34px; place-items: center; border-radius: 8px; background: var(--blue-soft); color: var(--blue); font-size: 14px; }
  .reminder-row strong { display: block; font-size: 11px; }
  .reminder-row span { display: block; margin-top: 4px; color: var(--green); font-size: 9px; }
  .reminder-list .action { width: 100%; margin-top: 2px; }
  .preferences { padding: 16px 18px; color: #536274; font-size: 10px; line-height: 1.55; }

  .mobile-capture { display: grid; height: 100%; place-items: center; padding: 28px; background:
    radial-gradient(circle at 12% 12%, rgba(36,107,158,.18), transparent 34%),
    linear-gradient(145deg, #0B1929, #142D42); }
  .mobile-stage { display: grid; width: min(810px, 100%); height: 100%; grid-template-columns: 460px minmax(0,1fr); align-items: center; gap: 34px; }
  .phone { width: 430px; height: 950px; overflow: hidden; border: 10px solid #07111D; border-radius: 44px; background: #FFFFFF; box-shadow: 0 30px 80px rgba(0,0,0,.34); }
  .phone-status { display: flex; height: 37px; align-items: center; justify-content: space-between; padding: 0 25px; background: #FFFFFF; color: #0C1A29; font-size: 11px; font-weight: 600; }
  .phone-app { height: calc(100% - 37px); background: #F7F9FB; }
  .phone-head { display: flex; min-height: 72px; align-items: center; gap: 12px; border-bottom: 1px solid var(--line); padding: 0 20px; background: #FFFFFF; }
  .phone-back { display: grid; width: 34px; height: 34px; place-items: center; border: 1px solid var(--line); border-radius: 9px; color: #405065; font-size: 17px; }
  .phone-head strong { font-size: 15px; }
  .phone-brand { display: grid; width: 30px; height: 30px; place-items: center; margin-left: auto; border-radius: 9px; background: var(--navy); color: #FFFFFF; font-size: 9px; font-weight: 700; }
  .phone-body { padding: 20px; }
  .phone-step { display: flex; align-items: center; justify-content: space-between; color: var(--blue); font-size: 9px; font-weight: 700; letter-spacing: .1em; }
  .step-track { width: 120px; height: 4px; overflow: hidden; border-radius: 999px; background: #DDE5EB; }
  .step-track span { display: block; width: 66%; height: 100%; background: var(--blue); }
  .phone-body h1 { margin: 18px 0 5px; font-size: 25px; letter-spacing: -.025em; }
  .phone-body > p { margin: 0 0 16px; color: var(--muted); font-size: 12px; }
  .mobile-service { display: flex; align-items: center; gap: 12px; border: 1px solid var(--line); border-radius: 11px; padding: 12px; background: #FFFFFF; }
  .mobile-service-icon { display: grid; width: 42px; height: 42px; place-items: center; border-radius: 9px; background: #DCEAF3; color: #234C69; font-size: 17px; }
  .mobile-service strong { display: block; font-size: 12px; }
  .mobile-service span { display: block; margin-top: 4px; color: var(--muted); font-size: 10px; }
  .day-strip { display: grid; grid-template-columns: repeat(5,1fr); gap: 6px; margin: 18px 0; }
  .day { display: grid; min-height: 60px; place-items: center; border: 1px solid var(--line); border-radius: 9px; background: #FFFFFF; color: #657285; font-size: 9px; }
  .day strong { display: block; color: var(--ink); font-size: 13px; }
  .day.active { border-color: var(--blue); background: var(--blue-soft); color: var(--blue); }
  .slot-group { margin-top: 18px; }
  .slot-group > strong { display: block; margin-bottom: 9px; font-size: 11px; }
  .slot-grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; }
  .slot { display: grid; height: 42px; place-items: center; border: 1px solid var(--line); border-radius: 8px; background: #FFFFFF; color: #405065; font-size: 11px; font-weight: 600; }
  .slot.active { border-color: var(--blue); background: var(--blue-soft); color: var(--blue); }
  .phone-footer { margin-top: 22px; }
  .phone-footer .action { width: 100%; min-height: 48px; }
  .phone-footer p { margin: 9px 0 0; color: var(--muted); font-size: 9px; text-align: center; }
  .mobile-context { color: #FFFFFF; }
  .mobile-context .demo-pill { border-color: rgba(255,255,255,.22); background: rgba(255,255,255,.08); color: #E6EEF4; white-space: normal; line-height: 1.35; }
  .mobile-context h2 { margin: 24px 0 10px; font-size: 28px; line-height: 1.12; letter-spacing: -.025em; }
  .mobile-context > p { margin: 0; color: #B7C6D2; font-size: 12px; line-height: 1.6; }
  .mobile-confirm { margin-top: 24px; border: 1px solid rgba(255,255,255,.14); border-radius: 13px; padding: 17px; background: rgba(255,255,255,.08); }
  .mobile-confirm strong { display: block; font-size: 12px; }
  .mobile-confirm p { margin: 8px 0 0; color: #C8D4DE; font-size: 10px; line-height: 1.5; }
  .mobile-confirm .status { margin-top: 14px; background: rgba(232,245,239,.12); color: #8DD6B8; }

  .og-canvas { position: relative; display: grid; width: 100%; height: 100%; grid-template-columns: 48% 52%; overflow: hidden; background:
    radial-gradient(circle at 14% 5%, rgba(36,107,158,.18), transparent 34%),
    linear-gradient(135deg, #071421 0%, #102A40 100%); color: #FFFFFF; }
  .og-grid { position: absolute; inset: 0; opacity: .12; background-image:
    linear-gradient(rgba(255,255,255,.18) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px); background-size: 40px 40px; mask-image: linear-gradient(90deg, #000, transparent 68%); }
  .og-copy { position: relative; z-index: 2; display: flex; flex-direction: column; justify-content: center; padding: 54px 22px 54px 64px; }
  .og-brand { display: flex; align-items: center; gap: 12px; margin-bottom: 46px; }
  .og-brand-mark { display: grid; width: 42px; height: 42px; place-items: center; border: 1px solid rgba(255,255,255,.28); border-radius: 12px; background: rgba(255,255,255,.10); color: #FFFFFF; font-size: 17px; font-weight: 700; }
  .og-brand strong { font-size: 20px; letter-spacing: -.01em; }
  .og-kicker { color: #86B9DA; font-size: 12px; font-weight: 700; letter-spacing: .15em; }
  .og-copy h1 { max-width: 510px; margin: 15px 0 18px; font-size: 43px; line-height: 1.08; letter-spacing: -.035em; }
  .og-copy > p { max-width: 475px; margin: 0; color: #C1CFD9; font-size: 16px; line-height: 1.5; }
  .og-copy .demo-pill { align-self: flex-start; margin-top: 30px; border-color: rgba(255,255,255,.23); background: rgba(255,255,255,.09); color: #E8EFF4; }
  .og-shot-wrap { position: relative; z-index: 2; display: flex; align-items: center; overflow: hidden; padding: 55px 0 55px 8px; }
  .og-shot { width: 860px; height: 520px; flex: none; overflow: hidden; border: 1px solid rgba(255,255,255,.25); border-radius: 18px 0 0 18px; background: #FFFFFF; box-shadow: 0 32px 90px rgba(0,0,0,.40); }
  .og-shot img { display: block; width: 832px; height: 520px; object-fit: cover; object-position: 66% center; }
`;

const INTERACTION_SCRIPT = String.raw`
  (() => {
    const all = (selector) => Array.from(document.querySelectorAll(selector));

    const serviceCards = all('[data-testid="service-card"]');
    const summaryService = document.querySelector('[data-testid="summary-service"]');
    const summaryTotal = document.querySelector('[data-testid="summary-total"]');

    serviceCards.forEach((card) => {
      card.addEventListener('click', () => {
        serviceCards.forEach((candidate) => {
          candidate.classList.remove('selected');
          candidate.setAttribute('aria-pressed', 'false');
        });
        card.classList.add('selected');
        card.setAttribute('aria-pressed', 'true');

        if (summaryService) summaryService.textContent = card.dataset.service || '';
        if (summaryTotal) summaryTotal.textContent = card.dataset.total || '';
      });
    });

    const bookingTimes = all('[data-testid="booking-time"]');
    const summaryTime = document.querySelector('[data-testid="summary-time"]');

    bookingTimes.forEach((time) => {
      time.addEventListener('click', () => {
        bookingTimes.forEach((candidate) => {
          candidate.classList.remove('active');
          candidate.setAttribute('aria-pressed', 'false');
        });
        time.classList.add('active');
        time.setAttribute('aria-pressed', 'true');

        if (summaryTime) summaryTime.textContent = time.dataset.time || '';
      });
    });

    const bookingConfirm = document.querySelector('[data-testid="booking-confirm"]');

    if (bookingConfirm) {
      bookingConfirm.addEventListener('click', () => {
        bookingConfirm.dataset.state = 'confirmed';
        bookingConfirm.textContent = bookingConfirm.dataset.confirmedLabel || '';
      });
    }

    const mobileSlots = all('[data-testid="mobile-slot"]');
    const mobileSummaryTime = document.querySelector('[data-testid="mobile-summary-time"]');

    mobileSlots.forEach((slot) => {
      slot.addEventListener('click', () => {
        mobileSlots.forEach((candidate) => {
          candidate.classList.remove('active');
          candidate.setAttribute('aria-pressed', 'false');
        });
        slot.classList.add('active');
        slot.setAttribute('aria-pressed', 'true');

        if (mobileSummaryTime) mobileSummaryTime.textContent = slot.dataset.time || '';
      });
    });

    const mobileConfirm = document.querySelector('[data-testid="mobile-confirm"]');

    if (mobileConfirm) {
      mobileConfirm.addEventListener('click', () => {
        mobileConfirm.dataset.state = 'confirmed';
        mobileConfirm.textContent = mobileConfirm.dataset.confirmedLabel || '';
      });
    }

    const scheduleFilter = document.querySelector('[data-testid="schedule-team-filter"]');

    if (scheduleFilter) {
      scheduleFilter.addEventListener('click', () => {
        const active = scheduleFilter.dataset.state !== 'sofia';
        scheduleFilter.dataset.state = active ? 'sofia' : 'all';
        scheduleFilter.textContent = active
          ? (scheduleFilter.dataset.activeLabel || '') + '⌄'
          : (scheduleFilter.dataset.defaultLabel || '') + '⌄';

        all('[data-testid="schedule-appointment"]').forEach((appointment) => {
          appointment.hidden = active && appointment.dataset.team !== 'Sofia';
        });
      });
    }

    const reminderButton = document.querySelector('[data-testid="send-test-reminder"]');

    if (reminderButton) {
      reminderButton.addEventListener('click', () => {
        reminderButton.dataset.state = 'sent';
        reminderButton.textContent = reminderButton.dataset.sentLabel || '';
      });
    }
  })();
`;

function browserChrome(url: string) {
  return `
    <div class="browser-bar">
      <div class="browser-dots"><i class="browser-dot"></i><i class="browser-dot"></i><i class="browser-dot"></i></div>
      <div class="browser-url"><i class="secure-dot"></i>${url}</div>
      <div class="browser-tools"><i class="browser-tool"></i><i class="browser-tool"></i></div>
    </div>`;
}

function demoPill(text: string) {
  return `<span class="demo-pill">${text}</span>`;
}

function liveBooking(locale: Locale) {
  const copy = COPY[locale];
  const live = copy.live;

  const services = [
    { label: live.serviceOne, meta: live.serviceOneMeta, total: live.total },
    { label: live.serviceTwo, meta: live.serviceTwoMeta, total: locale === 'fr' ? 'Gratuit' : 'Free' },
    { label: live.serviceThree, meta: live.serviceThreeMeta, total: locale === 'fr' ? '62 €' : '€62' },
  ] as const;

  return `
    <div class="browser">
      ${browserChrome('atelier17.example.test/book')}
      <header class="salon-header">
        <span class="brand-mark">A17</span>
        <span class="brand-copy"><strong>${copy.salon}</strong><span>${copy.salonType}</span></span>
        <nav class="salon-nav">${copy.nav.map((item) => `<span>${item}</span>`).join('')}</nav>
        ${demoPill(copy.demo)}
        <button class="action">${locale === 'fr' ? 'Réserver' : 'Book now'}</button>
      </header>
      <main class="live-main">
        <section class="live-content">
          <span class="eyebrow">${live.eyebrow}</span>
          <h1>${live.title}</h1>
          <p>${live.intro}</p>
          <h2 class="service-title">${live.section}</h2>
          <div class="service-grid">
            ${services.map((service, index) => `<button type="button" class="service-card ${index === 0 ? 'selected' : ''}" data-testid="service-card" data-service="${service.label}" data-total="${service.total}" aria-pressed="${index === 0 ? 'true' : 'false'}"><i class="selected-check">✓</i><i class="service-art"></i><small>0${index + 1}</small><strong>${service.label}</strong><span>${service.meta}</span></button>`).join('')}
          </div>
          <div class="availability"><strong>${live.availability}</strong>${live.slots.map((slot, index) => `<button type="button" class="time-chip ${index === 1 ? 'active' : ''}" data-testid="booking-time" data-time="${slot}" aria-pressed="${index === 1 ? 'true' : 'false'}">${slot}</button>`).join('')}<span class="status status--ok">${live.available}</span></div>
        </section>
        <aside class="live-summary">
          <div class="summary-card">
            <span class="eyebrow">${live.selected}</span>
            <h2 data-testid="summary-service">${live.serviceOne}</h2>
            <div class="summary-row"><span>${live.stylistLabel}</span><strong>${live.stylist}</strong></div>
            <div class="summary-row"><span>${live.dateLabel}</span><strong>${live.date}</strong></div>
            <div class="summary-row"><span>${live.timeLabel}</span><strong data-testid="summary-time">${live.time}</strong></div>
            <div class="summary-total"><span>${live.totalLabel}</span><strong data-testid="summary-total">${live.total}</strong></div>
            <button type="button" class="action" data-testid="booking-confirm" data-confirmed-label="${locale === 'fr' ? 'Réservation confirmée' : 'Booking confirmed'}">${live.cta}</button>
            <p class="summary-foot">${locale === 'fr' ? 'Vous pourrez modifier ou annuler depuis votre compte.' : 'You can reschedule or cancel from your account.'}</p>
          </div>
        </aside>
      </main>
    </div>`;
}

function mobileBooking(locale: Locale) {
  const copy = COPY[locale];
  const mobile = copy.mobile;

  const dayLabels =
    locale === 'fr'
      ? [
          ['Lun.', '17'],
          ['Mar.', '18'],
          ['Mer.', '19'],
          ['Jeu.', '20'],
          ['Ven.', '21'],
        ]
      : [
          ['Mon', '17'],
          ['Tue', '18'],
          ['Wed', '19'],
          ['Thu', '20'],
          ['Fri', '21'],
        ];

  return `
    <div class="mobile-capture">
      <div class="mobile-stage">
        <div class="phone">
          <div class="phone-status"><span>9:41</span><span>● ● ▰</span></div>
          <div class="phone-app">
            <header class="phone-head"><span class="phone-back">‹</span><strong>${mobile.title}</strong><span class="phone-brand">A17</span></header>
            <main class="phone-body">
              <div class="phone-step"><span>${mobile.step}</span><span class="step-track"><span></span></span></div>
              <h1>${mobile.section}</h1><p>${mobile.date}</p>
              <article class="mobile-service"><span class="mobile-service-icon">✦</span><span><strong>${mobile.service}</strong><span>${mobile.duration}</span></span></article>
              <div class="day-strip">${dayLabels.map(([day, date], index) => `<span class="day ${index === 1 ? 'active' : ''}">${day}<strong>${date}</strong></span>`).join('')}</div>
              <section class="slot-group"><strong>${mobile.morning}</strong><div class="slot-grid"><button type="button" class="slot" data-testid="mobile-slot" data-time="09:30" aria-pressed="false">09:30</button><button type="button" class="slot active" data-testid="mobile-slot" data-time="10:15" aria-pressed="true">10:15</button><button type="button" class="slot" data-testid="mobile-slot" data-time="11:00" aria-pressed="false">11:00</button></div></section>
              <section class="slot-group"><strong>${mobile.afternoon}</strong><div class="slot-grid"><button type="button" class="slot" data-testid="mobile-slot" data-time="14:30" aria-pressed="false">14:30</button><button type="button" class="slot" data-testid="mobile-slot" data-time="15:15" aria-pressed="false">15:15</button><button type="button" class="slot" data-testid="mobile-slot" data-time="16:00" aria-pressed="false">16:00</button></div></section>
              <footer class="phone-footer"><button type="button" class="action" data-testid="mobile-confirm" data-confirmed-label="${locale === 'fr' ? 'Rendez-vous confirmé' : 'Appointment confirmed'}">${mobile.cta}</button><p>${mobile.note}</p></footer>
            </main>
          </div>
        </div>
        <aside class="mobile-context">
          ${demoPill(copy.demo)}
          <h2>${mobile.confirmation}</h2>
          <p>${mobile.confirmationText}</p>
          <div class="mobile-confirm"><strong>${mobile.service}</strong><p>${mobile.date}<br>${mobile.duration} · <span data-testid="mobile-summary-time">10:15</span></p><span class="status status--ok">${locale === 'fr' ? 'Créneau disponible' : 'Time available'}</span></div>
        </aside>
      </div>
    </div>`;
}

function adminSidebar(locale: Locale, activeIndex: number, product: string, items: readonly string[]) {
  const copy = COPY[locale];

  return `<aside class="admin-sidebar"><div class="admin-brand"><span class="brand-mark">A17</span><span><strong>${copy.salon}</strong><span>${product}</span></span></div><nav class="admin-nav">${items.map((item, index) => `<div class="${index === activeIndex ? 'active' : ''}"><i class="nav-icon"></i><span>${item}</span></div>`).join('')}</nav>${demoPill(copy.demo)}</aside>`;
}

function teamSchedule(locale: Locale) {
  const copy = COPY[locale];
  const schedule = copy.schedule;

  const placements = [
    { column: 0, top: 7, pending: false },
    { column: 1, top: 21, pending: false },
    { column: 2, top: 36, pending: true },
    { column: 3, top: 10, pending: false },
    { column: 3, top: 52, pending: false },
    { column: 4, top: 67, pending: false },
  ];

  const appointmentTeams = ['Sofia', 'Sofia', 'Noa', 'Maya', 'Noa', 'Sofia'] as const;

  const columns = schedule.days.map((_, column) => {
    const cards = placements.flatMap((placement, index) => {
      if (placement.column !== column) {
        return [];
      }

      const [time, client, service] = schedule.appointments[index];

      return [
        `<article class="appointment ${placement.pending ? 'pending' : ''}" style="top:${placement.top}%;" data-testid="schedule-appointment" data-team="${appointmentTeams[index]}"><strong>${time} · ${client}</strong><span>${service}</span></article>`,
      ];
    });

    if (column === 0 || column === 2 || column === 4) {
      cards.push(`<span class="open-slot" style="top:${column === 2 ? 68 : 48}%;">${schedule.open}</span>`);
    }

    return `<div class="day-column">${cards.join('')}</div>`;
  });

  return `
    <div class="browser">
      ${browserChrome('atelier17.example.test/admin/schedule')}
      <div class="admin">
        ${adminSidebar(locale, 0, schedule.product, schedule.sidebar)}
        <main class="admin-main">
          <header class="admin-top"><div class="admin-title"><h1>${schedule.page}</h1><p>${schedule.subtitle}</p></div><button type="button" class="filter" data-testid="schedule-team-filter" data-state="all" data-default-label="${schedule.filters[0]}" data-active-label="Sofia">${schedule.filters[0]}⌄</button><button type="button" class="filter">${schedule.filters[1]}⌄</button><button type="button" class="action">${schedule.create}</button></header>
          <section class="schedule-area">
            <div class="schedule-toolbar"><strong>${schedule.week}</strong><span class="legend"><i></i>${schedule.confirmed}</span><span class="legend"><i class="open"></i>${schedule.open}</span><button class="secondary-action">${schedule.today}</button></div>
            <div class="calendar"><div class="calendar-head"><div></div>${schedule.days.map((day) => `<div>${day}</div>`).join('')}</div><div class="calendar-grid"><div class="time-axis">${['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'].map((time) => `<span>${time}</span>`).join('')}</div>${columns.join('')}</div></div>
          </section>
        </main>
      </div>
    </div>`;
}

function clientReminders(locale: Locale) {
  const copy = COPY[locale];
  const client = copy.client;

  return `
    <div class="browser">
      ${browserChrome('atelier17.example.test/admin/clients/demo-0042')}
      <div class="admin">
        ${adminSidebar(locale, 1, client.product, client.sidebar)}
        <main class="admin-main">
          <header class="admin-top"><div class="admin-title"><h1>${client.page}</h1><p>← ${client.back}</p></div><span class="status status--neutral">${copy.demo}</span></header>
          <section class="client-area">
            <div class="client-column">
              <article class="panel"><div class="profile-head"><span class="avatar">AM</span><span><h2>${client.name}</h2><p>${client.since}</p></span><button class="secondary-action">${locale === 'fr' ? 'Modifier la fiche' : 'Edit record'}</button></div><div class="contact-grid"><div><span>Email</span><strong>${client.email}</strong></div><div><span>${locale === 'fr' ? 'Téléphone' : 'Phone'}</span><strong>${client.phone}</strong></div></div></article>
              <article class="panel"><div class="booking-highlight"><div><small>${client.next}</small><h3>${client.nextDate}</h3><p>${client.nextService}</p></div><button class="secondary-action">${client.edit}</button></div></article>
              <article class="panel"><div class="panel-head"><h2>${client.history}</h2><span>${locale === 'fr' ? 'Données de démonstration' : 'Demo records'}</span></div><table class="table"><thead><tr>${client.headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody>${client.rows.map((row) => `<tr>${row.map((cell, index) => `<td>${index === 3 ? `<span class="status status--ok">${cell}</span>` : cell}</td>`).join('')}</tr>`).join('')}</tbody></table></article>
            </div>
            <aside class="client-column">
              <article class="panel"><div class="panel-head"><h2>${client.reminders}</h2><span class="status status--ok">${locale === 'fr' ? 'Activés' : 'Enabled'}</span></div><p class="reminder-intro">${client.remindersIntro}</p><div class="reminder-list"><div class="reminder-row"><span class="mail-icon">✉</span><span><strong>${client.firstReminder}</strong><span>${client.firstTime}</span></span></div><div class="reminder-row"><span class="mail-icon">✉</span><span><strong>${client.secondReminder}</strong><span>${client.secondTime}</span></span></div><button type="button" class="action" data-testid="send-test-reminder" data-sent-label="${locale === 'fr' ? 'Rappel test envoyé' : 'Test reminder sent'}">${client.send}</button></div></article>
              <article class="panel"><div class="panel-head"><h2>${client.profile}</h2></div><p class="preferences">${client.preferences}</p></article>
            </aside>
          </section>
        </main>
      </div>
    </div>`;
}

function ogVisual(locale: Locale, screenshotData: string) {
  const copy = COPY[locale];

  const title =
    locale === 'fr'
      ? 'Décrivez le fonctionnement. Obtenez l’app de réservation.'
      : 'Describe the workflow. Get the booking app.';
  const body =
    locale === 'fr'
      ? 'Un prompt devient une interface de réservation concrète, avec agenda, comptes clients et rappels.'
      : 'One prompt becomes a concrete booking interface with a calendar, client accounts and reminders.';

  const kicker = locale === 'fr' ? 'CRÉATEUR D’APPLICATIONS' : 'APP BUILDER';

  return `<main class="og-canvas"><div class="og-grid"></div><section class="og-copy"><div class="og-brand"><span class="og-brand-mark">E</span><strong>E-Code</strong></div><span class="og-kicker">${kicker}</span><h1>${title}</h1><p>${body}</p>${demoPill(copy.demo)}</section><section class="og-shot-wrap"><div class="og-shot"><img src="data:image/png;base64,${screenshotData}" alt=""></div></section></main>`;
}

const VISUALS: readonly {
  name: VisualName;
  width: number;
  height: number;
  render: (locale: Locale) => string;
}[] = [
  { name: 'live-booking-app', width: 1440, height: 900, render: liveBooking },
  { name: 'mobile-booking', width: 900, height: 1050, render: mobileBooking },
  { name: 'team-schedule', width: 1440, height: 900, render: teamSchedule },
  { name: 'client-reminders', width: 1440, height: 900, render: clientReminders },
];

function htmlDocument(locale: Locale, content: string, fontData: string) {
  return `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="color-scheme" content="light"><style>@font-face{font-family:'IBM Plex Sans';font-style:normal;font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${fontData}) format('woff2');}${BASE_CSS}</style></head><body>${content}<script>${INTERACTION_SCRIPT}</script></body></html>`;
}

async function loadPinnedFont() {
  const response = await fetch(IBM_PLEX_SANS_URL);

  if (!response.ok) {
    throw new Error(`Unable to load pinned IBM Plex Sans: ${response.status}`);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');

  if (digest !== IBM_PLEX_SANS_SHA256) {
    throw new Error(`IBM Plex Sans checksum changed: ${digest}`);
  }

  return bytes.toString('base64');
}

async function assertReady(page: Page, width: number, height: number) {
  await page.evaluate(async () => {
    const browserDocument = (
      globalThis as unknown as {
        document: { fonts: { ready: Promise<unknown> } };
      }
    ).document;

    await browserDocument.fonts.ready;
  });

  const result = await page.evaluate(() => {
    const browserDocument = (
      globalThis as unknown as {
        document: {
          documentElement: { scrollHeight: number; scrollWidth: number };
          fonts: { check(value: string): boolean };
        };
      }
    ).document;

    return {
      fontReady: browserDocument.fonts.check('16px "IBM Plex Sans"'),
      height: browserDocument.documentElement.scrollHeight,
      width: browserDocument.documentElement.scrollWidth,
    };
  });

  if (!result.fontReady) {
    throw new Error('IBM Plex Sans did not load');
  }

  if (result.width !== width || result.height !== height) {
    throw new Error(`Unexpected document geometry ${result.width}×${result.height}; expected ${width}×${height}`);
  }
}

async function assertPngDimensions(path: string, width: number, height: number) {
  const png = await readFile(path);
  const signature = png.subarray(0, 8).toString('hex');

  if (signature !== '89504e470d0a1a0a') {
    throw new Error(`${path} is not a PNG file`);
  }

  const actualWidth = png.readUInt32BE(16);
  const actualHeight = png.readUInt32BE(20);

  if (actualWidth !== width || actualHeight !== height) {
    throw new Error(`${path} is ${actualWidth}×${actualHeight}; expected ${width}×${height}`);
  }
}

async function assertText(locator: Locator, expected: string, label: string) {
  const actual = (await locator.textContent())?.trim();

  if (actual !== expected) {
    throw new Error(`${label}: expected "${expected}", received "${actual ?? ''}"`);
  }
}

async function assertAttribute(locator: Locator, name: string, expected: string, label: string) {
  const actual = await locator.getAttribute(name);

  if (actual !== expected) {
    throw new Error(`${label}: expected ${name}="${expected}", received "${actual ?? ''}"`);
  }
}

async function exerciseVisual(page: Page, visual: VisualName, locale: Locale) {
  if (visual === 'live-booking-app') {
    const serviceCards = page.getByTestId('service-card');

    if ((await serviceCards.count()) !== 3) {
      throw new Error('Live booking fixture must expose three selectable services');
    }

    await serviceCards.nth(1).click();
    await assertAttribute(serviceCards.nth(1), 'aria-pressed', 'true', 'Selected service state');
    await assertText(page.getByTestId('summary-service'), COPY[locale].live.serviceTwo, 'Selected service summary');

    const nextTime = page.getByTestId('booking-time').filter({ hasText: '14:30' });
    await nextTime.click();
    await assertAttribute(nextTime, 'aria-pressed', 'true', 'Selected booking time state');
    await assertText(page.getByTestId('summary-time'), '14:30', 'Selected booking time summary');

    const confirm = page.getByTestId('booking-confirm');
    await confirm.click();
    await assertAttribute(confirm, 'data-state', 'confirmed', 'Booking confirmation state');
    await assertText(confirm, locale === 'fr' ? 'Réservation confirmée' : 'Booking confirmed', 'Booking confirmation');

    return;
  }

  if (visual === 'mobile-booking') {
    const nextTime = page.getByTestId('mobile-slot').filter({ hasText: '14:30' });
    await nextTime.click();
    await assertAttribute(nextTime, 'aria-pressed', 'true', 'Selected mobile booking time state');
    await assertText(page.getByTestId('mobile-summary-time'), '14:30', 'Mobile appointment summary time');

    const confirm = page.getByTestId('mobile-confirm');
    await confirm.click();
    await assertAttribute(confirm, 'data-state', 'confirmed', 'Mobile booking confirmation state');
    await assertText(
      confirm,
      locale === 'fr' ? 'Rendez-vous confirmé' : 'Appointment confirmed',
      'Mobile booking confirmation',
    );

    return;
  }

  if (visual === 'team-schedule') {
    const appointments = page.getByTestId('schedule-appointment');

    if ((await appointments.count()) !== 6) {
      throw new Error('Team schedule fixture must expose six appointments before filtering');
    }

    const filter = page.getByTestId('schedule-team-filter');
    await filter.click();
    await assertAttribute(filter, 'data-state', 'sofia', 'Team schedule filter state');

    const visibility = await appointments.evaluateAll((elements) => ({
      hidden: elements.filter((element) => element.hasAttribute('hidden')).length,
      visible: elements.filter((element) => !element.hasAttribute('hidden')).length,
    }));

    if (visibility.hidden !== 3 || visibility.visible !== 3) {
      throw new Error(`Team schedule filter returned ${visibility.visible} visible and ${visibility.hidden} hidden`);
    }

    return;
  }

  const reminder = page.getByTestId('send-test-reminder');
  await reminder.click();
  await assertAttribute(reminder, 'data-state', 'sent', 'Test reminder state');
  await assertText(reminder, locale === 'fr' ? 'Rappel test envoyé' : 'Test reminder sent', 'Test reminder result');
}

async function main() {
  const fontData = await loadPinnedFont();
  const browser = await chromium.launch({ headless: true });

  try {
    for (const locale of ['en', 'fr'] as const) {
      const outputDirectory = resolve(OUTPUT_ROOT, locale);
      await mkdir(outputDirectory, { recursive: true });

      for (const visual of VISUALS) {
        const context = await browser.newContext({
          colorScheme: 'light',
          deviceScaleFactor: 1,
          locale: locale === 'fr' ? 'fr-FR' : 'en-US',
          reducedMotion: 'reduce',
          timezoneId: 'Europe/Paris',
          viewport: { width: visual.width, height: visual.height },
        });

        const page = await context.newPage();
        const html = htmlDocument(locale, visual.render(locale), fontData);
        await page.setContent(html, { waitUntil: 'load' });
        await assertReady(page, visual.width, visual.height);
        await exerciseVisual(page, visual.name, locale);

        await page.setContent(html, { waitUntil: 'load' });
        await assertReady(page, visual.width, visual.height);

        const outputPath = resolve(outputDirectory, `${visual.name}.png`);
        await page.screenshot({
          animations: 'disabled',
          caret: 'hide',
          fullPage: false,
          path: outputPath,
          scale: 'css',
          type: 'png',
        });
        await assertPngDimensions(outputPath, visual.width, visual.height);
        await context.close();
        process.stdout.write(`generated ${locale}/${visual.name}.png (${visual.width}×${visual.height})\n`);
      }

      await mkdir(OG_OUTPUT_ROOT, { recursive: true });

      const liveCapture = await readFile(resolve(outputDirectory, 'live-booking-app.png'));

      const context = await browser.newContext({
        colorScheme: 'light',
        deviceScaleFactor: 1,
        locale: locale === 'fr' ? 'fr-FR' : 'en-US',
        reducedMotion: 'reduce',
        timezoneId: 'Europe/Paris',
        viewport: { width: 1200, height: 630 },
      });

      const page = await context.newPage();
      await page.setContent(htmlDocument(locale, ogVisual(locale, liveCapture.toString('base64')), fontData), {
        waitUntil: 'load',
      });
      await assertReady(page, 1200, 630);

      const outputPath = resolve(OG_OUTPUT_ROOT, `app-builder-${locale}.png`);
      await page.screenshot({
        animations: 'disabled',
        caret: 'hide',
        fullPage: false,
        path: outputPath,
        scale: 'css',
        type: 'png',
      });
      await assertPngDimensions(outputPath, 1200, 630);
      await context.close();
      process.stdout.write(`generated og/app-builder-${locale}.png (1200×630)\n`);
    }
  } finally {
    await browser.close();
  }
}

await main();
