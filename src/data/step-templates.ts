/**
 * Built-in Step Templates
 * Pre-defined workflow step templates for common development tasks
 * Focus on commands that are useful but hard to remember
 */

import type {
  StepTemplate,
  TemplateCategory,
  TemplateCategoryInfo,
  GroupedTemplates,
  TemplateExportData,
  CustomTemplate,
} from '../types/step-template';
import type { WorkflowNode } from '../types/workflow';
import { isScriptNodeConfig } from '../types/workflow';
import { stepTemplateAPI, type CustomStepTemplate } from '../lib/tauri-api';

/** Category metadata for display */
export const TEMPLATE_CATEGORIES: TemplateCategoryInfo[] = [
  { id: 'package-manager', name: 'Package Manager', icon: 'Package' },
  { id: 'git', name: 'Git Operations', icon: 'GitBranch' },
  { id: 'docker', name: 'Docker', icon: 'Container' },
  { id: 'shell', name: 'Shell & System', icon: 'Terminal' },
  { id: 'testing', name: 'Testing', icon: 'TestTube' },
  { id: 'code-quality', name: 'Code Quality', icon: 'CheckCircle' },
  { id: 'kubernetes', name: 'Kubernetes', icon: 'Server' },
  { id: 'database', name: 'Database', icon: 'Database' },
  { id: 'cloud', name: 'Cloud', icon: 'Cloud' },
  { id: 'ai', name: 'AI Assistants', icon: 'Robot' },
  { id: 'security', name: 'Security', icon: 'Shield' },
  { id: 'nodejs', name: 'Node.js', icon: 'Cpu' },
];

