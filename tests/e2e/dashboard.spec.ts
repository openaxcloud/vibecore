import { expect, test } from '@playwright/test';

async function authenticate(page: import('@playwright/test').Page) {
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const email = `e2e-${suffix}@local.test`;
  const response = await page.request.post(`${apiBaseUrl}/auth/register`, {
    data: {
      email,
      password: 'Password123!',
      name: 'E2E User',
      organizationName: `E2E Organization ${suffix}`,
    },
  });

  expect(response.ok(), await response.text()).toBeTruthy();
  const payload = (await response.json()) as { token: string; organization: { id: string } };

  await page.context().addCookies([
    {
      name: 'vc_session',
      value: payload.token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);

  return payload;
}

test('onboarding guides project setup', async ({ page }) => {
  await authenticate(page);
  await page.goto('/onboarding');
  await expect(page.getByRole('heading', { name: 'Onboarding' })).toBeVisible();
  await expect(page.locator('section').getByRole('link', { name: 'Create project' })).toBeVisible();
  await expect(page.getByText('Connect GitHub')).toBeVisible();
});

test('project creation exposes templates and import paths', async ({ page }) => {
  await authenticate(page);
  await page.goto('/projects/new');
  await expect(page.getByRole('heading', { name: 'Create project' })).toBeVisible();
  await expect(page.getByLabel('Project name')).toBeVisible();
  await expect(page.getByRole('link', { name: /Import GitHub/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Import zip/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Browse templates/ })).toHaveAttribute('href', '/dashboard/templates');
});

test('private templates create a project instead of opening the public gallery', async ({ page }) => {
  await authenticate(page);
  await page.goto('/dashboard/templates');
  await expect(page.getByRole('heading', { name: 'Templates' })).toBeVisible();
  await expect(page.getByText('Create production workspaces from curated starters')).toBeVisible();
  await page.getByRole('button', { name: 'Use template' }).first().click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/ide$/);
  await expect(page.getByRole('link', { name: 'Running' })).toBeVisible({ timeout: 15000 });
});

test('authenticated user area applies the global platform design system', async ({ page }) => {
  await authenticate(page);
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Dashboard|Projects|Welcome/ })).toBeVisible({ timeout: 30_000 });

  const theme = await page.evaluate(() => {
    const root = window.getComputedStyle(document.documentElement);
    const body = window.getComputedStyle(document.body);
    const interactive = document.createElement('button');
    interactive.textContent = 'Design probe';
    interactive.className = 'vc-button-solid';
    interactive.style.position = 'absolute';
    interactive.style.left = '-9999px';
    document.body.appendChild(interactive);
    const button = window.getComputedStyle(interactive);

    return {
      app: root.getPropertyValue('--vc-ide-bg-app').trim().toLowerCase(),
      panel: root.getPropertyValue('--vc-ide-bg-panel').trim().toLowerCase(),
      card: root.getPropertyValue('--vc-ide-bg-card').trim().toLowerCase(),
      hover: root.getPropertyValue('--vc-ide-bg-hover').trim().toLowerCase(),
      text: root.getPropertyValue('--vc-ide-text-primary').trim().toLowerCase(),
      action: root.getPropertyValue('--vc-ide-accent-action').trim().toLowerCase(),
      radiusButton: root.getPropertyValue('--vc-ui-radius-button').trim(),
      transitionHover: root.getPropertyValue('--vc-ui-transition-hover').trim(),
      bodyBackground: body.backgroundColor,
      bodyColor: body.color,
      buttonBackground: button.backgroundColor,
      buttonRadius: button.borderRadius,
    };
  });

  expect(theme).toMatchObject({
    app: '#0a0f1c',
    panel: '#0e1525',
    card: '#1a2030',
    hover: '#2b3245',
    text: '#f5f9fc',
    action: '#0099ff',
    radiusButton: '4px',
    transitionHover: '150ms ease-out',
    bodyBackground: 'rgb(10, 15, 28)',
    bodyColor: 'rgb(245, 249, 252)',
    buttonBackground: 'rgb(26, 32, 48)',
    buttonRadius: '4px',
  });
});

