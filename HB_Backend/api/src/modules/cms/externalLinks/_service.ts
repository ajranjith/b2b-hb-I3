import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/utils/errors';
import type { CreateExternalLinkInput, UpdateExternalLinkInput } from './_dto';

// Create external link
export async function createExternalLink(input: CreateExternalLinkInput) {
  // Get totalCount
  const totalCount = await prisma.externalLinks.count({
    where: {
      status: true,
    },
  });

  // Auto-increment orderNo
  const orderNo = totalCount ? totalCount + 1 : 1;

  const externalLink = await prisma.externalLinks.create({
    data: {
      image: input.image,
      title: input.title,
      link: input.link,
      orderNo: orderNo,
    },
  });

  return externalLink;
}

// Get all external links with pagination
export async function getAllExternalLinks(page: number = 1, limit: number = 20) {
  const skip = (page - 1) * limit;

  const [externalLinks, total] = await Promise.all([
    prisma.externalLinks.findMany({
      where: {
        status: true, // Only active items
      },
      orderBy: [
        { orderNo: 'asc' },
        { createdAt: 'desc' },
      ],
      skip,
      take: limit,
    }),
    prisma.externalLinks.count({
      where: {
        status: true,
      },
    }),
  ]);

  return { externalLinks, total };
}

// Get external link by ID
export async function getExternalLinkById(id: number) {
  const externalLink = await prisma.externalLinks.findUnique({
    where: { id },
  });

  if (!externalLink) {
    throw new NotFoundError('External link not found');
  }

  return externalLink;
}

// Update external link
export async function updateExternalLink(id: number, input: UpdateExternalLinkInput) {
  // Check if external link exists
  const existingExternalLink = await prisma.externalLinks.findUnique({
    where: { id },
  });

  if (!existingExternalLink) {
    throw new NotFoundError('External link not found');
  }

  const externalLink = await prisma.externalLinks.update({
    where: { id },
    data: {
      ...(input.image !== undefined && { image: input.image }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.link !== undefined && { link: input.link }),
      ...(input.orderNo !== undefined && { orderNo: input.orderNo }),
      ...(input.status !== undefined && { status: input.status }),
    },
  });

  return externalLink;
}

// Delete external link (soft delete by setting status to false)
export async function deleteExternalLink(id: number) {
  // Check if external link exists
  const existingExternalLink = await prisma.externalLinks.findUnique({
    where: { id },
  });

  if (!existingExternalLink) {
    throw new NotFoundError('External link not found');
  }

  // Soft delete by setting status to false
  const externalLink = await prisma.externalLinks.update({
    where: { id },
    data: {
      status: false,
    },
  });

  return externalLink;
}
