# GitOps Helper Test Harness — Design Spec

## Overview

A Workflow-orchestrated multi-agent system that tests the `gitops-helper` skill by generating Helm charts from natural language prompts, validating them locally, deploying them to real OpenShift clusters via ArgoCD, and iteratively improving the skill based on failures.

The system runs 10 scenarios in parallel against 10 ephemeral clusters, with a critic agent that identifies systemic issues and directly edits the skill files. It loops up to 5 iterations until all scenarios pass. Successful scenarios graduate as new examples into the `rhdp-gitops-patterns` reference repo.

## Project Context

- **Skill under test:** `gitops-helper` (standalone mode only, no Publishing House)
- **Skill location:** `/Users/juliano/redhat/rhpds/gitops-helper/.claude/skills/gitops-helper/`
  - `SKILL.md` — 8-step workflow for generating GitOps automation
  - `references/gitops-patterns.md` — 14 codified practices
- **Test repo:** `https://github.com/juliaaano/gitops-helper` (generated charts pushed here for ArgoCD to pull)
- **Patterns repo:** `/Users/juliano/rhpds/rhdp-gitops-patterns` (successful scenarios graduated here, local commits only)
- **Deployer reference:** `/Users/juliano/redhat/agnosticd/core_workloads/roles/ocp4_workload_gitops_bootstrap/` (ArgoCD Application CR pattern)

## Project Structure

```
/Users/juliano/redhat/rhpds/gitops-helper/
  .claude/
    settings.json                # project-level permissions
    skills/gitops-helper/        # the skill under test (existing)
  scenarios/
    01-web-terminal-demo/
      prompt.md                  # natural language prompt for the skill
      automation/                # generated output
        bootstrap-infra/
        bootstrap-tenant/        # when applicable
      report.json                # structured execution report
    02-sample-app-workshop/
      ...
    ... (10 scenarios total)
  workflows/
    test-scenarios.js            # main Workflow script
  results/
    critic-analysis.md           # cross-scenario findings
    skill-changes.md             # changelog of skill edits
  credentials.txt                # user-provided: api_url admin_user admin_password per line
```

## Scenario Definitions

10 scenarios derived from the agnosticv catalog (`/Users/juliano/redhat/rhpds/agnosticv/`), using natural language prompts (not automation manifests). Each prompt describes what a real user would ask for.

### Distribution

- **3 simple** (1 infra-only, 2 infra+tenant)
- **5 medium** (1 infra-only, 4 infra+tenant)
- **2 complex** (1 infra-only, 1 infra+tenant)

### Scenario List

| # | Name | Tier | Type | Inspired by | Description |
|---|------|------|------|-------------|-------------|
| 01 | web-terminal-demo | simple | infra-only | ocp-gitops-example-infra | Single operator (WebTerminal) deployed via GitOps |
| 02 | sample-app-workshop | simple | infra+tenant | ocp-gitops-example-tenant | Per-user namespace with a sample app. 3 users |
| 03 | pipelines-workshop | simple | infra+tenant | OCP_ROLLOUTS | OpenShift Pipelines + per-user pipeline resources. 3 users |
| 04 | gitea-devspaces | medium | infra-only | OCP4_WORKSHOP_QUARKUS | Gitea operator + Dev Spaces operator. Shared dev environment |
| 05 | gitops-workshop | medium | infra+tenant | OCP_GITOPS | Gitea + GitOps + per-user ArgoCD instances + sample repos. 3 users |
| 06 | ocp-virt-lab | medium | infra+tenant | ocp-virt-gitops | OpenShift Virtualization + Gitea + per-user VMs. 3 users |
| 07 | serverless-workshop | medium | infra+tenant | ocp-getting-started | Serverless + Pipelines + per-user Knative services. 3 users |
| 08 | service-mesh-lab | medium | infra+tenant | modernize-ocp-virt | Service Mesh + Kiali + per-user mesh namespaces. 3 users |
| 09 | security-demo | complex | infra-only | rhacs-demo-cnv | RHACS + Pipelines + Quay. Multi-operator security stack |
| 10 | ai-dev-workshop | complex | infra+tenant | agentic-ai-openshift-aws | Gitea + Pipelines + GitOps + per-user AI app dev namespaces. 3 users |

