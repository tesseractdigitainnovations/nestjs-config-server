// validate env variables
import * as Joi from 'joi';

export const envSchema = Joi.object({
  CONFIG_SOURCE: Joi.string().valid('file', 'git').default('file'),
  CONFIG_DIR: Joi.string().default('./configs'),
  CONFIG_GIT_REPO: Joi.string().when('CONFIG_SOURCE', {
    is: 'git',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  CONFIG_GIT_BRANCH: Joi.string().default('main'),
  CONFIG_AUTH_USER: Joi.string().optional().allow(''),
  CONFIG_AUTH_PASS: Joi.string().optional().allow(''),
  AUTH_ENABLED: Joi.string().valid('true', 'false').default('false'),
}).unknown(true); // allow other env vars