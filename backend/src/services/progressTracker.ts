import { EventEmitter } from 'events';

interface FailedItem {
  id?: number;
  title?: string;
  error?: string;
}

interface Job {
  id: string;
  type: string;
  total: number;
  processed: number;
  updated: number;
  failed: number;
  failedItems: FailedItem[];
  status: 'running' | 'completed' | 'failed';
  startTime: Date;
  lastUpdate: Date;
  endTime?: Date;
  duration?: number;
  error?: string;
}

class ProgressTracker extends EventEmitter {
  private activeJobs: Map<string, Job>;

  constructor() {
    super();
    this.activeJobs = new Map();
  }

  // Start tracking a job
  startJob(jobId: string, totalItems: number, jobType: string = 'backfill'): Job {
    const job: Job = {
      id: jobId,
      type: jobType,
      total: totalItems,
      processed: 0,
      updated: 0,
      failed: 0,
      failedItems: [],
      status: 'running',
      startTime: new Date(),
      lastUpdate: new Date()
    };

    this.activeJobs.set(jobId, job);
    this.emit('jobStarted', job);
    return job;
  }

  // Update job progress
  updateProgress(jobId: string, processed: number, updated: number = 0, failed: number = 0, failedItem: FailedItem | null = null): void {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    job.processed = processed;
    job.updated += updated;
    job.failed += failed;
    job.lastUpdate = new Date();

    if (failedItem) {
      job.failedItems.push(failedItem);
    }

    this.emit('progress', job);
  }

  // Complete a job
  completeJob(jobId: string): void {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    job.status = 'completed';
    job.endTime = new Date();
    job.duration = job.endTime.getTime() - job.startTime.getTime();

    this.emit('jobCompleted', job);

    // Keep job data for a while before cleanup
    setTimeout(() => {
      this.activeJobs.delete(jobId);
    }, 300000); // 5 minutes
  }

  // Fail a job
  failJob(jobId: string, error: string): void {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    job.status = 'failed';
    job.error = error;
    job.endTime = new Date();
    job.duration = job.endTime.getTime() - job.startTime.getTime();

    this.emit('jobFailed', job);

    setTimeout(() => {
      this.activeJobs.delete(jobId);
    }, 300000); // 5 minutes
  }

  // Get job status
  getJobStatus(jobId: string): Job | undefined {
    return this.activeJobs.get(jobId);
  }

  // Get all active jobs
  getAllJobs(): Job[] {
    return Array.from(this.activeJobs.values());
  }

  // Get jobs by type
  getJobsByType(type: string): Job[] {
    return Array.from(this.activeJobs.values()).filter(job => job.type === type);
  }
}

// Create singleton instance
const progressTracker = new ProgressTracker();

export default progressTracker;