/** Built-in step templates */
export const STEP_TEMPLATES: StepTemplate[] = [
  // Package Manager
  {
    id: 'pm-clean-install',
    name: 'Clean Install',
    command: 'rm -rf node_modules && {pm} install',
    category: 'package-manager',
    description: 'Remove node_modules and reinstall',
  },
  {
    id: 'pm-full-reset',
    name: 'Full Reset',
    command: 'rm -rf node_modules package-lock.json pnpm-lock.yaml yarn.lock && {pm} install',
    category: 'package-manager',
    description: 'Remove all lock files and reinstall',
  },
  {
    id: 'pm-audit-fix',
    name: 'Audit & Fix',
    command: '{pm} audit fix',
    category: 'package-manager',
    description: 'Check and auto-fix security vulnerabilities',
  },
  {
    id: 'pm-why',
    name: 'Why Package',
    command: '{pm} why <package-name>',
    category: 'package-manager',
    description: 'Show why a package is installed',
  },
  {
    id: 'pm-link',
    name: 'Link Local Package',
    command: '{pm} link <path-to-local-package>',
    category: 'package-manager',
    description: 'Link a local package for development',
  },
  {
    id: 'pm-dedupe',
    name: 'Deduplicate',
    command: '{pm} dedupe',
    category: 'package-manager',
    description: 'Remove duplicate package dependencies',
  },

  // Git Operations
  {
    id: 'git-amend-no-edit',
    name: 'Amend Last Commit',
    command: 'git commit --amend --no-edit',
    category: 'git',
    description: 'Add staged changes to last commit without editing message',
  },
  {
    id: 'git-undo-commit',
    name: 'Undo Last Commit',
    command: 'git reset --soft HEAD~1',
    category: 'git',
    description: 'Undo last commit but keep changes staged',
  },
  {
    id: 'git-stash-named',
    name: 'Stash with Name',
    command: 'git stash push -m "<stash-name>"',
    category: 'git',
    description: 'Stash changes with a descriptive name',
  },
  {
    id: 'git-stash-list',
    name: 'List Stashes',
    command: 'git stash list',
    category: 'git',
    description: 'List all stashed changes',
  },
  {
    id: 'git-clean-untracked',
    name: 'Clean Untracked Files',
    command: 'git clean -fd',
    category: 'git',
    description: 'Remove all untracked files and directories',
  },
  {
    id: 'git-log-pretty',
    name: 'Pretty Log',
    command: 'git log --oneline --graph --decorate -20',
    category: 'git',
    description: 'Show last 20 commits in graph format',
  },
  {
    id: 'git-cherry-pick',
    name: 'Cherry Pick',
    command: 'git cherry-pick <commit-hash>',
    category: 'git',
    description: 'Apply a specific commit to current branch',
  },
  {
    id: 'git-reflog',
    name: 'Show Reflog',
    command: 'git reflog -20',
    category: 'git',
    description: 'Show HEAD history (recover deleted commits)',
  },
  {
    id: 'git-branch-cleanup',
    name: 'Cleanup Merged Branches',
    command: 'git branch --merged | grep -v "\\*\\|main\\|master" | xargs -n 1 git branch -d',
    category: 'git',
    description: 'Delete all merged local branches',
  },
  {
    id: 'git-fetch-prune',
    name: 'Fetch & Prune',
    command: 'git fetch --prune',
    category: 'git',
    description: 'Fetch and remove deleted remote branches',
  },

  // Docker
  {
    id: 'docker-build',
    name: 'Build Image',
    command: 'docker build -t <image-name>:<tag> .',
    category: 'docker',
    description: 'Build image from Dockerfile',
  },
  {
    id: 'docker-run-it',
    name: 'Run Interactive',
    command: 'docker run -it --rm <image-name> /bin/sh',
    category: 'docker',
    description: 'Run container interactively (auto-remove on exit)',
  },
  {
    id: 'docker-run-port',
    name: 'Run with Port',
    command: 'docker run -d -p 3000:3000 --name <container-name> <image-name>',
    category: 'docker',
    description: 'Run detached with port mapping',
  },
  {
    id: 'docker-compose-up',
    name: 'Compose Up',
    command: 'docker compose up -d',
    category: 'docker',
    description: 'Start all services in background',
  },
  {
    id: 'docker-compose-down',
    name: 'Compose Down',
    command: 'docker compose down -v',
    category: 'docker',
    description: 'Stop services and remove volumes',
  },
  {
    id: 'docker-compose-logs',
    name: 'Compose Logs',
    command: 'docker compose logs -f --tail=100',
    category: 'docker',
    description: 'Follow last 100 lines of service logs',
  },
  {
    id: 'docker-exec',
    name: 'Exec into Container',
    command: 'docker exec -it <container-name> /bin/sh',
    category: 'docker',
    description: 'Open shell in running container',
  },
  {
    id: 'docker-logs',
    name: 'Follow Logs',
    command: 'docker logs -f --tail=100 <container-name>',
    category: 'docker',
    description: 'Follow container logs',
  },
  {
    id: 'docker-prune-all',
    name: 'System Prune',
    command: 'docker system prune -af --volumes',
    category: 'docker',
    description: 'Remove all unused images, containers, networks and volumes',
  },
  {
    id: 'docker-stop-all',
    name: 'Stop All Containers',
    command: 'docker stop $(docker ps -aq)',
    category: 'docker',
    description: 'Stop all running containers',
  },
  {
    id: 'docker-rm-all',
    name: 'Remove All Containers',
    command: 'docker rm $(docker ps -aq)',
    category: 'docker',
    description: 'Remove all containers',
  },
  {
    id: 'docker-rmi-dangling',
    name: 'Remove Dangling Images',
    command: 'docker rmi $(docker images -f "dangling=true" -q)',
    category: 'docker',
    description: 'Remove all dangling images',
  },

  // Shell & System
  {
    id: 'shell-kill-port',
    name: 'Kill Process on Port',
    command: 'lsof -ti:<port> | xargs kill -9',
    category: 'shell',
    description: 'Kill process using specified port',
  },
  {
    id: 'shell-ports',
    name: 'Show Listening Ports',
    command: 'lsof -i -P -n | grep LISTEN',
    category: 'shell',
    description: 'Show all listening ports',
  },
  {
    id: 'shell-find-large',
    name: 'Find Large Files',
    command: 'find . -type f -size +100M -exec ls -lh {} \\;',
    category: 'shell',
    description: 'Find files larger than 100MB',
  },
  {
    id: 'shell-disk-usage',
    name: 'Disk Usage',
    command: 'du -sh * | sort -hr | head -20',
    category: 'shell',
    description: 'Show 20 largest items in current directory',
  },
  {
    id: 'shell-delete-node-modules',
    name: 'Delete All node_modules',
    command: 'find . -name "node_modules" -type d -prune -exec rm -rf {} +',
    category: 'shell',
    description: 'Recursively delete all node_modules folders',
  },
  {
    id: 'shell-delete-ds-store',
    name: 'Delete .DS_Store',
    command: 'find . -name ".DS_Store" -type f -delete',
    category: 'shell',
    description: 'Delete all .DS_Store files',
  },
  {
    id: 'shell-env-from-example',
    name: 'Create .env from Example',
    command: 'cp .env.example .env',
    category: 'shell',
    description: 'Copy .env.example to .env',
  },
  {
    id: 'shell-watch-files',
    name: 'Watch File Changes',
    command: 'fswatch -o . | xargs -n1 -I{} echo "Changed"',
    category: 'shell',
    description: 'Watch for file changes in directory',
  },
  {
    id: 'shell-tar-create',
    name: 'Create Tar Archive',
    command: 'tar -czvf archive.tar.gz <directory>',
    category: 'shell',
    description: 'Create gzip compressed archive',
  },
  {
    id: 'shell-tar-extract',
    name: 'Extract Tar Archive',
    command: 'tar -xzvf archive.tar.gz',
    category: 'shell',
    description: 'Extract gzip compressed archive',
  },

  // Testing
  {
    id: 'test-coverage',
    name: 'Test with Coverage',
    command: '{pm} test -- --coverage',
    category: 'testing',
    description: 'Run tests with coverage report',
  },
  {
    id: 'test-update-snapshot',
    name: 'Update Snapshots',
    command: '{pm} test -- -u',
    category: 'testing',
    description: 'Update all test snapshots',
  },
  {
    id: 'test-watch',
    name: 'Watch Mode',
    command: '{pm} test -- --watch',
    category: 'testing',
    description: 'Run tests in watch mode',
  },
  {
    id: 'test-single',
    name: 'Test Single File',
    command: '{pm} test -- <file-pattern>',
    category: 'testing',
    description: 'Run tests matching file pattern',
  },
  {
    id: 'test-e2e',
    name: 'E2E Tests',
    command: '{pm} run test:e2e',
    category: 'testing',
    description: 'Run end-to-end tests',
  },
  {
    id: 'test-ci',
    name: 'CI Mode',
    command: '{pm} test -- --ci --runInBand',
    category: 'testing',
    description: 'Run tests in CI mode (single thread)',
  },

  // Code Quality
  {
    id: 'quality-lint-fix',
    name: 'Lint & Fix',
    command: '{pm} run lint -- --fix',
    category: 'code-quality',
    description: 'Check and auto-fix lint issues',
  },
  {
    id: 'quality-typecheck',
    name: 'Type Check',
    command: 'npx tsc --noEmit',
    category: 'code-quality',
    description: 'TypeScript type check without output',
  },
  {
    id: 'quality-format',
    name: 'Format All',
    command: 'npx prettier --write "**/*.{ts,tsx,js,jsx,json,css,md}"',
    category: 'code-quality',
    description: 'Format all code files',
  },
  {
    id: 'quality-format-check',
    name: 'Format Check',
    command: 'npx prettier --check "**/*.{ts,tsx,js,jsx,json,css,md}"',
    category: 'code-quality',
    description: 'Check formatting without modifying',
  },
  {
    id: 'quality-unused-deps',
    name: 'Find Unused Dependencies',
    command: 'npx depcheck',
    category: 'code-quality',
    description: 'Find unused package dependencies',
  },
  {
    id: 'quality-bundle-analyze',
    name: 'Analyze Bundle',
    command: 'npx vite-bundle-analyzer',
    category: 'code-quality',
    description: 'Analyze bundle size',
  },

  // Git Advanced Operations (new)
  {
    id: 'git-bisect-start',
    name: 'Bisect Start',
    command: 'git bisect start && git bisect bad && git bisect good <commit>',
    category: 'git',
    description: 'Start binary search for bad commit',
  },
  {
    id: 'git-worktree-add',
    name: 'Worktree Add',
    command: 'git worktree add ../<branch-name> <branch>',
    category: 'git',
    description: 'Add a new worktree for parallel development',
  },
  {
    id: 'git-worktree-list',
    name: 'Worktree List',
    command: 'git worktree list',
    category: 'git',
    description: 'List all worktrees',
  },
  {
    id: 'git-submodule-update',
    name: 'Submodule Update',
    command: 'git submodule update --init --recursive',
    category: 'git',
    description: 'Initialize and update all submodules',
  },
  {
    id: 'git-rebase-interactive',
    name: 'Rebase Interactive',
    command: 'git rebase -i HEAD~<n>',
    category: 'git',
    description: 'Interactive rebase last n commits',
  },

  // Docker Advanced Operations (new)
  {
    id: 'docker-buildx-multi',
    name: 'Buildx Multi-Arch',
    command: 'docker buildx build --platform linux/amd64,linux/arm64 -t <image>:<tag> --push .',
    category: 'docker',
    description: 'Build multi-architecture image',
  },
  {
    id: 'docker-push',
    name: 'Push to Registry',
    command: 'docker push <registry>/<image>:<tag>',
    category: 'docker',
    description: 'Push image to container registry',
  },
  {
    id: 'docker-tag',
    name: 'Tag Image',
    command: 'docker tag <source-image> <target-image>:<tag>',
    category: 'docker',
    description: 'Tag an image for registry',
  },
  {
    id: 'docker-save',
    name: 'Save Image',
    command: 'docker save -o <file.tar> <image>',
    category: 'docker',
    description: 'Export image to tar file',
  },
  {
    id: 'docker-load',
    name: 'Load Image',
    command: 'docker load -i <file.tar>',
    category: 'docker',
    description: 'Load image from tar file',
  },

  // Testing Advanced (new)
  {
    id: 'test-playwright',
    name: 'Playwright Run',
    command: 'npx playwright test',
    category: 'testing',
    description: 'Run Playwright E2E tests',
  },
  {
    id: 'test-playwright-ui',
    name: 'Playwright UI',
    command: 'npx playwright test --ui',
    category: 'testing',
    description: 'Open Playwright UI mode',
  },
  {
    id: 'test-cypress',
    name: 'Cypress Run',
    command: 'npx cypress run',
    category: 'testing',
    description: 'Run Cypress E2E tests',
  },
  {
    id: 'test-cypress-open',
    name: 'Cypress Open',
    command: 'npx cypress open',
    category: 'testing',
    description: 'Open Cypress GUI',
  },
  {
    id: 'test-vitest',
    name: 'Vitest Run',
    command: 'npx vitest run',
    category: 'testing',
    description: 'Run Vitest tests',
  },

  // Code Quality Advanced (new)
  {
    id: 'quality-vitest-coverage',
    name: 'Vitest Coverage',
    command: 'npx vitest run --coverage',
    category: 'code-quality',
    description: 'Run Vitest with coverage report',
  },
  {
    id: 'quality-eslint-cache',
    name: 'ESLint Cached',
    command: 'npx eslint --cache --fix .',
    category: 'code-quality',
    description: 'Lint with caching for faster runs',
  },
  {
    id: 'quality-biome-check',
    name: 'Biome Check',
    command: 'npx biome check .',
    category: 'code-quality',
    description: 'Fast lint and format check with Biome',
  },
  {
    id: 'quality-oxlint',
    name: 'OxLint',
    command: 'npx oxlint .',
    category: 'code-quality',
    description: 'Ultra-fast Rust-based linter',
  },
  {
    id: 'quality-knip',
    name: 'Knip Unused',
    command: 'npx knip',
    category: 'code-quality',
    description: 'Find unused files and exports',
  },

  // Kubernetes
  {
    id: 'k8s-get-pods',
    name: 'Get Pods',
    command: 'kubectl get pods -o wide',
    category: 'kubernetes',
    description: 'List all pods with details',
  },
  {
    id: 'k8s-get-all',
    name: 'Get All Resources',
    command: 'kubectl get all -A',
    category: 'kubernetes',
    description: 'List all resources in all namespaces',
  },
  {
    id: 'k8s-describe-pod',
    name: 'Describe Pod',
    command: 'kubectl describe pod <pod-name>',
    category: 'kubernetes',
    description: 'Show detailed pod information',
  },
  {
    id: 'k8s-logs',
    name: 'Pod Logs',
    command: 'kubectl logs -f <pod-name>',
    category: 'kubernetes',
    description: 'Follow pod logs',
  },
  {
    id: 'k8s-exec',
    name: 'Exec into Pod',
    command: 'kubectl exec -it <pod-name> -- /bin/sh',
    category: 'kubernetes',
    description: 'Open shell in running pod',
  },
  {
    id: 'k8s-apply',
    name: 'Apply Manifest',
    command: 'kubectl apply -f <manifest.yaml>',
    category: 'kubernetes',
    description: 'Apply Kubernetes manifest',
  },
  {
    id: 'k8s-delete-pod',
    name: 'Delete Pod',
    command: 'kubectl delete pod <pod-name>',
    category: 'kubernetes',
    description: 'Delete a pod',
  },
  {
    id: 'k8s-port-forward',
    name: 'Port Forward',
    command: 'kubectl port-forward <pod-name> 8080:80',
    category: 'kubernetes',
    description: 'Forward port to local machine',
  },
  {
    id: 'k8s-get-contexts',
    name: 'Get Contexts',
    command: 'kubectl config get-contexts',
    category: 'kubernetes',
    description: 'List all contexts',
  },
  {
    id: 'k8s-use-context',
    name: 'Switch Context',
    command: 'kubectl config use-context <context-name>',
    category: 'kubernetes',
    description: 'Switch to a different context',
  },

  // Database
  {
    id: 'db-pg-connect',
    name: 'PostgreSQL Connect',
    command: 'psql -h localhost -U <username> -d <database>',
    category: 'database',
    description: 'Connect to PostgreSQL database',
  },
  {
    id: 'db-pg-dump',
    name: 'PostgreSQL Dump',
    command: 'pg_dump -h localhost -U <user> <db> > backup.sql',
    category: 'database',
    description: 'Backup PostgreSQL database',
  },
  {
    id: 'db-pg-restore',
    name: 'PostgreSQL Restore',
    command: 'psql -h localhost -U <user> <db> < backup.sql',
    category: 'database',
    description: 'Restore PostgreSQL database',
  },
  {
    id: 'db-mysql-connect',
    name: 'MySQL Connect',
    command: 'mysql -h localhost -u <username> -p <database>',
    category: 'database',
    description: 'Connect to MySQL database',
  },
  {
    id: 'db-mysql-dump',
    name: 'MySQL Dump',
    command: 'mysqldump -h localhost -u <user> -p <db> > backup.sql',
    category: 'database',
    description: 'Backup MySQL database',
  },
  {
    id: 'db-mongo-connect',
    name: 'MongoDB Connect',
    command: 'mongosh "mongodb://localhost:27017/<db>"',
    category: 'database',
    description: 'Connect to MongoDB',
  },
  {
    id: 'db-mongo-export',
    name: 'MongoDB Export',
    command: 'mongoexport --db=<db> --collection=<col> --out=data.json',
    category: 'database',
    description: 'Export MongoDB collection',
  },
  {
    id: 'db-redis-cli',
    name: 'Redis CLI',
    command: 'redis-cli -h localhost -p 6379',
    category: 'database',
    description: 'Connect to Redis CLI',
  },
  {
    id: 'db-redis-flush',
    name: 'Redis Flush All',
    command: 'redis-cli FLUSHALL',
    category: 'database',
    description: 'Clear all Redis data',
  },
  {
    id: 'db-sqlite-query',
    name: 'SQLite Query',
    command: 'sqlite3 <database.db> "<SQL query>"',
    category: 'database',
    description: 'Execute SQLite query',
  },

  // Cloud
  {
    id: 'cloud-aws-s3-ls',
    name: 'AWS S3 List',
    command: 'aws s3 ls s3://<bucket-name>',
    category: 'cloud',
    description: 'List S3 bucket contents',
  },
  {
    id: 'cloud-aws-s3-sync',
    name: 'AWS S3 Sync',
    command: 'aws s3 sync ./<folder> s3://<bucket>/<path>',
    category: 'cloud',
    description: 'Sync directory to S3',
  },
  {
    id: 'cloud-aws-s3-cp',
    name: 'AWS S3 Copy',
    command: 'aws s3 cp <file> s3://<bucket>/<path>',
    category: 'cloud',
    description: 'Upload file to S3',
  },
  {
    id: 'cloud-aws-ecr-login',
    name: 'AWS ECR Login',
    command: 'aws ecr get-login-password | docker login --username AWS --password-stdin <account>.dkr.ecr.<region>.amazonaws.com',
    category: 'cloud',
    description: 'Login to AWS ECR',
  },
  {
    id: 'cloud-aws-lambda-invoke',
    name: 'AWS Lambda Invoke',
    command: 'aws lambda invoke --function-name <name> output.json',
    category: 'cloud',
    description: 'Invoke Lambda function',
  },
  {
    id: 'cloud-gcp-auth',
    name: 'GCP Auth Login',
    command: 'gcloud auth login',
    category: 'cloud',
    description: 'Login to Google Cloud',
  },
  {
    id: 'cloud-gcp-project',
    name: 'GCP Set Project',
    command: 'gcloud config set project <project-id>',
    category: 'cloud',
    description: 'Set GCP project',
  },
  {
    id: 'cloud-gcp-run-deploy',
    name: 'GCP Cloud Run Deploy',
    command: 'gcloud run deploy <service> --image <image> --region <region>',
    category: 'cloud',
    description: 'Deploy to Cloud Run',
  },
  {
    id: 'cloud-azure-login',
    name: 'Azure Login',
    command: 'az login',
    category: 'cloud',
    description: 'Login to Azure',
  },
  {
    id: 'cloud-azure-resources',
    name: 'Azure Resource List',
    command: 'az resource list --output table',
    category: 'cloud',
    description: 'List Azure resources',
  },

  // Security
  {
    id: 'sec-npm-audit',
    name: 'npm Audit High',
    command: 'npm audit --audit-level=high',
    category: 'security',
    description: 'Check for high severity vulnerabilities',
  },
  {
    id: 'sec-trivy-image',
    name: 'Trivy Scan Image',
    command: 'trivy image <image-name>',
    category: 'security',
    description: 'Scan Docker image for vulnerabilities',
  },
  {
    id: 'sec-trivy-fs',
    name: 'Trivy Scan FS',
    command: 'trivy fs --severity HIGH,CRITICAL .',
    category: 'security',
    description: 'Scan filesystem for vulnerabilities',
  },
  {
    id: 'sec-owasp-check',
    name: 'OWASP Dependency Check',
    command: 'dependency-check --scan . --format HTML --out report',
    category: 'security',
    description: 'OWASP dependency vulnerability check',
  },
  {
    id: 'sec-snyk-test',
    name: 'Snyk Test',
    command: 'snyk test',
    category: 'security',
    description: 'Snyk security scan',
  },
  {
    id: 'sec-gitleaks',
    name: 'GitLeaks Scan',
    command: 'gitleaks detect --source . --verbose',
    category: 'security',
    description: 'Scan for secrets in git history',
  },
  {
    id: 'sec-trufflehog',
    name: 'Secrets Scan',
    command: 'trufflehog filesystem --directory=.',
    category: 'security',
    description: 'Find secrets in codebase',
  },
  {
    id: 'sec-semgrep',
    name: 'SAST Semgrep',
    command: 'semgrep --config auto .',
    category: 'security',
    description: 'Static code security analysis',
  },
  {
    id: 'sec-ssl-check',
    name: 'Check SSL Certificate',
    command: 'openssl s_client -connect <host>:443 -servername <host>',
    category: 'security',
    description: 'Inspect SSL certificate',
  },
  {
    id: 'sec-ssl-gen',
    name: 'Generate SSL Cert',
    command: 'openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes',
    category: 'security',
    description: 'Generate self-signed SSL certificate',
  },

  // Node.js
  {
    id: 'node-version',
    name: 'Node Version',
    command: 'node -v && npm -v',
    category: 'nodejs',
    description: 'Show Node.js and npm versions',
  },
  {
    id: 'node-nvm-use',
    name: 'NVM Use',
    command: 'nvm use <version>',
    category: 'nodejs',
    description: 'Switch Node.js version',
  },
  {
    id: 'node-nvm-install',
    name: 'NVM Install',
    command: 'nvm install <version>',
    category: 'nodejs',
    description: 'Install Node.js version',
  },
  {
    id: 'node-clinic',
    name: 'Clinic Doctor',
    command: 'npx clinic doctor -- node <script.js>',
    category: 'nodejs',
    description: 'Performance diagnostics',
  },
  {
    id: 'node-0x',
    name: '0x Profiler',
    command: 'npx 0x <script.js>',
    category: 'nodejs',
    description: 'Generate flamegraph',
  },
  {
    id: 'node-webpack-analyze',
    name: 'Webpack Bundle Analyze',
    command: 'npx webpack-bundle-analyzer dist/stats.json',
    category: 'nodejs',
    description: 'Analyze Webpack bundle',
  },
  {
    id: 'node-vite-analyze',
    name: 'Vite Build Analyze',
    command: 'npx vite build --mode analyze',
    category: 'nodejs',
    description: 'Analyze Vite build',
  },
  {
    id: 'node-clear-cache',
    name: 'Clear npm Cache',
    command: 'npm cache clean --force',
    category: 'nodejs',
    description: 'Clear npm cache',
  },
  // AI Assistants
  {
    id: 'ai-codex-analysis',
    name: 'Codex Analysis',
    command: 'codex analyze --path <file-or-dir> --prompt "Summarize issues and improvements" --format markdown',
    category: 'ai',
    description: 'Run the Codex CLI to review a file or folder and get annotated feedback',
  },
  {
    id: 'ai-claude-brainstorm',
    name: 'Claude Brainstorm',
    command: 'claude brainstorm --prompt "<topic-or-problem>" --length short',
    category: 'ai',
    description: 'Ask Claude for ideas, summaries, or follow-up questions on a topic',
  },
  {
    id: 'ai-claude-release-notes',
    name: 'Claude Release Notes',
    command: 'claude write --style "release notes" --input "<summary-of-changes>" --tone upbeat',
    category: 'ai',
    description: 'Generate polished release note bullets from a change summary',
  },
  {
    id: 'ai-gemini-plan',
    name: 'Gemini Planning',
    command: 'gemini plan --goal "<project goal>" --output plan.md',
    category: 'ai',
    description: 'Generate structured steps for a goal via the Gemini CLI and persist to markdown',
  },
  {
    id: 'ai-gemini-summary',
    name: 'Gemini Summary',
    command: 'gemini summarize --input "<diff-or-notes>" --length concise --format bullet',
    category: 'ai',
    description: 'Create a concise bullet summary for a diff or meeting notes',
  },
  {
    id: 'ai-codex-debug',
    name: 'Codex Debug Context',
    command: 'codex explain --path <file> --focus "<error-or-log>" --format steps',
    category: 'ai',
    description: 'Ask Codex to explain logs, failures, or error messages with actionable steps',
  },
];

