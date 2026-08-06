import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import * as fs from "fs";
import * as https from "https";

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger("AuthGuard");

  private readonly authEnabled = process.env.AUTH_ENABLED === "true";
  private readonly authMode = (process.env.AUTH_MODE || "legacy").toLowerCase();

  // Legacy credentials (with fallback to old AUTH_USERNAME/AUTH_PASSWORD)
  private readonly legacyUser = process.env.AUTH_USER || process.env.AUTH_USERNAME;
  private readonly legacyPass = process.env.AUTH_PASS || process.env.AUTH_PASSWORD;

  // Namespace where your workloads run
  private readonly allowedNamespace = process.env.AUTH_NAMESPACE || "apps";

  // Kubernetes ServiceAccount TokenReview paths
  private readonly k8sTokenPath =
    process.env.K8S_TOKEN_PATH || "/var/run/secrets/kubernetes.io/serviceaccount/token";
  private readonly k8sCaPath =
    process.env.K8S_CA_PATH || "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt";

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.authEnabled) {
      this.logger.debug("Authentication is DISABLED, allowing request");
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const app = request.params.app;

    if (!app) {
      throw new UnauthorizedException(
        "Target app parameter is missing in route",
      );
    }

    this.logger.log(
      `Validating request in mode: ${this.authMode} for app target: ${app}`,
    );

    switch (this.authMode) {
      case "legacy":
        return this.validateLegacyMode(request);

      case "apikey":
        return this.validateApiKeyMode(request, app);

      case "k8s-token":
        return this.validateK8sTokenMode(request, app);

      default:
        throw new UnauthorizedException(
          `Unsupported authentication mode: ${this.authMode}`,
        );
    }
  }

  /**
   * Validate standard cluster-wide legacy credentials
   */
  private validateLegacyMode(request: any): boolean {
    if (!this.legacyUser || !this.legacyPass) {
      throw new UnauthorizedException(
        "Legacy auth is enabled but credentials are not configured",
      );
    }

    const credentials = this.parseBasicAuthHeader(request);

    if (
      credentials.username === this.legacyUser &&
      credentials.password === this.legacyPass
    ) {
      return true;
    }

    throw new UnauthorizedException("Invalid legacy credentials");
  }

  /**
   * Validate app-specific API keys
   */
  private validateApiKeyMode(request: any, app: string): boolean {
    const keysStr = process.env.AUTH_APP_KEYS || "{}";
    let keys: Record<string, string>;

    try {
      keys = JSON.parse(keysStr);
    } catch (err: any) {
      this.logger.error(`Failed to parse AUTH_APP_KEYS: ${err.message}`);
      throw new UnauthorizedException("Invalid AUTH_APP_KEYS configuration");
    }

    const credentials = this.parseBasicAuthHeader(request);
    const expectedKey = keys[app];

    if (!expectedKey) {
      this.logger.warn(`No registered API key for app '${app}'`);
      throw new UnauthorizedException(`App '${app}' is not registered`);
    }

    if (credentials.username === app && credentials.password === expectedKey) {
      this.logger.debug(`API key authorization successful for '${app}'`);
      return true;
    }

    this.logger.warn(`Invalid API key for '${app}'`);
    throw new UnauthorizedException(`Invalid API key for '${app}'`);
  }

  /**
   * Validate Kubernetes ServiceAccount projected token using TokenReview
   */
  private async validateK8sTokenMode(
    request: any,
    app: string,
  ): Promise<boolean> {
    const authHeader = request.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing or invalid Bearer token");
    }

    const token = authHeader.substring("Bearer ".length);

    if (!fs.existsSync(this.k8sTokenPath) || !fs.existsSync(this.k8sCaPath)) {
      this.logger.error(
        `Kubernetes ServiceAccount token or CA certificate not found (Token: ${this.k8sTokenPath}, CA: ${this.k8sCaPath})`,
      );
      throw new UnauthorizedException(
        "Config server is not running inside Kubernetes or missing volume mounts",
      );
    }

    try {
      // Config service's own ServiceAccount token
      const configSvcToken = fs.readFileSync(this.k8sTokenPath, "utf8").trim();
      const k8sCa = fs.readFileSync(this.k8sCaPath);

      const postData = JSON.stringify({
        apiVersion: "authentication.k8s.io/v1",
        kind: "TokenReview",
        spec: {
          token,
          audiences: ["config-service"],
        },
      });

      const options: https.RequestOptions = {
        hostname: "kubernetes.default.svc",
        port: 443,
        path: "/apis/authentication.k8s.io/v1/tokenreviews",
        method: "POST",
        ca: k8sCa,
        headers: {
          Authorization: `Bearer ${configSvcToken}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(postData),
        },
      };

      const tokenReview = await new Promise<any>((resolve, reject) => {
        const req = https.request(options, (res) => {
          let body = "";

          res.on("data", (chunk) => {
            body += chunk;
          });

          res.on("end", () => {
            if (
              res.statusCode &&
              res.statusCode >= 200 &&
              res.statusCode < 300
            ) {
              try {
                resolve(JSON.parse(body));
              } catch {
                reject(new Error("Failed to parse TokenReview response"));
              }
            } else {
              reject(
                new Error(`TokenReview failed (${res.statusCode}): ${body}`),
              );
            }
          });
        });

        req.on("error", reject);
        req.write(postData);
        req.end();
      });

      const status = tokenReview?.status;

      if (!status?.authenticated) {
        const errorDetail = status?.error ? `: ${status.error}` : "";
        this.logger.warn(
          `Kubernetes rejected ServiceAccount token for app '${app}'${errorDetail}`,
        );
        throw new UnauthorizedException(
          "Invalid or expired ServiceAccount token",
        );
      }

      // Audience validation (verified by Kubernetes)
      const audiences: string[] = status.audiences ?? [];

      if (!audiences.includes("config-service")) {
        const actualAuds = audiences.length > 0 ? audiences.join(", ") : "none";
        this.logger.warn(`Token audience mismatch. Expected: config-service, Got: [${actualAuds}]`);
        throw new UnauthorizedException("Token audience is not authorized");
      }

      // Username format: system:serviceaccount:<namespace>:<serviceaccount>
      const username: string = status.user?.username ?? "";
      const [system, principalType, namespace, serviceAccount] =
        username.split(":");

      if (
        system !== "system" ||
        principalType !== "serviceaccount" ||
        !namespace ||
        !serviceAccount
      ) {
        this.logger.warn(`Authenticated principal '${username}' is not a Kubernetes ServiceAccount`);
        throw new UnauthorizedException(
          "Authenticated principal is not a Kubernetes ServiceAccount",
        );
      }

      // Namespace validation
      if (namespace !== this.allowedNamespace) {
        this.logger.warn(
          `Rejected ServiceAccount '${serviceAccount}' from namespace '${namespace}'. Allowed namespace: ${this.allowedNamespace}`,
        );
        throw new UnauthorizedException("Unauthorized namespace");
      }

      // Service account name check
      const allowedNames = new Set([app, `${app}-sa`]);

      if (!allowedNames.has(serviceAccount)) {
        this.logger.warn(
          `ServiceAccount '${serviceAccount}' is not authorized for app '${app}'. Expected one of: ${Array.from(allowedNames).join(", ")}`,
        );
        throw new UnauthorizedException(
          `ServiceAccount '${serviceAccount}' is not authorized for '${app}'`,
        );
      }

      this.logger.log(
        `Authorization successful: ${namespace}/${serviceAccount} -> ${app}`,
      );

      return true;
    } catch (error: any) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      this.logger.error(`TokenReview failed: ${error.message}`);
      throw new UnauthorizedException("Failed to verify Kubernetes identity");
    }
  }

  /**
   * Parse HTTP Basic Authorization header
   */
  private parseBasicAuthHeader(request: any) {
    const authHeader = request.headers["authorization"];

    if (!authHeader || !authHeader.startsWith("Basic ")) {
      throw new UnauthorizedException(
        "Missing or invalid Authorization header",
      );
    }

    try {
      const encoded = authHeader.substring("Basic ".length);
      const decoded = Buffer.from(encoded, "base64").toString("utf8");
      const separator = decoded.indexOf(":");

      if (separator === -1) {
        throw new UnauthorizedException("Invalid credentials format");
      }

      return {
        username: decoded.substring(0, separator),
        password: decoded.substring(separator + 1),
      };
    } catch {
      throw new UnauthorizedException("Invalid Authorization header");
    }
  }
}
