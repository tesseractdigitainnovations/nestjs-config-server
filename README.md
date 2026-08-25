# NestJS Config Server

A production-grade, centralized configuration server built with NestJS. Supports serving config files dynamically from the local filesystem or a Git repository, featuring hot-reloads, structured JSON request logging, anti-spoofing protections, and pluggable, secure authentication modes.

---

## 🚀 Architectural Overview & Authentication Modes

To accommodate diverse deployment architectures, the configuration server supports three pluggable authentication modes via the `AUTH_MODE` environment variable.

### 1. Anonymous Mode (`AUTH_ENABLED=false`)
The server accepts anonymous requests. Only suitable for isolated private subnets or testing environments.

### 2. Legacy Mode (`AUTH_MODE=legacy`)
Standard cluster-wide HTTP Basic Authentication.
*   **Required Env**: `AUTH_USER` (or `AUTH_USERNAME`) and `AUTH_PASS` (or `AUTH_PASSWORD`).
*   **Authorization Header**: `Basic <base64-credentials>`

### 3. API Keys Mode (`AUTH_MODE=apikey`)
App-specific Basic Authentication, assigning unique keys to each service.
*   **Required Env**: `AUTH_APP_KEYS` (JSON string mapping service name to API Key).
    *   Example: `AUTH_APP_KEYS='{"auth-service": "keyA", "profile-service": "keyB"}'`
*   **Authorization Header**: `Basic <base64-credentials>` where username is the application name and password is the corresponding key.

### 4. Kubernetes TokenReview Mode (`AUTH_MODE=k8s-token`) 🔒 (Recommended)
A modern, passwordless, **Zero-Trust** authentication architecture. Instead of managing, distributing, and rotating static credentials, client workloads prove their identity using their native **projected Kubernetes ServiceAccount token** (JWT).

#### How It Works:
1.  **Workload Request**: A client workload pod sends an HTTP request containing its short-lived projected ServiceAccount Bearer token (`Authorization: Bearer <token>`).
2.  **Token Review**: The Config Server intercepts this token and submits a `TokenReview` request to the Kubernetes API-server (`/apis/authentication.k8s.io/v1/tokenreviews`).
3.  **Validation & Metadata Extraction**: The Kubernetes control plane validates the token's signature, expiration, and extracts its metadata (authenticating the pod's Namespace and ServiceAccount name).
4.  **Security Checks**: The Config Server verifies:
    *   The token is verified as authentic by Kubernetes.
    *   The token's audience includes `config-service`.
    *   The pod's Namespace matches `AUTH_NAMESPACE` (default: `apps`).
    *   The pod's ServiceAccount name matches either `:app` (requested app name) or `:app-sa` (anti-spoofing validation).

---

## 🛠️ Step-by-Step Kubernetes Deployment & Setup Guide

Deploying the Config Server under `k8s-token` mode involves setting up the server's RBAC permissions, and configuring the client pods to project their ServiceAccount tokens.

### Step 1: Grant Config Server TokenReview Permissions
To authenticate client tokens, the Config Server needs cluster-level permission to write to the Kubernetes `tokenreviews` resource. 

Create and apply the following RBAC manifest (`config-server-rbac.yaml`):

```yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: nestjs-config-server
  namespace: infra # Namespace where your Config Server is deployed
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: nestjs-config-server-token-reviewer
rules:
  - apiGroups: ["authentication.k8s.io"]
    resources: ["tokenreviews"]
    verbs: ["create"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: nestjs-config-server-token-reviewer-binding
subjects:
  - kind: ServiceAccount
    name: nestjs-config-server
    namespace: infra
roleRef:
  kind: ClusterRole
  name: nestjs-config-server-token-reviewer
  apiGroup: rbac.authorization.k8s.io
```

### Step 2: Configure the Config Server Deployment
Ensure that the Config Server deployment uses the `nestjs-config-server` ServiceAccount and mounts its own token.

