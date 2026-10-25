import { UserModel } from '@/modules/user/user.model';
import { logger } from '@/utils/logger';

export const seedSuperAdmin = async (): Promise<void> => {
  try {
    const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@k10football.com';
    const adminPassword = process.env.SUPER_ADMIN_PASSWORD || '11111111';

    const existingAdmin = await UserModel.findOne({
      $or: [{ role: 'SUPER_ADMIN' }, { email: adminEmail.toLowerCase().trim() }],
    });

    if (!existingAdmin) {
      const superAdmin = await UserModel.create({
        name: 'Super Admin',
        email: adminEmail.toLowerCase().trim(),
        password: adminPassword,
        role: 'SUPER_ADMIN',
        status: 'ACTIVE',
        isEmailVerified: true,
        isVerified: true,
      });

      logger.info(`👑 Super Admin seeded successfully: ${superAdmin.email}`);
    } else if (existingAdmin.role !== 'SUPER_ADMIN') {
      existingAdmin.role = 'SUPER_ADMIN';
      existingAdmin.isEmailVerified = true;
      existingAdmin.isVerified = true;
      existingAdmin.status = 'ACTIVE';
      await existingAdmin.save();
      logger.info(`👑 Existing user ${existingAdmin.email} promoted to SUPER_ADMIN`);
    }
  } catch (error) {
    logger.error({ err: error }, 'Failed to seed Super Admin');
  }
};