/**
 * Resolve placeholders in a command
 * @param command - Command string with placeholders
 * @param packageManager - Package manager to use (npm, pnpm, yarn)
 * @returns Resolved command string
 */
export function resolveCommand(command: string, packageManager: string = 'npm'): string {
  return command.replace(/{pm}/g, packageManager);
}

/**
 * Group templates by category for display
 * @returns Array of grouped templates
 */
export function groupTemplatesByCategory(): GroupedTemplates[] {
  const categoryMap = new Map<TemplateCategory, StepTemplate[]>();

  // Initialize all categories
  for (const category of TEMPLATE_CATEGORIES) {
    categoryMap.set(category.id, []);
  }

  // Group templates
  for (const template of STEP_TEMPLATES) {
    const templates = categoryMap.get(template.category);
    if (templates) {
      templates.push(template);
    }
  }

  // Build result array in category order
  return TEMPLATE_CATEGORIES.map((category) => ({
    category,
    templates: categoryMap.get(category.id) || [],
  })).filter((group) => group.templates.length > 0);
}

/**
 * Filter templates by search query
 * @param query - Search query (case-insensitive)
 * @returns Filtered templates
 */
export function filterTemplates(query: string): StepTemplate[] {
  if (!query.trim()) {
    return STEP_TEMPLATES;
  }

  const lowerQuery = query.toLowerCase();
  return STEP_TEMPLATES.filter(
    (template) =>
      template.name.toLowerCase().includes(lowerQuery) ||
      template.command.toLowerCase().includes(lowerQuery) ||
      (template.description?.toLowerCase().includes(lowerQuery) ?? false)
  );
}