test('public templates stay marketing-only for anonymous visitors', async ({ page }) => {
  await page.goto('/templates');
  await expect(page.getByRole('heading', { name: 'Templates gallery' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in to use templates' })).toHaveAttribute('href', '/login');
  await expect(page.getByRole('link', { name: 'Sign in to use' }).first()).toHaveAttribute('href', '/login');
});

test('opens preserved Bolt IDE route for a project', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await authenticate(page);
  await page.goto('/projects/project_e2e/ide', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('link', { name: /Running|Building|Stopped|Crashed/ })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Agent', { exact: true })).toBeVisible();
  const agentPanel = page.getByRole('region', { name: 'AI agent' });
  await expect(agentPanel).toBeVisible();
  await expect(page.getByLabel('Resize AI agent panel')).toBeVisible();
  await expect(page.getByPlaceholder('Describe what you want to build...')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add a feature' })).toBeVisible();
  const agentMetrics = await agentPanel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return {
      position: style.position,
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      background: style.backgroundColor,
      borderRight: style.borderRightColor,
    };
  });
  expect(agentMetrics.position).toBe('fixed');
  expect(agentMetrics.left).toBe(0);
  expect(agentMetrics.top).toBe(36);
  expect(agentMetrics.width).toBe(420);
  expect(agentMetrics.background).toBe('rgb(14, 21, 37)');
  expect(agentMetrics.borderRight).toBe('rgb(26, 32, 48)');
  const workspaceMetrics = await page.locator('.bolt-project-workspace-shell').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return {
      position: style.position,
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      background: style.backgroundColor,
    };
  });
  expect(workspaceMetrics.position).toBe('absolute');
  expect(workspaceMetrics.top).toBe(36);
  expect(workspaceMetrics.left).toBe(420);
  expect(workspaceMetrics.width).toBe(620);
  expect(workspaceMetrics.height).toBe(864);
  expect(workspaceMetrics.background).toBe('rgb(10, 15, 28)');
  const tabBarMetrics = await page.locator('.bolt-project-tabbar').first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return {
      height: rect.height,
      background: style.backgroundColor,
      borderBottom: style.borderBottomColor,
      display: style.display,
    };
  });
  expect(tabBarMetrics.height).toBe(36);
  expect(tabBarMetrics.background).toBe('rgb(14, 21, 37)');
  expect(tabBarMetrics.borderBottom).toBe('rgb(26, 32, 48)');
  expect(tabBarMetrics.display).toBe('flex');
  await page.getByLabel('Open tool').first().click();
  const toolMenu = page.locator('.bolt-project-tool-menu').first();
  await expect(toolMenu).toBeVisible();
  const toolMenuMetrics = await toolMenu.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return {
      width: rect.width,
      maxHeight: style.maxHeight,
      background: style.backgroundColor,
      border: style.borderColor,
      borderRadius: style.borderRadius,
      padding: style.paddingTop,
    };
  });
  expect(toolMenuMetrics.width).toBe(320);
  expect(toolMenuMetrics.maxHeight).toBe('480px');
  expect(toolMenuMetrics.background).toBe('rgb(26, 32, 48)');
  expect(toolMenuMetrics.border).toBe('rgb(43, 50, 69)');
  expect(toolMenuMetrics.borderRadius).toBe('12px');
  expect(toolMenuMetrics.padding).toBe('8px');
  await expect(toolMenu.getByPlaceholder('Search tools and files...')).toBeVisible();
  await expect(toolMenu.locator('.bolt-project-tool-section', { hasText: 'RECENT FILES' })).toBeVisible();
  await expect(toolMenu.locator('.bolt-project-tool-section', { hasText: 'TOOLS' })).toBeVisible();
  await expect(toolMenu.getByRole('button', { name: /Files Browse project files/ })).toBeVisible();
  await expect(toolMenu.getByRole('button', { name: /Console Terminal/ })).toBeVisible();
  await expect(toolMenu.getByRole('button', { name: /Database SQL browser/ })).toBeVisible();
  await toolMenu.getByRole('button', { name: /Database SQL browser/ }).click();
  await expect(page.locator('[data-testid="ide-service-panel"][data-panel="database"]').first()).toBeVisible({
    timeout: 15000,
  });
  await page.getByPlaceholder('Describe what you want to build...').fill('Open files');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Open Files' })).toBeVisible();
  await page.getByRole('region', { name: 'Open Files' }).getByRole('button', { name: /Open/ }).click();
  await expect(page.getByTestId('ide-files-panel-toggle')).toBeVisible();
  await expect(page.getByRole('link', { name: /Publish/ })).toBeVisible();
  await expect(page.getByTestId('ide-files-panel-toggle')).toBeVisible();
  const rightPanel = page.getByRole('complementary', { name: 'Right preview panel' });
  await expect(rightPanel).toBeVisible();
  const rightPanelMetrics = await rightPanel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return {
      position: style.position,
      top: rect.top,
      right: Math.round(window.innerWidth - rect.right),
      width: rect.width,
      height: rect.height,
      background: style.backgroundColor,
      borderLeft: style.borderLeftColor,
    };
  });
  expect(rightPanelMetrics.position).toBe('fixed');
  expect(rightPanelMetrics.top).toBe(36);
  expect(rightPanelMetrics.right).toBe(0);
  expect(rightPanelMetrics.width).toBe(400);
  expect(rightPanelMetrics.height).toBe((page.viewportSize()?.height ?? 720) - 36);
  expect(rightPanelMetrics.background).toBe('rgb(14, 21, 37)');
  expect(rightPanelMetrics.borderLeft).toBe('rgb(26, 32, 48)');
  await expect(rightPanel.getByRole('tab', { name: 'Webview' })).toBeVisible();
  await expect(rightPanel.getByRole('tab', { name: 'Console' })).toBeVisible();
  await expect(rightPanel.getByRole('tab', { name: 'Network' })).toBeVisible();
  await expect(page.getByLabel('Resize right panel')).toBeVisible();
  await rightPanel.getByLabel('Close right panel').click();
  await expect(rightPanel).toHaveCount(0);
  await expect(page.getByTestId('ide-files-panel-toggle')).toHaveAttribute('aria-label', 'Open right panel');
  await page.getByTestId('ide-files-panel-toggle').click();
  await expect(page.getByRole('complementary', { name: 'Right preview panel' })).toBeVisible();
});

test('IDE applies the full 2026 color theme tokens', async ({ page }) => {
  const auth = await authenticate(page);
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'IDE Theme Project' },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();
  const projectId = (await createProject.json()).project.id as string;

  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.bolt-project-ide-panels')).toBeVisible({ timeout: 30000 });

  const themeTokens = await page.locator('.bolt-project-ide-panels').evaluate((element) => {
    const style = window.getComputedStyle(element);
    const token = (name: string) => style.getPropertyValue(name).trim().toLowerCase();

    return {
      app: token('--vc-ide-bg-app'),
      panel: token('--vc-ide-bg-panel'),
      card: token('--vc-ide-bg-card'),
      hover: token('--vc-ide-bg-hover'),
      borderSubtle: token('--vc-ide-border-subtle'),
      borderVisible: token('--vc-ide-border-visible'),
      textPrimary: token('--vc-ide-text-primary'),
      textSecondary: token('--vc-ide-text-secondary'),
      textMuted: token('--vc-ide-text-muted'),
      aiStart: token('--vc-ide-accent-ai-start'),
      aiEnd: token('--vc-ide-accent-ai-end'),
      success: token('--vc-ide-accent-success'),
      action: token('--vc-ide-accent-action'),
      orange: token('--vc-ide-accent-orange'),
      error: token('--vc-ide-accent-error'),
      warning: token('--vc-ide-accent-warning'),
      actualBackground: style.backgroundColor,
      actualText: style.color,
    };
  });

  expect(themeTokens).toMatchObject({
    app: '#0a0f1c',
    panel: '#0e1525',
    card: '#1a2030',
    hover: '#2b3245',
    borderSubtle: '#1a2030',
    borderVisible: '#2b3245',
    textPrimary: '#f5f9fc',
    textSecondary: '#c2c8cc',
    textMuted: '#6e7681',
    aiStart: '#7b61ff',
    aiEnd: '#ff6b9d',
    success: '#3fb950',
    action: '#0099ff',
    orange: '#f26207',
    error: '#f85149',
    warning: '#d29922',
    actualBackground: 'rgb(10, 15, 28)',
    actualText: 'rgb(245, 249, 252)',
  });
});

