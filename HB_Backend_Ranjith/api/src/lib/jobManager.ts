/**
 * Simple in-memory job manager for background imports
 * No external dependencies (Redis, etc.)
 */

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface Job {
  id: number;
  status: JobStatus;
  progress: {
    current: number;
    total: number;
    percentage: number;
  };
  startedAt: Date;
  completedAt?: Date;
  error?: string;
}

class JobManager {
  private jobs: Map<number, Job> = new Map();

  createJob(id: number, total: number): Job {
    const job: Job = {
      id,
      status: JobStatus.PENDING,
      progress: {
        current: 0,
        total,
        percentage: 0,
      },
      startedAt: new Date(),
    };

    this.jobs.set(id, job);
    return job;
  }

  updateProgress(id: number, current: number): void {
    const job = this.jobs.get(id);
    if (!job) return;

    job.status = JobStatus.PROCESSING;
    job.progress.current = current;
    job.progress.percentage = Math.round((current / job.progress.total) * 100);
  }

  completeJob(id: number): void {
    const job = this.jobs.get(id);
    if (!job) return;

    job.status = JobStatus.COMPLETED;
    job.completedAt = new Date();
    job.progress.current = job.progress.total;
    job.progress.percentage = 100;

    // Clean up after 1 hour
    setTimeout(() => {
      this.jobs.delete(id);
    }, 60 * 60 * 1000);
  }

  failJob(id: number, error: string): void {
    const job = this.jobs.get(id);
    if (!job) return;

    job.status = JobStatus.FAILED;
    job.completedAt = new Date();
    job.error = error;

    // Clean up after 1 hour
    setTimeout(() => {
      this.jobs.delete(id);
    }, 60 * 60 * 1000);
  }

  getJob(id: number): Job | undefined {
    return this.jobs.get(id);
  }

  getAllJobs(): Job[] {
    return Array.from(this.jobs.values());
  }
}

export const jobManager = new JobManager();
