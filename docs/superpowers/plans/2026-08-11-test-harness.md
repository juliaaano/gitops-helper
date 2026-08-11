# GitOps Helper Test Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Workflow-orchestrated multi-agent system that tests the gitops-helper skill across 10 scenarios, deploys to real OpenShift clusters, and iteratively improves the skill based on failures.

**Architecture:** A single Claude Code Workflow script (`workflows/test-scenarios.js`) orchestrates everything. It spawns a bootstrap agent to read inputs, fans out 10 scenario agents in parallel (one per cluster), runs a critic agent to analyze results and edit skill files, then loops up to 5 iterations. Successful scenarios graduate as examples to the rhdp-gitops-patterns repo.

**Tech Stack:** Claude Code Workflow tool (JavaScript), Helm, ArgoCD, OpenShift CLI (`oc`), Git

## Global Constraints

- Standalone mode only — no Publishing House integration
- All `oc`/`kubectl` commands must set `KUBECONFIG=/tmp/kubeconfig-scenario-NN.yaml` for context isolation
- Generated charts pushed to `https://github.com/juliaaano/gitops-helper` (same repo, different paths per scenario)
- Git pushes use `git pull --rebase` before push (parallel agents pushing concurrently)
- Graduated examples committed locally only to `/Users/juliano/rhpds/rhdp-gitops-patterns` — never pushed
- Patterns reference repo at `/Users/juliano/rhpds/rhdp-gitops-patterns` (already cloned)
- Skill files at `.claude/skills/gitops-helper/SKILL.md` and `.claude/skills/gitops-helper/references/gitops-patterns.md`
- Generation timeout: 10 minutes, up to 3 retry attempts
- Deployment timeout: 30 minutes, no retries
- Cleanup timeout: 3 minutes graceful, then force-remove finalizers
- Up to 5 iterations of the generate→deploy→critique loop

## File Map

```
.claude/settings.json                          # NEW — project-level permissions
.gitignore                                     # NEW — ignore credentials, reports, kubeconfigs
scenarios/01-web-terminal-demo/prompt.md        # NEW — simple, infra-only
scenarios/02-sample-app-workshop/prompt.md      # NEW — simple, infra+tenant
scenarios/03-pipelines-workshop/prompt.md       # NEW — simple, infra+tenant
scenarios/04-gitea-devspaces/prompt.md          # NEW — medium, infra-only
scenarios/05-gitops-workshop/prompt.md          # NEW — medium, infra+tenant
scenarios/06-ocp-virt-lab/prompt.md             # NEW — medium, infra+tenant
scenarios/07-serverless-workshop/prompt.md      # NEW — medium, infra+tenant
scenarios/08-service-mesh-lab/prompt.md         # NEW — medium, infra+tenant
scenarios/09-security-demo/prompt.md            # NEW — complex, infra-only
scenarios/10-ai-dev-workshop/prompt.md          # NEW — complex, infra+tenant
workflows/test-scenarios.js                     # NEW — main Workflow orchestration script
results/.gitkeep                                # NEW — placeholder for results dir
```

---

### Task 1: Project Scaffolding and Permissions

**Files:**
- Create: `.claude/settings.json`
- Create: `.gitignore`
- Create: `results/.gitkeep`

**Interfaces:**
- Consumes: nothing
- Produces: project-level permissions that allow mutating `oc`, `kubectl`, `helm`, and `git` commands for all subsequent tasks

- [ ] **Step 1: Create project-level permissions**

Write `.claude/settings.json`:

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

- [ ] **Step 2: Create .gitignore**

Write `.gitignore`:

```
# Cluster credentials — never commit real credentials
credentials.txt

# Generated reports — these are outputs, not source
scenarios/*/report.json

# Generated automation — produced by the skill at runtime
scenarios/*/automation/

# Critic analysis results
results/critic-analysis.md
results/skill-changes.md

# Kubeconfig files
/tmp/kubeconfig-scenario-*.yaml
```

- [ ] **Step 3: Create directory structure**

```bash
mkdir -p scenarios/01-web-terminal-demo
mkdir -p scenarios/02-sample-app-workshop
mkdir -p scenarios/03-pipelines-workshop
mkdir -p scenarios/04-gitea-devspaces
mkdir -p scenarios/05-gitops-workshop
mkdir -p scenarios/06-ocp-virt-lab
mkdir -p scenarios/07-serverless-workshop
mkdir -p scenarios/08-service-mesh-lab
mkdir -p scenarios/09-security-demo
mkdir -p scenarios/10-ai-dev-workshop
mkdir -p workflows
mkdir -p results
touch results/.gitkeep
```

- [ ] **Step 4: Commit**

```bash
git add .claude/settings.json .gitignore results/.gitkeep
git commit -m "chore: scaffold project structure and permissions"
```

---

### Task 2: Simple Scenario Prompts (01-03)

**Files:**
- Create: `scenarios/01-web-terminal-demo/prompt.md`
- Create: `scenarios/02-sample-app-workshop/prompt.md`
- Create: `scenarios/03-pipelines-workshop/prompt.md`

**Interfaces:**
- Consumes: nothing
- Produces: 3 prompt files read by the workflow script's bootstrap agent

- [ ] **Step 1: Write scenario 01 — web-terminal-demo (simple, infra-only)**

Write `scenarios/01-web-terminal-demo/prompt.md`:

```markdown
Create a GitOps automation for a simple demo environment that deploys the Web Terminal operator on an OpenShift cluster.

The cluster already has the OpenShift GitOps operator (ArgoCD) installed in the openshift-gitops namespace. You do not need to install ArgoCD.

Requirements:
- Deploy the Web Terminal operator via an OLM Subscription
- Use the "fast" channel for the Web Terminal operator
- This is a single-user demo, no per-user resources needed — only bootstrap-infra, no bootstrap-tenant
- The reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns

Generate the Helm chart in standalone mode. Output the bootstrap-infra chart only.
```

