Create a GitOps automation for a simple demo environment that deploys the Web Terminal operator on an OpenShift cluster.

The cluster already has ArgoCD installed in the openshift-gitops namespace, in standalone mode. You do not need to install ArgoCD.

Requirements:
- Deploy the Web Terminal operator via an OLM Subscription
- Use the "fast" channel for the Web Terminal operator
- This is a single-user demo, no per-user resources needed — only bootstrap-infra (infra-only scenario), no bootstrap-tenant
- Follow rhdp-gitops-patterns conventions
- The reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns

Generate the Helm chart in standalone mode. Output the bootstrap-infra chart only.
