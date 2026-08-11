# Skill Changes - Iteration 1

## Change 1: Gitea Operator Quirks (gitops-patterns.md)

**File**: `.claude/skills/gitops-helper/references/gitops-patterns.md`

**Reasoning**: The Gitea operator is not in any standard OLM catalog. Four scenarios needed it; three self-corrected (burning 2-3 attempts each), and one failed completely. The skill had no guidance on this, forcing the model to discover it at deployment time.

**What was added**: New section "Known Operator Quirks > Gitea Operator (RHPDS)" with:
- Complete CatalogSource manifest (`quay.io/rhpds/gitea-catalog:latest` in `openshift-marketplace`)
- Subscription manifest targeting `openshift-operators` namespace and `redhat-gpte-gitea` source
- Explicit warning: no OperatorGroup needed (AllNamespaces mode only)
- SkipDryRunOnMissingResource reminder for the Gitea CR

**Before**: No Gitea-specific guidance existed. The skill only had generic operator patterns.

**After**:
```yaml
# CatalogSource (always required for Gitea)
apiVersion: operators.coreos.com/v1alpha1
kind: CatalogSource
metadata:
  name: redhat-gpte-gitea
  namespace: openshift-marketplace
spec:
  sourceType: grpc
  image: quay.io/rhpds/gitea-catalog:latest

# Subscription (in openshift-operators, NOT a custom namespace)
apiVersion: operators.coreos.com/v1alpha1
kind: Subscription
metadata:
  name: gitea-operator
  namespace: openshift-operators
spec:
  source: redhat-gpte-gitea
  sourceNamespace: openshift-marketplace
```

---

## Change 2: S2I Builder Images (gitops-patterns.md)

**File**: `.claude/skills/gitops-helper/references/gitops-patterns.md`

**Reasoning**: S2I builder images like `ubi9/nginx-122` are not runnable container images. Two scenarios hit this; one self-corrected (2 attempts), one failed. The model has no inherent knowledge that these images need special handling.

**What was added**: New section "S2I Builder Images" with:
- Explanation that UBI9 S2I images are builders, not ready-to-run images
- Per-image command override patterns (nginx-122, httpd-24, python-311)
- Complete deployment snippet with ConfigMap volume mount for static content
- Warning: never deploy bare without command override

**Before**: No guidance on S2I images existed.

**After** (nginx-122 example):
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

---

## Change 3: PVC WaitForFirstConsumer (gitops-patterns.md)

**File**: `.claude/skills/gitops-helper/references/gitops-patterns.md`

**Reasoning**: Two passing scenarios hit warnings about PVCs blocking ArgoCD sync due to WaitForFirstConsumer volume binding mode. While not a failure, this wastes deployment time and could become a failure if the self-correction doesn't trigger.

**What was added**: New section "PVC with WaitForFirstConsumer StorageClass" with:
- Explanation of why PVCs at early sync-waves block sync
- Solution: place PVCs at same wave as consuming workload

**Before**: No PVC sync-wave guidance existed.

**After**: Guidance to place PVCs at sync-wave 0 or 1 alongside the workload, not at wave -2 with namespaces.

---

## Change 4: Pre-generation checks (SKILL.md)

**File**: `.claude/skills/gitops-helper/SKILL.md`

**Reasoning**: The reference patterns exist in gitops-patterns.md but the skill workflow (SKILL.md) never directed the model to check them before generating templates. Adding explicit "check before you generate" directives in Step 7b ensures the model reads the quirks documentation proactively.

**What was added**: Three new paragraphs in Step 7b (between sync-wave and namespace isolation guidance):
1. Check "Known Operator Quirks" before generating any operator Subscription
2. Check "S2I Builder Images" before using any S2I builder image
3. Check "PVC with WaitForFirstConsumer" for PVC sync-wave placement

**Before**:
```
Apply sync-wave annotations per the ordering conventions in `gitops-patterns.md`.

Ensure all tenant resources target one of the tenant's namespaces (never a shared namespace).
```

**After**:
```
Apply sync-wave annotations per the ordering conventions in `gitops-patterns.md`.

**Before generating any operator Subscription**, check the "Known Operator Quirks"
section in `gitops-patterns.md`. [...]

**Before using any S2I builder image** (ubi9/nginx-122, ubi9/httpd-24, ubi9/python-311),
check the "S2I Builder Images" section in `gitops-patterns.md`. [...]

**For PVCs**, place them at the same sync-wave as the workload that uses them [...]

Ensure all tenant resources target one of the tenant's namespaces (never a shared namespace).
```