- [ ] **Step 2: Write scenario 02 — sample-app-workshop (simple, infra+tenant)**

Write `scenarios/02-sample-app-workshop/prompt.md`:

```markdown
Create a GitOps automation for a workshop where 3 users each get their own namespace with a sample web application deployed.

The cluster already has the OpenShift GitOps operator (ArgoCD) installed in the openshift-gitops namespace. You do not need to install ArgoCD.

Requirements:
- bootstrap-infra should set up a shared namespace called "workshop-infra" for any cluster-level resources
- bootstrap-tenant should create a per-user namespace named <username>-app (e.g., user1-app, user2-app, user3-app)
- Each user's namespace should contain:
  - A Deployment running an nginx container (image: registry.access.redhat.com/ubi9/nginx-122) with 1 replica
  - A Service exposing port 8080
  - A Route to expose the service externally
  - An edit RoleBinding granting the user edit access to their namespace
- The tenant chart receives "username" and "deployer.domain" as Helm values
- 3 users: user1, user2, user3
- The reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns

Generate the Helm charts in standalone mode. Output both bootstrap-infra and bootstrap-tenant.
```

- [ ] **Step 3: Write scenario 03 — pipelines-workshop (simple, infra+tenant)**

Write `scenarios/03-pipelines-workshop/prompt.md`:

```markdown
Create a GitOps automation for a workshop that teaches OpenShift Pipelines (Tekton) to 3 users.

The cluster already has the OpenShift GitOps operator (ArgoCD) installed in the openshift-gitops namespace. You do not need to install ArgoCD.

Requirements:
- bootstrap-infra should:
  - Install the OpenShift Pipelines operator via OLM Subscription (channel: "pipelines-1.17")
  - Create a shared namespace "pipelines-infra" for cluster-level resources
- bootstrap-tenant should create per-user resources:
  - A namespace named <username>-pipelines (e.g., user1-pipelines)
  - An edit RoleBinding granting the user edit access
  - A sample Tekton Pipeline resource with two tasks: "git-clone" and "build"
  - A sample PipelineRun that references the Pipeline
  - A PersistentVolumeClaim (1Gi, ReadWriteOnce) for pipeline workspace storage
- The tenant chart receives "username" and "deployer.domain" as Helm values
- 3 users: user1, user2, user3
- The reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns

Generate the Helm charts in standalone mode. Output both bootstrap-infra and bootstrap-tenant.
```

- [ ] **Step 4: Commit**

```bash
git add scenarios/01-web-terminal-demo/prompt.md \
       scenarios/02-sample-app-workshop/prompt.md \
       scenarios/03-pipelines-workshop/prompt.md
git commit -m "feat: add simple scenario prompts (01-03)"
```

---

### Task 3: Medium Scenario Prompts (04-08)

**Files:**
- Create: `scenarios/04-gitea-devspaces/prompt.md`
- Create: `scenarios/05-gitops-workshop/prompt.md`
- Create: `scenarios/06-ocp-virt-lab/prompt.md`
- Create: `scenarios/07-serverless-workshop/prompt.md`
- Create: `scenarios/08-service-mesh-lab/prompt.md`

**Interfaces:**
- Consumes: nothing
- Produces: 5 prompt files read by the workflow script's bootstrap agent

- [ ] **Step 1: Write scenario 04 — gitea-devspaces (medium, infra-only)**

Write `scenarios/04-gitea-devspaces/prompt.md`:

```markdown
Create a GitOps automation for a shared development environment that provides Gitea (git hosting) and OpenShift Dev Spaces (cloud IDE) on an OpenShift cluster.

The cluster already has the OpenShift GitOps operator (ArgoCD) installed in the openshift-gitops namespace. You do not need to install ArgoCD.

Requirements:
- This is a shared environment with no per-user isolation — only bootstrap-infra, no bootstrap-tenant
- bootstrap-infra should:
  - Install the Gitea operator via OLM (use the community Gitea operator from OperatorHub)
  - Create a Gitea CR instance in a "gitea" namespace with:
    - Admin user: gitea-admin
    - PostgreSQL storage enabled
    - 5Gi PVC for Gitea data
  - Install the OpenShift Dev Spaces operator via OLM Subscription (channel: "stable")
  - Create a CheCluster CR in the "openshift-devspaces" namespace with default settings
- Ensure operator CRDs are handled with SkipDryRunOnMissingResource sync option
- Use appropriate sync-waves: operators at wave -2, namespaces at wave -2, CRs at wave 1
- The reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns

Generate the Helm chart in standalone mode. Output the bootstrap-infra chart only.
```

- [ ] **Step 2: Write scenario 05 — gitops-workshop (medium, infra+tenant)**

Write `scenarios/05-gitops-workshop/prompt.md`:

```markdown
Create a GitOps automation for a workshop that teaches OpenShift GitOps (ArgoCD) fundamentals to 3 users. Each user gets their own ArgoCD instance to practice with.

The cluster already has the OpenShift GitOps operator (ArgoCD) installed in the openshift-gitops namespace. You do not need to install ArgoCD — it is already available cluster-wide.

Requirements:
- bootstrap-infra should:
  - Install the Gitea operator and create a Gitea instance in a "gitea" namespace
  - Create a shared sample Git repository in Gitea containing a simple Kubernetes Deployment + Service manifest (an httpd app) that users will deploy via their ArgoCD
  - Ensure each user gets a Gitea account (user1, user2, user3 with password "openshift")
- bootstrap-tenant should create per-user resources:
  - A namespace named <username>-argocd for the user's ArgoCD instance
  - A namespace named <username>-app where the user will deploy workloads
  - A namespace named <username>-app-staging as a second target namespace
  - An ArgoCD CR (kind: ArgoCD) in <username>-argocd namespace, configured with:
    - Resource limits appropriate for a workshop (512Mi memory)
    - RBAC granting the user admin access to their ArgoCD
    - Managed namespaces: <username>-app and <username>-app-staging
  - Edit RoleBindings for the user in all three namespaces
- The tenant chart receives "username" and "deployer.domain" as Helm values
- 3 users: user1, user2, user3
- The reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns

Generate the Helm charts in standalone mode. Output both bootstrap-infra and bootstrap-tenant.
```

