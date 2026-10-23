import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';
import { authenticate } from './middleware/authenticate.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { academicsRouter } from './modules/academics/academics.routes.js';
import { financeRouter } from './modules/finance/finance.routes.js';
import { hrRouter } from './modules/hr/hr.routes.js';
import { communicationRouter } from './modules/communication/communication.routes.js';
import { publicRouter } from './modules/public/public.routes.js';
import { frontOfficeRouter } from './modules/frontoffice/frontoffice.routes.js';
import { websiteRouter } from './modules/website/website.routes.js';
import { facilitiesRouter } from './modules/facilities/facilities.routes.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { classesRouter } from './modules/classes/classes.routes.js';
import { orgRouter } from './modules/org/org.routes.js';
import { procurementRouter } from './modules/procurement/procurement.routes.js';
import { staffRouter } from './modules/staff/staff.routes.js';
import { studentsRouter } from './modules/students/students.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.TRUST_PROXY);

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  const api = Router();

  // Public
  api.get('/health', async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'ok', time: new Date().toISOString() });
  });
  api.use('/auth', authRouter);
  api.use(publicRouter);

  // Everything below needs a signed-in user
  api.use(authenticate);
  api.use(orgRouter);
  api.use(classesRouter);
  api.use(studentsRouter);
  api.use(usersRouter);
  api.use(procurementRouter);
  api.use(staffRouter);
  api.use(academicsRouter);
  api.use(financeRouter);
  api.use(hrRouter);
  api.use(communicationRouter);
  api.use(websiteRouter);
  api.use(frontOfficeRouter);
  api.use(facilitiesRouter);

  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
