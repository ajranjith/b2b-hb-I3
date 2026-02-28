import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/utils/errors';
import type { CreateBannerInput, UpdateBannerInput } from './_dto';

// Create banner
export async function createBanner(input: CreateBannerInput) {
  const totalBanners = await prisma.banner.count({
    where: {
      status: true,
    },
  });

  const orderNo = totalBanners + 1;

  const banner = await prisma.banner.create({
    data: {
      type: input.type || 'Horizontal',
      title: input.title,
      description: input.description,
      imgae: input.imgae,
      link: input.link,
      orderNo: orderNo,
    },
  });

  return banner;
}

// Get all banners with pagination
export async function getAllBanners(
  page: number = 1,
  limit: number = 20,
  type?: 'Horizontal' | 'Vertical'
) {
  const skip = (page - 1) * limit;

  const where = {
    status: true, // Only active banners
    ...(type && { type }), // Filter by type if provided
  };

  const [banners, total] = await Promise.all([
    prisma.banner.findMany({
      where,
      orderBy: [
        { orderNo: 'asc' },
        { createdAt: 'desc' },
      ],
      skip,
      take: limit,
    }),
    prisma.banner.count({
      where,
    }),
  ]);

  return { banners, total };
}

// Get banner by ID
export async function getBannerById(id: number) {
  const banner = await prisma.banner.findUnique({
    where: { id },
  });

  if (!banner) {
    throw new NotFoundError('Banner not found');
  }

  return banner;
}

// Update banner
export async function updateBanner(id: number, input: UpdateBannerInput) {
  // Check if banner exists
  const existingBanner = await prisma.banner.findUnique({
    where: { id },
  });

  if (!existingBanner) {
    throw new NotFoundError('Banner not found');
  }

  const banner = await prisma.banner.update({
    where: { id },
    data: {
      ...(input.type !== undefined && { type: input.type }),
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.imgae !== undefined && { imgae: input.imgae }),
      ...(input.link !== undefined && { link: input.link }),
      ...(input.orderNo !== undefined && { orderNo: input.orderNo }),
      ...(input.status !== undefined && { status: input.status }),
    },
  });

  return banner;
}

// Delete banner (soft delete by setting status to false)
export async function deleteBanner(id: number) {
  // Check if banner exists
  const existingBanner = await prisma.banner.findUnique({
    where: { id },
  });

  if (!existingBanner) {
    throw new NotFoundError('Banner not found');
  }

  // Soft delete by setting status to false
  const banner = await prisma.banner.update({
    where: { id },
    data: {
      status: false,
    },
  });

  return banner;
}