/**
 * Get category info by ID
 * @param categoryId - Category identifier
 * @returns Category info or undefined
 */
export function getCategoryInfo(categoryId: TemplateCategory): TemplateCategoryInfo | undefined {
  return TEMPLATE_CATEGORIES.find((c) => c.id === categoryId);
}

/**
 * Export templates to JSON format
 * @param templates - Templates to export
 * @returns Export data object
 */
export function exportTemplates(templates: StepTemplate[]): TemplateExportData {
  return {
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    templates,
  };
}

/**
 * Export templates to JSON string
 * @param templates - Templates to export
 * @returns JSON string
 */
export function exportTemplatesToJson(templates: StepTemplate[]): string {
  return JSON.stringify(exportTemplates(templates), null, 2);
}

/**
 * Parse and validate imported template data
 * @param jsonString - JSON string to parse
 * @returns Parsed templates or error
 */
export function parseImportedTemplates(jsonString: string): {
  success: boolean;
  templates?: StepTemplate[];
  error?: string;
} {
  try {
    const data = JSON.parse(jsonString);

    // Validate structure
    if (!data.templates || !Array.isArray(data.templates)) {
      return { success: false, error: 'Invalid format: missing templates array' };
    }

    // Validate each template
    const validCategories: TemplateCategory[] = [
      'package-manager',
      'git',
      'docker',
      'shell',
      'testing',
      'code-quality',
      'kubernetes',
      'database',
      'cloud',
      'ai',
      'security',
      'nodejs',
      'custom',
    ];

    const validatedTemplates: StepTemplate[] = [];

    for (const template of data.templates) {
      // Required fields
      if (!template.id || typeof template.id !== 'string') {
        return { success: false, error: 'Invalid template: missing or invalid id' };
      }
      if (!template.name || typeof template.name !== 'string') {
        return { success: false, error: `Invalid template "${template.id}": missing or invalid name` };
      }
      if (!template.command || typeof template.command !== 'string') {
        return { success: false, error: `Invalid template "${template.id}": missing or invalid command` };
      }
      if (!template.category || !validCategories.includes(template.category)) {
        return {
          success: false,
          error: `Invalid template "${template.id}": invalid category "${template.category}"`,
        };
      }

      validatedTemplates.push({
        id: template.id,
        name: template.name,
        command: template.command,
        category: template.category,
        description: template.description || undefined,
      });
    }

    return { success: true, templates: validatedTemplates };
  } catch {
    return { success: false, error: 'Invalid JSON format' };
  }
}

