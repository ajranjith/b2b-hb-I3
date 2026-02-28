import { prisma } from "@/lib/prisma";
import { NotFoundError } from "@/utils/errors";
import type {
  CreateExclusivePartInput,
  UpdateExclusivePartInput,
} from "./_dto";

// Create exclusive part
// When creating a new exclusive part, set all other exclusive parts' status to false
export async function createExclusivePart(input: CreateExclusivePartInput) {
  // Use a transaction to ensure atomicity
  const result = await prisma.$transaction(async (tx) => {
    // Set all existing exclusive parts to inactive
    await tx.exclusiveParts.updateMany({
      where: {
        status: true,
      },
      data: {
        status: false,
      },
    });

    // Create new exclusive part with status: true
    const exclusivePart = await tx.exclusiveParts.create({
      data: {
        title: input.title,
        description: input.description,
        imgae: input.imgae,
        status: true, // New part is always active
      },
    });

    return exclusivePart;
  });

  return result;
}

// Get all exclusive parts
export async function getAllExclusiveParts() {
  const exclusiveParts = await prisma.exclusiveParts.findFirst({
    where:{
        status:true
    }
  });

  return exclusiveParts;
}

// Get exclusive part by ID
export async function getExclusivePartById(id: number) {
  const exclusivePart = await prisma.exclusiveParts.findUnique({
    where: { id },
  });

  if (!exclusivePart) {
    throw new NotFoundError("Exclusive part not found");
  }

  return exclusivePart;
}

// Update exclusive part
export async function updateExclusivePart(
  id: number,
  input: UpdateExclusivePartInput,
) {
  // Check if exclusive part exists
  const existingPart = await prisma.exclusiveParts.findUnique({
    where: { id },
  });

  if (!existingPart) {
    throw new NotFoundError("Exclusive part not found");
  }

  // If setting this part to active, set all others to inactive
  if (input.status === true) {
    return await prisma.$transaction(async (tx) => {
      // Set all other exclusive parts to inactive
      await tx.exclusiveParts.updateMany({
        where: {
          id: { not: id },
          status: true,
        },
        data: {
          status: false,
        },
      });

      // Update this exclusive part
      const updatedPart = await tx.exclusiveParts.update({
        where: { id },
        data: {
          ...(input.title !== undefined && { title: input.title }),
          ...(input.description !== undefined && {
            description: input.description,
          }),
          ...(input.imgae !== undefined && { imgae: input.imgae }),
          status: true,
        },
      });

      return updatedPart;
    });
  }

  // Update exclusive part (status is false or not provided)
  const exclusivePart = await prisma.exclusiveParts.update({
    where: { id },
    data: {
      ...(input.title !== undefined && { title: input.title }),
      ...(input.description !== undefined && {
        description: input.description,
      }),
      ...(input.imgae !== undefined && { imgae: input.imgae }),
      ...(input.status !== undefined && { status: input.status }),
    },
  });

  return exclusivePart;
}

// Delete exclusive part (soft delete by setting status to false)
export async function deleteExclusivePart(id: number) {
  // Check if exclusive part exists
  const existingPart = await prisma.exclusiveParts.findUnique({
    where: { id },
  });

  if (!existingPart) {
    throw new NotFoundError("Exclusive part not found");
  }

  // Soft delete by setting status to false
  const exclusivePart = await prisma.exclusiveParts.update({
    where: { id },
    data: {
      status: false,
    },
  });

  return exclusivePart;
}
