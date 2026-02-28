import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/utils/errors';
import { NewsOffersType } from 'generated/prisma';
import type { CreateNewsOfferInput, UpdateNewsOfferInput } from './_dto';

// Create news/offer
export async function createNewsOffer(input: CreateNewsOfferInput) {
  // Get totalCount
  const totalCount = await prisma.newsOffers.count({
    where: {
      status: true,
    },
  });

  // Auto-increment orderNo
  const orderNo = totalCount ? totalCount + 1 : 1;

  const newsOffer = await prisma.newsOffers.create({
    data: {
      type: input.type,
      title: input.title,
      description: input.description ?? null,
      longDescription: input.longDescription ?? null,
      thumbnail: input.thumbnail,
      fileUpload: input.fileUpload ?? null,
      subtext: input.subtext ?? null,
      orderNo: orderNo,
      fromDate: input.fromDate,
      toDate: input.toDate ?? null,
    },
  });

  return newsOffer;
}

// Get all news/offers with pagination and optional type filter
// If filterType is 'dealer', only returns items where current date is within fromDate and toDate range
// If filterType is 'admin' or not provided, returns all active items without date filtering
export async function getAllNewsOffers(
  page: number = 1,
  limit: number = 20,
  type?: NewsOffersType,
  filterType?: 'admin' | 'dealer'
) {
  const skip = (page - 1) * limit;

  const where: any = {
    status: true, // Only active items
  };

  // Add date filtering only if filterType is 'dealer'
  if (filterType === 'dealer') {
    // Get current datetime (including time)
    const now = new Date();

    // fromDate must be <= current datetime (don't show future items)
    // AND (toDate must be >= current datetime OR toDate is null)
    where.AND = [
      {
        fromDate: {
          lte: now, // Item has started (fromDate <= now)
        },
      },
      {
        OR: [
          {
            toDate: {
              gte: now, // Item hasn't expired yet (toDate >= now)
            },
          },
          {
            toDate: null, // No expiration date
          },
        ],
      },
    ];
  }

  // Add type filter if provided
  if (type) {
    where.type = type;
  }

  const [newsOffers, total] = await Promise.all([
    prisma.newsOffers.findMany({
      where,
      orderBy: [
        { orderNo: 'asc' },
        { createdAt: 'desc' },
      ],
      skip,
      take: limit,
    }),
    prisma.newsOffers.count({
      where,
    }),
  ]);

  return { newsOffers, total };
}

// Get news/offer by ID
export async function getNewsOfferById(id: number) {
  const newsOffer = await prisma.newsOffers.findUnique({
    where: { id },
  });

  if (!newsOffer) {
    throw new NotFoundError('News/Offer not found');
  }

  return newsOffer;
}

// Update news/offer
export async function updateNewsOffer(id: number, input: UpdateNewsOfferInput) {
  // Check if news/offer exists
  const existingNewsOffer = await prisma.newsOffers.findUnique({
    where: { id },
  });

  if (!existingNewsOffer) {
    throw new NotFoundError('News/Offer not found');
  }

  const newsOffer = await prisma.newsOffers.update({
    where: { id },
    data: {
      ...(input.type !== undefined && { type: input.type }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description ?? null }),
      ...(input.longDescription !== undefined && { longDescription: input.longDescription ?? null }),
      ...(input.thumbnail !== undefined && { thumbnail: input.thumbnail }),
      ...(input.fileUpload !== undefined && { fileUpload: input.fileUpload ?? null }),
      ...(input.subtext !== undefined && { subtext: input.subtext ?? null }),
      ...(input.orderNo !== undefined && { orderNo: input.orderNo }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.fromDate !== undefined && { fromDate: input.fromDate }),
      ...(input.toDate !== undefined && { toDate: input.toDate ?? null }),
    },
  });

  return newsOffer;
}

// Delete news/offer (soft delete by setting status to false)
export async function deleteNewsOffer(id: number) {
  // Check if news/offer exists
  const existingNewsOffer = await prisma.newsOffers.findUnique({
    where: { id },
  });

  if (!existingNewsOffer) {
    throw new NotFoundError('News/Offer not found');
  }

  // Soft delete by setting status to false
  const newsOffer = await prisma.newsOffers.update({
    where: { id },
    data: {
      status: false,
    },
  });

  return newsOffer;
}