test('IDE panels, agent input and feature tools keep the platform theme in light and dark modes', async ({ page }) => {
  test.setTimeout(180_000);
  const auth = await authenticate(page);
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'IDE Light Dark Coverage Project' },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();
  const projectId = (await createProject.json()).project.id as string;

  await page.goto(`/projects/${projectId}/ide?panel=database`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.bolt-project-ide-panels')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('[data-testid="ide-service-panel"][data-panel="database"]').first()).toBeVisible({
    timeout: 15_000,
  });
  const coreSelectors = {
    root: '.bolt-project-ide-panels',
    agent: '.bolt-project-agent-shell',
    agentHeader: '.bolt-project-agent-header',
    agentInput: '.bolt-project-chatbox',
    agentTextarea: '.bolt-project-chatbox textarea',
    iconButton: '.bolt-project-ide-icon-button',
    workspace: '.bolt-project-workspace-shell',
    tabbar: '.bolt-project-tabbar',
    databasePanel: '[data-testid="ide-service-panel"][data-panel="database"]',
    rightPanel: '.bolt-project-right-panel-shell',
    rightTabs: '.bolt-project-right-tabs',
    statusbar: '.bolt-project-statusbar',
  };

  async function readIdeTheme(theme: 'light' | 'dark') {
    await page.evaluate((nextTheme) => {
      document.documentElement.setAttribute('data-theme', nextTheme);
    }, theme);
    await page.waitForTimeout(100);

    return page.locator('.bolt-project-ide-panels').evaluate((rootElement, selectorMap) => {
      const read = (selector: string) => {
        const element = document.querySelector(selector);

        if (!element) {
          return { missing: selector };
        }

        const style = window.getComputedStyle(element);

        return {
          background: style.backgroundColor,
          color: style.color,
          borderColor: style.borderColor,
          borderRightColor: style.borderRightColor,
          borderBottomColor: style.borderBottomColor,
          borderTopColor: style.borderTopColor,
          borderLeftColor: style.borderLeftColor,
          borderRadius: style.borderRadius,
          fontSize: style.fontSize,
        };
      };
      const rootStyle = window.getComputedStyle(rootElement);

      return {
        tokens: {
          app: rootStyle.getPropertyValue('--vc-ide-bg-app').trim().toLowerCase(),
          panel: rootStyle.getPropertyValue('--vc-ide-bg-panel').trim().toLowerCase(),
          card: rootStyle.getPropertyValue('--vc-ide-bg-card').trim().toLowerCase(),
          hover: rootStyle.getPropertyValue('--vc-ide-bg-hover').trim().toLowerCase(),
          text: rootStyle.getPropertyValue('--vc-ide-text-primary').trim().toLowerCase(),
          action: rootStyle.getPropertyValue('--vc-ide-accent-action').trim().toLowerCase(),
        },
        surfaces: Object.fromEntries(
          Object.entries(selectorMap as Record<string, string>).map(([key, selector]) => [key, read(selector)]),
        ) as Record<string, ReturnType<typeof read>>,
      };
    }, coreSelectors);
  }

  for (const theme of ['light', 'dark'] as const) {
    const snapshot = await readIdeTheme(theme);
    expect(
      Object.entries(snapshot.surfaces)
        .filter(([, value]) => 'missing' in value)
        .map(([key, value]) => `${key}:${value.missing}`),
    ).toEqual([]);
    expect(snapshot.tokens).toMatchObject({
      app: '#0a0f1c',
      panel: '#0e1525',
      card: '#1a2030',
      hover: '#2b3245',
      text: '#f5f9fc',
      action: '#0099ff',
    });
    expect(snapshot.surfaces.root).toMatchObject({
      background: 'rgb(10, 15, 28)',
      color: 'rgb(245, 249, 252)',
    });
    expect(snapshot.surfaces.agent.background).toBe('rgb(14, 21, 37)');
    expect(snapshot.surfaces.agent.borderRightColor).toBe('rgb(26, 32, 48)');
    expect(snapshot.surfaces.agentHeader.background).toBe('rgb(14, 21, 37)');
    expect(snapshot.surfaces.agentInput.background).toBe('rgb(26, 32, 48)');
    expect(snapshot.surfaces.agentInput.borderColor).toBe('rgb(43, 50, 69)');
    expect(snapshot.surfaces.agentTextarea.color).toBe('rgb(245, 249, 252)');
    expect(snapshot.surfaces.iconButton.borderRadius).toBe('4px');
    expect(snapshot.surfaces.workspace.background).toBe('rgb(10, 15, 28)');
    expect(snapshot.surfaces.tabbar.background).toBe('rgb(14, 21, 37)');
    expect(snapshot.surfaces.tabbar.borderBottomColor).toBe('rgb(26, 32, 48)');
    expect(snapshot.surfaces.databasePanel.background).toBe('rgb(10, 15, 28)');
    expect(snapshot.surfaces.rightPanel.background).toBe('rgb(14, 21, 37)');
    expect(snapshot.surfaces.rightPanel.borderLeftColor).toBe('rgb(26, 32, 48)');
    expect(snapshot.surfaces.rightTabs.background).toBe('rgb(14, 21, 37)');
    expect(snapshot.surfaces.statusbar.background).toBe('rgb(14, 21, 37)');
    expect(snapshot.surfaces.statusbar.color).toBe('rgb(194, 200, 204)');
  }

});

