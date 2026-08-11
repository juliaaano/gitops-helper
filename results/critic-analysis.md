# Critic Analysis - Iteration 1

## Summary

10 scenarios tested. 8 passed, 2 failed (scenarios 08 and 10).

| ID | Scenario | Tier | Gen | Deploy | Attempts |
|----|----------|------|-----|--------|----------|
| 01 | web-terminal-demo | simple | pass | pass | 1 |
| 02 | sample-app-workshop | simple | pass | pass | 2 |
| 03 | pipelines-workshop | simple | pass | pass | 1 |
| 04 | gitea-devspaces | medium | pass | pass | 2 |
| 05 | gitops-workshop | medium | pass | pass | 3 |
| 06 | ocp-virt-lab | medium | pass | pass | 3 |
| 07 | serverless-workshop | medium | pass | pass | 1 |
| 08 | service-mesh-lab | medium | pass | **FAIL** | 2 |
| 09 | security-demo | complex | pass | pass | 1 |
| 10 | ai-dev-workshop | complex | pass | **FAIL** | 1 |

Both failures are DEPLOYMENT failures (generation passed, charts deployed but didn't work on cluster). Neither is a generation failure.

## Systemic Issues Found

### 1. Gitea Operator CatalogSource (HIGH - caused failure in scenario 10)

**Root cause**: The Gitea operator is not available in standard OLM catalogs (`community-operators`, `redhat-operators`). It requires a custom RHPDS CatalogSource from `quay.io/rhpds/gitea-catalog:latest`. Additionally, the operator only supports `AllNamespaces` install mode, so its Subscription must go in `openshift-operators` (not a custom namespace), and no custom OperatorGroup should be created.

**Impact**:
- Scenario 10 (ai-dev-workshop): FAILED - Subscription pointed to `community-operators`; also had an invalid namespace-scoped OperatorGroup
- Scenario 04 (gitea-devspaces): Self-corrected after 2 attempts
- Scenario 05 (gitops-workshop): Self-corrected after 3 attempts
- Scenario 06 (ocp-virt-lab): Self-corrected after 3 attempts

**Fix applied**: Added "Known Operator Quirks > Gitea Operator (RHPDS)" section to `gitops-patterns.md` with exact CatalogSource and Subscription manifests, plus explicit warning about AllNamespaces mode. Added pre-generation check directive to SKILL.md Step 7b.

### 2. S2I Builder Images CrashLoopBackOff (HIGH - caused failure in scenario 08)

**Root cause**: Red Hat UBI9 S2I builder images (`ubi9/nginx-122`, `ubi9/httpd-24`, `ubi9/python-311`) are Source-to-Image builders, not ready-to-run container images. Deploying them without a command override causes CrashLoopBackOff because the default entrypoint expects injected application source.

**Impact**:
- Scenario 08 (service-mesh-lab): FAILED - nginx-122 backend pods in CrashLoopBackOff across all 3 tenant namespaces
- Scenario 02 (sample-app-workshop): Self-corrected after 2 attempts - added `/usr/libexec/s2i/run` command + ConfigMap content mount

**Fix applied**: Added "S2I Builder Images" section to `gitops-patterns.md` with per-image command override patterns and ConfigMap mount examples. Added pre-generation check directive to SKILL.md Step 7b.

### 3. PVC WaitForFirstConsumer Sync Blocking (LOW - warnings only, no failures)

**Root cause**: OpenShift clusters with `WaitForFirstConsumer` volume binding mode keep PVCs `Pending` until a pod references them. Placing PVCs at early sync-waves (-2 or 0) before the consuming workload blocks ArgoCD sync progression.

**Impact**:
- Scenario 03 (pipelines-workshop): Warning - PVC at wave 0 blocked sync
- Scenario 07 (serverless-workshop): Warning - PVC required storageClassName fix

**Fix applied**: Added "PVC with WaitForFirstConsumer StorageClass" section to `gitops-patterns.md`. Added PVC sync-wave guidance to SKILL.md Step 7b.

## One-Off Issues

### Scenario 10: Sync-wave cascade from Gitea blocking

Beyond the Gitea CatalogSource issue, scenario 10 had a secondary failure: ConfigMap and Secret in the `ai-models` namespace couldn't auto-sync because the Gitea Subscription failure blocked sync-wave progression. This is a consequence of the Gitea issue, not a separate root cause. Fixing the Gitea CatalogSource should resolve this cascade.

### Scenario 08: VirtualService routing blocked by CrashLoopBackOff

The VirtualService and Route resources couldn't sync because the backend Deployment health check failed (CrashLoopBackOff), blocking sync-wave progression. This is a consequence of the S2I image issue, not a separate root cause. Fixing the nginx-122 deployment should resolve this cascade.

## Scenarios to Re-run

Both failing scenarios should benefit from the skill fixes:

- **Scenario 08** (service-mesh-lab): The S2I Builder Images guidance will prevent the nginx-122 CrashLoopBackOff
- **Scenario 10** (ai-dev-workshop): The Gitea Operator guidance will provide the correct CatalogSource, Subscription namespace, and install mode

## Observations on Passing Scenarios

Several passing scenarios required multiple generation attempts to self-correct issues that are now documented in the skill:

| Scenario | Attempts | Self-corrected issue |
|----------|----------|---------------------|
| 02 | 2 | S2I nginx-122 image handling |
| 04 | 2 | Gitea custom CatalogSource |
| 05 | 3 | Gitea CatalogSource + AllNamespaces mode + ose-cli image |
| 06 | 3 | Gitea CatalogSource + AllNamespaces OperatorGroup + VM disk size |

With the skill fixes, these scenarios should require fewer attempts on re-run, improving generation efficiency. However, they do not need re-running since they already passed.