Each scenario's `prompt.md` is a natural language request written as a real user would type it. Example for scenario 05:

> Create a GitOps automation for a workshop lab where 3 users each get their own namespace with an ArgoCD instance and a sample app repo in Gitea. The cluster already has the GitOps operator installed. Deploy Gitea as a shared operator on the cluster. Each user should have their own ArgoCD that syncs from their Gitea repo.

## Cluster Configuration

- **Count:** 10 ephemeral clusters, one per scenario
- **Credentials file:** `credentials.txt`, one line per cluster: `api_url admin_user admin_password`
- **Pre-installed:** OpenShift GitOps (ArgoCD) in `openshift-gitops` namespace
- **Users:** admin + user1, user2, user3 (normal users)
- **Lifecycle:** Clusters are destroyed after testing completes
- **Context isolation:** Each agent uses a separate kubeconfig file (`/tmp/kubeconfig-scenario-NN.yaml`) to avoid context collisions when running in parallel on the same machine. All `oc` and `kubectl` commands run with `KUBECONFIG` set to the agent's file.

## Workflow Architecture

The system uses Claude Code's Workflow tool — a JavaScript orchestration script that spawns subagents with structured output schemas.

### Phase 1 — Generate & Deploy (parallel, 10 agents)

Each scenario agent runs independently with its assigned cluster:

1. **Read** the scenario's `prompt.md`
2. **Derive cluster metadata** from credentials:
   - `deployer.apiUrl` — from `credentials.txt` (the api_url field)
   - `deployer.domain` — query the cluster: `oc get ingresses.config.openshift.io cluster -o jsonpath='{.spec.domain}'`
   - `deployer.guid` — use the scenario number zero-padded (e.g., `s01`, `s02`, ... `s10`)
3. **Invoke** the gitops-helper skill via the `Skill` tool with `skill: "gitops-helper"` and the scenario's prompt as `args`. The agent's prompt instructs the skill to run in standalone mode and output to `scenarios/NN-name/automation/`
3. **Validate locally** (10 min timeout, retry on failure up to 3 attempts):
   - Valid YAML syntax on all generated files
   - `helm template` succeeds without errors
   - Chart structure: `Chart.yaml`, `values.yaml`, `templates/` present
   - Template subdirectory nesting for scenarios with 5+ manifests (e.g., `templates/gitea/`, `templates/webterminal/`)
   - Sync-wave annotations present and correctly ordered (-2 for operators, -1 for RBAC, 0 for workloads, 1+ for CRs)
   - No intra-repo ArgoCD Application CRs (flat chart rule)
   - Tenant resources only in user-prefixed namespaces
   - Provenance comments present
   - `SkipDryRunOnMissingResource` on CRs depending on operator CRDs
   - If validation fails: feed errors back to the skill and retry generation
4. **Commit and push** generated charts to `https://github.com/juliaaano/gitops-helper`
   - `git add scenarios/NN-name/`
   - `git pull --rebase` (expect stale remote as other agents are pushing concurrently)
   - `git commit` and `git push`
