'use strict';
const { Queue } = require('bullmq');
const Redis = require('ioredis');

const connection = new Redis({
  host: process.env.REDIS_HOST || 'mps-redis',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null
});

const causalityQueue = new Queue('causality', { connection });

module.exports = { connection, causalityQueue };
