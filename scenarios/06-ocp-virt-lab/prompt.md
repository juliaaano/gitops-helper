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
- Follow rhdp-gitops-patterns conventions
- The reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns

Generate the Helm charts in standalone mode. Output both bootstrap-infra and bootstrap-tenant.