/**
 * Get all templates (built-in)
 * @returns All built-in templates
 */
export function getAllTemplates(): StepTemplate[] {
  return [...STEP_TEMPLATES];
}

// ============================================================================
// Custom Template Storage (uses Tauri Store)
// ============================================================================

/** Convert Tauri CustomStepTemplate to frontend CustomTemplate */
function toCustomTemplate(t: CustomStepTemplate): CustomTemplate {
  return {
    id: t.id,
    name: t.name,
    command: t.command,
    category: t.category,
    description: t.description,
    isCustom: true,
    createdAt: t.createdAt,
  };
}

/**
 * Load custom templates from Tauri store
 */
export async function loadCustomTemplates(): Promise<CustomTemplate[]> {
  try {
    const response = await stepTemplateAPI.loadCustomTemplates();
    if (response.success && response.templates) {
      return response.templates.map(toCustomTemplate);
    }
    return [];
  } catch (error) {
    console.error('Failed to load custom templates:', error);
    return [];
  }
}

/**
 * Save a workflow node as a custom template
 * @param node - The workflow node to save
 * @param templateName - Name for the template
 * @param category - Category for the template
 * @returns The created custom template or null if failed
 */
export async function saveNodeAsTemplate(
  node: WorkflowNode,
  templateName: string,
  category: TemplateCategory = 'shell'
): Promise<CustomTemplate | null> {
  try {
    // Only script nodes can be saved as templates
    if (!isScriptNodeConfig(node.config)) {
      console.error('Only script nodes can be saved as templates');
      return null;
    }

    const template: CustomStepTemplate = {
      id: `custom-${crypto.randomUUID()}`,
      name: templateName,
      command: node.config.command,
      category,
      description: `Custom template from "${node.name}"`,
      isCustom: true,
      createdAt: new Date().toISOString(),
    };

    const response = await stepTemplateAPI.saveCustomTemplate(template);
    if (response.success && response.template) {
      return toCustomTemplate(response.template);
    }
    return null;
  } catch (error) {
    console.error('Failed to save custom template:', error);
    return null;
  }
}