5. **Deploy to cluster** (30 min timeout, no retries):
   - Set isolated kubeconfig: `export KUBECONFIG=/tmp/kubeconfig-scenario-NN.yaml` (each agent gets its own file to avoid context collisions when 10 agents run on the same machine)
   - `oc login` with admin credentials from `credentials.txt`
   - Create ArgoCD Application CR in `openshift-gitops` namespace for `bootstrap-infra`:
     ```yaml
     apiVersion: argoproj.io/v1alpha1
     kind: Application
     metadata:
       name: bootstrap-infra
       namespace: openshift-gitops
       finalizers:
         - resources-finalizer.argocd.argoproj.io
     spec:
       project: default
       source:
         repoURL: https://github.com/juliaaano/gitops-helper
         targetRevision: main
         path: scenarios/NN-name/automation/bootstrap-infra
         helm:
           values: |
             deployer:
               domain: <from oc get ingresses.config.openshift.io cluster>
               apiUrl: <from credentials.txt>
               guid: <scenario number, e.g. s01>
       destination:
         namespace: openshift-gitops
         server: https://kubernetes.default.svc
       syncPolicy:
         automated:
           prune: false
           selfHeal: false
     ```
   - For tenant scenarios, create additional Applications per user:
     ```yaml
     metadata:
       name: tenant-user1  # tenant-user2, tenant-user3
     spec:
       source:
         path: scenarios/NN-name/automation/bootstrap-tenant
         helm:
           values: |
             username: user1
             deployer:
               domain: <from oc get ingresses.config.openshift.io cluster>
               apiUrl: <from credentials.txt>
               guid: <scenario number, e.g. s01>
     ```
   - Wait for ArgoCD Applications to show `Synced` + `Healthy`
   - Verify all pods `Running` or `Completed`
   - Verify operator CSVs show `Succeeded`
   - For tenant scenarios: verify user namespaces exist and RBAC allows user access
6. **Write** structured report to `scenarios/NN-name/report.json`

If generation fails after 3 retries, deployment is skipped (`"status": "skipped"`).

### Structured Report Schema

Each agent returns:

```json
{
  "scenario": "05-gitops-workshop",
  "tier": "medium",
  "type": "infra+tenant",
  "iterations": [
    {
      "iteration": 1,
      "generation": {
        "status": "pass|fail",
        "attempts": 1,
        "duration_seconds": 180,
        "errors": [],
        "warnings": [],
        "charts_generated": ["bootstrap-infra", "bootstrap-tenant"]
      },
      "deployment": {
        "status": "pass|fail|skipped",
        "duration_seconds": 420,
        "argocd_apps": [
          {"name": "bootstrap-infra", "sync": "Synced", "health": "Healthy"}
        ],
        "operators": [
          {"name": "op-name", "csv": "csv-version", "phase": "Succeeded"}
        ],
        "pods_healthy": 12,
        "pods_failed": 0,
        "tenant_validation": {
          "namespaces_created": ["user1-app", "user2-app", "user3-app"],
          "rbac_verified": true
        },
        "errors": []
      }
    }
  ]
}
```

### Phase 2 — Critic Analysis (serial, 1 agent)

A single critic agent receives all 10 reports and:

1. **Categorizes failures:**
   - Systemic generation issues — failed across multiple scenarios
   - Systemic deployment issues — generated fine but failed on cluster consistently
   - One-off failures — isolated to a single scenario
   - Successes — what the skill got right (to avoid regression)

2. **Identifies root causes** and proposes fixes to:
   - `SKILL.md` — workflow steps, rules, instructions
   - `references/gitops-patterns.md` — conventions, practices, examples

3. **Applies changes** — directly edits skill files, commits locally (does not push)

4. **Writes output artifacts:**
   - `results/critic-analysis.md` — full analysis with severity ranking
   - `results/skill-changes.md` — changelog with before/after snippets and reasoning

5. **Returns** list of scenario IDs to re-run

### Cleanup Step (before each re-run)

For each failed scenario's cluster:

1. Delete ArgoCD Applications: `oc delete application bootstrap-infra -n openshift-gitops` (and tenant apps)
2. Wait up to **3 minutes** for graceful deletion (finalizer cascade)
3. If still present after 3 minutes, force-remove by patching out the finalizer:
   ```
   oc patch application <name> -n openshift-gitops \
     -p '{"metadata":{"finalizers":null}}' --type=merge
   ```
4. Best-effort sweep of orphaned namespaces stuck in `Terminating` (remove `kubernetes` finalizer)
5. Verify no ArgoCD Applications remain before re-deploying

### Iteration Loop

The system loops up to **5 iterations**:

