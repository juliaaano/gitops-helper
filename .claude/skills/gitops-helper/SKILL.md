---
name: rhdp-publishing-house:gitops-helper
description: This skill should be used when the user asks to "write GitOps automation", "create Helm charts", "set up ArgoCD for this lab", "generate GitOps manifests", "build GitOps deployment", or "deploy with Helm and ArgoCD". Generates GitOps (Helm + ArgoCD) automation for RHDP lab environments following rhdp-gitops-patterns conventions.
context: main
---

# GitOps Helper

You generate GitOps automation (Helm charts + ArgoCD manifests) for RHDP lab and demo environments.
You follow the conventions in @rhdp-publishing-house/skills/gitops-helper/references/gitops-patterns.md.
Scripts referenced below (`verify_operator_channel.py`, `sync_reference_repo.sh`) are
bundled in this skill's own `scripts/` directory (a sibling of `references/`) — resolve
paths relative to wherever you loaded this SKILL.md from.

## Step 1 — Clone reference repo

Required — the skeleton and examples are the foundation for all generated automation.

```bash
scripts/sync_reference_repo.sh required https://github.com/rhpds/rhdp-gitops-patterns.git /tmp/rhdp-gitops-patterns
```

Non-zero exit → STOP. Show the output and tell the user:
> "Cannot clone or update the rhdp-gitops-patterns reference repo. This skill requires it
> for the skeleton and examples. Check your network connection and try again."

## Step 2 — Additional reference repos

Use `AskUserQuestion` with two options:

- **"Proceed with rhdp-gitops-patterns (Recommended)"** — continue with the default repo only.
- **"Add additional reference repos"** — free text where the user can provide extra repo URLs
  to use as examples alongside the default patterns repo.

Additional repos are for **examples only** — they do not replace the skeleton or the default
examples.

```bash
scripts/sync_reference_repo.sh optional /tmp/user-gitops-ref REPO_URL_1 REPO_URL_2 ...
```

Failures print a `WARN:` line to stderr — warn the user and continue with whatever succeeded.

## Step 3 — Gather inputs

Collect inputs in this priority order, combining all sources:

### 3a. Automation manifest

Look for `publishing-house/spec/automation-manifest.yaml` or any YAML file the user
points to. If it exists, read it.
This is one input — not a contract. Do not require specific fields or a specific format.
Use whatever is there to inform your work.

### 3b. Skill arguments

Check if the user passed arguments when invoking the skill. Combine with manifest data.

### 3c. Target OpenShift version

**Always run `list-versions` and always confirm with `AskUserQuestion`** — even when a
version is already known from context, never skip either step.

Needed later in Step 5b to verify and pin operator channels.

```bash
python3 <path-to-this-skill>/scripts/verify_operator_channel.py list-versions
```

Check whether a version is already known from context — a skill argument (3b) takes
priority over `publishing-house/spec/automation-manifest.yaml` (3a). Build the
`AskUserQuestion` options from the command's exact output (newest first), adding the
context version too if it isn't already in that list, plus free text for anything else.

Preselect the first option — never label it "(Recommended)", label it by source instead:
- `X.Y (User provided)` — user provided input
- `X.Y (As per automation-manifest.yaml)` — the manifest set it
- `X.Y (Latest)` — neither did; it's the newest version returned

Every other option must be a literal array element from that JSON output — not a number
you recall or assume.

Store the chosen `major.minor` version for reuse across every operator verified in Step 5b —
run this once per run, not once per operator.

### 3d. Clarifying questions

Check what's still unclear after exhausting every source available: the manifest (3a),
skill arguments (3b), and the conventions/examples in the cloned reference repo (Steps
1–2). Ask the user only about genuine gaps — not something any of those sources already
answered. Typical gaps to check for, whether or not a manifest exists:
- What namespaces does each user need?
- What applications, operators, or services should be pre-configured?
- Are there any VMs (KubeVirt)?
- Does the user need their own ArgoCD instance?

If no manifest was found in 3a at all, say so before asking:
> "I didn't find an automation manifest. Do you have one you'd like to point me to?"

If the user provides a path, read it and combine with other inputs.

Always combine all inputs — manifest, arguments, reference-repo conventions, and user answers.

## Step 4 — Scaffold

### 4a. Determine chart structure

`bootstrap-infra` is always generated — every lab needs cluster-scoped resources.

`bootstrap-tenant` is only needed for multi-user labs where per-user environments are deployed
N times. Single-user or shared-cluster labs may only need infra.

Analyze the gathered inputs to determine whether tenant is needed. Signals that suggest tenant:
- Multiple users or per-user namespaces mentioned
- Per-user RBAC, applications, or VMs
- Topology is per-student or multi-user
- Manifest has `multi_user: true` or `users_per_deployment > 1`

Signals that suggest infra-only:
- Single user or single deployment
- No per-user resources, everything is cluster-wide
- Lab is a shared environment with no user isolation

Use `AskUserQuestion` with your recommendation based on the inputs:
- **"Infra + Tenant (Recommended)"** or **"Infra only (Recommended)"** — whichever fits the inputs.
- The other option as the alternative.

### 4b. Run the scaffold script

Use the deterministic scaffold script from the cloned reference repo:

```bash
/tmp/rhdp-gitops-patterns/scaffold.sh --target automation
```

If tenant was confirmed in 4a, add the flag:
```bash
/tmp/rhdp-gitops-patterns/scaffold.sh --target automation --with-tenant
```

If the script fails → STOP and show the error.

### 4c. Customize values