/**
 * Delete a custom template
 * @param templateId - ID of the template to delete
 * @returns Whether the deletion was successful
 */
export async function deleteCustomTemplate(templateId: string): Promise<boolean> {
  try {
    const response = await stepTemplateAPI.deleteCustomTemplate(templateId);
    return response.success;
  } catch (error) {
    console.error('Failed to delete custom template:', error);
    return false;
  }
}

/**
 * Import multiple templates as custom templates
 * @param templates - Templates to import
 * @returns Array of successfully imported templates
 */
export async function importTemplatesAsCustom(
  templates: StepTemplate[]
): Promise<CustomTemplate[]> {
  const imported: CustomTemplate[] = [];

  for (const template of templates) {
    try {
      const customTemplate: CustomStepTemplate = {
        id: `custom-${crypto.randomUUID()}`,
        name: template.name,
        command: template.command,
        category: 'custom',
        description: template.description || `Imported template`,
        isCustom: true,
        createdAt: new Date().toISOString(),
      };

      const response = await stepTemplateAPI.saveCustomTemplate(customTemplate);
      if (response.success && response.template) {
        imported.push(toCustomTemplate(response.template));
      }
    } catch (error) {
      console.error(`Failed to import template "${template.name}":`, error);
    }
  }

  return imported;
}

