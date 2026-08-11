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
- Follow rhdp-gitops-patterns conventions
- The reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns

Generate the Helm charts in standalone mode. Output both bootstrap-infra and bootstrap-tenant.
