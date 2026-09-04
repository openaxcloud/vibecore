import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useFocusTrap } from '~/lib/use-focus-trap';
import '~/styles/agent-skills.scss';

export type AgentSkillArtifactStatus = 'quarantined' | 'blocked' | 'approved' | 'revoked';
export type AgentSkillDecision = 'approve' | 'reject' | 'enable' | 'disable' | 'revoke';

export interface AgentSkillDiagnostic {
  code: string;
  severity: 'warning' | 'error';
  message: string;
  location?: string;
}

export interface AgentSkillFinding {
  ruleId: string;
  category: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  location: string;
  line?: number;
  excerpt: string;
}

export interface AgentSkillAuditReport {
  scanner?: string;
  scanStatus?: string;
  diagnostics?: AgentSkillDiagnostic[];
  findings?: AgentSkillFinding[];
  scannedCharacters?: number;
  scanTruncated?: boolean;
  inventory?: Array<{ path: string; byteLength: number; mode: string; binary: boolean }>;
  approval?: {
    specificationValid?: boolean;
    eligibleForManualApproval?: boolean;
    requiresManualReview?: boolean;
    blockingCodes?: string[];
  };
}

export interface AgentSkillArtifact {
  id: string;
  ownerRepo: string;
  skillPath: string;
  requestedRef: string;
  commitSha: string;
  digest: string;
  sourceUrl: string;
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  declaredAllowedTools?: string;
  auditStatus: AgentSkillArtifactStatus;
  auditReport?: AgentSkillAuditReport;
  enabled: boolean;
  installedPath?: string | null;
  reviewedAt?: string;
  reviewReason?: string;
  revokedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentSkillCatalogEntry {
  id: string;
  ownerRepo: string;
  skillPath: string;
  ref: string;
  name: string;
  description: string;
  category: string;
  homepageUrl: string;
  auditStatus: 'requires_audit';
  requiresAudit: true;
  artifact?: AgentSkillArtifact;
}

export interface AgentSkillAuditEvent {
  id: string;
  action: string;
  fromStatus?: string;
  toStatus: string;
  reason?: string;
  createdAt: string;
}

export interface AgentSkillReviewFile {
  path: string;
  mode: string;
  byteLength: number;
  sha256: string;
  binary: boolean;
  content?: string;
}

export interface AgentSkillArtifactDetail {
  artifact: AgentSkillArtifact;
  skillMarkdown?: string;
  reviewFiles?: AgentSkillReviewFile[];
  events: AgentSkillAuditEvent[];
  nextEventCursor?: string;
}

export interface AgentSkillsPanelData {
  artifacts?: AgentSkillArtifact[];
  catalog?: AgentSkillCatalogEntry[];
  workspaceId?: string;
  standard?: {
    specification?: string;
    directory?: string;
    disclosure?: string[];
  } | null;
}

interface AgentSkillsPanelProps {
  projectId?: string;
  data: AgentSkillsPanelData;
  busy?: boolean;
  reload?: () => void | Promise<void>;
}

interface ReviewPrompt {
  artifact: AgentSkillArtifact;
  decision: AgentSkillDecision;
}

const STATUS_LABELS: Record<AgentSkillArtifactStatus, string> = {
  quarantined: 'Awaiting review',
  blocked: 'Blocked',
  approved: 'Approved',
  revoked: 'Revoked',
};

const AGENT_SKILL_REQUEST_TIMEOUT_MS = 60_000;

const DECISION_COPY: Record<
  AgentSkillDecision,
  { title: string; description: string; submit: string; destructive?: boolean }
> = {
  approve: {
    title: 'Approve exact digest',
    description:
      'Install this audited bundle into the selected workspace and make its metadata available to the agent.',
    submit: 'Approve & install',
  },
  reject: {
    title: 'Reject artifact',
    description: 'Record why this immutable artifact must remain blocked. Its audit trail is retained.',
    submit: 'Reject artifact',
    destructive: true,
  },
  enable: {
    title: 'Enable approved skill',
    description: 'Reinstall this same approved digest in .agents/skills. No mutable source is fetched.',
    submit: 'Enable skill',
  },
  disable: {
    title: 'Disable approved skill',
    description: 'Remove the installed folder while preserving the artifact and complete audit trail.',
    submit: 'Disable skill',
  },
  revoke: {
    title: 'Revoke approval',
    description: 'Remove the installed folder and permanently mark this artifact digest as revoked.',
    submit: 'Revoke approval',
    destructive: true,
  },
};

function formatTimestamp(value?: string): string {
  if (!value) {
    return '—';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return `${date.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function shortDigest(value: string): string {
  return value.length > 16 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
}

function actionErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const candidate = payload as { error?: unknown; message?: unknown };

  if (typeof candidate.error === 'string' && candidate.error.trim()) {
    return candidate.error;
  }

  if (typeof candidate.message === 'string' && candidate.message.trim()) {
    return candidate.message;
  }

  return fallback;
}

export function canApproveAgentSkill(artifact: AgentSkillArtifact): boolean {
  return artifact.auditStatus === 'quarantined' && artifact.auditReport?.approval?.eligibleForManualApproval === true;
}

export function agentSkillStatusLabel(artifact: AgentSkillArtifact): string {
  if (artifact.auditStatus === 'approved') {
    return artifact.enabled ? 'Active' : 'Disabled';
  }

  return STATUS_LABELS[artifact.auditStatus];
}

export function agentSkillImportNotice(artifact?: AgentSkillArtifact): string {
  if (!artifact) {
    return 'The Agent Skill source was imported for review.';
  }

  if (artifact.auditStatus === 'blocked') {
    return `${artifact.name} was imported and blocked by audit.`;
  }

  if (artifact.auditStatus === 'approved') {
    return `${artifact.name} still resolves to the approved immutable digest.`;
  }

  if (artifact.auditStatus === 'revoked') {
    return `${artifact.name} still resolves to a revoked digest; a new source revision is required.`;
  }

  return `${artifact.name} is quarantined for human review.`;
}

function AgentSkillStatusBadge({ artifact }: { artifact: AgentSkillArtifact }) {
  const tone = artifact.auditStatus === 'approved' && !artifact.enabled ? 'disabled' : artifact.auditStatus;

  return (
    <span className="vc-agent-skill-status" data-status={tone}>
      <span aria-hidden />
      {agentSkillStatusLabel(artifact)}
    </span>
  );
}

function DetailSkeleton() {
  return (
    <div className="vc-agent-skill-detail-skeleton" aria-label="Loading Agent Skill review" role="status">
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}

function EmptyArtifacts({ onBrowse }: { onBrowse: () => void }) {
  return (
    <div className="vc-agent-skills-empty">
      <span className="i-ph:shield-check" aria-hidden />
      <h3>No imported Agent Skills</h3>
      <p>Browse audited sources or import one exact GitHub folder. Nothing is installed before human review.</p>
      <button type="button" className="vc-agent-skills-primary" onClick={onBrowse}>
        Browse open catalog
      </button>
    </div>
  );
}

function ArtifactCard({
  artifact,
  selected,
  loading,
  onInspect,
}: {
  artifact: AgentSkillArtifact;
  selected: boolean;
  loading: boolean;
  onInspect: () => void;
}) {
  const report = artifact.auditReport;
  const findings = report?.findings ?? [];
  const blocking = findings.filter((finding) => finding.severity === 'high' || finding.severity === 'critical').length;

  return (
    <article className="vc-agent-skill-card" data-selected={selected || undefined}>
      <button
        type="button"
        className="vc-agent-skill-card-main"
        onClick={onInspect}
        aria-expanded={selected}
        aria-label={`Inspect ${artifact.name} audit`}
      >
        <span className="vc-agent-skill-card-icon" data-status={artifact.auditStatus} aria-hidden>
          <span className={artifact.auditStatus === 'blocked' ? 'i-ph:warning-octagon' : 'i-ph:brackets-curly'} />
        </span>
        <span className="vc-agent-skill-card-copy">
          <span className="vc-agent-skill-card-title-row">
            <strong>{artifact.name}</strong>
            <AgentSkillStatusBadge artifact={artifact} />
          </span>
          <span className="vc-agent-skill-card-description">{artifact.description}</span>
          <span className="vc-agent-skill-card-meta">
            <code>
              {artifact.ownerRepo}/{artifact.skillPath}
            </code>
            <span>{shortDigest(artifact.digest)}</span>
            {blocking > 0 ? <span className="vc-agent-skill-risk-count">{blocking} blocking</span> : null}
          </span>
        </span>
        <span className={loading ? 'i-svg-spinners:90-ring-with-bg' : 'i-ph:caret-right'} aria-hidden />
      </button>
    </article>
  );
}

function RiskFinding({ finding }: { finding: AgentSkillFinding }) {
  return (
    <li className="vc-agent-skill-finding" data-severity={finding.severity}>
      <div>
        <span className="vc-agent-skill-severity">{finding.severity}</span>
        <code>{finding.ruleId}</code>
      </div>
      <strong>{finding.message}</strong>
      <span>
        {finding.location}
        {finding.line ? `:${finding.line}` : ''}
      </span>
      {finding.excerpt ? <pre>{finding.excerpt}</pre> : null}
    </li>
  );
}

function ArtifactDetail({
  detail,
  onClose,
  onDecision,
  onLoadOlderEvents,
  loadingOlderEvents,
}: {
  detail: AgentSkillArtifactDetail;
  onClose: () => void;
  onDecision: (artifact: AgentSkillArtifact, decision: AgentSkillDecision) => void;
  onLoadOlderEvents: () => void;
  loadingOlderEvents: boolean;
}) {
  const { artifact } = detail;
  const report = artifact.auditReport ?? {};
  const findings = report.findings ?? [];
  const diagnostics = report.diagnostics ?? [];
  const inventory = report.inventory ?? [];

  const reviewFiles =
    detail.reviewFiles ??
    (detail.skillMarkdown
      ? [
          {
            path: 'SKILL.md',
            mode: '100644',
            byteLength: new TextEncoder().encode(detail.skillMarkdown).byteLength,
            sha256: artifact.digest,
            binary: false,
            content: detail.skillMarkdown,
          },
        ]
      : []);

  const approvalEligible = canApproveAgentSkill(artifact);
  const approvalBlocked = artifact.auditStatus === 'quarantined' && !approvalEligible;

  return (
    <aside className="vc-agent-skill-detail" aria-label={`${artifact.name} security review`}>
      <header className="vc-agent-skill-detail-header">
        <div>
          <span className="vc-agent-skill-eyebrow">Immutable review artifact</span>
          <h3>{artifact.name}</h3>
        </div>
        <button type="button" className="vc-agent-skills-icon-button" onClick={onClose} aria-label="Close skill review">
          <span className="i-ph:x" aria-hidden />
        </button>
      </header>

      <div className="vc-agent-skill-detail-scroll">
        <section className="vc-agent-skill-chain" aria-label="Source provenance">
          <div className="vc-agent-skill-chain-heading">
            <AgentSkillStatusBadge artifact={artifact} />
            <span>Imported {formatTimestamp(artifact.createdAt)}</span>
          </div>
          <dl>
            <div>
              <dt>Source folder</dt>
              <dd>
                <a href={artifact.sourceUrl} target="_blank" rel="noreferrer">
                  {artifact.ownerRepo}/{artifact.skillPath}
                  <span className="i-ph:arrow-square-out" aria-hidden />
                </a>
              </dd>
            </div>
            <div>
              <dt>Commit</dt>
              <dd>
                <code>{artifact.commitSha}</code>
              </dd>
            </div>
            <div>
              <dt>Bundle SHA-256</dt>
              <dd>
                <code>{artifact.digest}</code>
              </dd>
            </div>
            <div>
              <dt>Install path</dt>
              <dd>
                <code>{artifact.installedPath ?? `.agents/skills/${artifact.name}/SKILL.md`}</code>
              </dd>
            </div>
            <div>
              <dt>License</dt>
              <dd>{artifact.license ?? 'Not declared'}</dd>
            </div>
            <div>
              <dt>Declared tools</dt>
              <dd>{artifact.declaredAllowedTools ?? 'None declared'}</dd>
            </div>
          </dl>
          {artifact.declaredAllowedTools ? (
            <p className="vc-agent-skill-tool-note">
              <span className="i-ph:info" aria-hidden />
              This declaration is descriptive. It never grants tool permissions.
            </p>
          ) : null}
        </section>

        <section className="vc-agent-skill-audit-summary" aria-label="Static audit summary">
          <div className="vc-agent-skill-section-heading">
            <div>
              <span className="vc-agent-skill-eyebrow">Static audit</span>
              <h4>
                {findings.length
                  ? `${findings.length} security finding${findings.length === 1 ? '' : 's'}`
                  : 'No known injection pattern found'}
              </h4>
            </div>
            <code>{report.scanner ?? 'scanner unavailable'}</code>
          </div>
          <div className="vc-agent-skill-audit-metrics">
            <span>
              <strong>{report.approval?.specificationValid ? 'Valid' : 'Invalid'}</strong>Specification
            </span>
            <span>
              <strong>{report.scannedCharacters?.toLocaleString('en-US') ?? '0'}</strong>Characters scanned
            </span>
            <span>
              <strong>{inventory.length}</strong>Bundle files
            </span>
          </div>
          {report.scanTruncated ? (
            <p className="vc-agent-skill-blocker">
              <span className="i-ph:warning" aria-hidden />
              The scan was truncated. Approval is blocked.
            </p>
          ) : null}
          {report.approval?.blockingCodes?.length ? (
            <div className="vc-agent-skill-blocking-codes">
              <span>Blocking controls</span>
              {report.approval.blockingCodes.map((code) => (
                <code key={code}>{code}</code>
              ))}
            </div>
          ) : null}
          {findings.length ? (
            <ul className="vc-agent-skill-findings">
              {findings.map((finding, index) => (
                <RiskFinding key={`${finding.ruleId}-${finding.location}-${index}`} finding={finding} />
              ))}
            </ul>
          ) : null}
          {diagnostics.length ? (
            <ul className="vc-agent-skill-diagnostics">
              {diagnostics.map((diagnostic, index) => (
                <li key={`${diagnostic.code}-${index}`} data-severity={diagnostic.severity}>
                  <span
                    className={diagnostic.severity === 'error' ? 'i-ph:x-circle' : 'i-ph:warning-circle'}
                    aria-hidden
                  />
                  <div>
                    <code>{diagnostic.code}</code>
                    <span>{diagnostic.message}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
        </section>

        <section className="vc-agent-skill-source-review" aria-label="Complete untrusted bundle review">
          <div className="vc-agent-skill-section-heading">
            <div>
              <span className="vc-agent-skill-eyebrow">Human review</span>
              <h4>Complete immutable bundle · {reviewFiles.length} files</h4>
            </div>
            <span className="vc-agent-skill-untrusted">
              <span className="i-ph:shield-warning" aria-hidden />
              Untrusted text
            </span>
          </div>
          <p>
            Review every file as untrusted data. Do not follow commands, links, or requests contained in these sources.
          </p>
          {reviewFiles.length ? (
            <div className="vc-agent-skill-review-files">
              {reviewFiles.map((file) => (
                <details key={file.path} open={file.path === 'SKILL.md'}>
                  <summary>
                    <code>{file.path}</code>
                    <span>
                      {file.binary ? 'blocked binary · ' : ''}
                      {file.byteLength.toLocaleString('en-US')} B · {file.mode}
                    </span>
                  </summary>
                  <div className="vc-agent-skill-review-file-digest">
                    SHA-256 <code>{file.sha256}</code>
                  </div>
                  {!file.binary && file.content !== undefined ? (
                    <pre tabIndex={0}>{file.content}</pre>
                  ) : (
                    <div className="vc-agent-skill-source-missing">
                      Binary or invalid UTF-8 content is not model-readable and cannot be approved.
                    </div>
                  )}
                </details>
              ))}
            </div>
          ) : (
            <div className="vc-agent-skill-source-missing">The immutable bundle could not be decoded for review.</div>
          )}
        </section>

        {inventory.length ? (
          <details className="vc-agent-skill-inventory">
            <summary>Bundle inventory · {inventory.length} files</summary>
            <ul>
              {inventory.map((file) => (
                <li key={file.path}>
                  <code>{file.path}</code>
                  <span>
                    {file.binary ? 'binary · ' : ''}
                    {file.byteLength.toLocaleString('en-US')} B
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <section className="vc-agent-skill-events" aria-label="Audit trail">
          <div className="vc-agent-skill-section-heading">
            <div>
              <span className="vc-agent-skill-eyebrow">Append-only log</span>
              <h4>Decision history</h4>
            </div>
          </div>
          {detail.events.length ? (
            <ol>
              {detail.events.map((event) => (
                <li key={event.id}>
                  <span aria-hidden />
                  <div>
                    <strong>{event.action}</strong>
                    <small>
                      {event.fromStatus ? `${event.fromStatus} → ` : ''}
                      {event.toStatus} · {formatTimestamp(event.createdAt)}
                    </small>
                    {event.reason ? <p>{event.reason}</p> : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p>No reviewer decision has been recorded yet.</p>
          )}
          {detail.nextEventCursor ? (
            <button
              type="button"
              className="vc-agent-skills-secondary vc-agent-skill-events-more"
              onClick={onLoadOlderEvents}
              disabled={loadingOlderEvents}
            >
              {loadingOlderEvents ? (
                <>
                  <span className="i-svg-spinners:90-ring-with-bg" aria-hidden /> Loading…
                </>
              ) : (
                'Load older audit events'
              )}
            </button>
          ) : null}
        </section>
      </div>

      <footer className="vc-agent-skill-detail-actions">
        {artifact.auditStatus === 'quarantined' ? (
          <>
            <button
              type="button"
              className="vc-agent-skills-secondary vc-agent-skills-danger"
              onClick={() => onDecision(artifact, 'reject')}
            >
              Reject
            </button>
            <button
              type="button"
              className="vc-agent-skills-primary"
              disabled={!approvalEligible}
              onClick={() => onDecision(artifact, 'approve')}
            >
              Approve exact digest
            </button>
          </>
        ) : null}
        {approvalBlocked ? (
          <span className="vc-agent-skill-action-note">This audit is not eligible for approval.</span>
        ) : null}
        {artifact.auditStatus === 'blocked' ? (
          <span className="vc-agent-skill-action-note">
            High-risk or invalid artifacts cannot be manually approved.
          </span>
        ) : null}
        {artifact.auditStatus === 'blocked' ? (
          <button type="button" className="vc-agent-skills-secondary" onClick={() => onDecision(artifact, 'reject')}>
            Record rejection reason
          </button>
        ) : null}
        {artifact.auditStatus === 'approved' ? (
          <>
            <button
              type="button"
              className="vc-agent-skills-secondary"
              onClick={() => onDecision(artifact, artifact.enabled ? 'disable' : 'enable')}
            >
              {artifact.enabled ? 'Disable' : 'Enable'}
            </button>
            <button
              type="button"
              className="vc-agent-skills-secondary vc-agent-skills-danger"
              onClick={() => onDecision(artifact, 'revoke')}
            >
              Revoke
            </button>
          </>
        ) : null}
        {artifact.auditStatus === 'revoked' ? (
          <span className="vc-agent-skill-action-note">
            Revoked artifacts are retained for evidence and cannot be re-enabled.
          </span>
        ) : null}
      </footer>
    </aside>
  );
}

function DecisionForm({
  prompt,
  reason,
  acknowledged,
  error,
  pending,
  workspaceAvailable,
  onReasonChange,
  onAcknowledgedChange,
  onCancel,
  onConfirm,
}: {
  prompt: ReviewPrompt;
  reason: string;
  acknowledged: boolean;
  error: string | null;
  pending: boolean;
  workspaceAvailable: boolean;
  onReasonChange: (value: string) => void;
  onAcknowledgedChange: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const copy = DECISION_COPY[prompt.decision];
  const needsWorkspace = prompt.decision !== 'reject';
  const needsReviewAcknowledgement = prompt.decision === 'approve';

  const disabled =
    pending ||
    reason.trim().length < 3 ||
    (needsWorkspace && !workspaceAvailable) ||
    (needsReviewAcknowledgement && !acknowledged);

  const formRef = useFocusTrap<HTMLFormElement>(true);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;

    if (!dialog) {
      return undefined;
    }

    const isolated: Array<{ element: HTMLElement; inert: string | null; ariaHidden: string | null }> = [];

    let current: HTMLElement | null = dialog;

    /*
     * Keep assistive technology and pointer/keyboard interaction inside this
     * security decision even though the dialog is rendered in the workbench
     * tree rather than a global portal. Restore every prior attribute exactly.
     */
    while (current?.parentElement && current.parentElement !== document.body) {
      for (const sibling of current.parentElement.children) {
        if (!(sibling instanceof HTMLElement) || sibling === current) {
          continue;
        }

        isolated.push({
          element: sibling,
          inert: sibling.getAttribute('inert'),
          ariaHidden: sibling.getAttribute('aria-hidden'),
        });
        sibling.setAttribute('inert', '');
        sibling.setAttribute('aria-hidden', 'true');
      }

      current = current.parentElement;
    }

    return () => {
      for (const previous of isolated) {
        if (previous.inert === null) {
          previous.element.removeAttribute('inert');
        } else {
          previous.element.setAttribute('inert', previous.inert);
        }

        if (previous.ariaHidden === null) {
          previous.element.removeAttribute('aria-hidden');
        } else {
          previous.element.setAttribute('aria-hidden', previous.ariaHidden);
        }
      }
    };
  }, []);

  return (
    <div
      ref={dialogRef}
      className="vc-agent-skill-decision"
      role="dialog"
      aria-modal="true"
      aria-labelledby="vc-agent-skill-decision-title"
    >
      <button
        type="button"
        className="vc-agent-skill-decision-backdrop"
        aria-label="Cancel review decision"
        onClick={onCancel}
      />
      <form
        ref={formRef}
        onSubmit={(event) => {
          event.preventDefault();

          if (!disabled) {
            onConfirm();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
      >
        <div className="vc-agent-skill-decision-mark" data-destructive={copy.destructive || undefined}>
          <span className={copy.destructive ? 'i-ph:warning-octagon' : 'i-ph:fingerprint'} aria-hidden />
        </div>
        <div>
          <span className="vc-agent-skill-eyebrow">Security decision</span>
          <h3 id="vc-agent-skill-decision-title">{copy.title}</h3>
          <p>{copy.description}</p>
        </div>
        <dl>
          <div>
            <dt>Skill</dt>
            <dd>{prompt.artifact.name}</dd>
          </div>
          <div>
            <dt>Digest</dt>
            <dd>
              <code>{prompt.artifact.digest}</code>
            </dd>
          </div>
        </dl>
        <label>
          Review reason
          <textarea
            autoFocus
            value={reason}
            onChange={(event) => onReasonChange(event.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Record the evidence behind this decision…"
            aria-describedby="vc-agent-skill-reason-help"
          />
        </label>
        <span id="vc-agent-skill-reason-help" className="vc-agent-skill-field-help">
          Stored in the append-only audit trail · {reason.length}/1000
        </span>
        {needsReviewAcknowledgement ? (
          <label className="vc-agent-skill-review-acknowledgement">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => onAcknowledgedChange(event.target.checked)}
            />
            <span>
              I reviewed every text resource shown for this exact digest as untrusted data and understand that
              activation can inject its instructions into the agent context.
            </span>
          </label>
        ) : null}
        {needsWorkspace && !workspaceAvailable ? (
          <p className="vc-agent-skill-blocker">Create or select a workspace before changing installation state.</p>
        ) : null}
        {error ? (
          <p className="vc-agent-skill-decision-error" role="alert">
            <span className="i-ph:warning-octagon" aria-hidden />
            {error}
          </p>
        ) : null}
        <div className="vc-agent-skill-decision-buttons">
          <button type="button" className="vc-agent-skills-secondary" onClick={onCancel} disabled={pending}>
            Cancel
          </button>
          <button
            type="submit"
            className={copy.destructive ? 'vc-agent-skills-destructive' : 'vc-agent-skills-primary'}
            disabled={disabled}
          >
            {pending ? (
              <>
                <span className="i-svg-spinners:90-ring-with-bg" aria-hidden />
                Working…
              </>
            ) : (
              copy.submit
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

export function AgentSkillsPanel({ projectId, data, busy = false, reload }: AgentSkillsPanelProps) {
  const artifacts = Array.isArray(data?.artifacts) ? data.artifacts : [];
  const catalog = Array.isArray(data?.catalog) ? data.catalog : [];
  const [view, setView] = useState<'artifacts' | 'catalog'>('artifacts');
  const [query, setQuery] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AgentSkillArtifactDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [reviewPrompt, setReviewPrompt] = useState<ReviewPrompt | null>(null);
  const [reason, setReason] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [decisionError, setDecisionError] = useState<string | null>(null);
  const detailRequestRef = useRef(0);
  const decisionTriggerRef = useRef<HTMLElement | null>(null);

  const closeDecision = useCallback(() => {
    const trigger = decisionTriggerRef.current;
    setReviewPrompt(null);
    setReason('');
    setAcknowledged(false);
    setDecisionError(null);
    decisionTriggerRef.current = null;
    setTimeout(() => trigger?.focus(), 0);
  }, []);

  const post = useCallback(
    async (fields: Record<string, string>, key: string) => {
      if (!projectId) {
        throw new Error('Project context is unavailable.');
      }

      setPending(key);
      setError(null);
      setNotice(null);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), AGENT_SKILL_REQUEST_TIMEOUT_MS);

      try {
        const form = new FormData();
        Object.entries(fields).forEach(([name, value]) => form.append(name, value));

        const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/ide-panel/skills`, {
          method: 'POST',
          body: form,
          signal: controller.signal,
        });

        const payload = (await response.json().catch(() => null)) as unknown;

        if (!response.ok) {
          throw new Error(actionErrorMessage(payload, 'Agent Skill request failed.'));
        }

        return payload as Record<string, unknown>;
      } catch (requestError) {
        if (controller.signal.aborted) {
          throw new Error('The Agent Skill request timed out. Retry when the workspace or source is available.');
        }

        throw requestError;
      } finally {
        clearTimeout(timeout);
        setPending(null);
      }
    },
    [projectId],
  );

  const inspect = useCallback(
    async (artifactId: string) => {
      const requestId = ++detailRequestRef.current;

      setSelectedId(artifactId);
      setDetail(null);
      setDetailError(null);

      try {
        if (!data.workspaceId) {
          throw new Error('A project workspace is required to inspect this Agent Skill.');
        }

        const payload = await post(
          { intent: 'inspect', artifactId, workspaceId: data.workspaceId },
          `inspect:${artifactId}`,
        );

        const nextDetail = payload.detail as AgentSkillArtifactDetail | undefined;

        if (!nextDetail?.artifact) {
          throw new Error('The audit detail response was incomplete.');
        }

        if (requestId === detailRequestRef.current) {
          setDetail(nextDetail);
        }
      } catch (inspectError) {
        if (requestId === detailRequestRef.current) {
          setDetailError(inspectError instanceof Error ? inspectError.message : 'Unable to load this security review.');
        }
      }
    },
    [data.workspaceId, post],
  );

  const runImport = useCallback(
    async (fields: Record<string, string>, key: string) => {
      try {
        if (!data.workspaceId) {
          throw new Error('A project workspace is required before an Agent Skill can be imported.');
        }

        const payload = await post({ ...fields, workspaceId: data.workspaceId }, key);
        const imported = payload.artifact as AgentSkillArtifact | undefined;
        setNotice(agentSkillImportNotice(imported));
        setView('artifacts');
        setCustomOpen(false);
        await reload?.();

        if (imported?.id) {
          await inspect(imported.id);
        }
      } catch (importError) {
        setError(importError instanceof Error ? importError.message : 'Unable to import this Agent Skill.');
      }
    },
    [data.workspaceId, inspect, post, reload],
  );

  const loadOlderEvents = useCallback(async () => {
    if (!detail?.nextEventCursor || !data.workspaceId) {
      return;
    }

    try {
      const payload = await post(
        {
          intent: 'inspect',
          artifactId: detail.artifact.id,
          workspaceId: data.workspaceId,
          eventCursor: detail.nextEventCursor,
        },
        `events:${detail.artifact.id}`,
      );

      const page = payload.detail as AgentSkillArtifactDetail | undefined;

      if (!page?.artifact || page.artifact.id !== detail.artifact.id) {
        throw new Error('The audit event response was incomplete.');
      }

      setDetail((current) =>
        current?.artifact.id === page.artifact.id
          ? {
              ...current,
              events: [
                ...current.events,
                ...page.events.filter((event) => !current.events.some((existing) => existing.id === event.id)),
              ],
              nextEventCursor: page.nextEventCursor,
            }
          : current,
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load older audit events.');
    }
  }, [data.workspaceId, detail, post]);

  const confirmDecision = useCallback(async () => {
    if (!reviewPrompt) {
      return;
    }

    const { artifact, decision } = reviewPrompt;

    try {
      await post(
        {
          intent: decision,
          artifactId: artifact.id,
          digest: artifact.digest,
          reason: reason.trim(),
          ...(data.workspaceId ? { workspaceId: data.workspaceId } : {}),
          ...(decision === 'approve' ? { acknowledgedUntrustedContent: String(acknowledged) } : {}),
        },
        `decision:${artifact.id}:${decision}`,
      );
      setNotice(`${artifact.name}: ${DECISION_COPY[decision].submit} recorded.`);
      closeDecision();
      await reload?.();
      await inspect(artifact.id);
    } catch (decisionError) {
      setDecisionError(decisionError instanceof Error ? decisionError.message : 'Unable to record this decision.');
    }
  }, [acknowledged, closeDecision, data.workspaceId, inspect, post, reason, reload, reviewPrompt]);

  const openDecision = useCallback((artifact: AgentSkillArtifact, decision: AgentSkillDecision) => {
    setError(null);
    setDecisionError(null);
    setReason('');
    setAcknowledged(false);
    decisionTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setReviewPrompt({ artifact, decision });
  }, []);

  const sortedArtifacts = useMemo(() => {
    const rank: Record<AgentSkillArtifactStatus, number> = { quarantined: 0, blocked: 1, approved: 2, revoked: 3 };
    return [...artifacts].sort(
      (left, right) =>
        rank[left.auditStatus] - rank[right.auditStatus] || right.updatedAt.localeCompare(left.updatedAt),
    );
  }, [artifacts]);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredCatalog = normalizedQuery
    ? catalog.filter((entry) =>
        [entry.name, entry.description, entry.ownerRepo, entry.skillPath, entry.category].some((value) =>
          value.toLowerCase().includes(normalizedQuery),
        ),
      )
    : catalog;

  const reviewCount = artifacts.filter((artifact) => artifact.auditStatus === 'quarantined').length;
  const activeCount = artifacts.filter((artifact) => artifact.auditStatus === 'approved' && artifact.enabled).length;

  return (
    <section className="vc-agent-skills" aria-label="Open-standard Agent Skills">
      <header className="vc-agent-skills-header">
        <div className="vc-agent-skills-heading">
          <span className="vc-agent-skills-heading-mark" aria-hidden>
            <span className="i-ph:brackets-curly" />
          </span>
          <div>
            <span className="vc-agent-skill-eyebrow">Open standard · security gated</span>
            <h2>Agent Skills</h2>
            <p>Metadata is discovered first. Full instructions load only when the agent activates a relevant skill.</p>
          </div>
        </div>
        <a
          href={data.standard?.specification ?? 'https://agentskills.io/specification'}
          target="_blank"
          rel="noreferrer"
          className="vc-agent-skills-spec-link"
        >
          agentskills.io <span className="i-ph:arrow-square-out" aria-hidden />
        </a>
      </header>

      <div className="vc-agent-skills-standard-strip">
        <code>{data.standard?.directory ?? '.agents/skills/&lt;name&gt;/SKILL.md'}</code>
        <span>
          <span className="i-ph:shield-check" aria-hidden />
          External skills are never auto-installed
        </span>
      </div>

      <nav className="vc-agent-skills-tabs" aria-label="Agent Skills views">
        <button
          type="button"
          aria-current={view === 'artifacts' ? 'page' : undefined}
          onClick={() => setView('artifacts')}
        >
          Review & installed <span>{artifacts.length}</span>
          {reviewCount ? <em>{reviewCount} waiting</em> : null}
        </button>
        <button type="button" aria-current={view === 'catalog' ? 'page' : undefined} onClick={() => setView('catalog')}>
          Open catalog <span>{catalog.length}</span>
        </button>
      </nav>

      <div className="vc-agent-skills-live" aria-live="polite" aria-atomic="true">
        {error ? (
          <div className="vc-agent-skills-alert" data-tone="error">
            <span className="i-ph:warning-octagon" aria-hidden />
            <p>{error}</p>
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
              <span className="i-ph:x" aria-hidden />
            </button>
          </div>
        ) : null}
        {notice ? (
          <div className="vc-agent-skills-alert" data-tone="success">
            <span className="i-ph:check-circle" aria-hidden />
            <p>{notice}</p>
            <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss notification">
              <span className="i-ph:x" aria-hidden />
            </button>
          </div>
        ) : null}
      </div>

      {view === 'artifacts' ? (
        <div className="vc-agent-skills-review-layout" data-detail={selectedId ? 'open' : 'closed'}>
          <div className="vc-agent-skills-artifacts">
            <div className="vc-agent-skills-metrics" aria-label="Agent Skill status summary">
              <div>
                <span className="i-ph:hourglass-medium" aria-hidden />
                <strong>{reviewCount}</strong>
                <small>Awaiting review</small>
              </div>
              <div>
                <span className="i-ph:seal-check" aria-hidden />
                <strong>{activeCount}</strong>
                <small>Active, approved</small>
              </div>
              <div>
                <span className="i-ph:files" aria-hidden />
                <strong>{artifacts.length}</strong>
                <small>Immutable artifacts</small>
              </div>
            </div>
            {sortedArtifacts.length ? (
              <div className="vc-agent-skills-card-list">
                {sortedArtifacts.map((artifact) => (
                  <ArtifactCard
                    key={artifact.id}
                    artifact={artifact}
                    selected={selectedId === artifact.id}
                    loading={selectedId === artifact.id && !detail && !detailError}
                    onInspect={() => void inspect(artifact.id)}
                  />
                ))}
              </div>
            ) : (
              <EmptyArtifacts onBrowse={() => setView('catalog')} />
            )}
          </div>

          {selectedId ? (
            detail ? (
              <ArtifactDetail
                detail={detail}
                onClose={() => {
                  setSelectedId(null);
                  setDetail(null);
                  setDetailError(null);
                }}
                onDecision={openDecision}
                onLoadOlderEvents={() => void loadOlderEvents()}
                loadingOlderEvents={pending === `events:${detail.artifact.id}`}
              />
            ) : detailError ? (
              <aside className="vc-agent-skill-detail vc-agent-skill-detail-error" role="alert">
                <span className="i-ph:warning-circle" aria-hidden />
                <h3>Review unavailable</h3>
                <p>{detailError}</p>
                <div>
                  <button
                    type="button"
                    className="vc-agent-skills-secondary"
                    onClick={() => {
                      setSelectedId(null);
                      setDetailError(null);
                    }}
                  >
                    Close
                  </button>
                  <button type="button" className="vc-agent-skills-primary" onClick={() => void inspect(selectedId)}>
                    Retry
                  </button>
                </div>
              </aside>
            ) : (
              <aside className="vc-agent-skill-detail" aria-busy="true">
                <DetailSkeleton />
              </aside>
            )
          ) : null}
        </div>
      ) : (
        <div className="vc-agent-skills-catalog">
          <div className="vc-agent-skills-catalog-toolbar">
            <label className="vc-agent-skills-search">
              <span className="i-ph:magnifying-glass" aria-hidden />
              <span className="sr-only">Search open Agent Skills catalog</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search folders, repositories, or categories"
              />
            </label>
            <button
              type="button"
              className="vc-agent-skills-secondary"
              aria-expanded={customOpen}
              onClick={() => setCustomOpen((open) => !open)}
            >
              <span className="i-ph:git-fork" aria-hidden />
              Import GitHub folder
            </button>
          </div>

          {customOpen ? (
            <form
              className="vc-agent-skill-custom-import"
              onSubmit={(event) => {
                event.preventDefault();

                const form = new FormData(event.currentTarget);
                void runImport(
                  {
                    intent: 'import-custom',
                    ownerRepo: String(form.get('ownerRepo') ?? ''),
                    skillPath: String(form.get('skillPath') ?? ''),
                    ref: String(form.get('ref') ?? ''),
                  },
                  'import:custom',
                );
              }}
            >
              <div>
                <span className="vc-agent-skill-eyebrow">Exact folder import</span>
                <h3>Quarantine a GitHub Agent Skill</h3>
                <p>The ref is resolved to an immutable commit before any source enters review.</p>
              </div>
              <label>
                Owner / repository
                <input name="ownerRepo" required maxLength={220} placeholder="anthropics/skills" autoComplete="off" />
              </label>
              <label>
                Skill folder
                <input name="skillPath" required maxLength={512} placeholder="skills/pdf" autoComplete="off" />
              </label>
              <label>
                Git ref <span>(latest HEAD by default)</span>
                <input name="ref" maxLength={200} placeholder="main" autoComplete="off" />
              </label>
              <button
                type="submit"
                className="vc-agent-skills-primary"
                disabled={busy || pending === 'import:custom' || !data.workspaceId}
              >
                {pending === 'import:custom' ? (
                  <>
                    <span className="i-svg-spinners:90-ring-with-bg" aria-hidden />
                    Auditing…
                  </>
                ) : (
                  'Import into quarantine'
                )}
              </button>
            </form>
          ) : null}

          <div className="vc-agent-skills-catalog-intro">
            <div>
              <span className="i-ph:globe-hemisphere-west" aria-hidden />
              <div>
                <strong>Reference catalog</strong>
                <p>Current open-source folders. Catalog inclusion is not an approval.</p>
              </div>
            </div>
            <span>
              {filteredCatalog.length} source{filteredCatalog.length === 1 ? '' : 's'}
            </span>
          </div>

          {filteredCatalog.length ? (
            <div className="vc-agent-skills-catalog-grid">
              {filteredCatalog.map((entry) => {
                const importing = pending === `import:${entry.id}`;
                return (
                  <article key={entry.id} className="vc-agent-skill-catalog-card">
                    <div className="vc-agent-skill-catalog-card-top">
                      <span className="i-ph:folder-notch-open" aria-hidden />
                      <span>{entry.category}</span>
                    </div>
                    <h3>{entry.name}</h3>
                    <p>{entry.description}</p>
                    <dl>
                      <div>
                        <dt>Repository</dt>
                        <dd>{entry.ownerRepo}</dd>
                      </div>
                      <div>
                        <dt>Folder</dt>
                        <dd>
                          <code>{entry.skillPath}</code>
                        </dd>
                      </div>
                      <div>
                        <dt>Ref</dt>
                        <dd>
                          <code>{entry.ref}</code>
                        </dd>
                      </div>
                    </dl>
                    <div className="vc-agent-skill-catalog-card-foot">
                      <span className="vc-agent-skill-audit-required">
                        <span className="i-ph:shield-warning" aria-hidden />
                        Audit required
                      </span>
                      <button
                        type="button"
                        className="vc-agent-skills-primary"
                        disabled={busy || importing || !data.workspaceId}
                        onClick={() =>
                          void runImport({ intent: 'import-catalog', catalogId: entry.id }, `import:${entry.id}`)
                        }
                      >
                        {importing ? (
                          <>
                            <span className="i-svg-spinners:90-ring-with-bg" aria-hidden />
                            Auditing…
                          </>
                        ) : entry.artifact ? (
                          'Audit latest'
                        ) : (
                          'Import & audit'
                        )}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="vc-agent-skills-empty">
              <span className="i-ph:magnifying-glass" aria-hidden />
              <h3>No source matches “{query}”</h3>
              <p>Try a repository, file format, or category.</p>
              <button type="button" className="vc-agent-skills-secondary" onClick={() => setQuery('')}>
                Clear search
              </button>
            </div>
          )}
        </div>
      )}

      {reviewPrompt ? (
        <DecisionForm
          prompt={reviewPrompt}
          reason={reason}
          acknowledged={acknowledged}
          error={decisionError}
          pending={pending === `decision:${reviewPrompt.artifact.id}:${reviewPrompt.decision}`}
          workspaceAvailable={Boolean(data.workspaceId)}
          onReasonChange={setReason}
          onAcknowledgedChange={setAcknowledged}
          onCancel={() => {
            if (!pending) {
              closeDecision();
            }
          }}
          onConfirm={() => void confirmDecision()}
        />
      ) : null}
    </section>
  );
}
