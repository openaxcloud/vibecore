> ## Documentation Index
> Fetch the complete documentation index at: https://docs.replit.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Agent Modes

> Learn how to choose between Lite, Economy, and Power, and when to turn on App Testing, High effort, and Turbo.

Agent modes let you control the balance between speed, cost, and capability when using Agent. Use the top-level mode selector in the Agent settings dropdown to switch between **Lite**, **Economy**, and **Power**, then use the toggles below it for more control over testing, High effort, and Turbo.

<Frame>
  <img src="https://mintcdn.com/replit/CEz1CvpChV8LOqgG/images/replitai/agent-modes/agent-modes-dropdown-segmented.png?fit=max&auto=format&n=CEz1CvpChV8LOqgG&q=85&s=b0a98c41a815c486ead3adb061c9e383" alt="Agent modes popover with Lite, Economy, and Power as a segmented control, and App testing and Turbo toggles below it" width="760" height="502" data-path="images/replitai/agent-modes/agent-modes-dropdown-segmented.png" />
</Frame>

<Tip>
  **Keyboard shortcut:** Press **⌘+Shift+I** (Ctrl+Shift+I on Windows) to cycle through Agent modes without leaving the chat input.
</Tip>

<Note>Max mode is no longer available. Use Power for the most capable standard builds, and turn on Turbo when you need the fastest runs.</Note>

## Lite mode

**Optimized for quick edits.** Lite uses fast, lightweight models for visual tweaks, bug fixes, and other small, scoped changes.

<Frame>
  <img src="https://mintcdn.com/replit/CEz1CvpChV8LOqgG/images/replitai/agent-modes-lite.png?fit=max&auto=format&n=CEz1CvpChV8LOqgG&q=85&s=9464a643906c154f2b18774f66ccce93" alt="Agent modes dropdown with Lite selected and the High effort and Turbo toggles greyed out" width="760" height="502" data-path="images/replitai/agent-modes-lite.png" />
</Frame>

**Best for:** Quick fixes, UI polish, and short iteration loops while you stay at your keyboard.

**Keep in mind:** Lite works best in existing apps when you already know what you want to change. If you're starting from scratch, making large architectural changes, adding a new integration, or changing a database schema, switch to Economy or Power.

**Cost:** Lite uses the same effort-based pricing model as the other build modes, but focused requests often cost less than Economy or Power for the same targeted edit.

## Economy mode

**Optimized for cost.** Economy uses fewer credits per task and is the best default when you want strong results without paying for the most capable models.

<Frame>
  <img src="https://mintcdn.com/replit/CEz1CvpChV8LOqgG/images/replitai/agent-modes-economy.png?fit=max&auto=format&n=CEz1CvpChV8LOqgG&q=85&s=70c60c52eccc2e8bb052f64e49eba7d4" width="760" height="604" data-path="images/replitai/agent-modes-economy.png" />
</Frame>

**Best for:** Everyday builds, learning, and cost-conscious work across an existing project.

## Power mode

**Optimized for capability.** Power uses more capable models for complex tasks, larger codebases, and harder problems.

<Frame>
  <img src="https://mintcdn.com/replit/CEz1CvpChV8LOqgG/images/replitai/agent-modes-power.png?fit=max&auto=format&n=CEz1CvpChV8LOqgG&q=85&s=bf79cdb3526f572195875900d718f890" alt="Agent modes dropdown with Power selected, App testing on, and High effort and Turbo off" width="760" height="604" data-path="images/replitai/agent-modes-power.png" />
</Frame>

**Best for:** Production-grade projects, complex features, and when you want the best results from Agent.

### Power mode suggestions

<Frame>
  <img src="https://mintcdn.com/replit/aH_UxEdErlJDdhQz/images/replitai/power-mode-nudge.png?fit=max&auto=format&n=aH_UxEdErlJDdhQz&q=85&s=cf37197d41776c04b265c58989a7aa65" alt="Power Mode nudge card in the Agent chat showing the prompt 'Not quite there? Switch to Power Mode for stronger performance.' with Dismiss and Switch to Power buttons" width="737" height="227" data-path="images/replitai/power-mode-nudge.png" />
</Frame>

When you are in Economy mode and Agent notices you are hitting the same problem repeatedly, it suggests switching to Power mode for your next message.

You will see the suggestion at most once per project. Once you dismiss it or act on it, Agent will not nudge you again in that project, even if you stay in Economy.

## Build controls

Below the mode selector, the Agent settings dropdown shows the rest of Agent's build controls:

* **App Testing** lets Agent test your app automatically in a browser.
* **High effort** lets Agent reach for its most capable models on the hardest parts of a task. Available in Economy and Power.
* **Turbo** gives you the fastest available models when you're in Power mode.

