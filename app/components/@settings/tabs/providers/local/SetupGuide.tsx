import {
  Cpu,
  Server,
  Settings,
  ExternalLink,
  Package,
  Code,
  Database,
  CheckCircle,
  AlertCircle,
  Activity,
  Cable,
  ArrowLeft,
  Download,
  Shield,
  Globe,
  Terminal,
  Monitor,
  Wifi,
} from 'lucide-react';
import React from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/components/ui/Button';
import { Card, CardContent, CardHeader } from '~/components/ui/Card';

const settingsCode = (value: string) => value;

// Setup Guide Component
function SetupGuide({ onBack }: { onBack: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      {/* Header with Back Button */}
      <div className="flex items-center gap-4 mb-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="bg-transparent hover:bg-transparent text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary transition-all duration-200 p-2"
          aria-label={t('settings.copy.backToDashboard_97ba1d39')}
        >
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h2 className="text-xl font-semibold text-bolt-elements-textPrimary">
            {t('settings.copy.localProviderSetupGuide_2ac47684')}
          </h2>
          <p className="text-sm text-bolt-elements-textSecondary">
            {t('settings.copy.completeSetupInstructionsForRunningAiModelsLocally_7182c7db')}
          </p>
        </div>
      </div>

      {/* Hardware Requirements Overview */}
      <Card className="bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)] border border-[color-mix(in_srgb,var(--vc-ide-accent-action)_20%,transparent)] shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Shield className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">
                {t('settings.copy.systemRequirements_ac272c8f')}
              </h3>
              <p className="text-sm text-bolt-elements-textSecondary">
                {t('settings.copy.recommendedHardwareForOptimalPerformance_46d8b7e6')}
              </p>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Cpu className="w-4 h-4 text-green-500" />
                <span className="font-medium text-bolt-elements-textPrimary">{t('settings.copy.cpu_db9a4c7d')}</span>
              </div>
              <p className="text-bolt-elements-textSecondary">{t('settings.copy.8CoresModernArchitecture_72799aa5')}</p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-blue-500" />
                <span className="font-medium text-bolt-elements-textPrimary">{t('settings.copy.ram_bf4b0c03')}</span>
              </div>
              <p className="text-bolt-elements-textSecondary">
                {t('settings.copy.16gbMinimum32gbRecommended_a4db04d4')}
              </p>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-[var(--vc-ide-accent-action)]" />
                <span className="font-medium text-bolt-elements-textPrimary">{t('settings.copy.gpu_ea49523d')}</span>
              </div>
              <p className="text-bolt-elements-textSecondary">{t('settings.copy.nvidiaRtx30xxOrAmdRx6000_1be2e6f2')}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ollama Setup Section */}
      <Card className="bg-bolt-elements-background-depth-2 shadow-sm">
        <CardHeader className="pb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_18%,transparent)] flex items-center justify-center ring-1 ring-[color-mix(in_srgb,var(--vc-ide-accent-action)_30%,transparent)]">
              <Server className="w-6 h-6 text-[var(--vc-ide-accent-action)]" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-bolt-elements-textPrimary">
                {t('settings.copy.ollamaSetup_def5e560')}
              </h3>
              <p className="text-sm text-bolt-elements-textSecondary">
                {t('settings.copy.mostPopularChoiceForRunningOpenSourceModels_0efd1d7f')}
              </p>
            </div>
            <span className="px-3 py-1 bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)] text-[var(--vc-ide-accent-action)] text-xs font-medium rounded-full">
              {t('settings.copy.recommended_d70604e8')}
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Installation Options */}
          <div className="space-y-4">
            <h4 className="font-medium text-bolt-elements-textPrimary flex items-center gap-2">
              <Download className="w-4 h-4" />
              {t('settings.copy.1ChooseInstallationMethod_e76504d5')}
            </h4>

            {/* Desktop App - New and Recommended */}
            <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20">
              <div className="flex items-center gap-2 mb-3">
                <Monitor className="w-5 h-5 text-green-500" />
                <h5 className="font-medium text-green-500">{t('settings.copy.desktopAppRecommended_2da22eb4')}</h5>
              </div>
              <p className="text-sm text-bolt-elements-textSecondary mb-3">
                {t('settings.copy.newUserFriendlyDesktopApplicationWithBuiltIn_3c20fcc9')}
              </p>
              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-3 rounded-lg bg-bolt-elements-background-depth-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Monitor className="w-4 h-4 text-bolt-elements-textPrimary" />
                    <strong className="text-bolt-elements-textPrimary">{t('settings.copy.macos_aed6b7aa')}</strong>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_18%,transparent)] border-[color-mix(in_srgb,var(--vc-ide-accent-action)_30%,transparent)] hover:border-[color-mix(in_srgb,var(--vc-ide-accent-action)_50%,transparent)] transition-all duration-300 gap-2 group shadow-sm hover:shadow-lg font-medium"
                    _asChild
                  >
                    <a
                      href="https://ollama.com/download/mac"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4 group-hover:scale-110 group-hover:rotate-12 transition-all duration-300 flex-shrink-0" />
                      <span className="flex-1 text-center font-medium">
                        {t('settings.copy.downloadDesktopApp_fab2cfd1')}
                      </span>
                      <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300 flex-shrink-0" />
                    </a>
                  </Button>
                </div>
                <div className="p-3 rounded-lg bg-bolt-elements-background-depth-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Monitor className="w-4 h-4 text-bolt-elements-textPrimary" />
                    <strong className="text-bolt-elements-textPrimary">{t('settings.copy.windows_d598026a')}</strong>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)] hover:bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_18%,transparent)] border-[color-mix(in_srgb,var(--vc-ide-accent-action)_30%,transparent)] hover:border-[color-mix(in_srgb,var(--vc-ide-accent-action)_50%,transparent)] transition-all duration-300 gap-2 group shadow-sm hover:shadow-lg font-medium"
                    _asChild
                  >
                    <a
                      href="https://ollama.com/download/windows"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-2"
                    >
                      <Download className="w-4 h-4 group-hover:scale-110 group-hover:rotate-12 transition-all duration-300 flex-shrink-0" />
                      <span className="flex-1 text-center font-medium">
                        {t('settings.copy.downloadDesktopApp_fab2cfd1')}
                      </span>
                      <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300 flex-shrink-0" />
                    </a>
                  </Button>
                </div>
              </div>
              <div className="mt-3 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                <div className="flex items-center gap-2 mb-1">
                  <Globe className="w-4 h-4 text-blue-500" />
                  <span className="font-medium text-blue-500 text-sm">
                    {t('settings.copy.builtInWebInterface_52ff43a3')}
                  </span>
                </div>
                <p className="text-xs text-bolt-elements-textSecondary">
                  {t('settings.copy.desktopAppIncludesAWebInterfaceAt_25a4f7fb')}{' '}
                  <code className="bg-bolt-elements-background-depth-4 px-1 rounded">http://localhost:11434</code>
                </p>
              </div>
            </div>

            {/* CLI Installation */}
            <div className="p-4 rounded-lg bg-bolt-elements-background-depth-3">
              <div className="flex items-center gap-2 mb-3">
                <Terminal className="w-5 h-5 text-bolt-elements-textPrimary" />
                <h5 className="font-medium text-bolt-elements-textPrimary">
                  {t('settings.copy.commandLineAdvanced_faa5b0f0')}
                </h5>
              </div>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-3 rounded-lg bg-bolt-elements-background-depth-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Monitor className="w-4 h-4 text-bolt-elements-textPrimary" />
                    <strong className="text-bolt-elements-textPrimary">{t('settings.copy.windows_d598026a')}</strong>
                  </div>
                  <div className="text-xs bg-bolt-elements-background-depth-4 p-2 rounded font-mono text-bolt-elements-textPrimary">
                    {settingsCode('winget install Ollama.Ollama')}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-bolt-elements-background-depth-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Monitor className="w-4 h-4 text-bolt-elements-textPrimary" />
                    <strong className="text-bolt-elements-textPrimary">{t('settings.copy.macos_aed6b7aa')}</strong>
                  </div>
                  <div className="text-xs bg-bolt-elements-background-depth-4 p-2 rounded font-mono text-bolt-elements-textPrimary">
                    {settingsCode('brew install ollama')}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-bolt-elements-background-depth-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Terminal className="w-4 h-4 text-bolt-elements-textPrimary" />
                    <strong className="text-bolt-elements-textPrimary">{t('settings.copy.linux_4828e602')}</strong>
                  </div>
                  <div className="text-xs bg-bolt-elements-background-depth-4 p-2 rounded font-mono text-bolt-elements-textPrimary">
                    {settingsCode('curl -fsSL https://ollama.com/install.sh | sh')}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Latest Model Recommendations */}
          <div className="space-y-4">
            <h4 className="font-medium text-bolt-elements-textPrimary flex items-center gap-2">
              <Package className="w-4 h-4" />
              {t('settings.copy.2DownloadLatestModels_dafd3f59')}
            </h4>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-bolt-elements-background-depth-3">
                <h5 className="font-medium text-bolt-elements-textPrimary mb-3 flex items-center gap-2">
                  <Code className="w-4 h-4 text-green-500" />
                  {t('settings.copy.codeDevelopment_3351f93a')}
                </h5>
                <div className="space-y-2 text-xs bg-bolt-elements-background-depth-4 p-3 rounded font-mono text-bolt-elements-textPrimary">
                  <div>{settingsCode('# Latest Llama 3.2 for coding')}</div>
                  <div>{settingsCode('ollama pull llama3.2:3b')}</div>
                  <div>{settingsCode('ollama pull codellama:13b')}</div>
                  <div>{settingsCode('ollama pull deepseek-coder-v2')}</div>
                  <div>{settingsCode('ollama pull qwen2.5-coder:7b')}</div>
                </div>
              </div>
              <div className="p-4 rounded-lg bg-bolt-elements-background-depth-3">
                <h5 className="font-medium text-bolt-elements-textPrimary mb-3 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-blue-500" />
                  {t('settings.copy.generalPurposeChat_01eb4bad')}
                </h5>
                <div className="space-y-2 text-xs bg-bolt-elements-background-depth-4 p-3 rounded font-mono text-bolt-elements-textPrimary">
                  <div>{settingsCode('# Latest general models')}</div>
                  <div>{settingsCode('ollama pull llama3.2:3b')}</div>
                  <div>{settingsCode('ollama pull mistral:7b')}</div>
                  <div>{settingsCode('ollama pull phi3.5:3.8b')}</div>
                  <div>{settingsCode('ollama pull qwen2.5:7b')}</div>
                </div>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_6%,transparent)] border border-[color-mix(in_srgb,var(--vc-ide-accent-action)_20%,transparent)]">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="w-4 h-4 text-[var(--vc-ide-accent-action)]" />
                  <span className="font-medium text-[var(--vc-ide-accent-action)]">
                    {t('settings.copy.performanceOptimized_76baff5a')}
                  </span>
                </div>
                <ul className="text-xs text-bolt-elements-textSecondary space-y-1">
                  <li>{t('settings.copy.llama323bFastest8gbRam_bb32e1ef')}</li>
                  <li>{t('settings.copy.phi3538bGreatBalance_c6c4328e')}</li>
                  <li>{t('settings.copy.qwen257bExcellentQuality_acddf255')}</li>
                  <li>{t('settings.copy.mistral7bPopularChoice_3bfbcab9')}</li>
                </ul>
              </div>
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-yellow-500" />
                  <span className="font-medium text-yellow-500">{t('settings.copy.proTips_b4ea1d8c')}</span>
                </div>
                <ul className="text-xs text-bolt-elements-textSecondary space-y-1">
                  <li>{t('settings.copy.startWith3b7bModelsForBestPerformance_96946569')}</li>
                  <li>{t('settings.copy.useQuantizedVersionsForFasterLoading_96d73904')}</li>
                  <li>{t('settings.copy.desktopAppAutoManagesModelStorage_a02fdb8e')}</li>
                  <li>{t('settings.copy.webUiAvailableAtLocalhost11434_a7b22429')}</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Desktop App Features */}
          <div className="space-y-4">
            <h4 className="font-medium text-bolt-elements-textPrimary flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              {t('settings.copy.3DesktopAppFeatures_168b65ab')}
            </h4>
            <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h5 className="font-medium text-blue-500 mb-3">{t('settings.copy.userInterface_e5a4db53')}</h5>
                  <ul className="text-sm text-bolt-elements-textSecondary space-y-1">
                    <li>{t('settings.copy.modelLibraryBrowser_d508b940')}</li>
                    <li>{t('settings.copy.oneClickModelDownloads_c738bcda')}</li>
                    <li>{t('settings.copy.builtInChatInterface_074dd1ef')}</li>
                    <li>{t('settings.copy.systemResourceMonitoring_33880d04')}</li>
                  </ul>
                </div>
                <div>
                  <h5 className="font-medium text-blue-500 mb-3">{t('settings.copy.managementTools_9d0f3966')}</h5>
                  <ul className="text-sm text-bolt-elements-textSecondary space-y-1">
                    <li>{t('settings.copy.automaticUpdates_33795c13')}</li>
                    <li>{t('settings.copy.modelSizeOptimization_89b91baa')}</li>
                    <li>{t('settings.copy.gpuAccelerationDetection_e8fcc6fd')}</li>
                    <li>{t('settings.copy.crossPlatformCompatibility_a97997c5')}</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Troubleshooting */}
          <div className="space-y-4">
            <h4 className="font-medium text-bolt-elements-textPrimary flex items-center gap-2">
              <Settings className="w-4 h-4" />
              {t('settings.copy.4TroubleshootingCommands_3ee4e6cd')}
            </h4>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-red-500/5 border border-red-500/20">
                <h5 className="font-medium text-red-500 mb-2">{t('settings.copy.commonIssues_e2f95b40')}</h5>
                <ul className="text-xs text-bolt-elements-textSecondary space-y-1">
                  <li>{t('settings.copy.desktopAppNotStartingRestartSystem_896d554a')}</li>
                  <li>{t('settings.copy.gpuNotDetectedUpdateDrivers_b5e71907')}</li>
                  <li>{t('settings.copy.port11434BlockedChangePortInSettings_4cbce6f0')}</li>
                  <li>{t('settings.copy.modelsNotLoadingCheckAvailableDiskSpace_cd065055')}</li>
                  <li>{t('settings.copy.slowPerformanceUseSmallerModelsOrEnableGpu_ab385dcd')}</li>
                </ul>
              </div>
              <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20">
                <h5 className="font-medium text-green-500 mb-2">{t('settings.copy.usefulCommands_3ba36691')}</h5>
                <div className="text-xs bg-bolt-elements-background-depth-4 p-3 rounded font-mono text-bolt-elements-textPrimary space-y-1">
                  <div>{settingsCode('# Check installed models')}</div>
                  <div>{settingsCode('ollama list')}</div>
                  <div></div>
                  <div>{settingsCode('# Remove unused models')}</div>
                  <div>{settingsCode('ollama rm model_name')}</div>
                  <div></div>
                  <div>{settingsCode('# Check GPU usage')}</div>
                  <div>{settingsCode('ollama ps')}</div>
                  <div></div>
                  <div>{settingsCode('# View logs')}</div>
                  <div>{settingsCode('ollama logs')}</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* LM Studio Setup Section */}
      <Card className="bg-bolt-elements-background-depth-2 shadow-sm">
        <CardHeader className="pb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 flex items-center justify-center ring-1 ring-blue-500/30">
              <Monitor className="w-6 h-6 text-blue-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-bolt-elements-textPrimary">
                {t('settings.copy.lmStudioSetup_5de4dcc7')}
              </h3>
              <p className="text-sm text-bolt-elements-textSecondary">
                {t('settings.copy.userFriendlyGuiForRunningLocalModelsWith_3a5c1e68')}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Installation */}
          <div className="space-y-4">
            <h4 className="font-medium text-bolt-elements-textPrimary flex items-center gap-2">
              <Download className="w-4 h-4" />
              {t('settings.copy.1DownloadInstall_7ae81ef7')}
            </h4>
            <div className="p-4 rounded-lg bg-bolt-elements-background-depth-3">
              <p className="text-sm text-bolt-elements-textSecondary mb-3">
                {t('settings.copy.downloadLmStudioForWindowsMacosOrLinux_f10bb050')}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="bg-gradient-to-r from-blue-500/10 to-blue-600/10 hover:from-blue-500/20 hover:to-blue-600/20 border-blue-500/30 hover:border-blue-500/50 transition-all duration-300 gap-2 group shadow-sm hover:shadow-lg hover:shadow-blue-500/20 font-medium"
                _asChild
              >
                <a
                  href="https://lmstudio.ai/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4 group-hover:scale-110 group-hover:rotate-12 transition-all duration-300 flex-shrink-0" />
                  <span className="flex-1 text-center font-medium">{t('settings.copy.downloadLmStudio_12eb15f2')}</span>
                  <ExternalLink className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300 flex-shrink-0" />
                </a>
              </Button>
            </div>
          </div>

          {/* Configuration */}
          <div className="space-y-4">
            <h4 className="font-medium text-bolt-elements-textPrimary flex items-center gap-2">
              <Settings className="w-4 h-4" />
              {t('settings.copy.2ConfigureLocalServer_04ef371b')}
            </h4>
            <div className="space-y-3">
              <div className="p-4 rounded-lg bg-bolt-elements-background-depth-3">
                <h5 className="font-medium text-bolt-elements-textPrimary mb-2">
                  {t('settings.copy.startLocalServer_a0d0ffd9')}
                </h5>
                <ol className="text-xs text-bolt-elements-textSecondary space-y-1 list-decimal list-inside">
                  <li>{t('settings.copy.downloadAModelFromTheMyModelsTab_098051e9')}</li>
                  <li>{t('settings.copy.goToLocalServerTab_114c2806')}</li>
                  <li>{t('settings.copy.selectYourDownloadedModel_434b0454')}</li>
                  <li>{t('settings.copy.setPortTo1234Default_ed7ec7fa')}</li>
                  <li>{t('settings.copy.clickStartServer_c810101e')}</li>
                </ol>
              </div>

              <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle className="w-4 h-4 text-red-500" />
                  <span className="font-medium text-red-500">{t('settings.copy.criticalEnableCors_98fbc978')}</span>
                </div>
                <div className="space-y-2">
                  <p className="text-xs text-bolt-elements-textSecondary">
                    {t('settings.copy.toWorkWithECodeYouMustEnable_4a1386c5')}
                  </p>
                  <ol className="text-xs text-bolt-elements-textSecondary space-y-1 list-decimal list-inside ml-2">
                    <li>{t('settings.copy.inServerSettingsCheckEnableCors_87759a1e')}</li>
                    <li>{t('settings.copy.setNetworkInterfaceTo0000_006ac3e1')}</li>
                    <li>
                      {t('settings.copy.alternativelyUseCli_e39ae18c')}{' '}
                      <code className="bg-bolt-elements-background-depth-4 px-1 rounded">lms server start --cors</code>
                    </li>
                  </ol>
                </div>
              </div>
            </div>
          </div>

          {/* Advantages */}
          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-blue-500" />
              <span className="font-medium text-blue-500">{t('settings.copy.lmStudioAdvantages_8b6d71c3')}</span>
            </div>
            <ul className="text-xs text-bolt-elements-textSecondary space-y-1 list-disc list-inside">
              <li>{t('settings.copy.builtInModelDownloaderWithSearch_e9393cef')}</li>
              <li>{t('settings.copy.easyModelSwitchingAndManagement_620f3622')}</li>
              <li>{t('settings.copy.builtInChatInterfaceForTesting_5e4515bd')}</li>
              <li>{t('settings.copy.ggufFormatSupportMostCompatible_a39eb7cf')}</li>
              <li>{t('settings.copy.regularUpdatesWithNewFeatures_269f43f5')}</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* LocalAI Setup Section */}
      <Card className="bg-bolt-elements-background-depth-2 shadow-sm">
        <CardHeader className="pb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/20 flex items-center justify-center ring-1 ring-green-500/30">
              <Globe className="w-6 h-6 text-green-500" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-bolt-elements-textPrimary">
                {t('settings.copy.localaiSetup_850d5974')}
              </h3>
              <p className="text-sm text-bolt-elements-textSecondary">
                {t('settings.copy.selfHostedOpenaiCompatibleApiServerWithExtensive_8c227789')}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Installation */}
          <div className="space-y-4">
            <h4 className="font-medium text-bolt-elements-textPrimary flex items-center gap-2">
              <Download className="w-4 h-4" />
              {t('settings.copy.installationOptions_01a41c3a')}
            </h4>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg bg-bolt-elements-background-depth-3">
                <h5 className="font-medium text-bolt-elements-textPrimary mb-2">
                  {t('settings.copy.quickInstall_eed87f51')}
                </h5>
                <div className="text-xs bg-bolt-elements-background-depth-4 p-3 rounded font-mono text-bolt-elements-textPrimary space-y-1">
                  <div>{settingsCode('# One-line install')}</div>
                  <div>{settingsCode('curl https://localai.io/install.sh | sh')}</div>
                </div>
              </div>
              <div className="p-4 rounded-lg bg-bolt-elements-background-depth-3">
                <h5 className="font-medium text-bolt-elements-textPrimary mb-2">
                  {t('settings.copy.dockerRecommended_0d048700')}
                </h5>
                <div className="text-xs bg-bolt-elements-background-depth-4 p-3 rounded font-mono text-bolt-elements-textPrimary space-y-1">
                  <div>{settingsCode('docker run -p 8080:8080')}</div>
                  <div>{settingsCode('quay.io/go-skynet/local-ai:latest')}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Configuration */}
          <div className="space-y-4">
            <h4 className="font-medium text-bolt-elements-textPrimary flex items-center gap-2">
              <Settings className="w-4 h-4" />
              {t('settings.copy.configuration_b332c349')}
            </h4>
            <div className="p-4 rounded-lg bg-bolt-elements-background-depth-3">
              <p className="text-sm text-bolt-elements-textSecondary mb-3">
                {t('settings.copy.localaiSupportsManyModelFormatsAndProvidesA_67a2cbe1')}
              </p>
              <div className="text-xs bg-bolt-elements-background-depth-4 p-3 rounded font-mono text-bolt-elements-textPrimary space-y-1">
                <div>{settingsCode('# Example configuration')}</div>
                <div>{settingsCode('models:')}</div>
                <div>{settingsCode('- name: llama3.1')}</div>
                <div>{settingsCode('backend: llama')}</div>
                <div>{settingsCode('parameters:')}</div>
                <div>{settingsCode('model: llama3.1.gguf')}</div>
              </div>
            </div>
          </div>

          {/* Advantages */}
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-green-500" />
              <span className="font-medium text-green-500">{t('settings.copy.localaiAdvantages_9743cb00')}</span>
            </div>
            <ul className="text-xs text-bolt-elements-textSecondary space-y-1 list-disc list-inside">
              <li>{t('settings.copy.fullOpenaiApiCompatibility_e7456795')}</li>
              <li>{t('settings.copy.supportsMultipleModelFormats_e570bebc')}</li>
              <li>{t('settings.copy.dockerDeploymentOption_3bbb9b46')}</li>
              <li>{t('settings.copy.builtInModelGallery_967f1fcc')}</li>
              <li>{t('settings.copy.restApiForModelManagement_d0ba6dff')}</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Performance Optimization */}
      <Card className="bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_10%,transparent)] border border-[color-mix(in_srgb,var(--vc-ide-accent-action)_20%,transparent)] shadow-sm">
        <CardHeader className="pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[color-mix(in_srgb,var(--vc-ide-accent-action)_20%,transparent)] flex items-center justify-center">
              <Activity className="w-5 h-5 text-[var(--vc-ide-accent-action)]" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-bolt-elements-textPrimary">
                {t('settings.copy.performanceOptimization_fffce0e2')}
              </h3>
              <p className="text-sm text-bolt-elements-textSecondary">
                {t('settings.copy.tipsToImproveLocalAiPerformance_99755ec3')}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <h4 className="font-medium text-bolt-elements-textPrimary">
                {t('settings.copy.hardwareOptimizations_48ad78d7')}
              </h4>
              <ul className="text-sm text-bolt-elements-textSecondary space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>{t('settings.copy.useNvidiaGpuWithCudaFor510x_a306dc3f')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>{t('settings.copy.increaseRamForLargerContextWindows_ef69129e')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>{t('settings.copy.useSsdStorageForFasterModelLoading_eb4743bc')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                  <span>{t('settings.copy.closeOtherApplicationsToFreeUpRam_2b1400e5')}</span>
                </li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-medium text-bolt-elements-textPrimary">
                {t('settings.copy.softwareOptimizations_62e25f29')}
              </h4>
              <ul className="text-sm text-bolt-elements-textSecondary space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span>{t('settings.copy.useSmallerModelsForFasterResponses_0256ff93')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span>{t('settings.copy.enableQuantization4Bit8BitModels_86462e78')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span>{t('settings.copy.reduceContextLengthForChatApplications_5de704b2')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span>{t('settings.copy.useStreamingResponsesForBetterUx_067f2858')}</span>
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Alternative Options */}
      <Card className="bg-bolt-elements-background-depth-2 shadow-sm">
        <CardHeader className="pb-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500/20 to-red-500/20 flex items-center justify-center ring-1 ring-orange-500/30">
              <Wifi className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <h3 className="text-xl font-semibold text-bolt-elements-textPrimary">
                {t('settings.copy.alternativeOptions_02e57e3b')}
              </h3>
              <p className="text-sm text-bolt-elements-textSecondary">
                {t('settings.copy.otherLocalAiSolutionsAndCloudAlternatives_0f0bd686')}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="font-medium text-bolt-elements-textPrimary">
                {t('settings.copy.otherLocalSolutions_ce50070c')}
              </h4>
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-bolt-elements-background-depth-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Package className="w-4 h-4 text-blue-500" />
                    <span className="font-medium text-bolt-elements-textPrimary">
                      {t('settings.copy.janAi_d25ee8a5')}
                    </span>
                  </div>
                  <p className="text-xs text-bolt-elements-textSecondary">
                    {t('settings.copy.modernInterfaceWithBuiltInModelMarketplace_a6195945')}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-bolt-elements-background-depth-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Terminal className="w-4 h-4 text-green-500" />
                    <span className="font-medium text-bolt-elements-textPrimary">
                      {t('settings.copy.oobabooga_fa777f02')}
                    </span>
                  </div>
                  <p className="text-xs text-bolt-elements-textSecondary">
                    {t('settings.copy.advancedTextGenerationWebUiWithExtensions_16a96feb')}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-bolt-elements-background-depth-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Cable className="w-4 h-4 text-[var(--vc-ide-accent-action)]" />
                    <span className="font-medium text-bolt-elements-textPrimary">
                      {t('settings.copy.koboldai_3fd1a515')}
                    </span>
                  </div>
                  <p className="text-xs text-bolt-elements-textSecondary">
                    {t('settings.copy.focusOnCreativeWritingAndStorytelling_86acfd3c')}
                  </p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <h4 className="font-medium text-bolt-elements-textPrimary">
                {t('settings.copy.cloudAlternatives_27a75f72')}
              </h4>
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-bolt-elements-background-depth-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe className="w-4 h-4 text-orange-500" />
                    <span className="font-medium text-bolt-elements-textPrimary">
                      {t('settings.copy.openrouter_eb70c3bc')}
                    </span>
                  </div>
                  <p className="text-xs text-bolt-elements-textSecondary">
                    {t('settings.copy.accessTo100ModelsThroughUnifiedApi_5a32b5e5')}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-bolt-elements-background-depth-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Server className="w-4 h-4 text-red-500" />
                    <span className="font-medium text-bolt-elements-textPrimary">
                      {t('settings.copy.togetherAi_1551e58e')}
                    </span>
                  </div>
                  <p className="text-xs text-bolt-elements-textSecondary">
                    {t('settings.copy.fastInferenceWithOpenSourceModels_9888e4c5')}
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-bolt-elements-background-depth-3">
                  <div className="flex items-center gap-2 mb-1">
                    <Activity className="w-4 h-4 text-pink-500" />
                    <span className="font-medium text-bolt-elements-textPrimary">
                      {t('settings.copy.groq_493727d6')}
                    </span>
                  </div>
                  <p className="text-xs text-bolt-elements-textSecondary">
                    {t('settings.copy.ultraFastLpuInferenceForLlamaModels_bb2bc301')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default SetupGuide;