Example Server Deployment snippet:
```yaml
spec:
  template:
    spec:
      serviceAccountName: nestjs-config-server
      containers:
        - name: config-server
          image: tesseractdigitainnovations/nestjs-config-server:latest
          env:
            - name: PORT
              value: "3333"
            - name: CONFIG_SOURCE
              value: "git"
            - name: CONFIG_DIR
              value: "/tmp/configs"
            - name: CONFIG_GIT_REPO
              value: "https://github.com/my-org/my-configs.git"
            - name: AUTH_ENABLED
              value: "true"
            - name: AUTH_MODE
              value: "k8s-token"
            - name: AUTH_NAMESPACE
              value: "apps" # The namespace where client workloads run
```

### Step 3: Configure Client Pods (ServiceAccount Token Projection)
To security-harden client pods, use **ServiceAccount Token Projection** (Kubernetes 1.20+). This mounts a short-lived token restricted to the `config-service` audience.

Add this projected volume and volume mount to the client's deployment template:

```yaml
spec:
  template:
    spec:
      serviceAccountName: auth-service # Must match the CONFIG_APP_NAME or auth-service-sa
      containers:
        - name: app
          image: my-app:latest
          env:
            - name: CONFIG_SERVER_URL
              value: "http://nestjs-config-server.infra.service:3333"
            - name: CONFIG_APP_NAME
              value: "auth-service"
            - name: CONFIG_PROFILE
              value: "production"
            - name: CONFIG_AUTH_MODE
              value: "service-account"
            - name: CONFIG_AUTH_TOKEN_PATH
              value: "/var/run/secrets/config-server/token"
          volumeMounts:
            - name: config-server-token
              mountPath: /var/run/secrets/config-server
              readOnly: true
      volumes:
        - name: config-server-token
          projected:
            sources:
              - serviceAccountToken:
                  path: token
                  expirationSeconds: 3600 # Auto-rotated hourly by Kubelet
                  audience: config-service # Must match config server expectations
```

---

## 🔒 Anti-Spoofing & Security Protections
*   **Header Verification**: In addition to validating the token, the server verifies the `x-service-name` header. If a pod requests `auth-service` configs, it *must* send `x-service-name: auth-service`.
*   **ServiceAccount Account Alignment**: The Kubernetes token user must map to `system:serviceaccount:<namespace>:auth-service` (or `auth-service-sa`), completely blocking pods running under other service accounts from downloading sensitive environments.

---

## 📈 Environment Variables Reference

| Variable | Description | Default | Required |
|---|---|---|---|
| `CONFIG_SOURCE` | Config backend (`file` or `git`) | `file` | No |
| `CONFIG_DIR` | Local config storage folder | `./configs` | No |
| `CONFIG_GIT_REPO` | Git repo URL | (none) | Only if `git` |
| `CONFIG_GIT_BRANCH` | Target branch | `main` | No |
| `PORT` | Listening Port | `3333` | No |
| `LOG_DIR` | Folder for write request log outputs | `./logs` | No |
| `AUTH_ENABLED` | Enable authentication (`true`/`false`) | `false` | No |
| `AUTH_MODE` | Authentication mode (`legacy`, `apikey`, `k8s-token`) | `legacy` | No |
| `AUTH_USER` | Legacy Basic Username | (none) | Only `legacy` |
| `AUTH_PASS` | Legacy Basic Password | (none) | Only `legacy` |
| `AUTH_APP_KEYS` | JSON string of app API keys | `"{}"` | Only `apikey` |
| `AUTH_NAMESPACE` | Kubernetes Namespace where workloads run | `apps` | Only `k8s-token` |
| `K8S_TOKEN_PATH` | Path to Config Server ServiceAccount token | `/var/run/secrets/...` | Only `k8s-token` |
| `K8S_CA_PATH` | Path to Config Server CA Certificate | `/var/run/secrets/...` | Only `k8s-token` |

---

## 💻 Local Installation & Development

1. Install dependencies:
   ```sh
   pnpm install
   ```
2. Start server in development mode:
   ```sh
   pnpm start:dev
   ```

## License

MIT
