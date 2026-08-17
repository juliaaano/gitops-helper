# GitOps Patterns for RHDP Labs

Conventions for generating GitOps automation (Helm + ArgoCD) for RHDP lab and demo environments.
The canonical reference repo is `github.com/rhpds/rhdp-gitops-patterns`.

## Chart Model

Every lab has at least one Helm chart, optionally two:

- **`bootstrap-infra/`** (always) — Cluster-scoped shared resources deployed once. Operators,
  shared services (GitLab, Gitea, DevHub), tenant-lifecycle namespace. An external deployer
  creates a single ArgoCD `Application` pointing here.
- **`bootstrap-tenant/`** (multi-user only) — Per-user tenant environment. The external deployer
  creates one ArgoCD `Application` per user, injecting `username` and `deployer.domain` as
  helm values.

Single-user or shared-cluster labs may only need `bootstrap-infra`. The tenant chart is added
when per-user environments are deployed N times. Tenant always comes with infra — never standalone.

## Infra vs Tenant Decision

- **Infra**: cluster-wide or shared across users. Operators (Subscriptions, OperatorGroups),
  shared services, shared namespaces, cluster RBAC.
- **Tenant**: per-user, deployed N times. User namespaces, user RBAC, user applications, VMs,
  seed data, provision data.

## Tenant Namespace Isolation

**Everything in `bootstrap-tenant` must go into one of the tenant's own namespaces.**
Never deploy tenant resources into a shared or common namespace. If a resource is placed in
a namespace like `hello` (not prefixed with the username), it will be overwritten N times —
once per tenant deployment — causing conflicts.

Tenant namespaces are created from a list in `values.yaml`:

```yaml
username: user1
namespaces:
  - app
  - db
```

This produces `user1-app` and `user1-db`. All tenant resources must target one of these namespaces.

## RBAC

Every tenant namespace gets an automatic `edit` RoleBinding for the tenant user:

```yaml
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: {{ .Values.username }}-edit
  namespace: {{ .Values.username }}-<suffix>
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: edit
subjects:
- apiGroup: rbac.authorization.k8s.io
  kind: User
  name: {{ .Values.username }}
```

Additional RBAC (cluster-monitoring-view, lightspeed access, view on shared namespaces)
is added as needed per lab.

## Sync-Wave Ordering

Use ArgoCD sync-wave annotations to control deployment order:

| Wave | Resources |
|------|-----------|
| -2 | Namespaces, OperatorGroups, CatalogSources, Subscriptions |
| -1 | RBAC (RoleBindings, ClusterRoleBindings), ServiceAccounts |
| 0 | ConfigMaps, Secrets, Deployments, Services, standard workloads |
| 1+ | CRs that depend on operator-installed CRDs, Routes |

In the tenant chart, namespace creation (-2) must precede everything else.

## Operator CRDs

CRs that depend on CRDs installed by an operator Subscription need the annotation:

```yaml
argocd.argoproj.io/sync-options: SkipDryRunOnMissingResource=true
```

This prevents ArgoCD from failing the dry-run when the CRD does not yet exist.

## Known Operator Quirks

This section covers operators that are **not in a standard OLM catalog** at all, or that
need install-mode handling beyond a normal Subscription. For a `redhat-operators` package,
don't document its channel here — verify and pin it per "Verifying and Pinning Operator
Channels" below instead.

### Gitea Operator (RHPDS)

The Gitea operator is **not available** in the standard `community-operators` or `redhat-operators`
OLM catalogs. It requires a custom RHPDS CatalogSource. Always generate three resources together:

1. **CatalogSource** (sync-wave -2, in `openshift-marketplace`):
```yaml
apiVersion: operators.coreos.com/v1alpha1
kind: CatalogSource
metadata:
  name: redhat-gpte-gitea
  namespace: openshift-marketplace
  annotations:
    argocd.argoproj.io/sync-wave: "-2"
spec:
  sourceType: grpc
  image: quay.io/rhpds/gitea-catalog:latest
  displayName: Red Hat GPTE (Gitea Operator)
  publisher: Red Hat GPTE
```

2. **Subscription** (sync-wave -2, in `openshift-operators` — NOT a custom namespace):
```yaml
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: gitea-operator
  namespace: openshift-operators
  annotations:
    argocd.argoproj.io/sync-wave: "-2"
spec:
  channel: stable
  installPlanApproval: Automatic
  name: gitea-operator
  source: redhat-gpte-gitea
  sourceNamespace: openshift-marketplace
```

3. **No OperatorGroup needed** — the Gitea operator only supports `AllNamespaces` install mode.
   The `openshift-operators` namespace already has a global OperatorGroup. Do NOT create a
   namespace-scoped OperatorGroup for Gitea; it will conflict with AllNamespaces mode.

