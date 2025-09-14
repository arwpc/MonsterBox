#!/usr/bin/env node

/**
 * MonsterBox GitHub Log Collector
 * 
 * Collects logs from GitHub API including:
 * - Repository events
 * - Workflow runs
 * - Issues and PRs
 * - Commits
 * - Actions logs
 */

const axios = require('axios');
const logger = require('./logger');
const fs = require('fs').promises;
const path = require('path');

class GitHubLogCollector {
    constructor(options = {}) {
        this.options = {
            owner: 'arwpc',
            repo: 'MonsterBox',
            token: process.env.GITHUB_TOKEN,
            logDir: path.join(process.cwd(), 'log'),
            ...options
        };
        
        this.baseURL = 'https://api.github.com';
        this.headers = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'MonsterBox-Log-Collector'
        };
        
        if (this.options.token) {
            this.headers['Authorization'] = `token ${this.options.token}`;
        }
    }

    async collectAllLogs() {
        logger.info('Starting GitHub log collection', { 
            repo: `${this.options.owner}/${this.options.repo}` 
        });

        const logs = {
            timestamp: new Date().toISOString(),
            repository: `${this.options.owner}/${this.options.repo}`,
            events: [],
            workflows: [],
            issues: [],
            commits: [],
            actions: []
        };

        try {
            // Collect different types of logs
            logs.events = await this.collectRepositoryEvents();
            logs.workflows = await this.collectWorkflowRuns();
            logs.issues = await this.collectIssuesAndPRs();
            logs.commits = await this.collectRecentCommits();
            logs.actions = await this.collectActionsLogs();

            // Store logs
            await this.storeLogs(logs);
            
            logger.info('GitHub log collection completed', {
                events: logs.events.length,
                workflows: logs.workflows.length,
                issues: logs.issues.length,
                commits: logs.commits.length
            });

            return logs;

        } catch (error) {
            logger.error('GitHub log collection failed', { error: error.message });
            throw error;
        }
    }

    async collectRepositoryEvents() {
        try {
            const response = await axios.get(
                `${this.baseURL}/repos/${this.options.owner}/${this.options.repo}/events`,
                { 
                    headers: this.headers,
                    params: { per_page: 100 }
                }
            );

            return response.data.map(event => ({
                id: event.id,
                type: event.type,
                actor: event.actor.login,
                created_at: event.created_at,
                payload: event.payload
            }));

        } catch (error) {
            logger.error('Failed to collect repository events', { error: error.message });
            return [];
        }
    }

    async collectWorkflowRuns() {
        try {
            const response = await axios.get(
                `${this.baseURL}/repos/${this.options.owner}/${this.options.repo}/actions/runs`,
                { 
                    headers: this.headers,
                    params: { per_page: 50 }
                }
            );

            return response.data.workflow_runs.map(run => ({
                id: run.id,
                name: run.name,
                status: run.status,
                conclusion: run.conclusion,
                created_at: run.created_at,
                updated_at: run.updated_at,
                head_branch: run.head_branch,
                head_sha: run.head_sha,
                event: run.event,
                actor: run.actor.login
            }));

        } catch (error) {
            logger.error('Failed to collect workflow runs', { error: error.message });
            return [];
        }
    }

    async collectIssuesAndPRs() {
        try {
            const [issuesResponse, prsResponse] = await Promise.all([
                axios.get(
                    `${this.baseURL}/repos/${this.options.owner}/${this.options.repo}/issues`,
                    { 
                        headers: this.headers,
                        params: { state: 'all', per_page: 50 }
                    }
                ),
                axios.get(
                    `${this.baseURL}/repos/${this.options.owner}/${this.options.repo}/pulls`,
                    { 
                        headers: this.headers,
                        params: { state: 'all', per_page: 50 }
                    }
                )
            ]);

            const issues = issuesResponse.data.map(issue => ({
                number: issue.number,
                title: issue.title,
                state: issue.state,
                created_at: issue.created_at,
                updated_at: issue.updated_at,
                user: issue.user.login,
                labels: issue.labels.map(label => label.name),
                type: 'issue'
            }));

            const prs = prsResponse.data.map(pr => ({
                number: pr.number,
                title: pr.title,
                state: pr.state,
                created_at: pr.created_at,
                updated_at: pr.updated_at,
                user: pr.user.login,
                head: pr.head.ref,
                base: pr.base.ref,
                merged: pr.merged,
                type: 'pull_request'
            }));

            return [...issues, ...prs];

        } catch (error) {
            logger.error('Failed to collect issues and PRs', { error: error.message });
            return [];
        }
    }

    async collectRecentCommits() {
        try {
            const response = await axios.get(
                `${this.baseURL}/repos/${this.options.owner}/${this.options.repo}/commits`,
                { 
                    headers: this.headers,
                    params: { per_page: 50 }
                }
            );

            return response.data.map(commit => ({
                sha: commit.sha,
                message: commit.commit.message,
                author: commit.commit.author.name,
                date: commit.commit.author.date,
                committer: commit.commit.committer.name,
                url: commit.html_url,
                stats: commit.stats
            }));

        } catch (error) {
            logger.error('Failed to collect recent commits', { error: error.message });
            return [];
        }
    }

    async collectActionsLogs() {
        try {
            // Get recent workflow runs
            const runsResponse = await axios.get(
                `${this.baseURL}/repos/${this.options.owner}/${this.options.repo}/actions/runs`,
                { 
                    headers: this.headers,
                    params: { per_page: 10 }
                }
            );

            const actionLogs = [];

            // Get logs for each recent run
            for (const run of runsResponse.data.workflow_runs.slice(0, 5)) {
                try {
                    const jobsResponse = await axios.get(
                        `${this.baseURL}/repos/${this.options.owner}/${this.options.repo}/actions/runs/${run.id}/jobs`,
                        { headers: this.headers }
                    );

                    actionLogs.push({
                        run_id: run.id,
                        run_name: run.name,
                        status: run.status,
                        conclusion: run.conclusion,
                        jobs: jobsResponse.data.jobs.map(job => ({
                            id: job.id,
                            name: job.name,
                            status: job.status,
                            conclusion: job.conclusion,
                            started_at: job.started_at,
                            completed_at: job.completed_at,
                            steps: job.steps.map(step => ({
                                name: step.name,
                                status: step.status,
                                conclusion: step.conclusion,
                                number: step.number
                            }))
                        }))
                    });

                } catch (error) {
                    logger.warn('Failed to collect logs for run', { 
                        runId: run.id, 
                        error: error.message 
                    });
                }
            }

            return actionLogs;

        } catch (error) {
            logger.error('Failed to collect actions logs', { error: error.message });
            return [];
        }
    }

    async storeLogs(logs) {
        try {
            await fs.mkdir(this.options.logDir, { recursive: true });
            
            const filename = `github-${new Date().toISOString().split('T')[0]}.log`;
            const filepath = path.join(this.options.logDir, filename);
            
            const logEntry = {
                timestamp: new Date().toISOString(),
                source: 'github',
                data: logs
            };

            await fs.appendFile(filepath, JSON.stringify(logEntry) + '\n');
            
            logger.info('GitHub logs stored', { filepath, filename });

        } catch (error) {
            logger.error('Failed to store GitHub logs', { error: error.message });
        }
    }

    async getRepositoryInfo() {
        try {
            const response = await axios.get(
                `${this.baseURL}/repos/${this.options.owner}/${this.options.repo}`,
                { headers: this.headers }
            );

            return {
                name: response.data.name,
                full_name: response.data.full_name,
                description: response.data.description,
                private: response.data.private,
                created_at: response.data.created_at,
                updated_at: response.data.updated_at,
                size: response.data.size,
                language: response.data.language,
                open_issues: response.data.open_issues_count,
                watchers: response.data.watchers_count,
                forks: response.data.forks_count
            };

        } catch (error) {
            logger.error('Failed to get repository info', { error: error.message });
            return null;
        }
    }

    async checkRateLimit() {
        try {
            const response = await axios.get(
                `${this.baseURL}/rate_limit`,
                { headers: this.headers }
            );

            return response.data.rate;

        } catch (error) {
            logger.error('Failed to check rate limit', { error: error.message });
            return null;
        }
    }
}

// CLI usage
if (require.main === module) {
    const collector = new GitHubLogCollector();
    
    collector.collectAllLogs()
        .then(logs => {
            console.log('✅ GitHub logs collected successfully');
            console.log(`📊 Summary: ${logs.events.length} events, ${logs.workflows.length} workflows, ${logs.issues.length} issues/PRs, ${logs.commits.length} commits`);
        })
        .catch(error => {
            console.error('❌ GitHub log collection failed:', error.message);
            process.exit(1);
        });
}

module.exports = GitHubLogCollector;