After scaffolding, edit the copied files with project-specific values:

- `automation/bootstrap-infra/values.yaml` — update tenant-lifecycle config and any
  infra-level settings from the gathered inputs.
- If tenant was scaffolded: `automation/bootstrap-tenant/values.yaml` — set the namespace
  list, deployer domain from the gathered inputs.

## Step 5 — Populate templates

### 5a. Classify resources

For each component from the inputs, decide:
- **Infra** if cluster-wide or shared (operators, shared services) → `automation/bootstrap-infra/templates/`
- **Tenant** if per-user (applications, VMs, RBAC, seed data) → `automation/bootstrap-tenant/templates/`

If a resource looks tenant-scoped but no tenant chart was scaffolded, warn the user:
> "This resource looks per-user but there's no tenant chart. Should I add bootstrap-tenant,
> or place this in infra?"

If the user wants to add tenant, run the scaffold script again with `--with-tenant`
(it will only copy bootstrap-tenant since bootstrap-infra already exists).

### 5b. Generate templates

For each component:

1. **Check reference repo examples first.** Search the default `rhdp-gitops-patterns/examples/`
   and any additional user-provided repos. If a matching pattern exists (e.g., GitLab, DevHub,
   Istio Gateway, per-user ArgoCD, KubeVirt VMs), use it as the basis for generation.
   Adapt values and namespaces to the current project. Add a provenance comment to each
   generated file with the full git repo URL of the source, e.g.
   `# Generated from https://github.com/redhat-gpte/rhdp-gitops-patterns/examples/modernize-ocp-virt`.

   **Never generate ArgoCD Application CRs that point back to subdirectories of the same repo.**
   Expand all manifests directly into the chart templates.

2. **If no example matches**, ask the user: "I don't have a reference pattern for deploying
   [component]. Can you point me to a repo or manifests I can use as a starting point?"

3. **If the user has no reference**, generate templates based on best practices and the
   information available. Tell the user what you assumed and ask for review.

Apply sync-wave annotations per the ordering conventions in `gitops-patterns.md`.

**Before generating any operator Subscription**, check the "Known Operator Quirks"
section in `gitops-patterns.md`. Some operators (e.g., Gitea) are not in standard
OLM catalogs and require a custom CatalogSource or specific install modes. Always
apply these requirements during generation -- do not rely on deployment-time debugging.

**For any Subscription sourced from `redhat-operators`**, verify and pin the channel
against the RHPDS snapshot: see "Verifying and Pinning Operator Channels" in
`gitops-patterns.md`. It resolves the real channel for the target OCP version (Step 3c)
and pins the Subscription to a frozen snapshot instead of the cluster's floating
catalog. If verification can't run, say so in the Step 5c summary instead of guessing.

**Before using any S2I builder image** (ubi9/nginx-122, ubi9/httpd-24, ubi9/python-311),
check the "S2I Builder Images" section in `gitops-patterns.md`. These images require
a command override and content mount -- they will CrashLoopBackOff if deployed bare.

**For PVCs**, place them at the same sync-wave as the workload that uses them
(not with namespaces at wave -2). See "PVC with WaitForFirstConsumer StorageClass"
in `gitops-patterns.md`.

Ensure all tenant resources target one of the tenant's namespaces (never a shared namespace).

### 5c. Present for review

Show the user what was generated:
- List of files created
- Summary of what goes in infra vs tenant
- Any assumptions made
- Any components that need user-provided references
- Operator channel results: verified/pinned as-is, corrected (old → real value), or
  unverified (flagged for manual confirmation)

Wait for the author to review the generated files.

## Step 6 — Review and next steps

Tell the user to review, stage, and commit the generated files themselves.

Then print a suggested AgnosticV `common.yml` snippet to the console.

Generate a snippet for the cluster catalog item (`bootstrap-infra`):
```yaml
ocp4_workload_gitops_bootstrap_repo_url: https://github.com/ORG/REPO
ocp4_workload_gitops_bootstrap_repo_revision: main
ocp4_workload_gitops_bootstrap_repo_path: bootstrap-infra
ocp4_workload_gitops_bootstrap_application_name: bootstrap-infra
ocp4_workload_gitops_bootstrap_helm_values:
  # Only include values prone to external changes.
  # deployer.domain, deployer.apiUrl, and deployer.guid are auto-injected.
  ...
```

If `bootstrap-tenant` was generated, also print a tenant snippet:
```yaml
ocp4_workload_gitops_bootstrap_repo_url: https://github.com/ORG/REPO
ocp4_workload_gitops_bootstrap_repo_revision: main
ocp4_workload_gitops_bootstrap_repo_path: bootstrap-tenant
ocp4_workload_gitops_bootstrap_application_project: tenants
ocp4_workload_gitops_bootstrap_application_name: "bootstrap-{{ guid }}"
ocp4_workload_gitops_bootstrap_helm_values:
  username: "{{ ocp4_workload_user_base }}{{ user_num }}"
  ...
```

Populate `helm_values` with only deployer-managed values: image tags, secrets,
user count/prefix (`repo_revision` is fixed at `main`, not a helm value).
Operator channels are already verified and pinned in `values.yaml` defaults
(Step 5b) — leave them there unless a deployment needs a different pinned
snapshot.

## Rules

- Do not hardcode cluster domains — construct URLs from `deployer.domain`.
- Never enable the ApplicationSet in `bootstrap-infra`. Do not add a `tenant:` key to its `values.yaml`. The ApplicationSet is for manual use only.
- Do not advance the lifecycle phase — that is the development skill's job.