The Gitea CR (kind: Gitea) can be created in any namespace. Apply `SkipDryRunOnMissingResource`
to the Gitea CR since its CRD is installed by the operator.

## Verifying and Pinning Operator Channels

**Never write an operator Subscription's `channel:` from memory** — a plausible-sounding
name (`stable`, `fast-1.8`) may not exist, and even a correct one can be renamed later,
breaking the lab long after it was authored.

`quay.io/rhpds/olm_snapshot_redhat_catalog` is a weekly, per-OCP-version snapshot of
`redhat-operators` — the catalog AgnosticD's `install_operator` role actually pins
installs to (`install_operator_catalogsource_image`, agnosticd-v2). As a versioned,
public OCI image, this skill can check it directly: no live cluster, no MCP tools, same
category of read as cloning the patterns repo in Step 3.

### Mechanism

Use the bundled `scripts/verify_operator_channel.py` (path: see SKILL.md) — it already
handles caching and FBC parsing; don't hand-roll the quay.io/podman calls.

1. **Resolve the target OCP version** once per run (SKILL.md Step 5d) — from
   `publishing-house/spec.yaml`, the manifest, or by asking the user with
   `list-versions` as the candidate list.

2. **For each Subscription sourced from `redhat-operators`**, verify:

   ```bash
   python3 <path-to-this-skill>/scripts/verify_operator_channel.py verify \
     --ocp-version 4.22 \
     --package openshift-pipelines-operator-rh --channel latest
   ```

   (`<path-to-this-skill>` — resolve relative to wherever this SKILL.md was loaded from,
   same as Step 5d.)

