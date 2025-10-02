import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as chokidar from 'chokidar';
import simpleGit, { SimpleGit } from 'simple-git';
import * as YAML from 'yaml';
import * as dotenv from 'dotenv';
import PropertiesReader from 'properties-reader';

@Injectable()
export class AppConfigService implements OnModuleInit {
  private readonly logger = new Logger(AppConfigService.name);
  private readonly source = process.env.CONFIG_SOURCE || 'file';
  private readonly configDir = path.resolve(process.env.CONFIG_DIR || './configs');
  private readonly repoUrl = process.env.CONFIG_GIT_REPO || '';
  private readonly branch = process.env.CONFIG_GIT_BRANCH || 'main';

  private git: SimpleGit | null = null;
  private cache: Record<string, any> = {};


  isGitEnabled(): boolean {
    return this.source === 'git';
  }

  constructor() {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
  }
  
  async onModuleInit() {
    if (this.source === 'git') {
      await this.initGitRepo();
    }
    this.initFileWatcher();
    this.logger.log(`Config service started in "${this.source}" mode`);
  }

  private loadFromFile(app: string, profile: string): any {
    const candidates = [
      // Hyphenated
      path.join(this.configDir, `${app}-${profile}.json`),
      path.join(this.configDir, `${app}-${profile}.yaml`),
      path.join(this.configDir, `${app}-${profile}.yml`),
      path.join(this.configDir, `${app}-${profile}.properties`),
      path.join(this.configDir, `${app}-${profile}.env`),

      // Folder-based
      path.join(this.configDir, app, `${profile}.json`),
      path.join(this.configDir, app, `${profile}.yaml`),
      path.join(this.configDir, app, `${profile}.yml`),
      path.join(this.configDir, app, `${profile}.properties`),
      path.join(this.configDir, app, `${profile}.env`),

      // Dot-env style
      path.join(this.configDir, app, `.env.${profile}`)
    ];

    for (const filePath of candidates) {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf-8');
        let data: any;
        if (filePath.endsWith('.json')) {
          data = JSON.parse(raw);
        } else if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
          data = YAML.parse(raw);
        } else if (filePath.endsWith('.properties')) {
          const props = PropertiesReader(filePath);
          data = {};
          props.each((key, value) => (data[key] = value));
        } else if (filePath.endsWith('.env') || filePath.includes('.env.')) {
          data = dotenv.parse(raw);
        }
        this.cache[`${app}-${profile}`] = data;
        return data;
      }
    }
    return null;
  }

  private async initGitRepo() {
    if (!this.repoUrl) {
      throw new Error('CONFIG_GIT_REPO must be set when CONFIG_SOURCE=git');
    }
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    this.git = simpleGit();
    if (!fs.existsSync(path.join(this.configDir, '.git'))) {
      this.logger.log(`Cloning config repo from ${this.repoUrl}...`);
      await this.git.clone(this.repoUrl, this.configDir, ['-b', this.branch]);
    } else {
      this.logger.log(`Pulling latest configs from ${this.repoUrl}...`);
      await this.git.cwd(this.configDir).pull('origin', this.branch);
    }
  }

  private initFileWatcher() {
    if (!fs.existsSync(this.configDir)) return;
    chokidar.watch(this.configDir).on('change', (filePath) => {
      this.logger.log(`Config file changed: ${filePath}`);
      const fileName = path.basename(filePath);
      const [app, profileWithExt] = fileName.split('-');
      const profile = profileWithExt?.split('.')[0];
      if (app && profile) {
        this.loadFromFile(app, profile);
      }
    });
  }

  async getConfig(app: string, profile: string): Promise<any> {
    const key = `${app}-${profile}`;
    if (this.cache[key]) return this.cache[key];
    return this.loadFromFile(app, profile);
  }

  async refreshFromGit() {
    if (this.source === 'git' && this.git) {
      this.logger.log(`Refreshing configs from Git...`);
      await this.git.cwd(this.configDir).pull('origin', this.branch);
    }
  }
}