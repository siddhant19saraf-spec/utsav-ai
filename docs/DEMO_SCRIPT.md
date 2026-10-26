# UTSAV AI — Competition Demo Script

A three-to-four-minute, live demonstration of the features that actually exist in this repository. The script uses the bundled fictional sample workspace and the verified Event Rescue budget-reduction scenario.

This is a **script**, not evidence that a demo was recorded. No video is included. Static screenshots of the running app exist in [`docs/screenshots/`](screenshots/), but they are not a recording. A public static demo is live at **[https://utsav-ai-9evw6i99uw4.qoder.website](https://utsav-ai-9evw6i99uw4.qoder.website)**; it serves the SPA only, so the AI Planner reports **Unavailable** there and the deterministic outline is used. The optional Node/API service is prepared in [DEPLOYMENT.md](DEPLOYMENT.md) but not deployed. For a fully local run with the API, follow [SETUP.md](SETUP.md).

## Demo at a glance

- **Target duration:** 3 minutes 50 seconds, with a short buffer.
- **Format:** screen recording or live walkthrough at 100% browser zoom.
- **Primary story:** a wedding budget is reduced by ₹3,00,000; UTSAV AI detects the gap, proposes a constrained repair, validates it, and changes nothing until approval.
- **Data:** four fictional sample celebrations created by the app. No real guest or client data is used.
- **AI:** the default path uses the deterministic local outline and honestly labels it **Not AI-generated**. Provider AI is shown only if this exact environment was configured and verified beforehand.
- **What is not shown as working:** hosting, accounts, cloud sync, vendor availability, payments, email invitations, or live AI claims that were not verified.

## Before you record or present

### One-time setup

1. Install dependencies and start the frontend:

   ```bash
   npm ci
   npm run dev
   ```

2. Open the URL printed by Vite, normally `http://localhost:5173`.
3. Use a fresh browser profile or a private window so the sample workspace is in its initial, current state.

Do **not** start `npm run dev:api` unless you have deliberately configured and tested provider AI. With no server, the AI Planner will show **Not configured** and the deterministic outline remains available; that is the intended default demo path.

### Workspace reset

If sample data was edited, remove and re-add it before recording:

1. Go to **Settings**.
2. Under sample data controls, choose **Remove sample data**.
3. Choose **Add sample data**.

This restores current sample records with fresh relative dates. It removes only sample-origin records; events you created are kept. If the browser profile contains data you care about, export it first. Better still, use a disposable profile.

If the device has an older saved workspace with sample records created before optional event fields existed, reset samples or use a fresh profile; otherwise some Event Rescue findings and proposal details can differ.

### Final pre-flight check

- The app loads at Overview with **Sample data loaded** visible.
- The first sample event is **Ananya & Rohan’s Wedding**.
- **Event Rescue** can analyze it.
- The browser window has no unrelated tabs, bookmarks, notifications, extension popups, or personal data.
- Terminal windows, `.env` files, provider keys, storage inspection, and network tools are hidden.
- Notifications are off; screen recorder and microphone are tested.
- Zoom is 100% and the window is large enough to show the rescue comparison without excessive scrolling.

## Sample data cheat sheet

**Ananya & Rohan’s Wedding** is the demo event.

| Field | Value |
| --- | --- |
| Category | Wedding |
| Date | 38 days after the sample workspace was created (about six weeks out) |
| Venue | The Leela Palace, Bengaluru |
| Expected guests | 240 |
| Total budget | ₹45,00,000 |
| Planning status | On track |
| Setting | Outdoor |
| Theme | Regal garden romance |
| Accessibility | Required; not yet addressed |
| Outdoor contingency | Not confirmed |
| Catering estimate | Not configured |

Budget allocation:

| Category | Protection | Planned |
| --- | --- | --- |
| Venue | Protected | ₹15,00,000 |
| Catering | Protected | ₹12,00,000 |
| Décor | Flexible, minimum ₹6,00,000 | ₹8,00,000 |
| Entertainment | Flexible, minimum ₹3,00,000 | ₹4,50,000 |
| Photography | Protected | ₹3,00,000 |
| Transport | Flexible, minimum ₹1,00,000 | ₹1,50,000 |
| Emergency reserve | Protected | ₹1,00,000 |
| **Total** | | **₹45,00,000** |

The other samples are Meera’s 60th Birthday, Acme Annual Gala, and Sundar Family Diwali. They are not required for this demo.

## Timed script

### 0:00–0:25 — Problem and introduction

**On screen:** Overview with the labelled sample data visible.

**Do:** Point to the workspace summary and the Risk Intelligence area. Do not open any dialog yet.

**Say:**

> “Planning a celebration is not one list. It is a budget, a schedule, guests, catering assumptions, and a hundred decisions that change each other. UTSAV AI is an intelligent celebration planning workspace. It keeps those plans together, detects when they stop fitting, and repairs the plan with deterministic rules. Nothing is applied automatically. This is the labelled sample workspace, so no real guest data is on screen.”

### 0:25–1:00 — Open a realistic event

**Do:**

1. Click **My Events** in the sidebar.
2. Point to **Ananya & Rohan’s Wedding**. Point out `On track`, `240` guests, `₹45,00,000`, and The Leela Palace, Bengaluru.
3. Click **Edit event** on that card.
4. Show the saved fields briefly: event name, category, date, venue, expected guests, and budget.
5. Click **Cancel**. Do not change or save anything.

**Say:**

> “This is a fictional wedding about six weeks away: 240 guests, a ₹45 lakh budget, and an outdoor theme. Opening the event shows the same values used by every planning module. The data is isolated to this event, and sample records are clearly marked.”

### 1:00–1:40 — Planning context and budget constraints

**Do:**

1. Click **Overview**.
2. Set **Focus event** to **Ananya & Rohan’s Wedding**.
3. Point to the summary, planning-health cards, upcoming activities, and the risk warning area.
4. Click **Budget Planner**.
5. Confirm **Event to edit** is **Ananya & Rohan’s Wedding**.
6. Point to the total budget, protected categories, flexible categories, minimums, and emergency reserve.

**Say:**

> “The overview pulls the saved plan into one view: tasks, activities, guests, and early warnings. In the budget planner, Venue, Catering, Photography, and the emergency reserve are protected. Décor, Entertainment, and Transport are flexible, but they have minimums. Those constraints are exactly what the rescue engine must respect.”

### 1:40–2:40 — Event Rescue: detect, explain, propose, validate

**Do:**

1. Click **Event Rescue**.
2. If needed, set **Event to analyze** to **Ananya & Rohan’s Wedding**.
3. Show **Saved event · original plan**: 240 guests, ₹45,00,000 total, **Within budget**.
4. In **Total budget (INR)**, replace the prefilled `4500000` with `4200000`.
5. Leave the date, guest count, setting, theme, accessibility answers, and protections unchanged.
6. Click **Analyze rescue options**.
7. Scroll to **Analysis result** and then **Original versus proposed plan**.

**Say while the analysis runs:**

> “A ₹45 lakh plan just became a ₹42 lakh plan. That is a ₹3 lakh gap. Rescue evaluates the change against the saved event, budget, tasks, activities, guests, and catering assumption. It is deterministic, and the saved event is still untouched.”

**Point to and say after the result appears:**

> “The analysis shows the over-allocation and the evidence behind it. The proposal changes the total to ₹42 lakh and reduces Décor from ₹8 lakh to ₹6 lakh and Entertainment from ₹4.5 lakh to ₹3.5 lakh. Transport stays at ₹1.5 lakh. Venue, Catering, Photography, and the emergency reserve are unchanged. The validation section confirms the plan fits and preserved the protections. Remaining issues are still listed; accepting this proposal does not pretend they disappear.”

**Expected values on an unmodified sample workspace:**

- Total budget: `₹45,00,000 → ₹42,00,000`
- Planned expenditure: `₹45,00,000 → ₹42,00,000`
- Décor: `₹8,00,000 → ₹6,00,000`
- Entertainment: `₹4,50,000 → ₹3,50,000`
- Transport: unchanged at `₹1,50,000`
- Protected Venue, Catering, Photography, and reserve: unchanged
- The proposal is **Ready for approval** and passes deterministic validation
- Expected guests, date, setting, and theme remain unchanged

If the values differ, the sample workspace was edited or stale. Either reset the samples or narrate the values the app actually shows. Never force the scripted numbers.

### 2:40–3:15 — Approval and persistence

**Do:**

1. Point out the statement that the saved event stays exactly as it is until approval.
2. Click **Accept proposal**.
3. Click **Budget Planner** to show the persisted result. Confirm the event is **Ananya & Rohan’s Wedding** and the total is now `₹42,00,000`, with Décor and Entertainment reduced.
4. If time allows, refresh the page once and show the same values persist.

**Say:**

> “Acceptance is explicit and atomic. The app rechecks the proposal against the current event, rejects stale or duplicate proposals, and saves before updating the screen. The plan now reflects the smaller budget, and the protected categories were never used to close the gap. A refresh keeps the approved values because they are saved in this browser.”

**Expected state after acceptance on the sample workspace:**

- The Budget Planner shows total and planned expenditure of `₹42,00,000`.
- Décor shows `₹6,00,000`; Entertainment shows `₹3,50,000`; Transport remains `₹1,50,000`.
- Protected categories and the reserve remain unchanged.
- The app’s live status message reports that the change was applied, the new planned expenditure, and that remaining reported risks still need attention. On the verified sample run, the message was: “Changes were applied to ‘Ananya & Rohan’s Wedding’. Planned expenditure is now ₹42,00,000. 2 reported risks still need attention; this proposal does not resolve them.”
- The message is exposed through the app’s polite live region; the visible budget values are the on-screen proof.

Do not claim a refresh test unless you actually perform it.

### 3:15–3:55 — Optional AI and conclusion

Choose exactly one of these paths.

#### Default path: no provider configured (recommended for an unverified environment)

**Do:**

1. Click **AI Planner**.
2. Point to **Server-side AI status**: **Not configured**.
3. Set **Saved event** to **Ananya & Rohan’s Wedding**.
4. Choose **Create a plan**.
5. In **Your request**, enter: `Draft the next planning steps for this wedding.`
6. Click **Build deterministic outline**.
7. Scroll to the result and point to the **Not AI-generated** label and the deterministic checks.

**Say:**

> “AI is optional. In this environment no provider is configured, so the app disables AI generation instead of pretending. The deterministic outline uses saved facts and the app’s own rules. It is clearly labelled ‘Not AI-generated’. When a provider is configured on the local server, the same plumbing validates its output, previews it, and still requires explicit approval. AI never gets to change protected budgets or approve itself.”

#### Optional path: provider AI was configured and tested beforehand

Use this only if you have already confirmed the exact environment and provider work. Otherwise use the default path.

1. Start `npm run dev:api` in a second terminal and confirm **Server-side AI status** shows a configured model.
2. Select **Ananya & Rohan’s Wedding**.
3. Choose **Summarize detected risks** or **Create a plan**.
4. Enter a short, non-sensitive request.
5. Click **Generate AI plan**.
6. Show the **Generated by AI** label, the deterministic checks, and the preview. Do not approve the plan during a short demo.
7. If the provider fails or times out, say so and switch to **Build deterministic outline**. Do not retry in a loop or claim a result you did not receive.

**Say only if verified:**

> “This is a real provider proposal, but it is still advisory. The browser and server validated the response, the app reran its deterministic checks, and nothing has been added. I can select tasks and activities and preview them, then approve them explicitly.”

#### Close (last 10–15 seconds)

**Say:**

> “UTSAV AI is a local-first competition prototype. The differentiator is Event Rescue: it detects the problem, explains the evidence, proposes a constrained repair, validates the before-and-after plan, and asks for approval. The public demo is a static build: no hosted API, accounts, vendor integrations, or cloud sync are claimed. Plan smarter. Celebrate better.”

## Backup demo path

If the primary path fails or you are short on time:

1. **Skip the Budget Planner walkthrough.** The Event Rescue saved-event card itself shows the original total, guests, and budget status.
2. **Keep the same rescue scenario** if the sample is intact. If the expected values differ, narrate the actual findings rather than forcing a script.
3. **Reset the sample workspace.** In Settings, remove sample data and add it again. This restores current sample records and relative dates. Export any user data first if the profile is not disposable.
4. **Use a fresh private window** if storage, port, or old sample data is causing drift.
5. **Skip the AI section entirely** and use the remaining time to show the updated budget. AI is optional; the core differentiator is the deterministic rescue flow.
6. **If the API server is running but unconfigured**, keep it running only if the AI page clearly shows **Not configured**. Otherwise stop it and use the default path.
7. **If the app fails to start**, do not invent a demo. State that you can show the source, tests, and documentation instead, and report the failure honestly.

## Warnings about real personal information

This is a local single-user prototype with plaintext browser storage and plaintext exports. Treat all planning data as sensitive.

- Use only the bundled fictional sample data for a recorded or public demo.
- Do not enter real guest names, email addresses, phone numbers, dietary needs, accessibility needs, vendor contracts, payment details, or private notes.
- Do not show the browser's developer tools, Application/Storage panel, downloaded backup files, `.env` files, terminal output containing credentials, or provider dashboards.
- Guest data is not sent by the AI context builder, but if provider AI is used, aggregate event facts do leave the browser to the configured provider. Do not claim that “nothing leaves the browser” when AI is configured.
- Exported JSON and local storage are not encrypted. Delete demo backups and close the disposable profile after recording if the demo included anything sensitive (ideally it did not).
- Turn off desktop notifications and close messaging apps before recording.

## Recording checklist

- [ ] Fresh or disposable browser profile at the intended origin.
- [ ] Current sample data loaded and **Sample data loaded** visible.
- [ ] Ananya & Rohan’s Wedding selected and unmodified.
- [ ] No real personal or client data anywhere on screen.
- [ ] No keys, `.env` content, provider bodies, or storage internals visible.
- [ ] `npm run dev` running; optional API status deliberately configured or deliberately absent.
- [ ] Notifications, extensions, and unrelated tabs closed.
- [ ] Microphone level checked; quiet room; no copyrighted background music.
- [ ] Screen recording resolution stable, cursor visible, browser zoom 100%.
- [ ] Dry run completed with actual values noted.
- [ ] Backup path chosen for a stale sample or missing AI.
- [ ] Final recording is three to four minutes; no fabricated deployment, provider, or recording claims.
- [ ] After recording, verify that the approved sample budget remains ₹42,00,000 in the same browser profile, or reset/close the disposable profile.

## What this demo deliberately does not claim

- That a real external AI provider was used, unless the optional path was explicitly configured and verified.
- That UTSAV AI can book vendors, check live availability, verify weather, send invitations, process payments, or sync between devices.
- That the app is hosted, deployed, or publicly accessible, or that CI verifies browser E2E, deployment, or a live provider. CI runs type checking, linting, tests, and the build only.
- That deterministic rescue is mathematically optimal; the repair is deterministic and greedy.
- That approval resolves every remaining issue; the UI reports remaining issues explicitly.
- That a demo video or recording exists; none is committed. Static screenshots are not a substitute for a recorded demo.
