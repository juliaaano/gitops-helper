Create a GitOps automation for a workshop teaching OpenShift Serverless (Knative) and Pipelines to 3 users.

The cluster already has the OpenShift GitOps operator (ArgoCD) installed in the openshift-gitops namespace. You do not need to install ArgoCD.

Requirements:
- bootstrap-infra should:
  - Install OpenShift Serverless operator via OLM Subscription (channel: "stable")
  - Create the KnativeServing CR in "knative-serving" namespace
  - Create the KnativeEventing CR in "knative-eventing" namespace
  - Install OpenShift Pipelines operator via OLM Subscription (channel: "pipelines-1.17")
- bootstrap-tenant should create per-user resources:
  - A namespace named <username>-serverless (e.g., user1-serverless)
  - An edit RoleBinding for the user
  - A sample Knative Service (ksvc) named "hello" using image quay.io/openshift-knative/showcase serving on port 8080
  - A sample Tekton Pipeline with a task that builds and deploys a Knative service
  - A PersistentVolumeClaim (1Gi) for pipeline workspace
- Operator CRDs (KnativeServing, KnativeEventing, Knative Service) must have SkipDryRunOnMissingResource sync option
- The tenant chart receives "username" and "deployer.domain" as Helm values
- 3 users: user1, user2, user3
- Follow rhdp-gitops-patterns conventions
- The reference patterns repo is already cloned at /Users/juliano/rhpds/rhdp-gitops-patterns

Generate the Helm charts in standalone mode. Output both bootstrap-infra and bootstrap-tenant.
