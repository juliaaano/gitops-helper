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
- Follow rhdp-gitops-patterns conventions
- The reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns

Generate the Helm charts in standalone mode. Output both bootstrap-infra and bootstrap-tenant.
