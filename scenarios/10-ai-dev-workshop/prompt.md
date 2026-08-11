Create a GitOps automation for an AI application development workshop where 3 users each get their own development environment with Gitea repos, Tekton pipelines, and a namespace for deploying AI-powered applications.

The cluster already has the OpenShift GitOps operator (ArgoCD) installed in the openshift-gitops namespace. You do not need to install ArgoCD. This is a standalone mode deployment.

Requirements:
- bootstrap-infra should:
  1. Install the Gitea operator and create a Gitea instance in "gitea" namespace:
     - Admin user: gitea-admin
     - PostgreSQL storage
     - 10Gi PVC for Gitea data
     - Create 3 user accounts (user1, user2, user3 with password "openshift")
  2. Install OpenShift Pipelines operator (channel: "pipelines-1.17")
  3. Create a shared namespace "ai-models" with:
     - A ConfigMap containing model endpoint configuration (model-config):
       - model_name: "llama-scout-17b"
       - model_endpoint: "https://models.example.com/v1"
       - embedding_model: "nomic-embed-text-v1-5"
     - A Secret containing a placeholder API key (ai-api-key with key "token" and value "placeholder-key")
  4. Create a shared namespace "ai-infra" for monitoring and shared tooling
- bootstrap-tenant should create per-user resources:
  - A namespace named <username>-ai-dev (e.g., user1-ai-dev)
  - A namespace named <username>-ai-staging (e.g., user1-ai-staging)
  - Edit RoleBindings for the user in both namespaces
  - A read-only RoleBinding allowing the user to read the shared "ai-models" namespace ConfigMap and Secret
  - In <username>-ai-dev:
    - A Tekton Pipeline "ai-app-build" with tasks: git-clone, build-image, deploy
    - A PersistentVolumeClaim (2Gi) for pipeline workspace
    - A sample Deployment "ai-chatbot" running a Python app (image: registry.access.redhat.com/ubi9/python-311) with 1 replica
    - Environment variables on the Deployment referencing the shared ai-models ConfigMap and Secret
    - A Service exposing port 8080
    - A Route for the service
- Use template subdirectories: templates/gitea/, templates/pipelines/, templates/ai-models/, templates/ai-infra/ for infra; templates/namespaces/, templates/rbac/, templates/pipelines/, templates/app/ for tenant
- Operator CRDs must have SkipDryRunOnMissingResource sync option
- Use appropriate sync-waves: operators at -2, namespaces at -1, RBAC at 0, standard resources at 1, and operator CRs at 2
- The tenant chart receives "username" and "deployer.domain" as Helm values
- 3 users: user1, user2, user3
- The reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns

Generate the Helm charts in standalone mode. Output both bootstrap-infra and bootstrap-tenant.
