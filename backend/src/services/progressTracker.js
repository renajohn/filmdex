const EventEmitter = require('events');

class ProgressTracker extends EventEmitter {
  constructor() {
    super();
    this.activeJobs = new Map();
  }

  // Start tracking a job
  startJob(jobId, totalItems, jobType = 'backfill') {
    const job = {
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
  updateProgress(jobId, processed, updated = 0, failed = 0, failedItem = null) {
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
  completeJob(jobId) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    job.status = 'completed';
    job.endTime = new Date();
    job.duration = job.endTime - job.startTime;

    this.emit('jobCompleted', job);
    
    // Keep job data for a while before cleanup
    setTimeout(() => {
      this.activeJobs.delete(jobId);
    }, 300000); // 5 minutes
  }

  // Fail a job
  failJob(jobId, error) {
    const job = this.activeJobs.get(jobId);
    if (!job) return;

    job.status = 'failed';
    job.error = error;
    job.endTime = new Date();
    job.duration = job.endTime - job.startTime;

    this.emit('jobFailed', job);
    
    setTimeout(() => {
      this.activeJobs.delete(jobId);
    }, 300000); // 5 minutes
  }

  // Get job status
  getJobStatus(jobId) {
    return this.activeJobs.get(jobId);
  }

  // Get all active jobs
  getAllJobs() {
    return Array.from(this.activeJobs.values());
  }

  // Get jobs by type
  getJobsByType(type) {
    return Array.from(this.activeJobs.values()).filter(job => job.type === type);
  }
}

// Create singleton instance
const progressTracker = new ProgressTracker();

module.exports = progressTracker;
