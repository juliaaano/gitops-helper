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
