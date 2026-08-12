Create a GitOps automation for an AI application development workshop where 3 users each get their own development environment with Gitea repos (migrated from GitHub), Tekton pipelines, and a namespace for deploying AI-powered applications. The cluster also runs OpenShift AI 3 with a simple CPU-only model served via an OCI modelcar image.

The cluster already has the OpenShift GitOps operator (ArgoCD) installed in the openshift-gitops namespace. You do not need to install ArgoCD. This is a standalone mode deployment.

Requirements:
- bootstrap-infra should:
  1. Install the Gitea operator and create a Gitea instance in "gitea" namespace:
     - Admin user: gitea-admin, password: openshift
     - PostgreSQL storage
     - 10Gi PVC for Gitea data
     - Create 3 user accounts (user1, user2, user3 with password "openshift")
     - Enable giteaMigrateRepositories: true
     - Migrate the repo https://github.com/redhat-scholars/openshift-starter-guides (name: "openshift-starter-guides", private: false)
  2. Install OpenShift Pipelines operator (channel: "pipelines-1.17")
  3. Install Red Hat OpenShift AI operator (channel: "stable-3.3", source: "redhat-operators"):
     - Create a DataScienceCluster CR with kserve managed in RawDeployment mode (no ServiceMesh or Serverless required)
     - Set dashboard, modelmeshserving, and workbenches to Managed; set all other optional components to Removed
  4. Deploy a simple CPU-only model using KServe with OCI modelcar storage:
     - Create a namespace "ai-models" for model serving
     - Create a ServingRuntime using OpenVINO Model Server (OVMS) for the openvino_ir format, CPU-only (no GPU requests/limits)
     - Create an InferenceService that loads a model from an OCI image: oci://quay.io/opendatahub/demo-models-ovms:openvino-example-model (this is a public example model)
     - The InferenceService should use RawDeployment mode (annotation: serving.kserve.io/deploymentMode: RawDeployment)
     - Add label opendatahub.io/dashboard: 'true' to the namespace so it shows in the RHOAI dashboard
  5. Create a shared namespace "ai-infra" for monitoring and shared tooling
- bootstrap-tenant should create per-user resources:
  - A namespace named <username>-ai-dev (e.g., user1-ai-dev)
  - A namespace named <username>-ai-staging (e.g., user1-ai-staging)
  - Edit RoleBindings for the user in both namespaces
  - A read-only RoleBinding allowing the user to view InferenceServices in the "ai-models" namespace
  - In <username>-ai-dev:
    - A Tekton Pipeline "ai-app-build" with tasks: git-clone, build-image, deploy
    - A PersistentVolumeClaim (2Gi) for pipeline workspace
    - A sample Deployment "ai-chatbot" running a Python app (image: registry.access.redhat.com/ubi9/python-311) with 1 replica
    - Environment variables on the Deployment referencing the model endpoint (ai-models namespace InferenceService URL)
    - A Service exposing port 8080
    - A Route for the service
- Use template subdirectories: templates/gitea/, templates/pipelines/, templates/rhoai/, templates/ai-models/ for infra; templates/namespaces/, templates/rbac/, templates/pipelines/, templates/app/ for tenant
- Operator CRDs must have SkipDryRunOnMissingResource sync option
- Use appropriate sync-waves: operators at -2, namespaces at -1, RBAC at 0, standard resources at 1, operator CRs at 2, and model-serving resources (ServingRuntime, InferenceService) at 3
- The tenant chart receives "username" and "deployer.domain" as Helm values
- 3 users: user1, user2, user3
- The reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns

Generate the Helm charts in standalone mode. Output both bootstrap-infra and bootstrap-tenant.
