const express = require('express');
const router = express.Router();
const { requireCronSecret } = require('../auth/authMiddleware');
const pipelineRunner = require('../services/scheduler/pipelineRunner');
const logger = require('../utils/logger');

const handleCronRun = async (req, res) => {
  logger.info('Received authenticated cron trigger request from Cron-job.org / external scheduler');
  try {
    const force = req.query.force === 'true' || req.body?.force === true;
    const result = await pipelineRunner.runPipeline({ force });
    return res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      result
    });
  } catch (err) {
    logger.error(`Cron execution encountered an error: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: err.message,
      timestamp: new Date().toISOString()
    });
  }
};

router.post('/run', requireCronSecret, handleCronRun);
router.post('/generate', requireCronSecret, handleCronRun);
router.get('/run', requireCronSecret, handleCronRun); // Support GET for monitoring tools if needed

module.exports = router;
