import { prisma } from '@/lib/prisma';
import { NotFoundError } from '@/utils/errors';
import type { CreateMarqueeInput, UpdateMarqueeInput } from './_dto';

// Create marquee
export async function createMarquee(input: CreateMarqueeInput) {
  const marquee = await prisma.marquee.create({
    data: {
      text: input.text,
      status: input.status ?? true,
    },
  });

  return marquee;
}

// Get all marquees with pagination
export async function getAllMarquees(
  page: number = 1,
  limit: number = 20,
  status?: boolean
) {
  const skip = (page - 1) * limit;

  const where = {
    ...(status !== undefined && { status }), // Filter by status if provided
  };

  const [marquees, total] = await Promise.all([
    prisma.marquee.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      skip,
      take: limit,
    }),
    prisma.marquee.count({
      where,
    }),
  ]);

  return { marquees, total };
}

// Get marquee by ID
export async function getMarqueeById(id: number) {
  const marquee = await prisma.marquee.findUnique({
    where: { id },
  });

  if (!marquee) {
    throw new NotFoundError('Marquee not found');
  }

  return marquee;
}

// Update marquee
export async function updateMarquee(id: number, input: UpdateMarqueeInput) {
  // Check if marquee exists
  const existingMarquee = await prisma.marquee.findUnique({
    where: { id },
  });

  if (!existingMarquee) {
    throw new NotFoundError('Marquee not found');
  }

  const marquee = await prisma.marquee.update({
    where: { id },
    data: {
      ...(input.text !== undefined && { text: input.text }),
      ...(input.status !== undefined && { status: input.status }),
    },
  });

  return marquee;
}

// Delete marquee (soft delete by setting status to false)
export async function deleteMarquee(id: number) {
  // Check if marquee exists
  const existingMarquee = await prisma.marquee.findUnique({
    where: { id },
  });

  if (!existingMarquee) {
    throw new NotFoundError('Marquee not found');
  }

  // Soft delete by setting status to false
  const marquee = await prisma.marquee.update({
    where: { id },
    data: {
      status: false,
    },
  });

  return marquee;
}
