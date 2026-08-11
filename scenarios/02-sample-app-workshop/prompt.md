Create a GitOps automation for a workshop where 3 users each get their own namespace with a sample web application deployed.

The cluster already has ArgoCD installed in the openshift-gitops namespace, in standalone mode. You do not need to install ArgoCD.

Requirements:
- bootstrap-infra should set up a shared namespace called "workshop-infra" for any cluster-level resources
- bootstrap-tenant should create per-user resources for 3 users: user1, user2, user3
- Each user's namespace should be named <username>-app (e.g., user1-app, user2-app, user3-app) and contain:
  - A Deployment running an nginx container (image: registry.access.redhat.com/ubi9/nginx-122) with 1 replica
  - A Service exposing port 8080
  - A Route to expose the service externally
  - An edit RoleBinding granting the user edit access to their namespace
- The tenant chart receives "username" and "deployer.domain" as Helm values
- Follow rhdp-gitops-patterns conventions
- The reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns

Generate the Helm charts in standalone mode. Output both bootstrap-infra and bootstrap-tenant (infra+tenant scenario).
