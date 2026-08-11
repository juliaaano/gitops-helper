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
- Follow rhdp-gitops-patterns conventions
- The reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns

Generate the Helm chart in standalone mode. Output the bootstrap-infra chart only.