test('platform typography tokens apply to the web IDE', async ({ page }) => {
  const auth = await authenticate(page);
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'IDE Typography Project' },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();
  const projectId = (await createProject.json()).project.id as string;

  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.bolt-project-ide-panels')).toBeVisible({ timeout: 30000 });
  await page.locator('.bolt-project-tool-popover:visible').first().getByLabel('Open tool').click();
  const toolMenu = page.locator('.bolt-project-tool-menu:visible').first();
  await expect(toolMenu).toBeVisible();
  await expect(toolMenu.locator('.bolt-project-tool-section').first()).toBeVisible();

  const typography = await page.locator('.bolt-project-ide-panels').evaluate((element) => {
    const codeSample = document.createElement('code');
    codeSample.textContent = 'const value = 1;';
    codeSample.style.position = 'absolute';
    codeSample.style.left = '-9999px';
    codeSample.setAttribute('data-testid', 'typography-code-sample');
    element.appendChild(codeSample);
    const root = window.getComputedStyle(document.documentElement);
    const shell = window.getComputedStyle(element);
    const heading = window.getComputedStyle(element.querySelector('.bolt-project-welcome h2')!);
    const label = window.getComputedStyle(document.querySelector('.bolt-project-tool-menu .bolt-project-tool-section')!);
    const code = window.getComputedStyle(codeSample);

    return {
      interfaceFont: root.getPropertyValue('--vc-font-interface').trim(),
      codeFont: root.getPropertyValue('--vc-font-code').trim(),
      interfaceSize: root.getPropertyValue('--vc-type-interface-size').trim(),
      codeSize: root.getPropertyValue('--vc-type-code-size').trim(),
      headingSize: root.getPropertyValue('--vc-type-heading-size').trim(),
      labelSize: root.getPropertyValue('--vc-type-label-size').trim(),
      labelTracking: root.getPropertyValue('--vc-type-label-letter-spacing').trim(),
      shellFont: shell.fontFamily,
      shellSize: shell.fontSize,
      shellLineHeight: shell.lineHeight,
      headingSizeActual: heading.fontSize,
      headingWeight: heading.fontWeight,
      labelSizeActual: label.fontSize,
      labelWeight: label.fontWeight,
      labelTrackingActual: label.letterSpacing,
      codeFontActual: code.fontFamily,
      codeSizeActual: code.fontSize,
      codeLigaturesActual: code.fontVariantLigatures,
    };
  });

  expect(typography.interfaceFont).toContain('Inter');
  expect(typography.codeFont).toContain('JetBrains Mono');
  expect(typography.interfaceSize).toBe('13px');
  expect(typography.codeSize).toBe('13px');
  expect(typography.headingSize).toBe('15px');
  expect(typography.labelSize).toBe('11px');
  expect(typography.labelTracking).toBe('0.4px');
  expect(typography.shellFont).toContain('Inter');
  expect(typography.shellSize).toBe('13px');
  expect(Number.parseFloat(typography.shellLineHeight)).toBeCloseTo(19.5, 1);
  expect(typography.headingSizeActual).toBe('15px');
  expect(typography.headingWeight).toBe('600');
  expect(typography.labelSizeActual).toBe('11px');
  expect(typography.labelWeight).toBe('500');
  expect(typography.labelTrackingActual).toBe('0.4px');
  expect(typography.codeFontActual).toContain('JetBrains Mono');
  expect(typography.codeSizeActual).toBe('13px');
  expect(typography.codeLigaturesActual).toContain('common-ligatures');
});

test('IDE applies section 12 UI detail styles', async ({ page }) => {
  const auth = await authenticate(page);
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'IDE UI Details Project' },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();
  const projectId = (await createProject.json()).project.id as string;

  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.bolt-project-ide-panels')).toBeVisible({ timeout: 30000 });
  await page.locator('.bolt-project-tool-popover:visible').first().getByLabel('Open tool').click();
  const toolMenu = page.locator('.bolt-project-tool-menu:visible').first();
  await expect(toolMenu).toBeVisible();
  const details = await toolMenu.evaluate((menu) => {
    const root = window.getComputedStyle(document.documentElement);
    const toolMenuStyle = window.getComputedStyle(menu);
    const tabActionElement = document.querySelector('.bolt-project-tab-action');
    const tabAction = tabActionElement ? window.getComputedStyle(tabActionElement) : null;
    const terminalHandleElement = document.querySelector('.bolt-project-terminal-resize-handle');
    const terminalHandle = terminalHandleElement ? window.getComputedStyle(terminalHandleElement) : null;

    return {
      radiusButton: root.getPropertyValue('--vc-ui-radius-button').trim(),
      radiusModal: root.getPropertyValue('--vc-ui-radius-modal').trim(),
      radiusPopover: root.getPropertyValue('--vc-ui-radius-popover').trim(),
      shadowXl: root.getPropertyValue('--vc-ui-shadow-xl').trim(),
      focusRing: root.getPropertyValue('--vc-ui-focus-ring').trim().toLowerCase(),
      toolMenuRadius: toolMenuStyle.borderRadius,
      toolMenuShadow: toolMenuStyle.boxShadow,
      toolMenuBackdrop: toolMenuStyle.backdropFilter || toolMenuStyle.getPropertyValue('-webkit-backdrop-filter'),
      tabActionRadius: tabAction?.borderRadius ?? '',
      tabActionDuration: tabAction?.transitionDuration ?? '',
      terminalHandleDuration: terminalHandle?.transitionDuration ?? '',
      terminalHandleTiming: terminalHandle?.transitionTimingFunction ?? '',
    };
  });

  expect(details.radiusButton).toBe('4px');
  expect(details.radiusModal).toBe('8px');
  expect(details.radiusPopover).toBe('12px');
  expect(details.shadowXl).toBe('0 24px 64px rgb(0 4 20 / 0.7)');
  expect(details.focusRing).toBe('#0099ff');
  expect(details.toolMenuRadius).toBe('12px');
  expect(details.toolMenuShadow).toBe('rgba(0, 4, 20, 0.7) 0px 24px 64px 0px');
  expect(details.toolMenuBackdrop).toContain('blur(12px)');
  expect(details.tabActionRadius).toBe('4px');
  expect(details.tabActionDuration).toContain('0.15s');
  if (details.terminalHandleDuration) {
    expect(details.terminalHandleDuration).toContain('0.15s');
    expect(details.terminalHandleTiming).toContain('ease-out');
  }
});