/**
 * Get all templates including custom ones (async)
 * @returns Combined array of built-in and custom templates
 */
export async function getAllTemplatesWithCustom(): Promise<(StepTemplate | CustomTemplate)[]> {
  const custom = await loadCustomTemplates();
  return [...custom, ...STEP_TEMPLATES];
}

/**
 * Group templates by category including custom templates (async)
 * @returns Array of grouped templates with custom templates first
 */
export async function groupTemplatesByCategoryWithCustom(): Promise<GroupedTemplates[]> {
  const customTemplates = await loadCustomTemplates();
  const groups = groupTemplatesByCategory();

  if (customTemplates.length > 0) {
    // Add custom templates category at the beginning
    const customCategory: TemplateCategoryInfo = {
      id: 'custom',
      name: 'My Templates',
      icon: 'Star',
    };

    // Create a special "My Templates" group at the top
    groups.unshift({
      category: customCategory,
      templates: customTemplates,
    });
  }

  return groups;
}

/**
 * Filter templates including custom ones (async)
 * @param query - Search query
 * @param customTemplates - Pre-loaded custom templates
 * @returns Filtered templates
 */
export function filterTemplatesWithCustom(
  query: string,
  customTemplates: CustomTemplate[]
): (StepTemplate | CustomTemplate)[] {
  const allTemplates = [...customTemplates, ...STEP_TEMPLATES];

  if (!query.trim()) {
    return allTemplates;
  }

  const lowerQuery = query.toLowerCase();
  return allTemplates.filter(
    (template) =>
      template.name.toLowerCase().includes(lowerQuery) ||
      template.command.toLowerCase().includes(lowerQuery) ||
      (template.description?.toLowerCase().includes(lowerQuery) ?? false)
  );
}