```
Iteration 1:
  Phase 1 — Generate & Deploy (all 10 scenarios, parallel)
  Phase 2 — Critic Analysis
  → All passed? Stop, proceed to graduation
  → Failures? Continue

Iteration 2-5:
  Cleanup — Delete ArgoCD Applications on failed clusters
  Phase 1 — Re-generate & Deploy (only failed scenarios, parallel)
  Phase 2 — Critic Analysis (has history from all prior iterations)
  → All passed or iteration 5? Stop
```

**Exit conditions (whichever comes first):**
- All 10 scenarios pass
- 5 iterations completed
- No new failures to re-run (remaining failures flagged as needing human intervention)

**Critic escalation across iterations:**
The critic receives the full iteration history. If a fix it applied in iteration N didn't help in iteration N+1, it knows that approach failed and tries something different. By iteration 5, remaining failures are genuinely hard problems.

## Graduating Successful Scenarios

After the loop completes, a final agent takes all passing scenarios and commits them to the patterns repo.

**Target:** `/Users/juliano/rhpds/rhdp-gitops-patterns/examples/`

**Process:**
1. Copy `automation/` contents to `examples/<scenario-name>/`
2. Sanitize test-specific values:
   - Replace hardcoded cluster domains with `{{ .Values.deployer.domain }}`
   - Remove test GUIDs
   - Ensure `values.yaml` has sensible defaults
   - Add comment header noting the example was generated and validated
3. One commit per graduated scenario:
   ```
   feat(examples): add web-terminal-demo example

   Generated and validated by gitops-helper test harness.
   Passed generation validation and deployment to live cluster.
   ```
4. All commits local only — not pushed to upstream

**Exclusions:**
- Failed scenarios are not graduated
- `prompt.md` and `report.json` stay in the gitops-helper repo only

## Project Permissions

Project-level `.claude/settings.json` allowing mutating commands the agents need:

```json
{
  "permissions": {
    "allow": [
      "Bash(oc login:*)",
      "Bash(oc apply:*)",
      "Bash(oc create:*)",
      "Bash(oc delete:*)",
      "Bash(oc project:*)",
      "Bash(oc new-project:*)",
      "Bash(oc adm:*)",
      "Bash(oc patch:*)",
      "Bash(kubectl apply:*)",
      "Bash(kubectl create:*)",
      "Bash(kubectl delete:*)",
      "Bash(kubectl wait:*)",
      "Bash(kubectl patch:*)",
      "Bash(helm template:*)",
      "Bash(helm lint:*)",
      "Bash(git push:*)",
      "Bash(git pull:*)",
      "Bash(git rebase:*)",
      "Bash(chmod:*)",
      "Bash(bash /tmp/rhdp-gitops-patterns*)",
      "Bash(bash /Users/juliano/rhpds/rhdp-gitops-patterns*)",
      "Bash(/tmp/rhdp-gitops-patterns/scaffold.sh:*)",
      "Bash(/Users/juliano/rhpds/rhdp-gitops-patterns/scaffold.sh:*)"
    ]
  }
}
```

Read-only commands (`oc get`, `oc describe`, `kubectl get`, `helm template`, etc.) are covered by the user's global settings.

## Timeouts

| Phase | Timeout | Retry |
|-------|---------|-------|
| Generation (skill invocation + validation) | 10 minutes | Up to 3 attempts |
| Deployment (ArgoCD sync + health checks) | 30 minutes | No retries |
| Cleanup (ArgoCD Application deletion) | 3 minutes graceful, then force-remove | N/A |

## Success Criteria

**Generation validation (all must pass):**
- Valid YAML syntax
- `helm template` succeeds
- Correct chart structure (`Chart.yaml`, `values.yaml`, `templates/`)
- Sync-wave annotations correct
- Flat chart rule (no intra-repo ArgoCD Application CRs)
- Tenant namespace isolation (user-prefixed namespaces only)
- Provenance comments present
- `SkipDryRunOnMissingResource` on operator-dependent CRs

**Deployment validation (all must pass):**
- ArgoCD Applications show `Synced` + `Healthy`
- All pods `Running` or `Completed`
- Operator CSVs show `Succeeded`
- Tenant namespaces exist with correct RBAC (tenant scenarios only)
