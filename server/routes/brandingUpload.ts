/**
 * Branding Upload Route
 * Handles logo and favicon file uploads for white-label agencies.
 * Files are stored in the uploads directory and served statically.
 */

import type { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { whitelabelService } from '../services/WhitelabelService';

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads', 'branding');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuid()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/x-icon'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PNG, JPEG, SVG, and ICO are allowed.'));
    }
  },
});

export function registerBrandingUploadRoutes(app: Express.Application) {
  app.post(
    '/api/branding/upload',
    upload.single('file'),
    async (req: Request, res: Response) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'No file uploaded' });
        }

        const { organizationId, type } = req.body;
        if (!organizationId) {
          return res.status(400).json({ error: 'organizationId is required' });
        }

        const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
        const fileUrl = `${baseUrl}/uploads/branding/${req.file.filename}`;

        // Update branding in database
        if (type === 'logo') {
          await whitelabelService.updateLogo(organizationId, fileUrl);
        } else if (type === 'favicon') {
          await whitelabelService.updateFavicon(organizationId, fileUrl);
        }

        res.json({ url: fileUrl, filename: req.file.filename });
      } catch (error) {
        console.error('Branding upload error:', error);
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Upload failed',
        });
      }
    }
  );
}