- [ ] **Step 3: Write scenario 06 — ocp-virt-lab (medium, infra+tenant)**

Write `scenarios/06-ocp-virt-lab/prompt.md`:

```markdown
Create a GitOps automation for a lab that demonstrates OpenShift Virtualization with per-user virtual machines. 3 users each get their own VM.

The cluster already has the OpenShift GitOps operator (ArgoCD) installed in the openshift-gitops namespace. You do not need to install ArgoCD.

Requirements:
- bootstrap-infra should:
  - Install the OpenShift Virtualization (CNV) operator via OLM Subscription (channel: "stable")
  - Create the HyperConverged CR in the "openshift-cnv" namespace to activate the CNV stack
  - Install the Gitea operator and create a Gitea instance in a "gitea" namespace
- bootstrap-tenant should create per-user resources:
  - A namespace named <username>-vms (e.g., user1-vms)
  - An edit RoleBinding for the user
  - A VirtualMachine CR running Fedora (use the standard Fedora DataSource from openshift-virtualization-os-images namespace):
    - Name: <username>-fedora-vm
    - 2 CPU cores, 4Gi memory
    - 20Gi disk from DataSource
    - Running state: true
    - Cloud-init to set password to "redhat"
- Operator CRDs (HyperConverged, VirtualMachine) must have SkipDryRunOnMissingResource sync option
- The tenant chart receives "username" and "deployer.domain" as Helm values
- 3 users: user1, user2, user3
- The reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns

Generate the Helm charts in standalone mode. Output both bootstrap-infra and bootstrap-tenant.
```

- [ ] **Step 4: Write scenario 07 — serverless-workshop (medium, infra+tenant)**

Write `scenarios/07-serverless-workshop/prompt.md`:

```markdown
Create a GitOps automation for a workshop teaching OpenShift Serverless (Knative) and Pipelines to 3 users.

The cluster already has the OpenShift GitOps operator (ArgoCD) installed in the openshift-gitops namespace. You do not need to install ArgoCD.

Requirements:
- bootstrap-infra should:
  - Install OpenShift Serverless operator via OLM Subscription (channel: "stable")
  - Create the KnativeServing CR in "knative-serving" namespace
  - Create the KnativeEventing CR in "knative-eventing" namespace
  - Install OpenShift Pipelines operator via OLM Subscription (channel: "pipelines-1.17")
- bootstrap-tenant should create per-user resources:
  - A namespace named <username>-serverless (e.g., user1-serverless)
  - An edit RoleBinding for the user
  - A sample Knative Service (ksvc) named "hello" using image quay.io/openshift-knative/showcase serving on port 8080
  - A sample Tekton Pipeline with a task that builds and deploys a Knative service
  - A PersistentVolumeClaim (1Gi) for pipeline workspace
- Operator CRDs (KnativeServing, KnativeEventing, Knative Service) must have SkipDryRunOnMissingResource sync option
- The tenant chart receives "username" and "deployer.domain" as Helm values
- 3 users: user1, user2, user3
- The reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns

Generate the Helm charts in standalone mode. Output both bootstrap-infra and bootstrap-tenant.
```

- [ ] **Step 5: Write scenario 08 — service-mesh-lab (medium, infra+tenant)**

Write `scenarios/08-service-mesh-lab/prompt.md`:

```markdown
Create a GitOps automation for a lab that teaches OpenShift Service Mesh (Istio) with per-user mesh namespaces and sample microservices. 3 users each get their own service mesh playground.

The cluster already has the OpenShift GitOps operator (ArgoCD) installed in the openshift-gitops namespace. You do not need to install ArgoCD.

Requirements:
- bootstrap-infra should:
  - Install the Kiali operator via OLM Subscription (channel: "stable")
  - Install OpenShift Service Mesh 3 (Sail operator / Istio) via OLM Subscription (channel: "stable")
  - Create a shared Istio CR (kind: Istio) in "istio-system" namespace
- bootstrap-tenant should create per-user resources:
  - A namespace named <username>-mesh (e.g., user1-mesh) with Istio sidecar injection label (istio-injection: enabled)
  - An edit RoleBinding for the user
  - Two sample Deployments forming a microservice chain:
    - "frontend" — 1 replica of httpd (registry.access.redhat.com/ubi9/httpd-24), port 8080
    - "backend" — 1 replica of nginx (registry.access.redhat.com/ubi9/nginx-122), port 8080
  - Services for both frontend and backend
  - A Route for the frontend service
  - A VirtualService routing traffic from frontend to backend
- Operator CRDs (Istio, VirtualService) must have SkipDryRunOnMissingResource sync option
- The tenant chart receives "username" and "deployer.domain" as Helm values
- 3 users: user1, user2, user3
- The reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns

Generate the Helm charts in standalone mode. Output both bootstrap-infra and bootstrap-tenant.
```

- [ ] **Step 6: Commit**

```bash
git add scenarios/04-gitea-devspaces/prompt.md \
       scenarios/05-gitops-workshop/prompt.md \
       scenarios/06-ocp-virt-lab/prompt.md \
       scenarios/07-serverless-workshop/prompt.md \
       scenarios/08-service-mesh-lab/prompt.md
git commit -m "feat: add medium scenario prompts (04-08)"
```

---

### Task 4: Complex Scenario Prompts (09-10)

**Files:**
- Create: `scenarios/09-security-demo/prompt.md`
- Create: `scenarios/10-ai-dev-workshop/prompt.md`