Lite keeps App Testing off, High effort is available in Economy and Power, and Turbo is only available while Power is selected.

## Code review

Agent reviews and improves its own code as it builds, catching mistakes before it hands work back to you. This review is built into Agent and runs automatically—it is no longer a setting you turn on or off.

<Note>
  The **Code Optimizations** on/off toggle (formerly **Autonomy Level**) has been removed from the Agent settings dropdown. You no longer choose whether Agent reviews its own code—Agent handles it for you, so there's nothing to configure.
</Note>

Code review is separate from [High effort](#high-effort-mode) and [Turbo](#turbo-mode), which remain their own toggles in the Agent settings dropdown.

## High effort mode

**High effort is an opt-in toggle, not a separate mode.** It's available in both Economy and Power, so you can keep your usual mode and switch it on only when a task calls for it.

When High effort is enabled, Agent performs deeper, more deliberate reasoning and invokes its most capable frontier models, improving outcomes on the most complex tasks. Agent applies that extra power selectively — it routes to the more capable models only when a request is genuinely hard, not on every run.

<Frame>
  <img src="https://mintcdn.com/replit/9_Nf716LgoX22mUV/images/replitai/agent-modes-high-effort.png?fit=max&auto=format&n=9_Nf716LgoX22mUV&q=85&s=f40b3d759c66eda617e20011650d868a" alt="Agent modes dropdown with Power selected and High effort turned on" width="1952" height="1412" data-path="images/replitai/agent-modes-high-effort.png" />
</Frame>

<Tip>
  Because Agent only reaches for the most capable model on the hardest work, High effort adds cost up to \~2x on the toughest tasks — and often little to nothing on the simpler ones. Leave it on when you're tackling complex problems, and turn it off for routine changes.
</Tip>

**Best for:** Complex features, large refactors, and tricky bugs where getting the best possible result matters more than minimizing cost.

## Turbo mode

**Turbo is a separate toggle in the Agent settings dropdown.** Turn it on in Power mode when you want **2.5x faster** responses using the fastest models. Requests cost about 2x more than Power, so Turbo is best when speed matters more than efficiency.

<Frame>
  <img src="https://mintcdn.com/replit/CEz1CvpChV8LOqgG/images/replitai/agent-modes-turbo.png?fit=max&auto=format&n=CEz1CvpChV8LOqgG&q=85&s=3e5ea2a7ec43a1ff24f28dc85ae9eb82" alt="Agent modes dropdown with Power selected and Turbo turned on" width="760" height="502" data-path="images/replitai/agent-modes-turbo.png" />
</Frame>

<Warning>
  Turbo is highlighted in orange in the Agent modes dropdown as a visual reminder that it costs significantly more than Power. Keep an eye on the highlight when you're iterating quickly — it's there to keep the cost tradeoff visible.
</Warning>

**Availability:** **Pro and Enterprise.** Turbo is off by default on every plan—it's an opt-in toggle you turn on per project when you need it. On Enterprise, Turbo isn't available until an admin enables it for the organization.

**Best for:** When you need the fastest possible Agent response and are on a Pro or Enterprise plan.

## Which mode should I use?

Use the following as a guide:

| Goal                                           | Recommended mode                   |
| ---------------------------------------------- | ---------------------------------- |
| Small, scoped edits and quick iterations       | Lite                               |
| Maximize number of prompts per credit          | Economy                            |
| Balance cost and quality for most projects     | Power                              |
| Best possible result on the most complex tasks | Economy or Power + High effort     |
| Fastest response on bigger tasks               | Power + Turbo (Pro and Enterprise) |

You can change modes at any time from the Agent settings dropdown in the chat input. Choose Lite, Economy, or Power from the top-level control, then use the toggles below it when you want more control over testing, High effort, or Turbo. No single mode is always best—pick the one that fits the task in front of you.

## Settings in shared projects

Your Agent settings are tied to you, not to the project. When you invite a teammate into a project, each of you keeps your own choices for:

* Mode (Lite, Economy, or Power)
* [Plan Mode](/features/agent/plan-mode)
* Auto-merge for background tasks
* Auto-approve for plans
* High effort
* Turbo

A teammate switching to Power on their next task does not flip your settings to Power. The mode and toggles you see in the Agent settings dropdown are the ones Agent uses when you send the next message, regardless of how many collaborators are in the project.

## Related

* [Managing your spend](/billing/managing-spend): Set alerts, budgets, and use Plan Mode for cost control.
* [Replit Pro](/billing/plans/replit-pro): Unlock Turbo mode and tiered credits.
