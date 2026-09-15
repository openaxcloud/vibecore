> ## Documentation Index
> Fetch the complete documentation index at: https://docs.replit.com/llms.txt
> Use this file to discover all available pages before exploring further.

# Import from a provider

> Bring projects, code, and designs from another tool into Replit and continue building with Agent.

export const platform_8 = "Bolt"

export const platform_7 = "Base44"

export const platform_6 = "Lovable"

export const platform_5 = "Bolt"

export const projectType_5 = "project"

export const platform_4 = "Base44"

export const projectType_4 = "project"

export const platform_3 = "Lovable"

export const projectType_3 = "project"

export const platform_2 = "ZIP"

export const projectType_2 = "project"

export const platform_1 = "GitHub"

export const projectType_1 = "repository"

export const platform_0 = "Vercel"

export const projectType_0 = "project"

export const setupDescription_5 = "Agent prepares the environment, installs dependencies, and configures run commands for Replit"

export const setupDescription_4 = "Replit detects your app stack, installs dependencies, and configures run commands"

export const setupDescription_3 = "Agent validates project structure and adjusts setup for Replit"

export const setupDescription_2 = "Agent prepares the environment, installs dependencies, and configures run commands for Replit"

export const setupDescription_1 = "Agent validates project structure and adjusts setup for Replit"

export const setupDescription_0 = "Agent validates project structure and adjusts setup for Replit"

Import lets you bring existing code or designs into Replit Apps and continue building with Agent.

## Supported sources

| Source                | What you provide                                     | Best for                                           |
| --------------------- | ---------------------------------------------------- | -------------------------------------------------- |
| GitHub                | Repository URL or repository picker                  | Public and private repository imports              |
| Bitbucket             | Repository URL or repository picker                  | Bitbucket-hosted repository imports                |
| Vercel                | GitHub repository behind your Vercel project         | Migrating Vercel apps                              |
| Figma                 | Frame URL                                            | Turning designs into React apps                    |
| Claude                | Design sent from Claude                              | Turning a Claude design into an interactive app    |
| Bolt                  | GitHub repository exported from Bolt                 | Migrating Bolt projects                            |
| Lovable               | GitHub repository exported from Lovable              | Migrating Lovable projects                         |
| Base44                | GitHub repository exported from Base44               | Migrating Base44 projects                          |
| ZIP                   | `.zip` file upload                                   | Importing local project archives                   |
| Spreadsheet           | `.xlsx`, `.csv` file, or Google Sheets URL           | Building an app from spreadsheet data              |
| Previous Agent export | GitHub repository exported from a previous Agent App | Re-importing a previous Agent App                  |
| Empty                 | Nothing                                              | Power users who want a blank project without Agent |

<Note>Replit validates compatibility before import starts.</Note>

For Figma designs, see [Turn a Figma design into an interactive app](/build/figma-to-app).

For designs sent from Claude, see [Turn a Claude design into an app](/build/claude-to-app).

## Quick imports

Pick a source for step-by-step instructions:

<Tabs>
  <Tab title="Lovable">
    ⏰ *Estimated time: four minutes*

    Import a Lovable project into Replit by exporting it to GitHub, then importing that repository.

    **Before you start**

    * A Lovable project you can export
    * A GitHub account connected to Lovable
    * A Replit account

    **Steps**

    1. Export your Lovable project to GitHub.
    2. Open [replit.com/import](https://replit.com/import).
    3. Select **Lovable**.
    4. Connect your GitHub account.
    5. Select the exported Lovable repository.
    6. Select **Import**.

    ## What gets imported

    Replit imports the following from your {platform_6} project:

    * **Code**: Application logic and source files
    * **Design and styles**: UI components and styling rules
    * **Assets**: Images, icons, and static files
    * **Backend logic**: Server-side functionality, if present
    * **Database schema**: Table structure, if present

    ## What is not imported

    * **Supabase data**: Existing database records are not migrated
    * **Secrets**: Environment variables and API keys must be added separately

    Use Agent to rebuild missing functionality, add secrets, and recreate database data.

    ## Configure and run your app

    During import, {setupDescription_0}. If your app needs changes, use these Project Editor tools:

    * **[Agent](/features/agent/overview)**: Refine features, debug issues, and make code changes
    * **[Secrets](/core-concepts/project-editor/app-setup/secrets)**: Add API keys and environment variables
    * **[Workflows](/features/workspace-tools/workflows)**: Set the **Run** command for your app

    ## Continue your journey

    Now that you've imported your {platform_3} {projectType_3}, explore these next steps:

    * [Replit Agent](/features/agent/overview): Get help with feature work, debugging, and refactoring
    * [Replit Deployments](/learn/projects-and-artifacts/replit-deployments): Publish your app
    * [Database setup](/features/data-and-storage/sql-database): Configure your database with Agent help
    * [Collaborate](/build/invite-teammates): Build with teammates
  </Tab>

  <Tab title="Base44">
    ⏰ *Estimated time: four minutes*

    Import a Base44 project into Replit by exporting it to GitHub, then importing that repository.

    **Before you start**

    * A Base44 project you can export
    * A GitHub account connected to Base44
    * A Replit account

    **Steps**

    1. Export your Base44 project to GitHub.
    2. Open [replit.com/import](https://replit.com/import).
    3. Select **Base44**.
    4. Connect your GitHub account.
    5. Select the exported Base44 repository.
    6. Select **Import**.

    ## What gets imported

    Replit imports the following from your {platform_7} project:

    * **Code**: Application logic and source files
    * **Design and styles**: UI components and styling rules
    * **Assets**: Images, icons, and static files
    * **Backend logic**: Server-side functionality, if present
    * **Database schema**: Table structure, if present

    ## What is not imported

    * **Supabase data**: Existing database records are not migrated
    * **Secrets**: Environment variables and API keys must be added separately

    Use Agent to rebuild missing functionality, add secrets, and recreate database data.

    ## Configure and run your app

    During import, {setupDescription_1}. If your app needs changes, use these Project Editor tools:

    * **[Agent](/features/agent/overview)**: Refine features, debug issues, and make code changes
    * **[Secrets](/core-concepts/project-editor/app-setup/secrets)**: Add API keys and environment variables
    * **[Workflows](/features/workspace-tools/workflows)**: Set the **Run** command for your app

    ## Continue your journey

    Now that you've imported your {platform_4} {projectType_4}, explore these next steps:

    * [Replit Agent](/features/agent/overview): Get help with feature work, debugging, and refactoring
    * [Replit Deployments](/learn/projects-and-artifacts/replit-deployments): Publish your app
    * [Database setup](/features/data-and-storage/sql-database): Configure your database with Agent help
    * [Collaborate](/build/invite-teammates): Build with teammates
  </Tab>

  <Tab title="Vercel">
    ⏰ *Estimated time: three minutes*

    Import a Vercel project into Replit by linking the GitHub repository behind the project.

    **Before you start**

    * A Vercel project connected to GitHub
    * Access to the backing GitHub repository
    * A Replit account

    **Steps**

    1. Open [replit.com/import](https://replit.com/import).
    2. Select **Vercel**.
    3. Connect your GitHub account.
    4. Select the repository for your Vercel project.
    5. Add any requested secrets and environment variables.
    6. Select **Import**.

    **What gets imported**

    * Project files and directory structure
    * Dependency and framework configuration
    * Run and build defaults for Replit

    **What is not imported**

    * Existing environment variable values
    * Custom domains
    * Vercel-specific edge or middleware behavior
    * External analytics or monitoring configuration

    ## Configure and run your app

    During import, {setupDescription_2}. If your app needs changes, use these Project Editor tools:

    * **[Agent](/features/agent/overview)**: Refine features, debug issues, and make code changes
    * **[Secrets](/core-concepts/project-editor/app-setup/secrets)**: Add API keys and environment variables
    * **[Workflows](/features/workspace-tools/workflows)**: Set the **Run** command for your app

    ## Continue your journey

    Now that you've imported your {platform_0} {projectType_0}, explore these next steps:

    * [Replit Agent](/features/agent/overview): Get help with feature work, debugging, and refactoring
    * [Replit Deployments](/learn/projects-and-artifacts/replit-deployments): Publish your app
    * [Collaborate](/build/invite-teammates): Build with teammates
  </Tab>

  <Tab title="Bolt">
    ⏰ *Estimated time: four minutes*

    <Warning>Agent currently supports Bolt imports for Vite + React apps.</Warning>

    Import a Bolt project into Replit by exporting it to GitHub, then importing that repository.

    **Before you start**

    * A Bolt project you can export
    * A GitHub account connected to Bolt
    * A Replit account

    **Steps**

    1. Export your Bolt project to GitHub.
    2. Open [replit.com/import](https://replit.com/import).
    3. Select **Bolt**.
    4. Connect your GitHub account.
    5. Select the exported Bolt repository.
    6. Select **Import**.

    ## What gets imported

    Replit imports the following from your {platform_8} project:

    * **Code**: Application logic and source files
    * **Design and styles**: UI components and styling rules
    * **Assets**: Images, icons, and static files
    * **Backend logic**: Server-side functionality, if present
    * **Database schema**: Table structure, if present

    ## What is not imported

    * **Supabase data**: Existing database records are not migrated
    * **Secrets**: Environment variables and API keys must be added separately

    Use Agent to rebuild missing functionality, add secrets, and recreate database data.

    ## Configure and run your app

    During import, {setupDescription_3}. If your app needs changes, use these Project Editor tools:

    * **[Agent](/features/agent/overview)**: Refine features, debug issues, and make code changes
    * **[Secrets](/core-concepts/project-editor/app-setup/secrets)**: Add API keys and environment variables
    * **[Workflows](/features/workspace-tools/workflows)**: Set the **Run** command for your app

    ## Continue your journey

    Now that you've imported your {platform_5} {projectType_5}, explore these next steps:

    * [Replit Agent](/features/agent/overview): Get help with feature work, debugging, and refactoring
    * [Replit Deployments](/learn/projects-and-artifacts/replit-deployments): Publish your app
    * [Database setup](/features/data-and-storage/sql-database): Configure your database with Agent help
    * [Collaborate](/build/invite-teammates): Build with teammates
  </Tab>

  <Tab title="GitHub">
    ⏰ *Estimated time: two minutes*

    Import a GitHub repository into Replit to run, test, and publish faster.

    **Before you start**

    * A GitHub repository URL
    * Access to the repository (public or private)
    * A Replit account

    **Option one: rapid import**

    Rapid import works for public repositories.

    1. Copy the repository path after `github.com/`.
    2. Open `https://replit.com/github.com/<owner>/<repo>`.
    3. Press Enter to start import.

    *Example*

    * GitHub URL: `https://github.com/exampleUser/my-app`
    * Replit import URL: `https://replit.com/github.com/exampleUser/my-app`

    **Option two: guided import**

    Guided import supports public and private repositories.

    1. Open [replit.com/import](https://replit.com/import).
    2. Select **GitHub**.
    3. Connect your GitHub account.
    4. Choose a repository.
    5. Select **Import**.

    **What gets imported**

    * Repository files and folders
    * Dependency files
    * Common run and build configuration

    **What is not imported**

    * Existing secret values and environment variable values
    * Platform-specific services that do not run in Replit by default

    ## Configure and run your app

    During import, {setupDescription_4}. If your app needs changes, use these Project Editor tools:

    * **[Agent](/features/agent/overview)**: Refine features, debug issues, and make code changes
    * **[Secrets](/core-concepts/project-editor/app-setup/secrets)**: Add API keys and environment variables
    * **[Workflows](/features/workspace-tools/workflows)**: Set the **Run** command for your app

    ## Continue your journey

    Now that you've imported your {platform_1} {projectType_1}, explore these next steps:

    * [Replit Agent](/features/agent/overview): Get help with feature work, debugging, and refactoring
    * [Replit Deployments](/learn/projects-and-artifacts/replit-deployments): Publish your app
    * [Collaborate](/build/invite-teammates): Build with teammates

    **Troubleshooting GitHub connection issues**

    If you see `Failed to get repository, please re-authenticate with GitHub`, or the repository dropdown shows `No repositories found`, the GitHub import flow uses a separate connection from the one in your **Account → Connected Services** page. Reconnecting under Connected Services alone will not fix the import flow.

    <Steps>
      <Step title="Reconnect GitHub from Git Providers">
        Open the **Git Providers** section in your Replit account settings, disconnect GitHub, and reconnect from the same screen. After this, your personal repositories should appear in the import dropdown.
      </Step>

      <Step title="Approve the Replit app for your GitHub organization">
        If the repository is owned by a GitHub organization, open [https://github.com/settings/applications](https://github.com/settings/applications), find the Replit OAuth app, and grant it access to the organization under the third-party application access settings. Organization admins may need to perform this step if you are not an org owner.
      </Step>

      <Step title="Retry the import">
        Open [replit.com/import](https://replit.com/import) and try the import again, both from the repository dropdown and by pasting the repository URL.
      </Step>
    </Steps>
  </Tab>

  <Tab title="ZIP">
    ⏰ *Estimated time: three minutes*

    Import a local project by uploading a `.zip` file.

    **Before you start**

    * A `.zip` file that contains your project
    * A clear project root folder in the archive
    * A Replit account

    **Steps**

    1. Open [replit.com/import](https://replit.com/import).
    2. Select **ZIP**.
    3. Upload your `.zip` file.
    4. Add any requested secrets and environment variables.
    5. Select **Import**.

    **What gets imported**

    * Project files and directory structure
    * Dependency files
    * Run and build defaults for Replit

    **What is not imported**

    * Existing environment variable values
    * Custom domains
    * Platform-specific services that need manual setup
    * Existing database data
    * Existing third-party connector configuration

    ## Configure and run your app

    During import, {setupDescription_5}. If your app needs changes, use these Project Editor tools:

    * **[Agent](/features/agent/overview)**: Refine features, debug issues, and make code changes
    * **[Secrets](/core-concepts/project-editor/app-setup/secrets)**: Add API keys and environment variables
    * **[Workflows](/features/workspace-tools/workflows)**: Set the **Run** command for your app

    ## Continue your journey

    Now that you've imported your {platform_2} {projectType_2}, explore these next steps:

    * [Replit Agent](/features/agent/overview): Get help with feature work, debugging, and refactoring
    * [Replit Deployments](/learn/projects-and-artifacts/replit-deployments): Publish your app
    * [Collaborate](/build/invite-teammates): Build with teammates
  </Tab>
</Tabs>

## Other sources

### Bitbucket

* Paste a Bitbucket repository URL, or connect your Bitbucket account to search your repositories.
* Agent support during the import may be limited compared to GitHub-hosted projects.

### Spreadsheet

* Upload an Excel (`.xlsx`) or CSV file, or paste a public Google Sheets URL.
* Agent reads your spreadsheet structure and builds a full-stack app with a database seeded from your data.
* Includes a UI to view, search, and manage your records.

### Previous Agent export

* Re-import a previously exported Agent App from a GitHub repository.
* Replit preserves Agent-specific structure (code, database schema, backend functionality).
* Database values and secret values are not imported.

### Empty

* Start with a completely empty project — no Agent, no framework selection, and no scaffolding.
* Best for power users who want full control over project setup.

## Limitations

* Existing database data is not migrated.
* Some complex or proprietary dependencies may need manual setup.
* Large projects can take longer to process.

## Best practices

* Remove sensitive credentials before import.
* Keep your source project structure clean.
* Verify dependencies and run commands after import.
* Test core flows before publishing.

## Troubleshooting

If import fails, check these areas first:

* **Compatibility errors**: Verify required project files and supported frameworks.
* **Access errors**: Confirm repository or source permissions.
* **Processing errors**: Retry after simplifying project structure or reducing size.

If issues continue, visit the [Replit Community Hub](https://replit.com/community) or [contact Support](https://replit.com/support).

## Billing

Imports that require Agent migration work can consume credits. Credit usage depends on project complexity.
