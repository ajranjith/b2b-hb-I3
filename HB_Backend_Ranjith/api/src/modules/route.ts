import { Hono } from 'hono';
import healthRoutes from './health';
import userRoutes from './user';
import authRoutes from './auth';
import masterRoutes from './master';
import importRoutes from './import';
import syncRoutes from './sync';
import productsRoutes from './products';
import cartRoutes from './cart';
import orderRoutes from './order';
import contactRoutes from './contact';
import bannerRoutes from './cms/banner';
import newsOfferRoutes from './cms/newsOffer';
import externalLinkRoutes from './cms/externalLinks';
import exclusivePartsRoutes from './cms/exclusiveParts';
import marqueeRoutes from './cms/marquee';
import azureRoutes from './azure';
import { authenticate } from '@/middleware/authenticate';
import { authorize } from '@/middleware/authorize';
import { Role } from 'generated/prisma';

const routes = new Hono();

// Mount module routes
routes.route('/health', healthRoutes);
routes.route('/user', userRoutes);
routes.route('/auth', authRoutes);
routes.route('/master', masterRoutes);
routes.route('/products', productsRoutes);
routes.route('/cart', cartRoutes);
routes.route('/orders', orderRoutes);
routes.route('/contact', contactRoutes);
routes.use(authenticate).route('/cms/banner', bannerRoutes);
routes.use(authenticate).route('/cms/news-offers', newsOfferRoutes);
routes.use(authenticate).route('/cms/external-links', externalLinkRoutes);
routes.use(authenticate).route('/cms/exclusive-parts', exclusivePartsRoutes);
routes.use(authenticate).route('/cms/marquee', marqueeRoutes);
routes.use(authenticate).route('/azure', azureRoutes);
routes.use(authenticate).route('/azure', azureRoutes);
routes
.use(authenticate)
// .use(authorize.allow(Role.Admin))
.route('/import', importRoutes);
routes.use(authenticate).use(authorize.allow(Role.Admin)).route('/sync', syncRoutes);

export default routes;
