# Integrated #807 mobile overlay focus witness

Exact source cc0427bb88c408051b9a7255517d5a4e600751b2 in /workspace/vibecore-ui-ide-local-recovery = main d788a549 (including #809) + local #807 follow-ups. Root-built final build exit0 /tmp/ui807-main809-build.log. Source remained unchanged; existing main MobileOverlayFocus/IDE implementation used verbatim. No historical proposed focus patch applied.

Existing compiled app14699, isolated synthetic GET API7899. Project synthetic-safearea-project; fixture no workspace/files. Browser blocks nonlocal requests and all mutations; no registration/import/customer/backend action. Chromium /usr/bin/chromium. FR/EN/theme/zoom not a matrix here: English default light, exact two widths390x844 touch and1180x757 nontouch.

Four witnesses passed:
- receipt.json / check.cjs: each width opens its overlay while Chat.client-Cwbmf1wz.js is held. Release chunk → old trigger detached → sheet restored → focus search/close → Escape closes and focuses current trigger. Both passed; oldConnected=false, triggerFocused=true.
- control-receipt.json / control.cjs: same operations without forced chunk delay, after2s stabilization for control only. Both passed; oldConnected=true, triggerFocused=true. This wait is not a proposed CI-test relaxation.
- integrated-tabs-390.png / integrated-panels-1180.png are delayed captures. control-tabs-390.png / control-panels-1180.png are controls.

The same delayed witness on old3d8059a3 failed focus (BODY), see /tmp/ui-807-focus-repro/receipt.json. Integrated main focus provider fixes that observed handoff case. No extra focus modification proposed or needed from this result. This does NOT establish the root cause or resolution of original CI390 overlay absent immediately afterEnter: that separate failure remains not reproduced (previous5races). Does not certify full IDE/runtime or production.

Process origin and verified cleanup stored here; No other agent shared this witness stack. No commit/index/push/build or source edits by this agent.

This rerun contains no desktop palette witness; do not reuse the earlier desktop outcome as new evidence on this build.
