// validate env variables
import * as Joi from "joi";

export const envSchema = Joi.object({
  CONFIG_SOURCE: Joi.string().valid("file", "git").default("file"),
  CONFIG_DIR: Joi.string().default("./configs"),
  PORT: Joi.number().default(3333),
  CONFIG_GIT_REPO: Joi.string().when("CONFIG_SOURCE", {
    is: "git",
    then: Joi.required(),
    otherwise: Joi.optional().allow(""),
  }),
  CONFIG_GIT_BRANCH: Joi.string().default("main"),
  
  // Auth configuration
  AUTH_ENABLED: Joi.string().valid("true", "false").default("false"),
  AUTH_MODE: Joi.string().valid("legacy", "apikey", "k8s-token").default("legacy"),
  
  // Legacy authentication variables
  AUTH_USER: Joi.string().optional().allow(""),
  AUTH_PASS: Joi.string().optional().allow(""),
  AUTH_USERNAME: Joi.string().optional().allow(""), // kept for legacy backward compatibility
  AUTH_PASSWORD: Joi.string().optional().allow(""), // kept for legacy backward compatibility
  
  // API key configuration
  AUTH_APP_KEYS: Joi.string().optional().allow(""),
  
  // Kubernetes configuration
  AUTH_NAMESPACE: Joi.string().default("apps"),
  K8S_TOKEN_PATH: Joi.string().optional().allow(""),
  K8S_CA_PATH: Joi.string().optional().allow(""),

  // Log configuration
  LOG_DIR: Joi.string().optional().allow(""),
}).unknown(true); // allow other env vars
