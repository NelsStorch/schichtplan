import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { canUploadImages } from '../services/departmentVisibility.js';
import { detectImageType, unsafeSvgReason } from '../services/imageUpload.js';
import { createRateLimiter } from '../services/rateLimit.js';
import { formatSwissNumber } from '@schichtplan/shared';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
]);

const MAX_FILE_SIZE = 6 * 1024 * 1024; // 6 MB
// Base64 braucht 4/3 der Grösse, dazu etwas JSON drumherum. Nur diese Route darf so grosse Bodies annehmen.
const UPLOAD_BODY_LIMIT = Math.ceil((MAX_FILE_SIZE * 4) / 3) + 64 * 1024;
// Pro Person höchstens 30 Uploads pro Stunde (Logos und Banner ändern sich selten)
const uploadLimiter = createRateLimiter(60 * 60 * 1000, 30);

const UploadRequestBodySchema = z.object({
  filename: z.string().optional().describe('Dateiname des Bildes (z. B. logo.png)'),
  mimeType: z.string().optional().describe('MIME-Type (z. B. image/png, image/webp)'),
  base64: z.string().optional().describe('Reine Base64-kodierte Bilddaten'),
  dataUrl: z.string().optional().describe('Data-URL inklusive Präfix (data:image/png;base64,...)'),
});

const UploadResponseSchema = z.object({
  id: z.string().uuid().describe('Eindeutige ID des Uploads'),
  url: z.string().describe('Permanente URL des Bildes (/api/uploads/{id})'),
  filename: z.string().describe('Gespeicherter Dateiname'),
  size: z.number().int().describe('Dateigrösse in Bytes'),
  mimeType: z.string().describe('MIME-Type der Bilddatei'),
});

interface UploadBody {
  filename?: string;
  mimeType?: string;
  base64?: string;
  dataUrl?: string;
}

