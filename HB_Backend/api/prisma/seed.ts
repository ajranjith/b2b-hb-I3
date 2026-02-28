import { PrismaClient, Role } from '../generated/prisma';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Seed UserRoles
  const roles = [
    { code: Role.Admin, name: 'Administrator' },
    { code: Role.Dealer, name: 'Dealer' },
  ];

  for (const role of roles) {
    await prisma.userRole.upsert({
      where: { code: role.code },
      update: { name: role.name },
      create: role,
    });
  }
  console.log('UserRoles seeded');

  // Seed ShippingMethods
  const shippingMethods = ['Sea', 'Air', 'DHL', 'Others', 'FedEx'];

  for (const name of shippingMethods) {
    const existing = await prisma.shippingMethod.findFirst({
      where: { name },
    });

    if (!existing) {
      await prisma.shippingMethod.create({
        data: { name },
      });
    }
  }
  console.log('ShippingMethods seeded');

  // Seed Admin
 await prisma.user.upsert({
    where: { email: 'ajith@dgstechlimited.com' },
    update: {
      firstName: 'Ajith',
    },
    create: {
      firstName: 'Ajith',
      email: 'ajith@dgstechlimited.com',
      password: '$2b$10$G9C76dtMFUazCabd1AkyfO87re1apaxCaLoVGmzuXNrCS8Sz9ARGW',
      role: {
        connect: {
          code: Role.Admin,
        },
      },
    },
  });
  console.log('Admin seeded');

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