**Interfaces:**
- Consumes: nothing
- Produces: 2 prompt files read by the workflow script's bootstrap agent

- [ ] **Step 1: Write scenario 09 — security-demo (complex, infra-only)**

Write `scenarios/09-security-demo/prompt.md`:

```markdown
Create a GitOps automation for a security demo environment that deploys a comprehensive Red Hat security stack on an OpenShift cluster. This is a single-user demo for showcasing RHACS capabilities.

The cluster already has the OpenShift GitOps operator (ArgoCD) installed in the openshift-gitops namespace. You do not need to install ArgoCD.

Requirements:
- This is a single-user demo — only bootstrap-infra, no bootstrap-tenant
- bootstrap-infra should install and configure the following operators and resources:
  1. Red Hat Advanced Cluster Security (RHACS):
     - Operator Subscription (channel: "rhacs-4.8")
     - Central CR in "stackrox" namespace with:
       - Central with default resources
       - Scanner enabled
       - Scanner V4 enabled
     - SecuredCluster CR in "stackrox" namespace to register the cluster
  2. Red Hat Quay:
     - Operator Subscription (channel: "stable-3.13")
     - QuayRegistry CR in "quay" namespace with all managed components
  3. OpenShift Pipelines:
     - Operator Subscription (channel: "pipelines-1.17")
  4. A demo namespace "security-demo" with:
     - A sample vulnerable Deployment (image: quay.io/centos/centos:7) for RHACS to detect
     - A NetworkPolicy allowing ingress from the RHACS scanner
- Use template subdirectories for organization: templates/rhacs/, templates/quay/, templates/pipelines/, templates/demo/
- All operator CRDs (Central, SecuredCluster, QuayRegistry) must have SkipDryRunOnMissingResource sync option
- Use appropriate sync-waves: operators at -2, namespaces at -2, RBAC at -1, standard resources at 0, CRs at 1, SecuredCluster at 2 (depends on Central)
- The reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns

Generate the Helm chart in standalone mode. Output the bootstrap-infra chart only.
```

- [ ] **Step 2: Write scenario 10 — ai-dev-workshop (complex, infra+tenant)**

Write `scenarios/10-ai-dev-workshop/prompt.md`:

```markdown
Create a GitOps automation for an AI application development workshop where 3 users each get their own development environment with Gitea repos, Tekton pipelines, and a namespace for deploying AI-powered applications.

The cluster already has the OpenShift GitOps operator (ArgoCD) installed in the openshift-gitops namespace. You do not need to install ArgoCD.

Requirements:
- bootstrap-infra should:
  1. Install the Gitea operator and create a Gitea instance in "gitea" namespace:
     - Admin user: gitea-admin
     - PostgreSQL storage
     - 10Gi PVC for Gitea data
     - Create 3 user accounts (user1, user2, user3 with password "openshift")
  2. Install OpenShift Pipelines operator (channel: "pipelines-1.17")
  3. Create a shared namespace "ai-models" with:
     - A ConfigMap containing model endpoint configuration (model-config):
       - model_name: "llama-scout-17b"
       - model_endpoint: "https://models.example.com/v1"
       - embedding_model: "nomic-embed-text-v1-5"
     - A Secret containing a placeholder API key (ai-api-key with key "token" and value "placeholder-key")
  4. Create a shared namespace "ai-infra" for monitoring and shared tooling
- bootstrap-tenant should create per-user resources:
  - A namespace named <username>-ai-dev (e.g., user1-ai-dev)
  - A namespace named <username>-ai-staging (e.g., user1-ai-staging)
  - Edit RoleBindings for the user in both namespaces
  - A read-only RoleBinding allowing the user to read the shared "ai-models" namespace ConfigMap and Secret
  - In <username>-ai-dev:
    - A Tekton Pipeline "ai-app-build" with tasks: git-clone, build-image, deploy
    - A PersistentVolumeClaim (2Gi) for pipeline workspace
    - A sample Deployment "ai-chatbot" running a Python app (image: registry.access.redhat.com/ubi9/python-311) with 1 replica
    - Environment variables on the Deployment referencing the shared ai-models ConfigMap and Secret
    - A Service exposing port 8080
    - A Route for the service
- Use template subdirectories: templates/gitea/, templates/pipelines/, templates/ai-models/, templates/ai-infra/ for infra; templates/namespaces/, templates/rbac/, templates/pipelines/, templates/app/ for tenant
- Operator CRDs must have SkipDryRunOnMissingResource sync option
- The tenant chart receives "username" and "deployer.domain" as Helm values
- 3 users: user1, user2, user3
- The reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns

Generate the Helm charts in standalone mode. Output both bootstrap-infra and bootstrap-tenant.
```

- [ ] **Step 3: Commit**

```bash
git add scenarios/09-security-demo/prompt.md \
       scenarios/10-ai-dev-workshop/prompt.md
git commit -m "feat: add complex scenario prompts (09-10)"
```

---

### Task 5: Workflow Script

**Files:**
- Create: `workflows/test-scenarios.js`

**Interfaces:**
- Consumes: `scenarios/*/prompt.md` (read by bootstrap agent), `credentials.txt` (read by bootstrap agent), `.claude/skills/gitops-helper/SKILL.md` and `references/gitops-patterns.md` (read/edited by critic agent)
- Produces: `scenarios/*/report.json` (written by scenario agents), `results/critic-analysis.md` and `results/skill-changes.md` (written by critic agent), graduated examples in `/Users/juliano/rhpds/rhdp-gitops-patterns/examples/`

- [ ] **Step 1: Write the workflow script**

Write `workflows/test-scenarios.js` with the complete orchestration logic. The file is shown in full below:

```javascript
export const meta = {
  name: 'gitops-helper-test-harness',
  description: 'Test gitops-helper skill across 10 scenarios with real cluster deployments and self-improving critic',
  phases: [
    { title: 'Bootstrap' },
    { title: 'Generate & Deploy' },
    { title: 'Critic Analysis' },
    { title: 'Cleanup' },
    { title: 'Graduation' },
  ],
}

const SCENARIO_META = [
  { id: '01', name: 'web-terminal-demo', tier: 'simple', type: 'infra-only' },
  { id: '02', name: 'sample-app-workshop', tier: 'simple', type: 'infra+tenant' },
  { id: '03', name: 'pipelines-workshop', tier: 'simple', type: 'infra+tenant' },
  { id: '04', name: 'gitea-devspaces', tier: 'medium', type: 'infra-only' },
  { id: '05', name: 'gitops-workshop', tier: 'medium', type: 'infra+tenant' },
  { id: '06', name: 'ocp-virt-lab', tier: 'medium', type: 'infra+tenant' },
  { id: '07', name: 'serverless-workshop', tier: 'medium', type: 'infra+tenant' },
  { id: '08', name: 'service-mesh-lab', tier: 'medium', type: 'infra+tenant' },
  { id: '09', name: 'security-demo', tier: 'complex', type: 'infra-only' },
  { id: '10', name: 'ai-dev-workshop', tier: 'complex', type: 'infra+tenant' },
]

const SETUP_SCHEMA = {
  type: 'object',
  properties: {
    credentials: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          apiUrl: { type: 'string' },
          user: { type: 'string' },
          password: { type: 'string' },
        },
        required: ['apiUrl', 'user', 'password'],
      },
    },
    prompts: {
      type: 'object',
      additionalProperties: { type: 'string' },
    },
  },
  required: ['credentials', 'prompts'],
}

const SCENARIO_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    scenario: { type: 'string' },
    tier: { type: 'string' },
    type: { type: 'string' },
    generation: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pass', 'fail'] },
        attempts: { type: 'number' },
        duration_seconds: { type: 'number' },
        errors: { type: 'array', items: { type: 'string' } },
        warnings: { type: 'array', items: { type: 'string' } },
        charts_generated: { type: 'array', items: { type: 'string' } },
      },
      required: ['status', 'attempts', 'errors', 'charts_generated'],
    },
    deployment: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pass', 'fail', 'skipped'] },
        duration_seconds: { type: 'number' },
        argocd_apps: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              sync: { type: 'string' },
              health: { type: 'string' },
            },
          },
        },
        operators: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              csv: { type: 'string' },
              phase: { type: 'string' },
            },
          },
        },
        pods_healthy: { type: 'number' },
        pods_failed: { type: 'number' },
        tenant_validation: {
          type: 'object',
          properties: {
            namespaces_created: { type: 'array', items: { type: 'string' } },
            rbac_verified: { type: 'boolean' },
          },
        },
        errors: { type: 'array', items: { type: 'string' } },
      },
      required: ['status', 'errors'],
    },
  },
  required: ['scenario', 'tier', 'type', 'generation', 'deployment'],
}

const CRITIC_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    scenarios_to_rerun: { type: 'array', items: { type: 'string' } },
    systemic_issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          affected_scenarios: { type: 'array', items: { type: 'string' } },
          fix_applied: { type: 'string' },
          file_changed: { type: 'string' },
        },
      },
    },
    one_off_issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          scenario: { type: 'string' },
          description: { type: 'string' },
          recommendation: { type: 'string' },
        },
      },
    },
    skill_changes_summary: { type: 'string' },
  },
  required: ['scenarios_to_rerun', 'systemic_issues', 'one_off_issues'],
}

// ─── Phase 0: Bootstrap ─────────────────────────────────────────────

phase('Bootstrap')
log('Reading credentials and scenario prompts...')

const setup = await agent(`
Read the following files and return structured data:

1. Read credentials.txt in the project root. Each line contains: api_url admin_user admin_password (space-separated). Parse each line into an object with keys: apiUrl, user, password. Skip empty lines.

2. Read all prompt.md files from the scenarios directory. The scenarios are:
${SCENARIO_META.map(s => `   - scenarios/${s.id}-${s.name}/prompt.md`).join('\n')}

Return the credentials as an array and the prompts as an object keyed by scenario ID (e.g., "01", "02", etc.) with the full prompt text as the value.
`, {
  label: 'bootstrap',
  phase: 'Bootstrap',
  schema: SETUP_SCHEMA,
})

if (!setup || !setup.credentials || setup.credentials.length < SCENARIO_META.length) {
  log('ERROR: Could not read credentials or not enough clusters. Aborting.')
  return { error: 'Bootstrap failed — check credentials.txt has 10 lines' }
}

// ─── Main Loop ───────────────────────────────────────────────────────

let pendingIds = SCENARIO_META.map(s => s.id)
const allResults = {}
const iterationHistory = []

for (let iteration = 1; iteration <= 5; iteration++) {
  if (pendingIds.length === 0) break
  log(`=== Iteration ${iteration}: ${pendingIds.length} scenario(s) to run ===`)

  // ─── Cleanup (iterations 2+) ────────────────────────────────────

  if (iteration > 1) {
    phase('Cleanup')
    log(`Cleaning up ${pendingIds.length} cluster(s) from previous iteration...`)

    await parallel(pendingIds.map(id => {
      const idx = SCENARIO_META.findIndex(s => s.id === id)
      const s = SCENARIO_META[idx]
      const cred = setup.credentials[idx]
      const kubecfg = `/tmp/kubeconfig-scenario-${id}.yaml`
      const isTenant = s.type === 'infra+tenant'

      return () => agent(`
You must clean up the ArgoCD Applications on a cluster before a re-deployment.

Cluster: ${cred.apiUrl}
KUBECONFIG: ${kubecfg}