test('IDE project services open as in-place panels instead of legacy project pages', async ({ page }) => {
  test.setTimeout(120_000);
  const auth = await authenticate(page);
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'IDE Panel Project' },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();
  const projectId = (await createProject.json()).project.id as string;

  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('link', { name: /Publish/ })).toBeVisible({ timeout: 30000 });

  async function openIdeTool(name: RegExp) {
    await page.getByLabel('Open tool').first().click();
    const toolMenu = page.locator('.bolt-project-tool-menu:visible').last();
    await expect(toolMenu).toBeVisible();
    const item = toolMenu.getByRole('button', { name }).first();
    await expect(item).toBeVisible();
    await item.evaluate((element) => (element as HTMLButtonElement).click());
  }

  await openIdeTool(/Snapshots/);
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/ide\\?panel=snapshots$`));
  await expect(page.locator('[data-testid="ide-service-panel"][data-panel="snapshots"]')).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole('tab', { name: /Snapshots/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Snapshots' })).toBeVisible();
  await page.getByPlaceholder('Manual checkpoint').fill('E2E checkpoint');
  await page.getByRole('button', { name: 'Create snapshot' }).click();
  await expect(page.getByText('E2E checkpoint', { exact: true }).first()).toBeVisible({ timeout: 15000 });

  await openIdeTool(/Deployments/);
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/ide\\?panel=deployments$`));
  await expect(page.locator('[data-testid="ide-service-panel"][data-panel="deployments"]')).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole('tab', { name: /Snapshots/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Deploy/ }).first()).toBeVisible();

  const statusbar = page.locator('.bolt-project-statusbar');
  await expect(statusbar).toBeVisible();
  const statusbarMetrics = await statusbar.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const leftGroup = element.querySelector('div')!;
    const leftGroupStyle = window.getComputedStyle(leftGroup);
    const icon = element.querySelector('[class*="i-ph:"]')!;
    const iconRect = icon.getBoundingClientRect();

    return {
      position: style.position,
      bottom: Math.round(window.innerHeight - rect.bottom),
      left: rect.left,
      width: rect.width,
      height: rect.height,
      background: style.backgroundColor,
      borderTop: style.borderTopColor,
      paddingLeft: style.paddingLeft,
      paddingRight: style.paddingRight,
      fontSize: style.fontSize,
      gap: leftGroupStyle.gap,
      iconWidth: iconRect.width,
      iconHeight: iconRect.height,
    };
  });
  expect(statusbarMetrics.position).toBe('fixed');
  expect(statusbarMetrics.bottom).toBe(0);
  expect(statusbarMetrics.left).toBe(420);
  expect(statusbarMetrics.width).toBe(860);
  expect(statusbarMetrics.height).toBe(24);
  expect(statusbarMetrics.background).toBe('rgb(14, 21, 37)');
  expect(statusbarMetrics.borderTop).toBe('rgb(26, 32, 48)');
  expect(statusbarMetrics.paddingLeft).toBe('12px');
  expect(statusbarMetrics.paddingRight).toBe('12px');
  expect(statusbarMetrics.fontSize).toBe('11px');
  expect(statusbarMetrics.gap).toBe('12px');
  expect(statusbarMetrics.iconWidth).toBe(12);
  expect(statusbarMetrics.iconHeight).toBe(12);
  await expect(statusbar).toContainText(/main|stable/);
  await expect(statusbar).toContainText(/↑\d+ ↓\d+/);
  await expect(statusbar).toContainText('Ln 1, Col 1');
  await expect(statusbar).toContainText('Spaces: 2');
  await expect(statusbar).toContainText('UTF-8');
  await expect(statusbar).toContainText('Project');
  const workspaceStatusButton = statusbar.getByRole('button', { name: /Running on|Building|Crashed|Stopped/ });
  await expect(workspaceStatusButton).toBeVisible();
  await workspaceStatusButton.click();
  await expect(page.getByRole('tab', { name: /Webview/ }).first()).toBeVisible({ timeout: 15000 });
  const webviewToolbar = page.locator('.bolt-project-webview-toolbar').first();
  await expect(webviewToolbar).toBeVisible();
  const webviewToolbarMetrics = await webviewToolbar.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return { height: rect.height, background: style.backgroundColor, borderBottom: style.borderBottomColor };
  });
  expect(webviewToolbarMetrics.height).toBe(36);
  expect(webviewToolbarMetrics.background).toBe('rgb(14, 21, 37)');
  expect(webviewToolbarMetrics.borderBottom).toBe('rgb(26, 32, 48)');
  await expect(webviewToolbar.getByRole('button', { name: 'Back' })).toBeVisible();
  await expect(webviewToolbar.getByRole('button', { name: 'Forward' })).toBeVisible();
  await expect(webviewToolbar.getByRole('button', { name: 'Refresh preview' })).toBeVisible();
  await expect(webviewToolbar.getByRole('combobox', { name: 'Preview device' })).toBeVisible();

  await openIdeTool(/Files/);
  const filesHeader = page.locator('.bolt-project-files-header');
  await expect(filesHeader).toBeVisible();
  const filesHeaderMetrics = await filesHeader.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return { height: rect.height, background: style.backgroundColor, borderBottom: style.borderBottomColor };
  });
  expect(filesHeaderMetrics.height).toBe(32);
  expect(filesHeaderMetrics.borderBottom).toBe('rgb(26, 32, 48)');
  await expect(filesHeader.getByRole('button', { name: 'New file' })).toBeVisible();
  await expect(filesHeader.getByRole('button', { name: 'New folder' })).toBeVisible();
  await expect(filesHeader.getByRole('button', { name: 'Refresh files' })).toBeVisible();
  await expect(filesHeader.getByRole('button', { name: 'Collapse all files' })).toBeVisible();

  await openIdeTool(/Console/);
  const consolePanel = page.locator('[data-testid="ide-service-panel"][data-panel="logs"]').first();
  await expect(consolePanel.locator('.bolt-project-console-header')).toBeVisible({ timeout: 15000 });
  await expect(consolePanel.getByRole('combobox', { name: 'Shell' })).toBeVisible();
  await expect(consolePanel.getByRole('button', { name: 'Clear' })).toBeVisible();
  await expect(consolePanel.getByRole('button', { name: 'Split' })).toBeVisible();
  const consoleBodyMetrics = await consolePanel.locator('.bolt-project-console-body').evaluate((element) => {
    const style = window.getComputedStyle(element);

    return { background: style.backgroundColor, fontSize: style.fontSize, fontFamily: style.fontFamily };
  });
  expect(consoleBodyMetrics.background).toBe('rgb(10, 15, 28)');
  expect(consoleBodyMetrics.fontSize).toBe('13px');

  await openIdeTool(/Database/);
  const databasePanel = page.locator('[data-testid="ide-service-panel"][data-panel="database"]').first();
  await expect(databasePanel.locator('.bolt-project-database-tool')).toBeVisible({ timeout: 15000 });
  await expect(databasePanel.getByText('Tables')).toBeVisible();
  await expect(databasePanel.getByRole('button', { name: 'Editor' })).toBeVisible();
  await expect(databasePanel.getByRole('button', { name: 'Browse' })).toBeVisible();
  await expect(databasePanel.getByRole('button', { name: 'Schema' })).toBeVisible();
  await expect(databasePanel.getByRole('button', { name: 'Run' })).toBeVisible();

  await openIdeTool(/Secrets/);
  const secretsPanel = page.locator('[data-testid="ide-service-panel"][data-panel="secrets"]').first();
  await expect(secretsPanel.locator('.bolt-project-secrets-tool')).toBeVisible({ timeout: 15000 });
  await expect(secretsPanel.getByRole('button', { name: '+ New secret' })).toBeVisible();

  await openIdeTool(/Git/);
  const gitPanel = page.locator('[data-testid="ide-service-panel"][data-panel="git"]').first();
  await expect(gitPanel.locator('.bolt-project-git-tool')).toBeVisible({ timeout: 15000 });
  await expect(gitPanel.getByRole('heading', { name: 'Changes' })).toBeVisible();
  await expect(gitPanel.getByRole('heading', { name: 'Staged' })).toBeVisible();
  await expect(gitPanel.getByRole('heading', { name: 'History' })).toBeVisible();
  await expect(gitPanel.getByRole('button', { name: 'Commit & Push' })).toBeVisible();

  await page.getByLabel('Split right').first().click();
  await expect(page.locator('.bolt-project-pane-leaf')).toHaveCount(2);
  await page.getByLabel('Split down').first().click();
  await expect(page.locator('.bolt-project-pane-leaf')).toHaveCount(3);
  const splitHandles = page.locator('.bolt-project-ide-resize-handle:not(.bolt-project-ide-resize-handle-vertical)');
  await expect(splitHandles.first()).toBeVisible();
  const handleMetrics = await splitHandles.first().evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return {
      width: rect.width,
      background: style.backgroundColor,
      cursor: style.cursor,
    };
  });
  expect(handleMetrics.width).toBe(4);
  expect(handleMetrics.background).toBe('rgba(0, 0, 0, 0)');
  expect(handleMetrics.cursor).toBe('col-resize');
  await expect(page.locator('.bolt-project-drop-zones').first()).toBeVisible();
  const dropMetrics = await page.locator('.bolt-project-drop-zones').first().evaluate((element) => {
    const host = element.getBoundingClientRect();
    const center = element.querySelector('.bolt-project-drop-zone-center')!.getBoundingClientRect();
    const left = element.querySelector('.bolt-project-drop-zone-left')!.getBoundingClientRect();
    const right = element.querySelector('.bolt-project-drop-zone-right')!.getBoundingClientRect();
    const top = element.querySelector('.bolt-project-drop-zone-top')!.getBoundingClientRect();
    const bottom = element.querySelector('.bolt-project-drop-zone-bottom')!.getBoundingClientRect();

    return {
      centerWidthRatio: Math.round((center.width / host.width) * 100),
      centerHeightRatio: Math.round((center.height / host.height) * 100),
      leftWidthRatio: Math.round((left.width / host.width) * 100),
      rightWidthRatio: Math.round((right.width / host.width) * 100),
      topHeightRatio: Math.round((top.height / host.height) * 100),
      bottomHeightRatio: Math.round((bottom.height / host.height) * 100),
    };
  });
  expect(dropMetrics.centerWidthRatio).toBe(40);
  expect(dropMetrics.centerHeightRatio).toBe(40);
  expect(dropMetrics.leftWidthRatio).toBe(15);
  expect(dropMetrics.rightWidthRatio).toBe(15);
  expect(dropMetrics.topHeightRatio).toBe(15);
  expect(dropMetrics.bottomHeightRatio).toBe(15);
  await page.locator('.bolt-project-tab').first().click({ button: 'right' });
  await expect(page.getByRole('button', { name: 'Move to new pane right' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move to new pane down' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move to new pane left' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Move to new pane up' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Move to existing pane/ }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Move to new pane down' }).click();
  await expect(page.locator('.bolt-project-pane-leaf')).toHaveCount(4);
  await page.getByLabel('Tab actions').first().click();
  await page.getByRole('button', { name: 'Close to right' }).first().click();
  await expect(page.getByRole('tab', { name: /Deploy/ }).first()).toBeVisible();

  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+J' : 'Control+J');
  const pinnedTerminal = page.getByRole('region', { name: 'Pinned terminal' });
  await expect(pinnedTerminal).toBeVisible();
  await expect(page.getByLabel('Resize pinned terminal')).toBeVisible();
  const terminalMetrics = await pinnedTerminal.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const tabbar = element.querySelector('.bolt-project-bottom-terminal-tabs')!;
    const tabbarRect = tabbar.getBoundingClientRect();
    const tabbarStyle = window.getComputedStyle(tabbar);

    return {
      height: rect.height,
      borderTop: style.borderTopColor,
      background: style.backgroundColor,
      tabbarHeight: tabbarRect.height,
      tabbarBackground: tabbarStyle.backgroundColor,
    };
  });
  expect(terminalMetrics.height).toBe(240);
  expect(terminalMetrics.borderTop).toBe('rgb(26, 32, 48)');
  expect(terminalMetrics.background).toBe('rgb(10, 15, 28)');
  expect(terminalMetrics.tabbarHeight).toBe(32);
  expect(terminalMetrics.tabbarBackground).toBe('rgb(14, 21, 37)');
  await expect(pinnedTerminal.getByRole('button', { name: 'Terminal', exact: true })).toBeVisible();
  await expect(pinnedTerminal.getByRole('button', { name: 'Output' })).toBeVisible();
  await expect(pinnedTerminal.getByRole('button', { name: 'Problems' })).toBeVisible();
  await expect(pinnedTerminal.getByRole('button', { name: 'Debug Console' })).toBeVisible();
  await expect(pinnedTerminal.getByRole('button', { name: 'New terminal' })).toBeVisible();
  await pinnedTerminal.getByRole('button', { name: 'Output' }).click();
  await expect(pinnedTerminal.getByText('output stream is connected through workspace logs.')).toBeVisible();
  await page.getByLabel('Toggle terminal').click();
  await expect(pinnedTerminal).toBeHidden();
  await page.getByLabel('Toggle terminal').click();
  await expect(pinnedTerminal).toBeVisible();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  await expect(page.getByLabel('Command palette')).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: /Snapshots/ }).click();
  await expect(page.locator('[data-testid="ide-service-panel"][data-panel="snapshots"]')).toBeVisible();

  const inIdePanels = [
    ['Overview', 'overview'],
    ['Database', 'database'],
    ['Object Storage', 'object-storage'],
    ['Packages', 'packages'],
    ['Monitoring', 'monitoring'],
    ['Extensions', 'extensions'],
    ['Env vars', 'env'],
    ['Secrets', 'secrets'],
    ['Git', 'git'],
    ['Activity', 'activity'],
    ['Console', 'logs'],
    ['Collaborators', 'collaborators'],
    ['Domains', 'domains'],
  ] as const;

  for (const [label, panel] of inIdePanels) {
    await openIdeTool(new RegExp(label));
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/ide\\?panel=${panel}$`));
    await expect(page.locator(`[data-testid="ide-service-panel"][data-panel="${panel}"]`).first()).toBeVisible({
      timeout: 15000,
    });
  }

  await openIdeTool(/Settings/);
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/ide\\?panel=settings$`));
  await expect(page.locator('[data-testid="ide-service-panel"][data-panel="settings"]')).toBeVisible({
    timeout: 15000,
  });

  await openIdeTool(/Env vars/);
  await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/ide\\?panel=env$`));
  await expect(page.locator('[data-testid="ide-service-panel"][data-panel="env"]')).toBeVisible();
  await page.getByPlaceholder('VITE_API_URL').fill('E2E_FLAG');
  await page.getByPlaceholder('https://api.example.com').fill('enabled');
  await page.getByRole('button', { name: 'Save variable' }).click();
  await expect(
    page.locator('[data-testid="ide-service-panel"][data-panel="env"]').filter({ hasText: 'E2E_FLAG' }).last(),
  ).toBeVisible({ timeout: 15000 });

  await openIdeTool(/Database/);
  await page.getByPlaceholder('postgres://user:pass@host:5432/db').fill('postgres://local/test');
  await page.locator('[data-testid="ide-service-panel"][data-panel="database"]').getByRole('button', { name: 'Run' }).click();
  await expect(page.locator('[data-testid="ide-service-panel"][data-panel="database"]')).toContainText('DATABASE_URL', {
    timeout: 15000,
  });

  const exportResponse = await page.request.get(`/api/projects/${projectId}/project-action?intent=export`);
  expect(exportResponse.ok(), await exportResponse.text()).toBeTruthy();
  expect(exportResponse.headers()['content-type']).toContain('application/zip');

  expect(page.url()).not.toContain('/snapshots');
  expect(page.url()).not.toContain('/deployments');
  expect(page.url()).not.toContain('/env-vars');
});

test('edit file workflow surfaces editor, files, terminal and preview affordances', async ({ page }) => {
  await authenticate(page);
  await page.goto('/projects/project_e2e/ide', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('link', { name: 'Running' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('link', { name: /Publish/ })).toBeVisible();
  await expect(page.getByText('Bienvenue dans votre projet')).toBeVisible();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+T' : 'Control+T');
  await expect(page.getByLabel('Command palette')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+P' : 'Control+P');
  await expect(page.getByLabel('Command palette')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  const commandPalette = page.getByLabel('Command palette');
  await expect(commandPalette).toBeVisible();
  const commandPaletteMetrics = await page.locator('.bolt-project-command-palette').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);

    return {
      top: rect.top,
      width: rect.width,
      background: style.backgroundColor,
      borderRadius: style.borderRadius,
    };
  });
  expect(commandPaletteMetrics.top).toBe(120);
  expect(commandPaletteMetrics.width).toBe(600);
  expect(commandPaletteMetrics.background).toBe('rgb(26, 32, 48)');
  expect(commandPaletteMetrics.borderRadius).toBe('12px');
  await expect(page.locator('.bolt-project-command-section', { hasText: 'Files' })).toBeVisible();
  await expect(page.locator('.bolt-project-command-section', { hasText: 'Tools' })).toBeVisible();
  await expect(page.locator('.bolt-project-command-section', { hasText: 'Commands' })).toBeVisible();
  await expect(page.locator('.bolt-project-command-palette footer')).toContainText('↑↓ navigate');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('ide-files-panel-toggle')).toBeVisible();
});

test('reopens project IDE with persisted agent memory and panel state', async ({ page, isMobile }) => {
  const auth = await authenticate(page);
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';
  const marker = `Persisted enterprise memory ${Date.now()}`;
  const createProject = await page.request.post(`${apiBaseUrl}/orgs/${auth.organization.id}/projects`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: { name: 'Memory Project' },
  });

  expect(createProject.ok(), await createProject.text()).toBeTruthy();
  const projectId = (await createProject.json()).project.id as string;
  const saveState = await page.request.put(`${apiBaseUrl}/projects/${projectId}/ide-state`, {
    headers: { authorization: `Bearer ${auth.token}` },
    data: {
      state: {
        chat: {
          id: `project:${projectId}`,
          description: 'Persistent project agent',
          messages: [{ id: 'memory-user-message', role: 'user', content: marker }],
        },
        ui: {
          currentView: 'preview',
          rightPanel: 'network',
          rightPanelOpen: true,
          rightPanelWidth: 512,
          showWorkbench: true,
          agentWidth: 520,
          terminalBottomOpen: true,
          terminalBottomHeight: 320,
          activePaneId: 'pane-main',
          activeWorkspacePanel: 'snapshots',
          paneTree: {
            type: 'leaf',
            id: 'pane-main',
            tabs: [
              { id: 'tab-files-persisted', panel: 'files' },
              { id: 'tab-snapshots-persisted', panel: 'snapshots' },
            ],
            activeTabId: 'tab-snapshots-persisted',
          },
          cursorPositions: { '/home/project/src/App.tsx': { line: 42, column: 7, offset: 900 } },
          scrollPositions: { 'pane-main': 88 },
          recentTabIds: ['tab-snapshots-persisted', 'tab-files-persisted'],
          closedTabs: [{ id: 'tab-logs-closed', panel: 'logs' }],
        },
      },
    },
  });

  expect(saveState.ok(), await saveState.text()).toBeTruthy();
  await page.goto(`/projects/${projectId}/ide`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('link', { name: 'Running' })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(marker)).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('tab', { name: 'Snapshots' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('[data-testid="ide-service-panel"][data-panel="snapshots"]')).toBeVisible({
    timeout: 15000,
  });

  const persistedLocalState = await page.evaluate((id) => {
    const raw = localStorage.getItem(`vibecore.projectIdeMemory:${id}`);

    return raw ? JSON.parse(raw) : null;
  }, projectId);

  expect(persistedLocalState?.chat?.messages?.[0]?.content).toBe(marker);
  expect(persistedLocalState?.ui?.paneTree?.activeTabId).toBe('tab-snapshots-persisted');
  expect(persistedLocalState?.ui?.agentWidth).toBe(520);
  expect(persistedLocalState?.ui?.terminalBottomHeight).toBe(320);
  expect(persistedLocalState?.ui?.cursorPositions?.['/home/project/src/App.tsx']).toEqual({
    line: 42,
    column: 7,
    offset: 900,
  });

  if (!isMobile) {
    await expect(page.getByRole('tab', { name: 'Network' })).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('.bolt-project-bottom-terminal-shell')).toBeVisible();
    const persistedMetrics = await page.locator('.bolt-project-ide-panels').evaluate((element) => {
      const style = window.getComputedStyle(element);

      return {
        agentWidth: style.getPropertyValue('--project-agent-width').trim(),
        rightPanelWidth: style.getPropertyValue('--project-right-panel-width').trim(),
      };
    });
    expect(persistedMetrics.agentWidth).toBe('520px');
    expect(persistedMetrics.rightPanelWidth).toBe('512px');
  }
});

test('billing upgrade flow is reachable without frontend-only quota bypass', async ({ page }) => {
  await authenticate(page);
  await page.goto('/billing');
  await expect(page.getByRole('heading', { name: 'Billing overview' })).toBeVisible();
  await page.getByRole('link', { name: 'Upgrade' }).click();
  await expect(page.getByRole('heading', { name: 'Upgrade' })).toBeVisible();
});

test('authenticated users can sign out from the app shell', async ({ page }) => {
  const auth = await authenticate(page);
  const apiBaseUrl = process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001';

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).first().click();
  await expect(page).toHaveURL('/login');
  await expect(page.getByRole('heading', { name: 'Login' })).toBeVisible();

  const cookies = await page.context().cookies('http://localhost:5173');
  expect(cookies.some((cookie) => cookie.name === 'vc_session')).toBe(false);

  const me = await page.request.get(`${apiBaseUrl}/auth/me`, {
    headers: { authorization: `Bearer ${auth.token}` },
  });
  expect(me.status()).toBe(401);
});

test('public and authenticated routes render without route errors', async ({ page }) => {
  test.setTimeout(75_000);

  const publicRoutes = [
    '/',
    '/pricing',
    '/docs',
    '/templates',
    '/changelog',
    '/status',
    '/contact-sales',
    '/security',
    '/privacy',
    '/terms',
    '/acceptable-use',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/verify-email',
  ];

  for (const route of publicRoutes) {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), `${route} should not return an HTTP error`).toBeLessThan(400);
    await expect(page.getByText(/Application Error|Unable to load section|Failed to fetch/i)).toHaveCount(0);
  }

  const auth = await authenticate(page);
  const createProject = await page.request.post(
    `${process.env.SAAS_API_URL ?? process.env.API_BASE_URL ?? 'http://127.0.0.1:3001'}/orgs/${auth.organization.id}/projects`,
    {
      headers: { authorization: `Bearer ${auth.token}` },
      data: { name: 'Route Audit Project' },
    },
  );

  expect(createProject.ok(), await createProject.text()).toBeTruthy();
  const projectId = (await createProject.json()).project.id as string;
  const authenticatedRoutes = [
    '/dashboard',
    '/projects',
    '/projects/new',
    '/dashboard/templates',
    '/recent-projects',
    '/usage',
    '/billing',
    '/organization-members',
    '/invitations',
    '/account-settings',
    '/security-settings',
    '/api-keys',
    '/connected-accounts',
    '/notifications',
    '/support',
    '/command-palette',
    '/organization-switcher',
    '/roles-and-permissions',
    '/session-security',
    '/enterprise-sso-settings',
    '/scim-token-settings',
    '/audit-logs',
    `/projects/${projectId}`,
    `/projects/${projectId}/ide`,
    `/projects/${projectId}/settings`,
    `/projects/${projectId}/env`,
    `/projects/${projectId}/secrets`,
    `/projects/${projectId}/collaborators`,
    `/projects/${projectId}/snapshots`,
    `/projects/${projectId}/deployments`,
    `/projects/${projectId}/domains`,
    `/projects/${projectId}/logs`,
    `/projects/${projectId}/activity`,
    `/projects/${projectId}/git`,
  ];

  for (const route of authenticatedRoutes) {
    const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
    expect(response?.status(), `${route} should not return an HTTP error`).toBeLessThan(400);
    await expect(page.getByText(/Application Error|Unable to load section|Failed to fetch/i)).toHaveCount(0);
  }
});

test('command palette entries navigate to real product routes', async ({ page }) => {
  await authenticate(page);
  await page.goto('/command-palette');
  await page.getByRole('link', { name: /Import GitHub repository/ }).click();
  await expect(page).toHaveURL('/import-github');
  await expect(page.getByRole('heading', { name: 'Import GitHub' })).toBeVisible();
});
