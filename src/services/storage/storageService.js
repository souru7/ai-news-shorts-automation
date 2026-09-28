const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const env = require('../../config/env');
const logger = require('../../utils/logger');

class StorageService {
  constructor() {
    this.provider = env.STORAGE_PROVIDER.toLowerCase();
    this.localDir = path.join(__dirname, '../../../storage');

    if (this.provider === 's3' && env.STORAGE_BUCKET && env.STORAGE_ACCESS_KEY && env.STORAGE_SECRET_KEY) {
      const s3Config = {
        region: env.STORAGE_REGION || 'auto',
        credentials: {
          accessKeyId: env.STORAGE_ACCESS_KEY,
          secretAccessKey: env.STORAGE_SECRET_KEY
        }
      };

      if (env.STORAGE_ENDPOINT) {
        s3Config.endpoint = env.STORAGE_ENDPOINT;
        s3Config.forcePathStyle = true;
      }

      this.s3Client = new S3Client(s3Config);
      logger.info(`S3 storage client initialized (Bucket: ${env.STORAGE_BUCKET})`);
    } else {
      this.provider = 'local';
      logger.info('Using local disk storage service (storage/ directory)');
    }
  }

  /**
   * Save a local file to storage (S3/R2 or local persistent folder)
   * @param {string} localFilePath - Path to source file
   * @param {string} destinationKey - Relative key/filename, e.g. 'videos/vid_123.mp4'
   * @param {string} contentType - MIME type
   * @returns {Promise<{url: string, key: string, localPath: string}>}
   */
  async saveFile(localFilePath, destinationKey, contentType = 'application/octet-stream') {
    if (!fs.existsSync(localFilePath)) {
      throw new Error(`Source file does not exist: ${localFilePath}`);
    }

    if (this.provider === 's3' && this.s3Client) {
      try {
        const fileContent = fs.readFileSync(localFilePath);
        const command = new PutObjectCommand({
          Bucket: env.STORAGE_BUCKET,
          Key: destinationKey,
          Body: fileContent,
          ContentType: contentType
        });
        await this.s3Client.send(command);

        let publicUrl;
        if (env.STORAGE_ENDPOINT && env.STORAGE_ENDPOINT.includes('r2.cloudflarestorage.com')) {
          publicUrl = `${env.APP_URL}/media/${destinationKey}`;
        } else if (env.STORAGE_ENDPOINT) {
          publicUrl = `${env.STORAGE_ENDPOINT}/${env.STORAGE_BUCKET}/${destinationKey}`;
        } else {
          publicUrl = `https://${env.STORAGE_BUCKET}.s3.${env.STORAGE_REGION}.amazonaws.com/${destinationKey}`;
        }

        logger.info(`Uploaded file to S3: ${destinationKey}`);
        return { url: publicUrl, key: destinationKey, localPath: localFilePath };
      } catch (err) {
        logger.error(`S3 upload error for ${destinationKey}, falling back to local storage: ${err.message}`);
      }
    }

    // Local storage fallback
    const targetPath = path.join(this.localDir, destinationKey);
    const targetFolder = path.dirname(targetPath);
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    if (localFilePath !== targetPath) {
      fs.copyFileSync(localFilePath, targetPath);
    }

    const publicUrl = `${env.APP_URL}/media/${destinationKey.replace(/\\/g, '/')}`;
    return {
      url: publicUrl,
      key: destinationKey,
      localPath: targetPath
    };
  }

  /**
   * Delete a file from storage
   */
  async deleteFile(destinationKey) {
    if (this.provider === 's3' && this.s3Client) {
      try {
        const command = new DeleteObjectCommand({
          Bucket: env.STORAGE_BUCKET,
          Key: destinationKey
        });
        await this.s3Client.send(command);
      } catch (err) {
        logger.error(`Failed to delete S3 file ${destinationKey}: ${err.message}`);
      }
    }

    const localPath = path.join(this.localDir, destinationKey);
    if (fs.existsSync(localPath)) {
      try {
        fs.unlinkSync(localPath);
      } catch (e) {}
    }
  }

  getLocalFilePath(destinationKey) {
    return path.join(this.localDir, destinationKey);
  }
}

module.exports = new StorageService();