The KUBECONFIG file already exists from the previous iteration. If it doesn't, run:
  export KUBECONFIG=${kubecfg}
  oc login --server=${cred.apiUrl} -u ${cred.user} -p '${cred.password}' --insecure-skip-tls-verify=true

Steps:
1. export KUBECONFIG=${kubecfg}
2. Delete ArgoCD Applications:
   oc delete application bootstrap-infra -n openshift-gitops --ignore-not-found=true
${isTenant ? `   oc delete application tenant-user1 tenant-user2 tenant-user3 -n openshift-gitops --ignore-not-found=true` : ''}
3. Wait up to 3 minutes for deletion to complete:
   oc wait --for=delete application/bootstrap-infra -n openshift-gitops --timeout=180s
   (If this times out, proceed to step 4)
4. If any Applications still exist after 3 minutes, force-remove the finalizer:
   oc patch application <name> -n openshift-gitops -p '{"metadata":{"finalizers":null}}' --type=merge
5. Best-effort: delete any namespaces stuck in Terminating state by removing their kubernetes finalizer
6. Verify: oc get applications -n openshift-gitops should show no test applications

Report "cleanup complete" when done.
`, {
        label: `cleanup:${s.name}`,
        phase: 'Cleanup',
      })
    }))
  }

  // ─── Phase 1: Generate & Deploy ─────────────────────────────────

  phase('Generate & Deploy')

  const results = await parallel(pendingIds.map(id => {
    const idx = SCENARIO_META.findIndex(s => s.id === id)
    const s = SCENARIO_META[idx]
    const cred = setup.credentials[idx]
    const prompt = setup.prompts[id] || ''
    const kubecfg = `/tmp/kubeconfig-scenario-${id}.yaml`
    const scenarioDir = `scenarios/${id}-${s.name}`
    const isTenant = s.type === 'infra+tenant'
    const prevHistory = (allResults[id] || {}).iterations || []

    return () => agent(`
You are a test agent for the gitops-helper skill. Your job is to:
1. Invoke the skill to generate Helm charts
2. Validate the generated charts locally
3. Push them to Git
4. Deploy to a real OpenShift cluster via ArgoCD
5. Verify the deployment succeeded

${prevHistory.length > 0 ? `
IMPORTANT: This is iteration ${iteration}. Previous attempts for this scenario:
${JSON.stringify(prevHistory, null, 2)}
The skill files have been updated by the critic agent since the last attempt. Re-generate from scratch.
` : ''}

## Scenario Details
- ID: ${id}
- Name: ${s.name}
- Tier: ${s.tier}
- Type: ${s.type}
- Output directory: ${scenarioDir}/automation/

## Step 1: Generate Charts (10 min timeout, up to 3 retries)

First, delete any previously generated charts:
  rm -rf ${scenarioDir}/automation/

Invoke the gitops-helper skill with this prompt:

---BEGIN PROMPT---
${prompt}

Output the charts to ${scenarioDir}/automation/
---END PROMPT---

Use the Skill tool: skill="gitops-helper", args="<the prompt above>"

## Step 2: Validate Locally

After the skill generates the charts, validate:
- Run: helm lint ${scenarioDir}/automation/bootstrap-infra/
- Run: helm template test ${scenarioDir}/automation/bootstrap-infra/
${isTenant ? `- Run: helm lint ${scenarioDir}/automation/bootstrap-tenant/
- Run: helm template test ${scenarioDir}/automation/bootstrap-tenant/ --set username=testuser --set deployer.domain=example.com` : ''}
- Check that Chart.yaml, values.yaml, and templates/ exist
- Check sync-wave annotations are present (-2 for operators, -1 for RBAC, 0 for workloads, 1+ for CRs)
- Check no ArgoCD Application CRs exist inside the templates (flat chart rule)
${isTenant ? '- Check tenant resources use {{ .Values.username }}-prefixed namespaces' : ''}
- Check provenance comments are present
- Check SkipDryRunOnMissingResource on CRs that depend on operator CRDs

If validation fails, feed errors back to the skill and retry (up to 3 total attempts).

## Step 3: Commit and Push

After successful validation:
  git add ${scenarioDir}/automation/
  git pull --rebase origin main
  git commit -m "test: generate ${s.name} scenario (iteration ${iteration})"
  git push origin main

If push fails due to remote changes, pull --rebase and retry the push.

## Step 4: Deploy to Cluster (30 min timeout, NO retries)

Set up cluster access:
  export KUBECONFIG=${kubecfg}
  oc login --server=${cred.apiUrl} -u ${cred.user} -p '${cred.password}' --insecure-skip-tls-verify=true

Get the cluster ingress domain:
  DOMAIN=$(oc get ingresses.config.openshift.io cluster -o jsonpath='{.spec.domain}')

Create the ArgoCD Application for bootstrap-infra:
  cat <<'APPEOF' | oc apply -f -
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
    path: ${scenarioDir}/automation/bootstrap-infra
    helm:
      values: |
        deployer:
          domain: $DOMAIN
          apiUrl: ${cred.apiUrl}
          guid: s${id}
  destination:
    namespace: openshift-gitops
    server: https://kubernetes.default.svc
  syncPolicy:
    automated:
      prune: false
      selfHeal: false
    syncOptions:
      - RespectIgnoreDifferences=true
APPEOF

${isTenant ? `
Create ArgoCD Applications for each tenant (user1, user2, user3):
for USER in user1 user2 user3; do
  cat <<TENANTEOF | oc apply -f -
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: tenant-$USER
  namespace: openshift-gitops
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  source:
    repoURL: https://github.com/juliaaano/gitops-helper
    targetRevision: main
    path: ${scenarioDir}/automation/bootstrap-tenant
    helm:
      values: |
        username: $USER
        deployer:
          domain: $DOMAIN
          apiUrl: ${cred.apiUrl}
          guid: s${id}
  destination:
    namespace: openshift-gitops
    server: https://kubernetes.default.svc
  syncPolicy:
    automated:
      prune: false
      selfHeal: false
    syncOptions:
      - RespectIgnoreDifferences=true
TENANTEOF
done
` : ''}