const uploadRoutes: FastifyPluginAsync = async (fastify) => {
  // Bild abrufen (öffentlich, mit aggressivem Caching)
  fastify.get<{ Params: { id: string } }>(
    '/api/uploads/:id',
    {
      schema: {
        tags: ['Uploads'],
        summary: 'Bild oder Logo abrufen',
        description: 'Öffentlicher Endpunkt zum Abrufen eines hochgeladenen Bildes (PNG, JPEG, WebP, SVG, GIF) mit Browser-Caching.',
        params: z.object({ id: z.string().describe('Eindeutige ID des Uploads') }),
      },
    },
    async (request, reply) => {
    const { id } = request.params;

    const upload = await fastify.prisma.upload.findUnique({
      where: { id },
    });

    if (!upload) {
      return reply
        .header('Cache-Control', 'public, max-age=60')
        .status(404)
        .send({ error: request.t('upload.notFound') });
    }

    // Bilder liegen auf der eigenen Domain: Ein SVG darf beim direkten Öffnen kein Skript ausführen
    // (sonst liefe es mit den Rechten der angemeldeten Person). Als <img> eingebunden wirkt das nicht.
    reply
      .header('Content-Type', upload.mimeType)
      .header('Cache-Control', 'public, max-age=31536000, immutable')
      .header('Content-Disposition', `inline; filename="${encodeURIComponent(upload.filename)}"`)
      .header('Content-Security-Policy', "default-src 'none'; img-src data:; style-src 'unsafe-inline'; sandbox")
      .header('X-Content-Type-Options', 'nosniff');

    return reply.send(Buffer.from(upload.data));
  });

  // Bild hochladen (nur authentifizierte Benutzer)
  fastify.post<{ Body: UploadBody }>(
    '/api/uploads',
    {
      schema: {
        tags: ['Uploads'],
        summary: 'Bild oder Logo hochladen',
        description: 'Lädt ein Bild als Base64 oder Data-URL hoch (max. 6 MB). Berechtigt sind Abteilungsleitende und Event-OK.',
        security: [{ bearerAuth: [] }],
        body: UploadRequestBodySchema,
        response: {
          200: UploadResponseSchema,
        },
      },
      bodyLimit: UPLOAD_BODY_LIMIT,
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      // Hochladen nur für wer Logos und Banner setzen kann (sonst füllt jedes Gratis-Profil die DB)
      if (!(await canUploadImages(fastify.prisma, request.user.id))) {
        return reply.fail(403, 'upload.forbidden');
      }

      if (uploadLimiter.hit(request.user.id)) {
        return reply.fail(429, 'upload.tooMany');
      }

      const body = request.body || {};
      let rawBase64 = body.base64 || body.dataUrl || '';
      let mimeType = (body.mimeType || '').toLowerCase().trim();
      const filename = (body.filename || 'upload.png').trim();

      // Data-URL Präfix parsen (z.B. "data:image/png;base64,iVBOR...")
      if (rawBase64.startsWith('data:')) {
        const matches = rawBase64.match(/^data:([^;]+);base64,(.+)$/s);
        if (matches) {
          if (!mimeType) {
            mimeType = matches[1].toLowerCase().trim();
          }
          rawBase64 = matches[2];
        } else {
          return reply.fail(400, 'upload.invalidDataUrl');
        }
      }

      if (!rawBase64) {
        return reply.fail(400, 'upload.noData');
      }

      // Dateiendung zu MimeType mappen falls nötig
      if (!mimeType || mimeType === 'application/octet-stream') {
        const lowerName = filename.toLowerCase();
        if (lowerName.endsWith('.png')) mimeType = 'image/png';
        else if (lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')) mimeType = 'image/jpeg';
        else if (lowerName.endsWith('.webp')) mimeType = 'image/webp';
        else if (lowerName.endsWith('.svg')) mimeType = 'image/svg+xml';
        else if (lowerName.endsWith('.gif')) mimeType = 'image/gif';
      }

      if (mimeType === 'image/jpg') {
        mimeType = 'image/jpeg';
      }

      if (!ALLOWED_MIME_TYPES.has(mimeType)) {
        return reply.status(400).send({
          error: request.t('upload.unsupportedFormat', { format: mimeType || request.t('upload.unknownFormat') }),
        });
      }

      // Vor dem Dekodieren prüfen, damit keine riesigen Puffer entstehen
      if (rawBase64.length > Math.ceil((MAX_FILE_SIZE * 4) / 3) + 4) {
        return reply.fail(400, 'upload.tooLarge');
      }

      const buffer = Buffer.from(rawBase64, 'base64');

      if (buffer.length === 0) {
        return reply.fail(400, 'upload.empty');
      }

      if (buffer.length > MAX_FILE_SIZE) {
        return reply.status(400).send({
          error: request.t('upload.tooLargeSize', {
            size: formatSwissNumber(buffer.length / 1024 / 1024, { minimumFractionDigits: 1, maximumFractionDigits: 1 }, request.intlLocale),
          }),
        });
      }

      // Der Inhalt muss zum angegebenen Format passen (sonst z. B. HTML als «image/png»)
      const detected = detectImageType(buffer);
      if (!detected || detected !== mimeType) {
        return reply.fail(400, 'upload.contentMismatch');
      }
      if (detected === 'image/svg+xml') {
        const reason = unsafeSvgReason(buffer.toString('utf8'));
        if (reason) {
          return reply.status(400).send({ error: request.t('upload.svgNotAllowed', { reason }) });
        }
      }

      const upload = await fastify.prisma.upload.create({
        data: {
          filename: filename.slice(0, 200),
          mimeType,
          size: buffer.length,
          data: new Uint8Array(buffer),
        },
      });

      return {
        id: upload.id,
        url: `/api/uploads/${upload.id}`,
        filename: upload.filename,
        size: upload.size,
        mimeType: upload.mimeType,
      };
    }
  );
};

export default uploadRoutes;