3. **Act on the result:**
   - `verified: true` → the requested channel is real. Keep it.
   - `verified: false` → the requested channel doesn't exist. Use `resolved_channel`
     (the catalog's real `default_channel`) instead, and note the correction for the
     Step 7c summary: *"channel changed from 'X' (not found in vY.Z snapshot) to 'W'"*.
   - `package_found: false` → the package isn't in `redhat-operators`. Fall back to
     "Known Operator Quirks" handling, or ask the user.
   - Exit code 2 (`error` is one of `podman_unavailable`, `quay_unreachable`,
     `invalid_ocp_version`, `no_snapshot_for_version`, `extraction_failed`,
     `malformed_catalog_data`) → verification couldn't run. Do not guess. Write the
     Subscription with the best-available channel and flag it explicitly as
     **unverified** in Step 7c — an honest gap beats a silent guess.

4. **Pin, don't just verify.** Generate a `CatalogSource` in `bootstrap-infra/templates/`
   pointing at the exact `catalog_image` returned (sync-wave `-2`), and point the
   Subscription's `source`/`sourceNamespace` at it instead of the cluster default.
   **One `CatalogSource` for every `redhat-operators` Subscription in the lab** — a
   single snapshot image contains the whole catalog (100+ packages).

   ```yaml
   # Generated from quay.io/rhpds/olm_snapshot_redhat_catalog — pinned for reproducibility
   apiVersion: operators.coreos.com/v1alpha1
   kind: CatalogSource
   metadata:
     name: rhpds-redhat-operators
     namespace: openshift-marketplace
     annotations:
       argocd.argoproj.io/sync-wave: "-2"
   spec:
     sourceType: grpc
     image: quay.io/rhpds/olm_snapshot_redhat_catalog:v4.22_2026_08_10
     displayName: RHPDS Pinned Snapshot (redhat-operators)
     publisher: Red Hat GPTE
   ---
   apiVersion: operators.coreos.com/v1alpha1
   kind: Subscription
   metadata:
     name: openshift-pipelines-operator
     namespace: openshift-operators
     annotations:
       argocd.argoproj.io/sync-wave: "-2"
   spec:
     channel: latest
     installPlanApproval: Automatic
     name: openshift-pipelines-operator-rh
     source: rhpds-redhat-operators
     sourceNamespace: openshift-marketplace
   ```

   Name it `rhpds-redhat-operators` — unambiguous and reusable across every
   `redhat-operators` Subscription in the chart.

   CatalogSource and Subscriptions share wave `-2`; ArgoCD doesn't order within a wave,
   so the registry pod may not be ready yet. OLM retries resolution until it is — same
   behavior the Gitea quirk above already relies on, not a failure to fix.

This only applies to `redhat-operators`. Custom catalogs (Gitea's `redhat-gpte-gitea`)
stay documented under "Known Operator Quirks" above.

### Pinning to a specific CSV instead of a channel

Pinning the `CatalogSource` freezes which catalog the Subscription resolves against, but
it still tracks the latest CSV in its channel. To freeze the exact build too, use
`installPlanApproval: Manual` with a `startingCSV` from the verified package's bundle
list, and approve the InstallPlan out-of-band (or via an Ansible-in-Job step) —
independent of channel verification; decide Automatic vs. Manual+startingCSV separately.

## S2I Builder Images

Red Hat UBI9 S2I (Source-to-Image) builder images — such as `ubi9/nginx-122`, `ubi9/httpd-24`,
and `ubi9/python-311` — are **not intended to run directly as container images**. They are
builders that expect application source to be injected at build time.

When a lab prompt asks for a simple placeholder deployment using one of these images:

- **nginx-122**: Add `command: ["/usr/libexec/s2i/run"]` and mount a ConfigMap with
  a static `index.html` at `/opt/app-root/src`:
  ```yaml
  containers:
  - name: nginx
    image: registry.access.redhat.com/ubi9/nginx-122
    command: ["/usr/libexec/s2i/run"]
    ports:
    - containerPort: 8080
    volumeMounts:
    - name: content
      mountPath: /opt/app-root/src
  volumes:
  - name: content
    configMap:
      name: nginx-content
  ```
  Also create the ConfigMap with a basic `index.html`.

- **httpd-24**: Same pattern — `command: ["/usr/libexec/s2i/run"]` with content mounted
  at `/opt/app-root/src`.

- **python-311**: Add `command: ["python3", "-m", "http.server", "8080"]` to run a simple
  HTTP server without requiring application source.

Never deploy these S2I images as bare containers without a command override — they will
CrashLoopBackOff because the default entrypoint expects a source build.

## PVC with WaitForFirstConsumer StorageClass

On OpenShift clusters with `WaitForFirstConsumer` as the default storage class volume binding
mode, a PVC at sync-wave 0 (or earlier) can block ArgoCD sync because the PVC stays `Pending`
until a pod is scheduled that references it.

**Solution**: Place PVCs at the same sync-wave as (or after) the workload that mounts them.
If a pipeline workspace PVC is used by a Pipeline or PipelineRun, put it at sync-wave 0 or 1
alongside the Pipeline, not at wave -2 with namespaces.

## Ansible-in-Job Pattern

Use only when no declarative alternative exists (e.g., creating users via API, imperative cleanup).

Pattern:
1. ConfigMap containing an Ansible playbook
2. Job running the playbook image with the ConfigMap mounted
3. ArgoCD hook annotation (`Sync` for provisioning, `PreDelete` for cleanup)
4. Delete policy: `HookSucceeded`

For cleanup jobs, run in the `tenant-lifecycle` namespace (not the tenant's own namespace,
which may be deleted first). The tenant-lifecycle namespace has a ServiceAccount with
cross-namespace permissions.

## Per-User ArgoCD

Only provision a per-user ArgoCD instance when the lab exercise requires the user to
interact with ArgoCD directly. Do not use it just for deploying tenant workloads — that
is handled by the external deployer creating Applications.

Never allow users to deploy their applications through the cluster-wide `openshift-gitops`
ArgoCD. If they need ArgoCD access, provision a dedicated instance in one of their tenant
namespaces.

## Deployer Values

The external deployer (AgnosticD) injects a `deployer` value at deployment time:

```yaml
deployer:
  domain: apps.cluster-guid.sandbox.opentlc.com
  apiUrl: https://api.cluster-guid.sandbox.opentlc.com:6443
```

**Construct URLs from `deployer.domain` instead of passing full URLs as helm values.**
This minimizes the number of variables the deployer must inject and reduces coupling
between components.

Examples:

```yaml
# GitLab API URL — derived from namespace + domain, not a separate variable
apiBaseUrl: https://gitlab-{{ .Values.gitlab.namespace }}.{{ .Values.deployer.domain }}/api/v4

# Keycloak issuer — same pattern
issuer: https://keycloak-{{ .Values.rhsso.namespace }}.{{ .Values.deployer.domain }}/auth/realms/rhdp

# Application route — derived from username + domain
url: https://myapp-{{ .Values.username }}.{{ .Values.deployer.domain }}
```

Never hardcode cluster domains. If a template needs a URL to a service running on the cluster,
build it from the service's namespace and `deployer.domain`.

## AgnosticV Integration

The `ocp4_workload_gitops_bootstrap` role from AgnosticD creates an ArgoCD Application
pointing to a Helm chart in a Git repo. It is called separately for infra and tenant —
each as its own AgnosticV catalog item.

**Cluster catalog item** calls the role with `repo_path: bootstrap-infra`:
```yaml
ocp4_workload_gitops_bootstrap_repo_url: https://github.com/org/repo
ocp4_workload_gitops_bootstrap_repo_revision: "{{ gitops_repo_revision }}"
ocp4_workload_gitops_bootstrap_repo_path: bootstrap-infra
ocp4_workload_gitops_bootstrap_application_name: bootstrap-infra
```

**Tenant catalog item** calls the role with `repo_path: bootstrap-tenant` and a unique
application name per user:
```yaml
ocp4_workload_gitops_bootstrap_repo_url: https://github.com/org/repo
ocp4_workload_gitops_bootstrap_repo_revision: "{{ gitops_repo_revision }}"
ocp4_workload_gitops_bootstrap_repo_path: bootstrap-tenant
ocp4_workload_gitops_bootstrap_application_project: tenants
ocp4_workload_gitops_bootstrap_application_name: "bootstrap-{{ guid }}"
```

### Auto-injected values

The role automatically injects `deployer.domain`, `deployer.apiUrl`, and `deployer.guid`
into the helm values by combining them with the user-provided `helm_values`. Never pass
these manually.

### What belongs in helm_values

Only pass values that are **prone to external changes**:
- Git revisions and version pins (`targetRevision`, `gitops_repo_revision`)
- Container image tags
- Secrets (Ansible Vault encrypted)
- User count and prefix (`user.count`, `user.prefix`)
- Feature toggles that differ between dev and production

Everything else should have sensible defaults in the chart's `values.yaml`. This keeps
the AgnosticV config minimal and prevents the deployer from needing to know chart internals.

Operator channels are **not** deployer-managed values — they're verified and pinned into
the chart's defaults at generation time (see "Verifying and Pinning Operator Channels"
above), so there's nothing for the deployer to override.

### Version pinning

Use a `gitops_repo_revision` variable in the AgnosticV config that maps to a git tag:
```yaml
gitops_repo_revision: v1.0.0

ocp4_workload_gitops_bootstrap_repo_revision: "{{ gitops_repo_revision }}"
```

Pin to tags in production (`event.yaml`), use `main` in development (`dev.yaml`).

## Flat Chart — No Intra-Repo App-of-Apps

**Do not create ArgoCD Application CRs inside a chart that point back to subdirectories
of the same repository.** This is the "intra-repo app-of-apps" anti-pattern.

Anti-pattern example (do NOT do this):
```
bootstrap/
  templates/
    application-model-serving.yaml   → points to same-repo/model-serving/
    application-llama-stack.yaml     → points to same-repo/llama-stack/
    application-3scale.yaml          → points to same-repo/3scale/
model-serving/
llama-stack/
3scale/
```

This creates circular references, blast radius issues (any commit triggers multiple
ArgoCD syncs), and tight coupling between the orchestrator and the orchestrated.

**Instead, expand all manifests directly into the chart templates.** If the lab needs
model-serving resources, put those templates directly in `bootstrap-infra/templates/model-serving/`
or `bootstrap-tenant/templates/model-serving/` — not behind an ArgoCD Application indirection.

The only ArgoCD Applications that should exist are:
- The infra Application — created by the external deployer, pointing to `bootstrap-infra`
- The tenant Applications — created by the external deployer, pointing to `bootstrap-tenant`
- Optionally, the ApplicationSet in `bootstrap-infra` for bulk tenant deployment (disabled by default)

This keeps everything self-contained within the repo. For ephemeral demo and lab environments,
this is the right trade-off: autonomy and simplicity over component-level versioning.

## Provenance

When generating templates from a reference example, add a comment to the generated file
with the full git repo URL of the source:

```yaml
# Generated from https://github.com/redhat-gpte/rhdp-gitops-patterns/examples/modernize-ocp-virt
```

Use the actual repo URL and path — do not invent paths or append version numbers.

## Philosophy: AI-Driven Reuse

This skill is the reusability mechanism for GitOps patterns. Instead of shared Helm chart
libraries (which create dependency sprawl) or accepting divergent snowflakes, the skill
reads from a central reference repo (`rhdp-gitops-patterns`) and generates local copies.

- Each project owns its code autonomously — no runtime dependency on the reference repo.
- The reference repo evolves independently — improvements benefit future skill invocations.
- No "repos pointing to repos" — everything is expanded directly into the project.

## Reference Repo

Clone or check the reference repo for concrete examples:

```
github.com/rhpds/rhdp-gitops-patterns
├── skeleton/          Minimal starting point
└── examples/          Real lab automations to reference
```

When generating templates for a known pattern (GitLab, DevHub, Istio Gateway, per-user ArgoCD,
KubeVirt VMs), check the examples first. When the requested component has no matching example,
ask the user to provide a reference repo or manifests.
