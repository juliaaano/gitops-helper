Create a GitOps automation for a workshop that teaches OpenShift Pipelines (Tekton) to 3 users.

The cluster already has ArgoCD installed in the openshift-gitops namespace, in standalone mode. You do not need to install ArgoCD.

Requirements:
- bootstrap-infra should:
  - Install the OpenShift Pipelines operator via OLM Subscription (channel: "pipelines-1.17")
  - Create a shared namespace "pipelines-infra" for cluster-level resources
- bootstrap-tenant should create per-user resources for 3 users: user1, user2, user3
  - A namespace named <username>-pipelines (e.g., user1-pipelines, user2-pipelines, user3-pipelines)
  - An edit RoleBinding granting the user edit access
  - A sample Tekton Pipeline resource with two tasks: "git-clone" and "build"
  - A sample PipelineRun that references the Pipeline
  - A PersistentVolumeClaim (1Gi, ReadWriteOnce) for pipeline workspace storage
- The tenant chart receives "username" and "deployer.domain" as Helm values
- Follow rhdp-gitops-patterns conventions
- The reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns

Generate the Helm charts in standalone mode. Output both bootstrap-infra and bootstrap-tenant (infra+tenant scenario).
