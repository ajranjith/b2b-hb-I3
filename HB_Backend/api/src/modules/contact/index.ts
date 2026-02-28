import { Hono } from 'hono';
import { describeRoute } from 'hono-openapi';
import { resolver } from 'hono-openapi/zod';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { validationHook } from '@/middleware/validationHook';
import { createContactInquirySchema } from './_dto';
import { prisma } from '@/lib/prisma';
import { successResponse } from '@/utils/response';
import { sendContactInquiryAdminEmail } from '@/utils/emailFacade';

const contactRoutes = new Hono();

// Create Contact Inquiry
contactRoutes.post(
  '/inquiry',
  describeRoute({
    tags: ['Contact'],
    summary: 'Submit contact inquiry',
    description: 'Submit a contact inquiry or feedback form',
    responses: {
      201: {
        description: 'Inquiry submitted successfully',
        content: {
          'application/json': {
            schema: resolver(
              z.object({
                success: z.literal(true),
                data: z.object({
                  id: z.number(),
                  name: z.string(),
                  email: z.string(),
                  message: z.string(),
                  createdAt: z.string(),
                }),
                message: z.string(),
              })
            ),
          },
        },
      },
      400: {
        description: 'Validation error',
      },
    },
  }),
  zValidator('json', createContactInquirySchema, validationHook),
  async (c) => {
    const input = c.req.valid('json');
    const { name, email, phone, message } = input;

    // Create contact inquiry
    const inquiry = await prisma.contactInquiry.create({
      data: {
        name,
        email,
        phone,
        message,
      },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        message: true,
        createdAt: true,
      },
    });

    // Send notification email to admin
    const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
    if (adminEmail) {
      try {
        await sendContactInquiryAdminEmail({
          name: inquiry.name,
          email: inquiry.email,
          phone: inquiry.phone,
          message: inquiry.message,
          submittedAt: inquiry.createdAt,
          adminEmail,
        });
      } catch (error) {
        // Log error but don't fail the request if email fails
        console.error('Failed to send contact inquiry notification email to admin:', error);
      }
    } else {
      console.warn('ADMIN_NOTIFICATION_EMAIL not configured in environment variables');
    }

    return c.json(
      {
        ...successResponse(inquiry),
        message: 'Thank you for contacting us! We will get back to you soon.',
      },
      201
    );
  }
);

export default contactRoutes;