## Step 5: Wait and Verify

Wait for ArgoCD sync (poll every 30 seconds, up to 30 minutes):
  oc wait --for=jsonpath='{.status.sync.status}'=Synced application/bootstrap-infra -n openshift-gitops --timeout=1800s
  oc wait --for=jsonpath='{.status.health.status}'=Healthy application/bootstrap-infra -n openshift-gitops --timeout=1800s
${isTenant ? `  for USER in user1 user2 user3; do
    oc wait --for=jsonpath='{.status.sync.status}'=Synced application/tenant-$USER -n openshift-gitops --timeout=1800s
    oc wait --for=jsonpath='{.status.health.status}'=Healthy application/tenant-$USER -n openshift-gitops --timeout=1800s
  done` : ''}

If oc wait times out or the Application shows Degraded/Error, collect the error details:
  oc get application bootstrap-infra -n openshift-gitops -o yaml

Verify pods:
  Check all pods in relevant namespaces are Running or Completed (not CrashLoopBackOff or Pending)

Verify operators:
  oc get csv -A | grep -E 'Succeeded|Failed'
  All installed CSVs should show Succeeded

${isTenant ? `Verify tenant resources:
  For each user (user1, user2, user3):
  - Check their namespaces exist
  - Check RBAC: oc auth can-i get pods --as=<username> -n <username>-* should return "yes"
` : ''}

## Step 6: Write Report

Write the structured JSON report to ${scenarioDir}/report.json with the results.
Also return the same data as your structured output.

Report scenario="${s.name}", tier="${s.tier}", type="${s.type}".
`, {
      label: `scenario:${s.name}`,
      phase: 'Generate & Deploy',
      schema: SCENARIO_RESULT_SCHEMA,
    })
  }))

  // Collect results
  const iterationResults = {}
  results.forEach((r, i) => {
    const id = pendingIds[i]
    if (r) {
      if (!allResults[id]) allResults[id] = { iterations: [] }
      allResults[id].iterations.push({ iteration, ...r })
      iterationResults[id] = r
    }
  })

  // Check if all passed
  const stillFailing = pendingIds.filter(id => {
    const r = iterationResults[id]
    return !r || r.generation.status !== 'pass' || r.deployment.status !== 'pass'
  })

  if (stillFailing.length === 0) {
    log(`All scenarios passed on iteration ${iteration}!`)
    pendingIds = []
    break
  }

  if (iteration === 5) {
    log(`Reached max iterations. ${stillFailing.length} scenario(s) still failing.`)
    pendingIds = []
    break
  }

  // ─── Phase 2: Critic Analysis ───────────────────────────────────

  phase('Critic Analysis')
  log(`${stillFailing.length} scenario(s) failed. Running critic analysis...`)

  const criticInput = JSON.stringify({
    iteration,
    results: Object.fromEntries(
      Object.entries(allResults).map(([id, data]) => [id, data])
    ),
    failing: stillFailing,
    scenario_meta: SCENARIO_META,
    previous_changes: iterationHistory,
  }, null, 2)

  const critic = await agent(`
You are the critic agent for the gitops-helper test harness. Your job is to analyze test results across all scenarios, identify systemic issues, and fix the skill files.

## Test Results (Iteration ${iteration})

${criticInput}

## Your Tasks

### 1. Categorize Failures

