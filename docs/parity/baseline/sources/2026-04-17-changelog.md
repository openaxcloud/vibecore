> ## Documentation Index
> Fetch the complete documentation index at: https://docs.replit.com/llms.txt
> Use this file to discover all available pages before exploring further.

# April 17, 2026

> 2 min read

## What's new

* [Claude Opus 4.7 powers Power mode](#claude-opus-4-7-powers-power-mode)
* [New Agent modes dropdown](#new-agent-modes-dropdown)
* [Agent suggests follow-up tasks](#agent-suggests-follow-up-tasks)
* [Projects page improvements](#projects-page-improvements)
* [Filter the Projects page by artifact — now including Slides](#filter-the-projects-page-by-artifact)
* [Replit Agent on Google Cloud Marketplace](#replit-agent-on-google-cloud-marketplace)
* [Custom groups for SCIM organizations](#custom-groups-for-scim-organizations)

## Agent

### Claude Opus 4.7 powers Power mode

Power mode now runs on Anthropic's Claude Opus 4.7. Select **Power** in the Agent modes dropdown and Agent routes your request to the new model automatically.

<Frame>
  <img src="https://mintcdn.com/replit/zALc7OzXiaq7UGUn/images/changelog/2026-04-17/claude-opus-4-7.png?fit=max&auto=format&n=zALc7OzXiaq7UGUn&q=85&s=e278de8cde840b14d0802ed152563d24" alt="Replit Agent 4 powered by Claude Opus 4.7" width="1042" height="628" data-path="images/changelog/2026-04-17/claude-opus-4-7.png" />
</Frame>

Learn more about [Agent modes](/core-concepts/agent/agent-modes).

### New Agent modes dropdown

The Agent mode selector in the chat input is now a simpler segmented control. Pick between Lite, Economy, and Power right from the toolbar, and reach Turbo through Advanced settings when you need it..

What's new:

* **Segmented control in the toolbar.** Lite, Economy, and Power sit side-by-side so it's obvious which mode you're in and how to switch.
* **Keyboard shortcut.** Press **⌘+Shift+I** (Ctrl+Shift+I on Windows) to cycle through modes without reaching for your mouse.
* **Turbo highlighted in orange.** Turbo is the fastest mode but costs more, so it stands out in the UI to keep the cost tradeoff visible.
* **Advanced settings collapsed by default.** The controls for testing, code review, and Turbo live behind **Advanced settings** so the main view stays clean.
* **Max mode has been retired.** Use Power for the most capable builds, or turn on Turbo inside Advanced settings when you want the fastest response.

<Frame>
  <img src="https://mintcdn.com/replit/zALc7OzXiaq7UGUn/images/changelog/2026-04-17/agent-modes-dropdown.png?fit=max&auto=format&n=zALc7OzXiaq7UGUn&q=85&s=bb09f129f96d89489cd1b652087669de" alt="Agent modes popover showing Lite, Economy, and Power as a segmented control with Advanced settings collapsed below" width="598" height="246" data-path="images/changelog/2026-04-17/agent-modes-dropdown.png" />
</Frame>

Learn more about [Agent modes](/core-concepts/agent/agent-modes).

### Agent suggests follow-up tasks

<Frame>
  <video autoPlay muted loop playsInline src="https://cdn.replit.com/sanity/replit-suggested-tasks.mp4" />
</Frame>

Agent now proposes **follow-up tasks** after it finishes work, using the full context of your project to suggest what to build next. Three kinds of suggestions show up under each completed task:

* **New features to build** — capabilities that pair naturally with what you just shipped
* **Performance improvements** — optimizations Agent noticed while working on the task
* **User experience enhancements** — polish that rounds out the feature

Review each suggestion, select **Accept** on the ones you want, and Agent runs them in the background while you keep building. Hide suggestions you don't need with **Hide suggested tasks** in the Done column, and bring them back anytime.

Learn more about [follow-up task suggestions](/features/agent/follow-up-tasks).

## Workspace

### Projects page improvements

Three quality-of-life improvements landed on the Projects page:

* **Artifact previews on every card.** Each project card now shows small icons for each artifact inside. Hover any icon to preview that artifact's screenshot without opening the project.
* **Default sort by last opened by you.** The page now puts the projects *you* worked on most recently at the top, so your current work stays front and center in busy team workspaces.
* **Personal pinning.** Pin the projects you return to often. Pins are private to you and don't affect what other members of your workspace see.

<Frame>
  <img src="https://mintcdn.com/replit/zALc7OzXiaq7UGUn/images/changelog/2026-04-17/projects-page-artifact-tic-tacs.png?fit=max&auto=format&n=zALc7OzXiaq7UGUn&q=85&s=04370fef401e364498548696bba3e26d" alt="Project cards on the Projects page with artifact icons and a dropdown listing every artifact inside one project" width="721" height="1022" data-path="images/changelog/2026-04-17/projects-page-artifact-tic-tacs.png" />
</Frame>

Learn more about [managing your projects](/features/projects-and-artifacts/projects#managing-your-projects).

### Filter the Projects page by artifact

You can filter your Projects page by artifact using the **Build type** dropdown. Select the artifact type (for example, Slides) to see only the projects that contain it.

<Frame>
  <img src="https://mintcdn.com/replit/zALc7OzXiaq7UGUn/images/changelog/2026-04-17/projects-page-build-type-filter.png?fit=max&auto=format&n=zALc7OzXiaq7UGUn&q=85&s=4c8de4ad949becba068d57521ba0b0bc" alt="Build type dropdown on the Projects page filtering by artifact, with Design, Web, Data, Mobile, 3D Game, and Slides options" width="472" height="622" data-path="images/changelog/2026-04-17/projects-page-build-type-filter.png" />
</Frame>

Learn more about [Slide Decks](/features/artifact-types/slide-decks#finding-your-slide-decks).

## Integrations

### Replit Agent on Google Cloud Marketplace

Replit Agent is now available as an MCP Server listing on [Google Cloud Marketplace](https://console.cloud.google.com/marketplace/product/replit-public/replit-agent4?pli=1). Enterprise teams using Google Cloud can provision Agent through their existing billing relationship and integrate it with Gemini Enterprise.

<Frame>
  <img src="https://mintcdn.com/replit/zALc7OzXiaq7UGUn/images/changelog/2026-04-17/google-cloud-marketplace.png?fit=max&auto=format&n=zALc7OzXiaq7UGUn&q=85&s=8d1043fe117980e06cf5db119fe9c722" alt="Replit Agent listing on Google Cloud Marketplace showing the product details page with a Contact Sales button" width="691" height="395" data-path="images/changelog/2026-04-17/google-cloud-marketplace.png" />
</Frame>

## Teams and Enterprise

### Custom groups for SCIM organizations

Organizations with SCIM provisioning enabled can now create custom groups in Replit alongside their IdP-synced groups. Use custom groups for project-based access, one-off permission grants, or any structure that isn't mirrored in your identity provider.

SCIM-synced groups remain managed through your identity provider — custom groups are managed directly in Replit by organization admins.

Learn more about [SCIM](/teams/identity-and-access-management/scim#creating-custom-groups-alongside-scim).
