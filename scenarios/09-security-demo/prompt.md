Create a GitOps automation for a security demo environment that deploys a comprehensive Red Hat security stack on an OpenShift cluster. This is a single-user demo for showcasing RHACS capabilities.

The cluster already has the OpenShift GitOps operator (ArgoCD) installed in the openshift-gitops namespace. You do not need to install ArgoCD. This is a standalone mode deployment.

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