For each failing scenario, determine:
- Is this a GENERATION failure (the skill produced invalid charts) or a DEPLOYMENT failure (charts were valid but didn't work on cluster)?
- Is this a SYSTEMIC issue (same root cause across multiple scenarios) or a ONE-OFF (unique to one scenario)?

### 2. Identify Root Causes

Look for patterns:
- Are sync-waves ordered incorrectly?
- Are SkipDryRunOnMissingResource annotations missing?
- Are namespace names wrong?
- Are operator channels/versions incorrect?
- Is the flat chart rule being violated?
- Are RBAC resources missing?
- Are template syntax errors recurring?

### 3. Fix Skill Files

For SYSTEMIC issues, directly edit the skill files:
- .claude/skills/gitops-helper/SKILL.md — workflow steps, rules, instructions
- .claude/skills/gitops-helper/references/gitops-patterns.md — conventions, patterns, examples

Read the current files first, identify what needs to change, and make the edits.
Commit each change locally with a descriptive message. Do NOT push.

${iterationHistory.length > 0 ? `
### Previous Fix Attempts
The following fixes were applied in previous iterations but did not resolve all issues:
${JSON.stringify(iterationHistory, null, 2)}

Do NOT repeat fixes that already failed. Try a different approach.
` : ''}

### 4. Write Analysis

Write results/critic-analysis.md with:
- Summary of iteration ${iteration}
- Systemic issues found and fixes applied
- One-off issues and recommendations
- Scenarios that should be re-run

Write results/skill-changes.md with:
- Each change made to skill files
- Before/after snippets
- Reasoning for each change

### 5. Return Structured Result

Return the list of scenario IDs that should be re-run (only those where your skill fixes should help).
Do NOT include scenarios with one-off issues that need prompt redesign.
`, {
    label: 'critic',
    phase: 'Critic Analysis',
    schema: CRITIC_RESULT_SCHEMA,
  })

  if (critic) {
    iterationHistory.push({
      iteration,
      changes: critic.systemic_issues || [],
      summary: critic.skill_changes_summary || '',
    })
    pendingIds = (critic.scenarios_to_rerun || []).filter(id => stillFailing.includes(id))
  } else {
    pendingIds = []
  }

  if (pendingIds.length === 0) {
    log('Critic found no scenarios worth re-running. Stopping loop.')
    break
  }

  log(`Critic recommends re-running ${pendingIds.length} scenario(s): ${pendingIds.join(', ')}`)
}

// ─── Graduation ──────────────────────────────────────────────────────

const passing = SCENARIO_META.filter(s => {
  const r = allResults[s.id]
  if (!r || !r.iterations) return false
  const last = r.iterations[r.iterations.length - 1]
  return last && last.generation.status === 'pass' && last.deployment.status === 'pass'
})

if (passing.length > 0) {
  phase('Graduation')
  log(`Graduating ${passing.length} successful scenario(s) to patterns repo...`)

  await agent(`
You are the graduation agent. Your job is to take successful test scenarios and add them as examples to the rhdp-gitops-patterns repo.

## Successful Scenarios

${passing.map(s => `- ${s.id}-${s.name} (${s.tier}, ${s.type})`).join('\n')}

## Process

For each successful scenario:

1. Copy the automation/ directory contents to /Users/juliano/rhpds/rhdp-gitops-patterns/examples/<scenario-name>/
   Example: scenarios/01-web-terminal-demo/automation/bootstrap-infra/ → examples/web-terminal-demo/bootstrap-infra/

2. Sanitize test-specific values in the copied files:
   - Replace any hardcoded cluster domains (e.g., apps.cluster-xxx.example.com) with {{ .Values.deployer.domain }}
   - Remove test GUIDs (s01, s02, etc.) — use {{ .Values.deployer.guid }} instead
   - Ensure values.yaml has sensible defaults, not test-specific values
   - Add a comment at the top of Chart.yaml:
     # Example generated and validated by gitops-helper test harness

3. Commit each scenario separately to the rhdp-gitops-patterns repo:
   cd /Users/juliano/rhpds/rhdp-gitops-patterns
   git add examples/<scenario-name>/
   git commit -m "feat(examples): add <scenario-name> example

   Generated and validated by gitops-helper test harness.
   Passed generation validation and deployment to live cluster."

4. Do NOT push. Leave all commits local.

Important: Only graduate scenarios that are listed above. Do not touch any other files in the patterns repo.
`, {
    label: 'graduation',
    phase: 'Graduation',
  })
}

// ─── Final Summary ───────────────────────────────────────────────────

const totalPassed = passing.length
const totalFailed = SCENARIO_META.length - totalPassed
const totalIterations = iterationHistory.length + 1

log(`=== Test Harness Complete ===`)
log(`Passed: ${totalPassed}/${SCENARIO_META.length} | Failed: ${totalFailed} | Iterations: ${totalIterations}`)
log(`Graduated: ${passing.map(s => s.name).join(', ') || 'none'}`)

return {
  summary: {
    total: SCENARIO_META.length,
    passed: totalPassed,
    failed: totalFailed,
    iterations: totalIterations,
    graduated: passing.map(s => s.name),
  },
  results: allResults,
  critic_history: iterationHistory,
}
```

- [ ] **Step 2: Verify the script has no obvious syntax issues**

Read back the file and check:
- All template literals are properly closed
- All braces/brackets are balanced
- Schema objects are valid JSON Schema
- No references to undefined variables

```bash
# Quick check — node can parse ES module syntax but won't execute (no runtime globals)
# Just verify the file exists and is non-empty
wc -l workflows/test-scenarios.js
head -5 workflows/test-scenarios.js
```

- [ ] **Step 3: Commit**

```bash
git add workflows/test-scenarios.js
git commit -m "feat: add test harness workflow script

Orchestrates 10 parallel scenario agents, critic analysis with
skill self-improvement, cleanup, re-run loop (up to 5 iterations),
and graduation of successful scenarios to the patterns repo."
```

---

### Task 6: Final Verification and Documentation

**Files:**
- Verify: all files from Tasks 1-5
- Create: nothing new

**Interfaces:**
- Consumes: all previous task outputs
- Produces: verified, ready-to-run project

- [ ] **Step 1: Verify project structure**

```bash
find . -type f | grep -v '.git/' | sort
```

Expected output should include:
- `.claude/settings.json`
- `.gitignore`
- `scenarios/01-web-terminal-demo/prompt.md` through `scenarios/10-ai-dev-workshop/prompt.md` (10 files)
- `workflows/test-scenarios.js`
- `results/.gitkeep`
- `docs/superpowers/specs/2026-08-11-test-harness-design.md`

- [ ] **Step 2: Verify all prompts mention key constraints**

For each `prompt.md`, confirm it includes:
- "The cluster already has the OpenShift GitOps operator (ArgoCD) installed" (all 10)
- "standalone mode" (all 10)
- Whether it's infra-only or infra+tenant (all 10)
- "reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns" (all 10)
- User count of 3 for tenant scenarios (scenarios 02, 03, 05, 06, 07, 08, 10)

```bash
for f in scenarios/*/prompt.md; do
  echo "=== $f ==="
  grep -c "ArgoCD" "$f"
  grep -c "standalone" "$f"
  grep -c "rhdp-gitops-patterns" "$f"
done
```

- [ ] **Step 3: Verify workflow script references correct scenario names**

```bash
grep -c "web-terminal-demo\|sample-app-workshop\|pipelines-workshop\|gitea-devspaces\|gitops-workshop\|ocp-virt-lab\|serverless-workshop\|service-mesh-lab\|security-demo\|ai-dev-workshop" workflows/test-scenarios.js
```

Should show all 10 scenario names present.

- [ ] **Step 4: Verify credentials.txt is gitignored**

```bash
echo "test" > credentials.txt
git status credentials.txt
```

Should show `credentials.txt` is not in the untracked files list (because `.gitignore` covers it).

```bash
rm credentials.txt
touch credentials.txt
```

- [ ] **Step 5: Final commit if any changes were needed**

Only if Steps 1-4 revealed issues that needed fixing:

```bash
git add -A
git status
# If changes exist:
git commit -m "fix: address verification issues"
```
